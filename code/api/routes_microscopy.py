"""
Microscopy upload and duplicate-check endpoints (RESTful).
Routes stay thin: validation + service calls; duplicate logic lives in duplication/service modules.
"""
from typing import List, Optional
import tempfile
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlalchemy import text

from code.api.deps import get_engine, resolve_session_id
from code.database.ingest_upload import ingest
from code.src.conversion.config_map import SUBJECT_MAP
from code.api.duplication import check_microscopy_duplicate, register_batch
from code.api.services import uploads as upload_service
from code.api.models import MicroscopyFile, DuplicateCheckResponse


router = APIRouter(prefix="/api/v1", tags=["microscopy"])
ALLOWED_SUBJECTS = {meta["subject"] for meta in SUBJECT_MAP.values()}
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".ome.tif", ".ome.tiff", ".zarr", ".ome.zarr")


def _stage_images(files: List[UploadFile]) -> (Path, List[Path]):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    tmpdir = Path(tempfile.mkdtemp())
    saved_paths: List[Path] = []
    try:
        for uf in files:
            fname = uf.filename or ""
            lower = fname.lower()
            if not lower.endswith(IMAGE_EXT):
                raise HTTPException(status_code=400, detail=f"Unsupported file type for {fname}. Upload images only.")
            dest = tmpdir / fname
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            if dest.stat().st_size == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"{fname} is 0 bytes. If this is a cloud placeholder (e.g., Dropbox online-only), make it available offline first.",
                )
            saved_paths.append(dest)
        if not saved_paths:
            raise HTTPException(status_code=400, detail="No valid image files found in upload.")
        return tmpdir, saved_paths
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise


@router.post("/microscopy-files", status_code=201)
async def create_microscopy_files(
    subject_id: Optional[str] = Form(None, description="Optional subject id; auto-assigned if omitted."),
    session_id: str = Form("auto", description="BIDS session id (e.g., ses-dbl or 'auto')"),
    hemisphere: str = Form("bilateral", regex="^(left|right|bilateral)$"),
    pixel_size_um: float = Form(1.0),
    experiment_type: str = Form("double_injection", regex="^(double_injection|rabies)$"),
    comments: Optional[str] = Form(None, description="Optional notes/comments for this upload"),
    files: List[UploadFile] = File(...),
):
    """
    Accept microscopy uploads, convert to OME-Zarr, register sessions/files.
    """
    tmpdir, saved_paths = _stage_images(files)
    engine = get_engine()
    try:
        with engine.connect() as conn:
            existing_subjects = {r[0] for r in conn.execute(text("SELECT subject_id FROM subjects"))}

        session_id = resolve_session_id(engine, subject_id, experiment_type, session_id)
        with engine.connect() as conn:
            already = conn.execute(
                text("SELECT 1 FROM microscopy_files WHERE session_id = :sid LIMIT 1"),
                {"sid": session_id},
            ).first()
            if already:
                raise HTTPException(
                    status_code=409,
                    detail=f"Session {session_id} already has microscopy files registered. Duplicate ingest blocked.",
                )

        saved_paths = sorted(saved_paths, key=lambda p: p.name)
        raw_batch_checksum, file_shas = upload_service.compute_batch_hash(saved_paths)
        reason = check_microscopy_duplicate(engine, raw_batch_checksum, file_shas)
        if reason:
            raise HTTPException(status_code=409, detail=reason)

        try:
            subject_id = upload_service.resolve_subject(
                existing_subjects, ALLOWED_SUBJECTS, subject_id, experiment_type
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            ingested = ingest(
                subject=subject_id,
                session=session_id,
                hemisphere=hemisphere,
                files=saved_paths,
                pixel_size_um=pixel_size_um,
                experiment_type=experiment_type,
            )
            if comments:
                with engine.begin() as conn:
                    conn.execute(
                        text("UPDATE sessions SET notes = :n WHERE session_id = :sid"),
                        {"n": comments, "sid": session_id},
                    )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Microscopy ingest failed: {e}")

        register_batch(engine, raw_batch_checksum, file_shas, note=f"microscopy upload {session_id}")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO ingest_log (source_path, checksum, status, message) "
                    "VALUES (:p, :c, :s, :m)"
                ),
                {
                    "p": ";".join(str(p) for p in saved_paths),
                    "c": raw_batch_checksum,
                    "s": "success",
                    "m": f"microscopy upload {session_id}",
                },
            )
        return {
            "status": "ok",
            "subject_id": subject_id,
            "session_id": session_id,
            "ingested": [str(p) for p in ingested],
            "files_processed": [p.name for p in saved_paths],
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.post("/microscopy-files/duplicate-check", status_code=200, response_model=DuplicateCheckResponse)
async def microscopy_files_duplicate_check(hashes: List[str]):
    hashes = [h for h in hashes or [] if h]
    if not hashes:
        return {"duplicate": False, "message": "No hashes provided"}
    engine = get_engine()
    reason = upload_service.check_dup_by_hashes(engine, hashes)
    if reason:
        return {"duplicate": True, "message": reason}
    return {"duplicate": False, "message": ""}


@router.get("/microscopy-files", status_code=200, response_model=List[MicroscopyFile])
async def list_microscopy_files(limit: int = 100):
    engine = get_engine()
    return upload_service.list_microscopy_files(engine, limit)


@router.get("/microscopy-files/{file_id}", status_code=200, response_model=MicroscopyFile)
async def get_microscopy_file(file_id: int):
    engine = get_engine()
    row = upload_service.get_microscopy_file(engine, file_id)
    if not row:
        raise HTTPException(status_code=404, detail="Microscopy file not found")
    return row
