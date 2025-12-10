import logging
from pathlib import Path
from typing import List, Optional

import pandas as pd
from sqlalchemy import text, types as satypes

from code.api.duplication import (
    check_microscopy_duplicate,
    register_batch,
    combine_hashes,
    combine_hex_hashes,
)
from code.api.deps import sha256_path, clean_numeric, load_table
from code.api.settings import ALLOWED_SUBJECT_PREFIXES, DUPLICATE_MESSAGE
from code.database.etl.counts_helper import prepare_counts_dataframe

logger = logging.getLogger(__name__)


def resolve_subject(existing_subjects: set, allowed_subjects: set, subject_id: Optional[str], experiment_type: str) -> str:
    if subject_id:
        if subject_id in existing_subjects or subject_id in allowed_subjects:
            return subject_id
        if subject_id.startswith(ALLOWED_SUBJECT_PREFIXES):
            return subject_id
        raise ValueError(f"Subject ID '{subject_id}' is not allowed. Use sub-rabXX or sub-dblXX.")
    # auto-assign using prefix and max number
    pref = "rab" if experiment_type == "rabies" else "dbl"
    pat = f"sub-{pref}"
    max_n = 0
    for sid in existing_subjects | allowed_subjects:
        if sid.startswith(pat):
            try:
                num = int(sid.split(pat)[-1])
                max_n = max(max_n, num)
            except Exception:
                continue
    return f"{pat}{max_n+1:02d}"


def list_microscopy_files(engine, limit: int = 100):
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT file_id, session_id, hemisphere, path, sha256 "
                "FROM microscopy_files "
                "ORDER BY file_id "
                "LIMIT :lim"
            ),
            {"lim": limit},
        ).fetchall()
    return [dict(r._mapping) for r in rows]


def get_microscopy_file(engine, file_id: int):
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT file_id, session_id, hemisphere, path, sha256 "
                "FROM microscopy_files "
                "WHERE file_id = :fid"
            ),
            {"fid": file_id},
        ).first()
    return dict(row._mapping) if row else None


def list_region_counts(engine, limit: int = 100):
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT subject_id, region_id, file_id, hemisphere "
                "FROM region_counts "
                "ORDER BY file_id, region_id "
                "LIMIT :lim"
            ),
            {"lim": limit},
        ).fetchall()
    return [dict(r._mapping) for r in rows]


def get_region_counts_for_file(engine, file_id: int, limit: int = 1000):
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT subject_id, region_id, file_id, hemisphere, region_pixels, load "
                "FROM region_counts "
                "WHERE file_id = :fid "
                "LIMIT :lim"
            ),
            {"fid": file_id, "lim": limit},
        ).fetchall()
    return [dict(r._mapping) for r in rows]


def check_dup_by_hashes(engine, hashes: List[str]) -> Optional[str]:
    hashes = [h for h in hashes or [] if h]
    if not hashes:
        return None
    batch_checksum = combine_hex_hashes(hashes)
    return check_microscopy_duplicate(engine, batch_checksum, hashes)


def compute_batch_hash(paths: List[Path]) -> (str, List[str]):
    file_shas = [sha256_path(p) for p in paths]
    raw_batch_checksum = combine_hashes(paths)
    return raw_batch_checksum, file_shas


def log_duplicate(reason: str):
    if reason:
        logger.info("Duplicate detected: %s", reason)


def check_counts_dup_by_hashes(engine, hashes: List[str]) -> Optional[str]:
    """Duplicate check for quant CSVs based on batch checksum."""
    hashes = [h for h in hashes or [] if h]
    if not hashes:
        return None
    batch_checksum = combine_hex_hashes(hashes)
    with engine.connect() as conn:
        dup = conn.execute(
            text("SELECT 1 FROM ingest_log WHERE checksum = :chk AND status = 'success' LIMIT 1"),
            {"chk": batch_checksum},
        ).first()
    if dup:
        return DUPLICATE_MESSAGE
    return None


def ingest_counts_csv(engine, csv_path: Path, subject_id: str, session_id: str, hemisphere: str, experiment_type: str) -> int:
    """
    Quantification CSV ingest for uploads (kept consistent with ETL staging logic).
    """
    df_counts = prepare_counts_dataframe(engine, csv_path, subject_id, session_id, hemisphere)
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


class DuplicateUpload(Exception):
    """Raised when a duplicate upload is detected."""


def prepare_microscopy_upload(
    engine,
    subject_id: Optional[str],
    session_id: str,
    experiment_type: str,
    file_paths: List[Path],
):
    """
    Prepare microscopy upload: resolve subject/session, check duplicates, return metadata and batch hashes.
    """
    with engine.connect() as conn:
        existing_subjects = {r[0] for r in conn.execute(text("SELECT subject_id FROM subjects"))}

    # Resolve session id and block session-level duplicates
    from code.api.deps import resolve_session_id  # local import to avoid cycle
    session_id = resolve_session_id(engine, subject_id, experiment_type, session_id)
    with engine.connect() as conn:
        already = conn.execute(
            text("SELECT 1 FROM microscopy_files WHERE session_id = :sid LIMIT 1"),
            {"sid": session_id},
        ).first()
        if already:
            raise DuplicateUpload(f"Session {session_id} already has microscopy files registered. Duplicate ingest blocked.")

    # Batch checksum + duplicate check
    raw_batch_checksum, file_shas = compute_batch_hash(file_paths)
    reason = check_microscopy_duplicate(engine, raw_batch_checksum, file_shas)
    if reason:
        raise DuplicateUpload(reason)

    resolved_subject = resolve_subject(existing_subjects, set(), subject_id, experiment_type)
    return resolved_subject, session_id, raw_batch_checksum, file_shas


def ingest_microscopy_files(
    engine,
    subject_id: str,
    session_id: str,
    hemisphere: str,
    pixel_size_um: float,
    experiment_type: str,
    file_paths: List[Path],
    comments: Optional[str],
    raw_batch_checksum: str,
    file_shas: List[str],
):
    """
    Run microscopy ingest and log results. Expects duplicate checks already done.
    """
    from code.database.ingest_upload import ingest  # local import to avoid cycle

    try:
        ingested = ingest(
            subject=subject_id,
            session=session_id,
            hemisphere=hemisphere,
            files=file_paths,
            pixel_size_um=pixel_size_um,
            experiment_type=experiment_type,
        )
        if comments:
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE sessions SET notes = :n WHERE session_id = :sid"),
                    {"n": comments, "sid": session_id},
                )
    except Exception as e:
        raise

    register_batch(engine, raw_batch_checksum, file_shas, note=f"microscopy upload {session_id}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO ingest_log (source_path, checksum, status, message) "
                "VALUES (:p, :c, :s, :m)"
            ),
            {
                "p": ";".join(str(p) for p in file_paths),
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
        "files_processed": [p.name for p in file_paths],
    }
