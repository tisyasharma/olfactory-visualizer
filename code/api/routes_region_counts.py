"""
Quantification CSV upload and duplicate-check endpoints (RESTful).
"""
from typing import List, Optional
import tempfile
import shutil
import hashlib
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlalchemy import text, types as satypes

from code.api.deps import get_engine, resolve_session_id, sha256_path, load_table, clean_numeric
from code.src.conversion.config_map import SUBJECT_MAP
from code.api.services import uploads as upload_service
from code.api.models import RegionCountSummary, DuplicateCheckResponse


router = APIRouter(prefix="/api/v1", tags=["region_counts"])
ALLOWED_SUBJECTS = {meta["subject"] for meta in SUBJECT_MAP.values()}


def ingest_counts_csv(engine, csv_path: Path, subject_id: str, session_id: str, hemisphere: str, experiment_type: str) -> int:
    """
    Simple CSV ingest used by the upload endpoint.
    Mirrors the ETL column mapping and writes into region_counts with a staging table.
    """
    df = load_table(csv_path)
    required_cols = {"Region ID", "Region name", "Region pixels", "Region area", "Load"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"{csv_path.name}: missing required columns {missing}")

    df = df.rename(columns={
        "Region ID": "region_id",
        "Region name": "region_name",
        "Region pixels": "region_pixels",
        "Region area": "region_area",
        "Object count": "object_count",
        "Object pixels": "object_pixels",
        "Object area": "object_area",
        "Load": "load",
        "Norm load": "norm_load"
    })

    df_rows = []
    with engine.connect() as conn:
        unit_map = {r._mapping["name"]: r._mapping["unit_id"] for r in conn.execute(text("SELECT unit_id, name FROM units"))}
        file_row = conn.execute(
            text(
                """
                SELECT mf.file_id
                FROM microscopy_files mf
                WHERE mf.session_id = :sid AND (mf.hemisphere = :hemi OR mf.hemisphere IS NULL)
                ORDER BY COALESCE(mf.run,0), mf.file_id
                LIMIT 1
                """
            ),
            {"sid": session_id, "hemi": hemisphere},
        ).first()
        file_id = file_row.file_id if file_row else None

    for r in df.itertuples(index=False):
        df_rows.append({
            "subject_id": subject_id,
            "region_id": int(getattr(r, "region_id")),
            "file_id": file_id,
            "region_pixels": clean_numeric(getattr(r, "region_pixels")),
            "region_area_mm": clean_numeric(getattr(r, "region_area", None)),
            "object_count": clean_numeric(getattr(r, "object_count", None)),
            "object_pixels": clean_numeric(getattr(r, "object_pixels", None)),
            "object_area_mm": clean_numeric(getattr(r, "object_area", None)),
            "load": clean_numeric(getattr(r, "load")),
            "norm_load": clean_numeric(getattr(r, "norm_load", None)),
            "hemisphere": hemisphere,
            "region_pixels_unit_id": unit_map.get("pixels"),
            "region_area_unit_id": unit_map.get("pixels"),
            "object_count_unit_id": unit_map.get("count"),
            "object_pixels_unit_id": unit_map.get("pixels"),
            "object_area_unit_id": unit_map.get("pixels"),
            "load_unit_id": unit_map.get("pixels"),
        })

    if not df_rows:
        return 0

    df_counts = pd.DataFrame(df_rows)
    df_counts = df_counts.dropna(subset=["region_pixels", "load"])
    temp_table = "_region_counts_upload_stage"
    with engine.begin() as conn:
        df_counts.to_sql(
            temp_table,
            con=conn,
            if_exists="replace",
            index=False,
            method="multi",
            dtype={
                "subject_id": satypes.String(50),
                "region_id": satypes.Integer(),
                "file_id": satypes.Integer(),
                "region_pixels": satypes.BigInteger(),
                "region_area_mm": satypes.Float(),
                "object_count": satypes.Integer(),
                "object_pixels": satypes.BigInteger(),
                "object_area_mm": satypes.Float(),
                "load": satypes.Float(),
                "norm_load": satypes.Float(),
                "hemisphere": satypes.String(20),
                "region_pixels_unit_id": satypes.Integer(),
                "region_area_unit_id": satypes.Integer(),
                "object_count_unit_id": satypes.Integer(),
                "object_pixels_unit_id": satypes.Integer(),
                "object_area_unit_id": satypes.Integer(),
                "load_unit_id": satypes.Integer(),
            },
        )
        inserted = conn.execute(
            text(
                f"""
                INSERT INTO region_counts (subject_id, region_id, file_id, region_pixels, region_area_mm, object_count, object_pixels, object_area_mm, load, norm_load, hemisphere,
                                          region_pixels_unit_id, region_area_unit_id, object_count_unit_id, object_pixels_unit_id, object_area_unit_id, load_unit_id)
                SELECT subject_id, region_id, file_id, region_pixels, region_area_mm, object_count, object_pixels, object_area_mm, load, norm_load, hemisphere,
                       region_pixels_unit_id, region_area_unit_id, object_count_unit_id, object_pixels_unit_id, object_area_unit_id, load_unit_id
                FROM {temp_table}
                ON CONFLICT (subject_id, region_id, hemisphere) DO NOTHING;
                """
            )
        ).rowcount
        conn.execute(text(f"DROP TABLE IF EXISTS {temp_table};"))
    return inserted or 0


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
                rows += ingest_counts_csv(engine, path, subject_id, sess, hemisphere, experiment_type)
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
        h = hashlib.sha256()
        for s in saved_hashes:
            h.update(s.encode())
        batch_checksum = h.hexdigest()
        engine = get_engine()
        with engine.connect() as conn:
            dup = conn.execute(
                text("SELECT 1 FROM ingest_log WHERE checksum = :chk AND status = 'success' LIMIT 1"),
                {"chk": batch_checksum},
            ).first()
        if dup:
            return {"duplicate": True, "message": "These files have already been uploaded and exist in the database (green check)"}
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
