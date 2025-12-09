"""
ETL utilities.
Reason: reusable helpers (hashing, CSV load, hemisphere detection, session id allocation).
"""
import os
import re
from pathlib import Path
import pandas as pd
from sqlalchemy import text
from code.src.conversion.subject_map import SUBJECT_MAP
from typing import List
from code.api.duplication import combine_hashes, ensure_batches_table  # reuse shared hashing/table setup


def file_sha256(path: Path, chunk_size: int = 1_048_576) -> str:
    h = hashlib.sha256()
    if path.is_dir():
        # Deterministic walk for stable hashes
        for sub in sorted(p for p in path.rglob("*") if p.is_file()):
            h.update(str(sub.relative_to(path)).encode())
            with sub.open("rb") as f:
                for chunk in iter(lambda: f.read(chunk_size), b""):
                    h.update(chunk)
    else:
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                h.update(chunk)
    return h.hexdigest()


def clean_numeric(val):
    """Convert bad strings/NaN to None, else float."""
    if str(val).strip().upper() == "N/A" or pd.isna(val):
        return None
    try:
        return float(val)
    except Exception:
        return None


def detect_hemisphere(root: str, filename: str) -> str:
    parts = [p.lower() for p in Path(root).parts]
    fname = filename.lower()
    if "left" in parts or "left" in fname:
        return "left"
    if "right" in parts or "right" in fname:
        return "right"
    if "both" in parts or "bilateral" in fname:
        return "bilateral"
    return "bilateral"


def get_or_create_session_id(conn, subject_id: str, exp_type: str, existing_sessions: dict | None = None, existing_ids: list[str] | None = None) -> str:
    """
    Return a session_id for a subject. If sessions exist for the subject, reuse the first.
    Otherwise, use the configured session label from subject_map when present, or fall back to 'ses-01'.
    We avoid experiment-type-derived suffixes (e.g., _ses-rab01) to keep BIDS paths consistent:
    sub-XXX/ses-01/... for all subjects.
    Does not insert rows here; caller can insert with ON CONFLICT DO NOTHING. Mutates existing_ids if provided.
    """
    subj_sessions = existing_sessions.get(subject_id) if existing_sessions is not None else None
    if subj_sessions:
        return subj_sessions[0]
    if existing_sessions is None:
        if conn is None:
            existing_sessions = {}
        else:
            rows = conn.execute(text("SELECT subject_id, session_id FROM sessions WHERE subject_id = :sid"), {"sid": subject_id})
            existing_sessions = {subject_id: [row.session_id for row in rows]}
    if existing_ids is None:
        if conn is None:
            existing_ids = []
        else:
            existing_ids = [row.session_id for row in conn.execute(text("SELECT session_id FROM sessions WHERE subject_id = :sid"), {"sid": subject_id})]
    # Preferred session label from config map
    desired_session = "ses-01"
    for meta in SUBJECT_MAP.values():
        if meta.get("subject") == subject_id and meta.get("session"):
            desired_session = meta["session"]
            break
    new_id = f"{subject_id}_{desired_session}"
    # If somehow taken, append incrementing counter to keep uniqueness but stay BIDS-ish
    if new_id in existing_ids:
        base = new_id
        counter = 2
        while f"{base}-{counter:02d}" in existing_ids:
            counter += 1
        new_id = f"{base}-{counter:02d}"
    existing_ids.append(new_id)
    if existing_sessions is not None:
        existing_sessions.setdefault(subject_id, []).append(new_id)
    return new_id


def load_table(csv_path: str) -> pd.DataFrame:
    """
    Read quantification CSV with delimiter sniffing and sep=; support.
    - Detect 'sep=;' header and skip it.
    - Drop unnamed/empty columns caused by trailing delimiters.
    """
    csv_path = Path(csv_path)
    with csv_path.open("r", errors="ignore") as f:
        first = f.readline()
    skiprows = 0
    sep = None
    if first.lower().startswith("sep="):
        sep = first.strip().split("=", 1)[1] or ";"
        skiprows = 1
    try:
        df = pd.read_csv(csv_path, sep=sep, engine="python", skiprows=skiprows)
    except Exception:
        df = pd.read_csv(csv_path, sep="\t", engine="python", skiprows=skiprows)
    df = df.loc[:, ~df.columns.str.contains("^Unnamed")]
    df = df.dropna(axis=1, how="all")
    df.columns = df.columns.str.strip()
    return df
