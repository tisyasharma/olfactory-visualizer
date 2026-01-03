import os
import sys
from pathlib import Path

# Ensure project root and code/ are importable (Render-friendly absolute imports)
HERE = os.path.dirname(os.path.abspath(__file__))      # .../code/api
CODE_ROOT = os.path.dirname(HERE)                      # .../code
PROJECT_ROOT = os.path.dirname(CODE_ROOT)              # repo root
for p in (PROJECT_ROOT, CODE_ROOT):
    if p and p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from code.api.routes import (
    data_router,
    metrics_router,
    microscopy_router,
    region_counts_router,
    scrna_router,
)
from code.config import FRONTEND_URL, FRONTEND_PORT

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

app = FastAPI(title="Olfactory Data API", version="0.1.0")

# CORS for React dev server and production
# Frontend runs on port 5173 by default (Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        f"http://127.0.0.1:{FRONTEND_PORT}",
        f"http://localhost:{FRONTEND_PORT}",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve data directory for OME-Zarr viewer access
# Use html=False to prevent directory listing, but allow file access
# check_dir=False allows serving files even if parent directories don't exist as files
app.mount("/data", StaticFiles(directory=DATA_DIR, html=False, check_dir=False), name="data")


@app.get("/")
def root():
    """Redirect to React frontend (run via Vite dev server)."""
    return RedirectResponse(url=FRONTEND_URL)


# Wire routers
app.include_router(data_router)
app.include_router(metrics_router)
app.include_router(microscopy_router)
app.include_router(region_counts_router)
app.include_router(scrna_router)
