"""
Helper to ingest uploaded microscopy images:
- Converts PNG/JPG/TIFF (and other imageio-readable formats) to OME-Zarr.
- Writes into Microscopy-BIDS layout under data/raw_bids/sub-*/ses-*/micr/.
- Registers sessions and microscopy_files in the database with SHA256 hashes.

Usage (example):
  python -m code.database.ingest_upload --subject sub-DBL_A --session ses-dbl --hemisphere right \
    --pixel-size-um 0.5 path/to/image1.png path/to/image2.tif
"""

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path

import dask.array as da
import warnings
from PIL import Image, ImageFile
import imageio.v3 as iio
import numpy as np
import zarr
from ome_zarr.io import parse_url
from ome_zarr.writer import write_image
from sqlalchemy import text, types as satypes

from code.database.connect import get_engine
from code.common.hashing import file_sha256

ROOT = Path(__file__).resolve().parents[2]  # project root
BIDS_ROOT = ROOT / "data" / "raw_bids"


def load_image(path: Path) -> np.ndarray:
    # Allow large images but guard against pathological cases; suppress PIL warnings
    Image.MAX_IMAGE_PIXELS = None
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=Image.DecompressionBombWarning)
        arr = iio.imread(path)
    # No hard cap; callers can downsample/tile manually if memory becomes an issue
    if arr.ndim == 2:
        arr = arr[np.newaxis, ...]
    elif arr.ndim == 3:
        if arr.shape[2] == 4:
            arr = arr[:, :, :3]
        arr = np.moveaxis(arr, -1, 0)
    else:
        raise ValueError(f"Unsupported image shape {arr.shape} for {path}")
    return arr


def write_omezarr(data: np.ndarray, dest: Path, pixel_size_um: float) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    store = parse_url(dest, mode="w").store
    root = zarr.group(store=store)
    darr = da.from_array(data, chunks=(data.shape[0], 512, 512))
    ps_m = pixel_size_um * 1e-6
    write_image(
        darr,
        group=root,
        axes="cyx",
        scaler=None,
        coordinate_transformations=[[{"type": "scale", "scale": [1.0, ps_m, ps_m]}]],
    )

def write_sidecar(dest: Path, subject: str, session: str, run: int, hemisphere: str, experiment_type: str, pixel_size_um: float, sample: str):
    sidecar = dest.with_suffix(dest.suffix + ".json")
    meta = {
        "BIDSVersion": "1.8.0",
        "Modality": "micr",
        "Subject": subject,
        "Session": session,
        "Run": run,
        "Hemisphere": hemisphere,
        "Sample": sample,
        "ExperimentType": experiment_type,
        "PixelSizeMicrons": pixel_size_um,
        "GeneratedAt": datetime.utcnow().isoformat() + "Z",
    }
    sidecar.write_text(json.dumps(meta, indent=2))

def ensure_dataset_files():
    """Ensure dataset_description exists at BIDS root."""
    BIDS_ROOT.mkdir(parents=True, exist_ok=True)
    dd = BIDS_ROOT / "dataset_description.json"
    if not dd.exists():
        dd.write_text(json.dumps({
            "Name": "Olfactory Data Visualizer",
            "BIDSVersion": "1.8.0",
            "DatasetType": "raw",
            "GeneratedBy": [{"Name": "ingest_upload.py", "Version": "0.1"}],
            "Authors": ["Olfactory Data Visualizer"],
            "License": "CC-BY-4.0"
        }, indent=2))

def validate_outputs(dest: Path):
    sidecar = dest.with_suffix(dest.suffix + ".json")
    if not dest.exists():
        raise FileNotFoundError(f"OME-Zarr not found at {dest}")
    if not sidecar.exists():
        raise FileNotFoundError(f"Missing sidecar JSON for {dest}")
    dd = BIDS_ROOT / "dataset_description.json"
    if not dd.exists():
        raise FileNotFoundError(f"Missing dataset_description.json at {dd}")

