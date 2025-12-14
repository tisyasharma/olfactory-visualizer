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
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from code.api.routes import (
    data_router,
    microscopy_router,
    region_counts_router,
    scrna_router,
)

WEB_DIR = Path(__file__).resolve().parents[1] / "web"

app = FastAPI(title="Olfactory Data API", version="0.1.0")
app.mount("/code/web", StaticFiles(directory=WEB_DIR, html=True), name="web")


@app.get("/")
def root():
    """
    Parameters:
        None

    Returns:
        RedirectResponse: Redirect to the web dashboard.

    Does:
        Redirects the API root to serve the frontend index.
    """
    return RedirectResponse(url="/code/web/index.html")


# Wire routers
app.include_router(data_router)
app.include_router(microscopy_router)
app.include_router(region_counts_router)
app.include_router(scrna_router)
