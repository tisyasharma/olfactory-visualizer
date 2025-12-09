"""
Shared filesystem paths for ETL.
Reason: centralize path resolution so all stages use the same roots.
"""
from pathlib import Path

# __file__ is code/database/etl/paths.py; project root is three levels up.
ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = ROOT / "data" / "sourcedata" / "quantification"
BIDS_ROOT = ROOT / "data" / "raw_bids"
IMAGES_ROOT = ROOT / "data" / "sourcedata" / "images"
ATLAS_JSON = ROOT / "allen_regions.json"
REQUIREMENTS_FILE = ROOT / "requirements.txt"
