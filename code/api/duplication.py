"""
Microscopy duplicate detection helpers.
Centralizes batch/per-file hashing, duplicate detection, and table setup.
Note: microscopy_batches / microscopy_batch_files are used solely for duplicate guarding;
downstream aggregations use microscopy_files/region_counts.
Overlap threshold defaults to 80% of files to catch path/order differences.
"""
from pathlib import Path
from typing import List, Optional
import hashlib

from sqlalchemy import text

DEFAULT_OVERLAP_THRESHOLD = 0.8
DUPLICATE_MESSAGE = "These microscopy images were already ingested."


def combine_hashes(paths: List[Path]) -> str:
    """
    Order-insensitive batch hash based on file contents.
    Sort individual sha256 strings, then hash their concatenation.
    """
    shas = [file_sha256(p) for p in paths]
    return combine_hex_hashes(shas)


def combine_hex_hashes(shas: List[str]) -> str:
    """
    Order-insensitive hash of already-computed hex digests.
    Sort input hex strings, then hash their concatenation.
    """
    shas = sorted([s.strip() for s in shas if s])
    h = hashlib.sha256()
    for s in shas:
        h.update(s.encode())
    return h.hexdigest()


def file_sha256(path: Path, chunk_size: int = 1_048_576) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def ensure_batches_table(engine):
    """Create microscopy batch tables if missing."""
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
    with engine.begin() as conn:
        conn.execute(text(ddl))


def register_batch(engine, batch_checksum: str, file_hashes: List[str], note: Optional[str] = None):
    """Persist batch and per-file hashes after a successful ingest."""
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


def check_microscopy_duplicate(engine, batch_checksum: str, file_hashes: List[str], overlap_threshold: float = DEFAULT_OVERLAP_THRESHOLD) -> Optional[str]:
    """
    Return a duplicate reason string if this batch/files are already ingested; otherwise None.
    Checks batch hash, per-file hash, and strong overlap against stored batches.
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
