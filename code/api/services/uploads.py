import logging
from pathlib import Path
from typing import List, Optional

from sqlalchemy import text

from code.api.duplication import (
    check_microscopy_duplicate,
    register_batch,
    combine_hashes,
    combine_hex_hashes,
)
from code.api.deps import sha256_path
from code.api.config import ALLOWED_SUBJECT_PREFIXES

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
