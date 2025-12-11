"""
Microscopy upload + dup-check endpoints.
Keep the route thin, let the services do the heavy lifting.
"""
from typing import List, Optional, Union
import tempfile
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Body
from code.api.deps import get_engine
from code.api.services import uploads as upload_service
from code.api.models import MicroscopyFile, DuplicateCheckResponse, HashesPayload
from code.src.conversion.subject_map import SUBJECT_MAP


router = APIRouter(prefix="/api/v1", tags=["microscopy"])
ALLOWED_SUBJECTS = {meta["subject"] for meta in SUBJECT_MAP.values()}
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".ome.tif", ".ome.tiff", ".zarr", ".ome.zarr")


def _stage_images(files: List[UploadFile]):
    """
    Parameters:
        files (list[UploadFile]): Incoming files from the client.

    Returns:
        tuple[Path, list[Path]]: Temp directory and saved file paths.

    Does:
        Validates extensions/size, writes uploads to a temp dir, and returns paths or raises HTTP errors.
    """
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
    Parameters:
        subject_id (str | None): Optional BIDS subject id; auto-assigned when omitted.
        session_id (str): BIDS session label or "auto".
        hemisphere (str): Hemisphere label (left/right/bilateral).
        pixel_size_um (float): Pixel size in micrometers.
        experiment_type (str): Experiment type (double_injection|rabies).
        comments (str | None): Optional notes to persist on the session.
        files (list[UploadFile]): Microscopy image uploads.

    Returns:
        dict: Upload status with subject_id, session_id, ingested files, and processed filenames.

    Does:
        Stages uploads, runs duplicate checks, ingests microscopy files into OME-Zarr + DB, and cleans temp storage.
    """
    tmpdir, saved_paths = _stage_images(files)
    engine = get_engine()
    try:
        saved_paths = sorted(saved_paths, key=lambda p: p.name)
        try:
            subject_id, session_id, raw_batch_checksum, file_shas = upload_service.prepare_microscopy_upload(
                engine=engine,
                subject_id=subject_id,
                session_id=session_id,
                experiment_type=experiment_type,
                file_paths=saved_paths,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except upload_service.DuplicateUpload as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        ingested = upload_service.ingest_microscopy_files(
            engine=engine,
            subject_id=subject_id,
            session_id=session_id,
            hemisphere=hemisphere,
            pixel_size_um=pixel_size_um,
            experiment_type=experiment_type,
            file_paths=saved_paths,
            comments=comments,
            raw_batch_checksum=raw_batch_checksum,
            file_shas=file_shas,
        )
        return ingested
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.post("/microscopy-files/check-duplicate", status_code=200, response_model=DuplicateCheckResponse)
@router.post("/microscopy-files/duplicate-check", status_code=200, response_model=DuplicateCheckResponse, deprecated=True)
async def microscopy_files_duplicate_check(payload: Union[HashesPayload, List[str]] = Body(...)):
    """
    Parameters:
        payload (HashesPayload | list[str]): SHA256 hashes to compare against existing ingests.

    Returns:
        DuplicateCheckResponse: Duplicate flag plus message.

    Does:
        Normalizes hash input and runs duplicate detection for microscopy uploads.
    """
    # Accept either raw list or {\"hashes\": [...]} for convenience
    hashes: List[str]
    if isinstance(payload, list):
        hashes = payload
    else:
        hashes = payload.hashes
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
    """
    Parameters:
        limit (int): Maximum number of rows to return.

    Returns:
        list[MicroscopyFile]: Microscopy file metadata rows.

    Does:
        Delegates to the upload service to fetch microscopy_files with an optional limit.
    """
    engine = get_engine()
    return upload_service.list_microscopy_files(engine, limit)


@router.get("/microscopy-files/{file_id}", status_code=200, response_model=MicroscopyFile)
async def get_microscopy_file(file_id: int):
    """
    Parameters:
        file_id (int): Microscopy file primary key.

    Returns:
        MicroscopyFile: File metadata row if found.

    Does:
        Retrieves one microscopy_files row by id or raises a 404 HTTPException when missing.
    """
    engine = get_engine()
    row = upload_service.get_microscopy_file(engine, file_id)
    if not row:
        raise HTTPException(status_code=404, detail="Microscopy file not found")
    return row
