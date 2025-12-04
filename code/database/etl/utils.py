"""
ETL utilities.
Reason: reusable helpers (hashing, CSV load, hemisphere detection, session id allocation).
"""
import hashlib
import os
import re
from pathlib import Path
import pandas as pd
from sqlalchemy import text


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


def session_prefix(exp_type: str) -> str:
    return "rab" if exp_type == "rabies" else "dbl"


def get_or_create_session_id(conn, subject_id: str, exp_type: str, existing_sessions: dict | None = None, existing_ids: list[str] | None = None) -> str:
    """
    Return a session_id for a subject. If sessions exist for the subject, reuse the first.
    Otherwise, generate the next available subject-prefixed label (e.g., sub-rab01_ses-rab02).
    Does not insert rows here; caller can insert with ON CONFLICT DO NOTHING. Mutates existing_ids if provided.
    """
    subj_sessions = existing_sessions.get(subject_id) if existing_sessions is not None else None
    if subj_sessions:
        return subj_sessions[0]
    if existing_ids is None:
        if conn is None:
            existing_ids = []
        else:
            existing_ids = [row.session_id for row in conn.execute(text("SELECT session_id FROM sessions"))]
    pref = session_prefix(exp_type)
    pat = re.compile(rf"^{re.escape(subject_id)}_ses-{pref}(\d+)$", re.IGNORECASE)
    max_n = 0
    for sid in existing_ids:
        m = pat.match(sid or "")
        if m:
            try:
                num = int(m.group(1))
                if num > max_n:
                    max_n = num
            except ValueError:
                continue
    next_n = max_n + 1
    new_id = f"{subject_id}_ses-{pref}{next_n:02d}"
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