def ingest(subject: str, session: str, hemisphere: str, files: list[Path], pixel_size_um: float = 1.0, experiment_type: str = "double_injection"):
    engine = get_engine()
    staged = []
    sample_label = "sample-01"
    session_label = session.split("_", 1)[1] if session and "_" in session else session
    hemi_label = hemisphere or "bilateral"
    hemi_label = hemi_label.lower()
    if hemi_label not in {"left", "right", "bilateral"}:
        hemi_label = "bilateral"
    try:
        ensure_dataset_files()
        for idx, src in enumerate(files, start=1):
            if not src.exists():
                raise FileNotFoundError(f"Input file not found: {src}")
            data = load_image(src)
            dest = BIDS_ROOT / subject / session_label / "micr" / f"{subject}_{session_label}_{sample_label}_run-{idx:02d}_micr.ome.zarr"
            # Clean up any stale store from prior attempts so the writer can proceed
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True)
                sidecar_stale = dest.with_suffix(dest.suffix + ".json")
                sidecar_stale.unlink(missing_ok=True)
            write_omezarr(data, dest, pixel_size_um)
            write_sidecar(dest, subject, session_label, idx, hemi_label, experiment_type, pixel_size_um, sample_label)
            validate_outputs(dest)
            sha = file_sha256(dest)
            # reject duplicate content before touching DB state
            with engine.connect() as conn:
                dup = conn.execute(
                    text("SELECT s.subject_id, mf.session_id, mf.run FROM microscopy_files mf JOIN sessions s ON mf.session_id = s.session_id WHERE mf.sha256 = :sha LIMIT 1"),
                    {"sha": sha},
                ).first()
            if dup:
                shutil.rmtree(dest, ignore_errors=True)
                dest.with_suffix(dest.suffix + ".json").unlink(missing_ok=True)
                raise ValueError(
                    f"Duplicate microscopy content detected (already stored for subject {dup.subject_id}, session {dup.session_id}, run {dup.run})"
                )
            staged.append((idx, dest, sha))

        # If we got here, all files are unique; register DB state now
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO subjects (subject_id, original_id, sex, experiment_type, details)
                    VALUES (:subj, :orig, 'U', :exp_type, '')
                    ON CONFLICT (subject_id) DO NOTHING;
                """),
                {"subj": subject, "orig": subject, "exp_type": experiment_type},
            )
            conn.execute(
                text("""
                    INSERT INTO sessions (session_id, subject_id, modality)
                    VALUES (:sid, :subj, :mod)
                    ON CONFLICT (session_id) DO NOTHING;
                """),
                {"sid": session, "subj": subject, "mod": "micr"},
            )
            for idx, dest, sha in staged:
                conn.execute(
                    text("""
                        INSERT INTO microscopy_files (session_id, run, hemisphere, path, sha256)
                        VALUES (:sid, :run, :hemi, :path, :sha)
                        ON CONFLICT (session_id, run, hemisphere) DO NOTHING;
                    """),
                    {"sid": session, "run": idx, "hemi": hemisphere, "path": str(dest), "sha": sha},
                )
        return [d for _, d, _ in staged]
    except Exception:
        # cleanup any staged files on error
        for _, dest, _ in staged:
            shutil.rmtree(dest, ignore_errors=True)
            dest.with_suffix(dest.suffix + ".json").unlink(missing_ok=True)
        raise


def main():
    ap = argparse.ArgumentParser(description="Ingest microscopy uploads and convert to OME-Zarr.")
    ap.add_argument("--subject", required=True, help="BIDS subject id (e.g., sub-DBL_A)")
    ap.add_argument("--session", required=True, help="BIDS session id (e.g., ses-dbl)")
    ap.add_argument("--hemisphere", default="bilateral", choices=["left", "right", "bilateral"])
    ap.add_argument("--pixel-size-um", type=float, default=1.0, help="Pixel size in micrometers")
    ap.add_argument("--experiment-type", default="double_injection", choices=["double_injection", "rabies"], help="Experiment type to satisfy subjects constraint")
    ap.add_argument("files", nargs="+", type=Path, help="Input image files")
    args = ap.parse_args()

    ingested = ingest(args.subject, args.session, args.hemisphere, args.files, args.pixel_size_um, args.experiment_type)
    print(f"Ingested {len(ingested)} file(s):")
    for p in ingested:
        print(" -", p)


if __name__ == "__main__":
    main()
