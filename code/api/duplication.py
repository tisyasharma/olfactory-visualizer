"""
Little helper set to keep us from double-ingesting microscopy files.
We stash batch/file hashes in their own tables so the main data stays clean, and
we default to an 80% overlap check to catch shuffled uploads.
"""
from typing import List, Optional, Union

from sqlalchemy.engine import Connection
from sqlalchemy import text

from code.api.settings import OVERLAP_THRESHOLD, DUPLICATE_MESSAGE

DEFAULT_OVERLAP_THRESHOLD = OVERLAP_THRESHOLD


def ensure_batches_table(engine_or_conn: Union["Connection", object]):
    """Make sure the hash tables exist before we touch them."""
    ddl = """
    CREATE TABLE IF NOT EXISTS microscopy_batches (
        batch_checksum TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        note TEXT
    );
    CREATE TABLE IF NOT EXISTS microscopy_batch_files (
        batch_checksum TEXT REFERENCES microscopy_batches(batch_checksum) ON DELETE CASCADE,
        file_sha TEXT NOT NULL,
        PRIMARY KEY(batch_checksum, file_sha)
    );
    """
    if isinstance(engine_or_conn, Connection):
        engine_or_conn.execute(text(ddl))
    else:
        with engine_or_conn.begin() as conn:
            conn.execute(text(ddl))


def register_batch(engine, batch_checksum: str, file_hashes: List[str], note: Optional[str] = None):
    """Remember a batch and its file hashes after we accept an upload."""
    ensure_batches_table(engine)
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO microscopy_batches (batch_checksum, note) VALUES (:c, :n) ON CONFLICT DO NOTHING"),
            {"c": batch_checksum, "n": note or ""},
        )
        for sha in file_hashes:
            conn.execute(
                text("INSERT INTO microscopy_batch_files (batch_checksum, file_sha) VALUES (:c, :s) ON CONFLICT DO NOTHING"),
                {"c": batch_checksum, "s": sha},
            )


def check_microscopy_duplicate(engine, batch_checksum: str, file_hashes: List[str], overlap_threshold: float = DEFAULT_OVERLAP_THRESHOLD):
    """
    Parameters:
        engine: SQLAlchemy engine/connection.
        batch_checksum (str): Combined hash of the upload batch.
        file_hashes (list[str]): Individual file SHA256 hashes.
        overlap_threshold (float): Fraction of overlap to consider a duplicate.

    Returns:
        str | None: Reason string when duplicate detected; None otherwise.

    Does:
        Checks ingest_log, existing batches, per-file hashes, exact set matches, and strong overlap to flag duplicates.
    """
    """
    Tell us why this upload looks like a repeat (or return None if it's fresh).
    Checks batch hash, per-file hash, and high-overlap batches.
    """
    ensure_batches_table(engine)
    with engine.connect() as conn:
        dup_batch = conn.execute(
            text("SELECT 1 FROM ingest_log WHERE checksum = :c AND status = 'success' AND message LIKE 'microscopy%' LIMIT 1"),
            {"c": batch_checksum},
        ).first()
        if dup_batch:
            return f"{DUPLICATE_MESSAGE} (batch match)."

        batch_seen = conn.execute(
            text("SELECT 1 FROM microscopy_batches WHERE batch_checksum = :c LIMIT 1"),
            {"c": batch_checksum},
        ).first()
        if batch_seen:
            return f"{DUPLICATE_MESSAGE} (batch seen)."

        if file_hashes:
            dup_file = conn.execute(
                text("SELECT 1 FROM microscopy_files WHERE sha256 = ANY(:shas) LIMIT 1"),
                {"shas": file_hashes},
            ).first()
            if dup_file:
                return f"{DUPLICATE_MESSAGE} (file hash match)."

            subset_match = conn.execute(
                text(
                    "SELECT batch_checksum FROM microscopy_batch_files "
                    "WHERE file_sha = ANY(:shas) "
                    "GROUP BY batch_checksum "
                    "HAVING COUNT(DISTINCT file_sha) = :n "
                    "LIMIT 1"
                ),
                {"shas": file_hashes, "n": len(file_hashes)},
            ).first()
            if subset_match:
                return f"{DUPLICATE_MESSAGE} (exact set match)."

            k = max(1, int(len(file_hashes) * overlap_threshold))
            overlap_match = conn.execute(
                text(
                    "SELECT batch_checksum FROM microscopy_batch_files "
                    "WHERE file_sha = ANY(:shas) "
                    "GROUP BY batch_checksum "
                    "HAVING COUNT(DISTINCT file_sha) >= :k "
                    "ORDER BY COUNT(DISTINCT file_sha) DESC "
                    "LIMIT 1"
                ),
                {"shas": file_hashes, "k": k},
            ).first()
            if overlap_match:
                return f"{DUPLICATE_MESSAGE} (strong overlap)."

    return None
