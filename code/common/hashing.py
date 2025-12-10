"""
Shared hashing helpers for microscopy/quant duplicate detection.
Provides a single source for file hashes, batch hashes, and order-insensitive hex hashes.
"""
from pathlib import Path
from typing import List
import hashlib


def file_sha256(path: Path, chunk_size: int = 1_048_576) -> str:
    """SHA256 for a file or directory (directories hashed deterministically by walk order)."""
    h = hashlib.sha256()
    if path.is_dir():
        # Deterministic walk for stable hashes
        for sub in sorted(p for p in path.rglob("*") if p.is_file()):
            h.update(str(sub.relative_to(path)).encode())
            with sub.open("rb") as f:
                for chunk in iter(lambda: f.read(chunk_size), b""):
                    if not chunk:
                        break
                    h.update(chunk)
    else:
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                if not chunk:
                    break
                h.update(chunk)
    return h.hexdigest()


def combine_hex_hashes(shas: List[str]) -> str:
    """Order-insensitive hash of already-computed hex digests."""
    shas = sorted([s.strip() for s in shas if s])
    h = hashlib.sha256()
    for s in shas:
        h.update(s.encode())
    return h.hexdigest()


def combine_hashes(paths: List[Path]) -> str:
    """Order-insensitive batch hash based on file contents."""
    shas = [file_sha256(p) for p in paths]
    return combine_hex_hashes(shas)
