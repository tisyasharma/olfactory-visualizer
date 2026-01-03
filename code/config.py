"""Centralized configuration. All paths, thresholds, and settings in one place."""
import os
from pathlib import Path

# Project paths
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_ROOT = DATA_DIR / "sourcedata" / "quantification"
BIDS_ROOT = DATA_DIR / "raw_bids"
IMAGES_ROOT = DATA_DIR / "sourcedata" / "images"
ATLAS_JSON = DATA_DIR / "allen_regions.json"

# API server
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
FRONTEND_PORT = 5173

# Authentication (set JWT_SECRET_KEY in production)
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/murthy_db")

# Duplication detection
OVERLAP_THRESHOLD = 0.8
DUPLICATE_MESSAGE = "These microscopy images were already ingested."

# Subject ID validation
ALLOWED_SUBJECT_PREFIXES = ("sub-rab", "sub-dbl")
