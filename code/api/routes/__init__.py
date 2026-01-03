"""
Router grab bag so main.py can just import once.
"""
from code.api.routes.data import router as data_router
from code.api.routes.metrics import router as metrics_router
from code.api.routes.microscopy import router as microscopy_router
from code.api.routes.region_counts import router as region_counts_router
from code.api.routes.scrna import router as scrna_router

__all__ = [
    "data_router",
    "metrics_router",
    "microscopy_router",
    "region_counts_router",
    "scrna_router",
]
