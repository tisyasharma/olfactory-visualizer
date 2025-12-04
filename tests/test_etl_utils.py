import os
from pathlib import Path

import pytest

from code.database.etl import utils


def test_detect_hemisphere():
    assert utils.detect_hemisphere("/tmp/Left", "file.csv") == "left"
    assert utils.detect_hemisphere("/tmp/right", "file.csv") == "right"
    assert utils.detect_hemisphere("/tmp/Both", "file.csv") == "bilateral"
    assert utils.detect_hemisphere("/tmp/else", "bilateral_file.csv") == "bilateral"
    assert utils.detect_hemisphere("/tmp/else", "file.csv") == "bilateral"


def test_session_id_reuse_and_increment():
    existing_sessions = {"sub-01": ["sub-01_ses-dbl01"]}
    existing_ids = ["sub-01_ses-dbl01", "sub-02_ses-dbl01"]

    # Reuse existing for subject with session
    sid = utils.get_or_create_session_id(None, "sub-01", "double_injection", existing_sessions, existing_ids)
    assert sid == "sub-01_ses-dbl01"

    # New subject gets next available for its prefix
    sid2 = utils.get_or_create_session_id(None, "sub-02", "double_injection", existing_sessions, existing_ids)
    assert sid2 == "sub-02_ses-dbl02"
    # A rabies subject starts its own numbering
    sid3 = utils.get_or_create_session_id(None, "sub-rab01", "rabies", existing_sessions, existing_ids)
    assert sid3 == "sub-rab01_ses-rab01"


def test_file_sha256_directory(tmp_path: Path):
    # Create deterministic content
    f1 = tmp_path / "a.txt"
    f2 = tmp_path / "b.txt"
    f1.write_text("alpha")
    f2.write_text("beta")

    h1 = utils.file_sha256(tmp_path)
    h2 = utils.file_sha256(tmp_path)
    assert h1 == h2  # stable hash for identical tree

    # Change content to ensure hash changes
    f2.write_text("beta2")
    h3 = utils.file_sha256(tmp_path)
    assert h3 != h1

