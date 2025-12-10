"""
Quantification CSV upload and duplicate-check endpoints (RESTful).
"""
from typing import List, Optional
import tempfile
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlalchemy import text

from code.api.deps import get_engine, resolve_session_id, sha256_path
from code.src.conversion.subject_map import SUBJECT_MAP
from code.api.services import uploads as upload_service
from code.api.models import RegionCountSummary, DuplicateCheckResponse


router = APIRouter(prefix="/api/v1", tags=["region_counts"])
ALLOWED_SUBJECTS = {meta["subject"] for meta in SUBJECT_MAP.values()}


@router.post("/region-counts", status_code=201)
async def create_region_counts(
    subject_id: str = Form(..., description="BIDS subject id (auto-assigned if omitted upstream)"),
    session_id: Optional[str] = Form(None, description="BIDS session id (e.g., ses-dbl)"),
    hemisphere: str = Form("auto", regex="^(left|right|bilateral|auto)$"),
    experiment_type: str = Form("double_injection", regex="^(double_injection|rabies)$"),
    files: List[UploadFile] = File(...),
):
    """
    Accept quantification CSV uploads and load them into region_counts.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    engine = get_engine()
    if subject_id not in ALLOWED_SUBJECTS:
        raise HTTPException(
            status_code=400,
            detail=f"Subject ID '{subject_id}' is not allowed. Allowed: {sorted(ALLOWED_SUBJECTS)}",
        )
    sess = resolve_session_id(engine, subject_id, experiment_type, session_id)

    tmpdir = Path(tempfile.mkdtemp())
    rows = 0
    try:
        saved = []
        saved_hashes = {}
        for uf in files:
            if not uf.filename.lower().endswith(".csv"):
                raise HTTPException(status_code=400, detail=f"Unsupported file type for {uf.filename}. Upload CSV only.")
            dest = tmpdir / uf.filename
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            saved.append(dest)
            saved_hashes[dest] = sha256_path(dest)

        with engine.connect() as conn:
            dup = conn.execute(
                text(
                    """
                    SELECT 1
                    FROM region_counts rc
                    JOIN microscopy_files mf ON rc.file_id = mf.file_id
                    WHERE mf.session_id = :sid
                    LIMIT 1
                    """
                ),
                {"sid": sess},
            ).first()
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail=f"Session {sess} already has quantification rows registered. Duplicate ingest blocked.",
                )
            for chk in saved_hashes.values():
                existing = conn.execute(
                    text("SELECT 1 FROM ingest_log WHERE checksum = :c AND status = 'success' LIMIT 1"),
                    {"c": chk},
                ).first()
                if existing:
                    raise HTTPException(
                        status_code=409,
                        detail="This quantification file matches a previously ingested file (checksum duplicate).",
                    )
        for path in saved:
            try:
                rows += upload_service.ingest_counts_csv(engine, path, subject_id, sess, hemisphere, experiment_type)
                chk = saved_hashes.get(path)
                if chk:
                    with engine.begin() as conn:
                        conn.execute(
                            text(
                                "INSERT INTO ingest_log (source_path, checksum, rows_loaded, status, message) "
                                "VALUES (:p, :c, :r, :s, :m)"
                            ),
                            {"p": str(path), "c": chk, "r": rows, "s": "success", "m": f"upload {sess}"},
                        )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        return {"status": "ok", "rows_ingested": rows}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.post("/region-counts/duplicate-check", status_code=200, response_model=DuplicateCheckResponse)
async def region_counts_duplicate_check(files: List[UploadFile] = File(...)):
    if not files:
        return {"duplicate": False, "message": "No files provided"}
    tmpdir = Path(tempfile.mkdtemp())
    saved_hashes = []
    try:
        for uf in files:
            if not (uf.filename or "").lower().endswith(".csv"):
                continue
            dest = tmpdir / (uf.filename or "upload.csv")
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            if dest.stat().st_size == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"{uf.filename or 'CSV'} is 0 bytes. If this is a cloud placeholder (e.g., Dropbox online-only), make it available offline first.",
                )
            saved_hashes.append(sha256_path(dest))
        if not saved_hashes:
            return {"duplicate": False, "message": ""}
        saved_hashes.sort()
        engine = get_engine()
        reason = upload_service.check_counts_dup_by_hashes(engine, saved_hashes)
        if reason:
            return {"duplicate": True, "message": reason}
        return {"duplicate": False, "message": ""}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.get("/region-counts", status_code=200, response_model=List[RegionCountSummary])
async def list_region_counts(limit: int = 100):
    engine = get_engine()
    return upload_service.list_region_counts(engine, limit)


@router.get("/region-counts/file/{file_id}", status_code=200, response_model=List[RegionCountSummary])
async def get_region_counts_for_file(file_id: int, limit: int = 1000):
    engine = get_engine()
    rows = upload_service.get_region_counts_for_file(engine, file_id, limit)
    if not rows:
        raise HTTPException(status_code=404, detail="No region counts found for this file_id")
    return rows
