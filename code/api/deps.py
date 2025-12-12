"""
Grab-bag of API helpers (engine/session hashing stuff) so the route files stay lighter.
"""
import hashlib
from pathlib import Path
from typing import Optional

from sqlalchemy import text

from code.database.connect import get_engine
from code.database.etl.utils import get_or_create_session_id


def resolve_session_id(engine, subject_id: str, experiment_type: str, session_id: Optional[str]):
    """
    Parameters:
        engine: SQLAlchemy engine.
        subject_id (str): Subject id to resolve for.
        experiment_type (str): Experiment type to pick defaults.
        session_id (str | None): Requested session label or 'auto'.

    Returns:
        str: Resolved session id (normalized BIDS-like).

    Does:
        Normalizes/auto-assigns session ids, ensuring consistent sub-xxx_ses-yy formatting.
    """
    sid = (session_id or "").strip()
    if sid.lower() == "auto" or sid == "":
        with engine.connect() as conn:
            return get_or_create_session_id(conn, subject_id, experiment_type)
    # Normalize to sub-xxx_ses-yy if caller passed a raw session label
    if not sid.startswith(f"{subject_id}_"):
        # If they passed just ses-xx, attach subject_id; otherwise fallback to default
        if sid.startswith("ses-"):
            return f"{subject_id}_{sid}"
        return f"{subject_id}_ses-01"
    return sid


def sha256_path(path: Path, chunk_size: int = 1_048_576):
    """
    Parameters:
        path (Path): File path to hash.
        chunk_size (int): Chunk size for streaming.

    Returns:
        str: SHA256 hex digest.

    Does:
        Streams a file and returns its SHA256 checksum.
    """
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def fetch_all(query: str, params: dict = None):
    """
    Parameters:
        query (str): SQL query text.
        params (dict | None): Optional bind parameters.

    Returns:
        list[dict]: Rows converted to dicts keyed by column name.

    Does:
        Runs a read-only query and returns all rows as dictionaries.
    """
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text(query), params or {})
        cols = rows.keys()
        return [dict(zip(cols, row)) for row in rows]


__all__ = [
    "get_engine",
    "resolve_session_id",
    "sha256_path",
    "fetch_all",
    "get_or_create_session_id",
]
