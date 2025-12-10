"""
Shared quantification CSV transformation helper used by both ETL and API uploads.
Keeps column renames/cleaning/unit resolution in one place to prevent drift.
"""
from pathlib import Path
from typing import Optional

import pandas as pd
from sqlalchemy import text

from code.database.etl.utils import load_table, clean_numeric


REQUIRED_COLS = {"Region ID", "Region name", "Region pixels", "Region area", "Load"}
RENAME_MAP = {
    "Region ID": "region_id",
    "Region name": "region_name",
    "Region pixels": "region_pixels",
    "Region area": "region_area",
    "Object count": "object_count",
    "Object pixels": "object_pixels",
    "Object area": "object_area",
    "Load": "load",
    "Norm load": "norm_load",
}


def prepare_counts_dataframe(
    engine,
    csv_path: Path,
    subject_id: str,
    session_id: str,
    hemisphere: str,
    file_id: Optional[int] = None,
):
    """Read and normalize a quant CSV to the region_counts schema.

    Resolves units and optionally file_id (if not provided, attempts lookup by session/hemisphere).
    Returns a pandas DataFrame ready for staging/insert.
    """
    df = load_table(csv_path)
    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        raise ValueError(f"{csv_path.name}: missing required columns {missing}")

    df = df.rename(columns=RENAME_MAP)

    with engine.connect() as conn:
        unit_map = {r._mapping["name"]: r._mapping["unit_id"] for r in conn.execute(text("SELECT unit_id, name FROM units"))}
        if file_id is None:
            file_row = conn.execute(
                text(
                    """
                    SELECT mf.file_id
                    FROM microscopy_files mf
                    WHERE mf.session_id = :sid AND (mf.hemisphere = :hemi OR mf.hemisphere IS NULL)
                    ORDER BY COALESCE(mf.run,0), mf.file_id
                    LIMIT 1
                    """
                ),
                {"sid": session_id, "hemi": hemisphere},
            ).first()
            file_id = file_row.file_id if file_row else None

    rows = []
    for r in df.itertuples(index=False):
        rows.append(
            {
                "subject_id": subject_id,
                "region_id": int(getattr(r, "region_id")),
                "file_id": file_id,
                "region_pixels": clean_numeric(getattr(r, "region_pixels")),
                "region_area_mm": clean_numeric(getattr(r, "region_area", None)),
                "object_count": clean_numeric(getattr(r, "object_count", None)),
                "object_pixels": clean_numeric(getattr(r, "object_pixels", None)),
                "object_area_mm": clean_numeric(getattr(r, "object_area", None)),
                "load": clean_numeric(getattr(r, "load")),
                "norm_load": clean_numeric(getattr(r, "norm_load", None)),
                "hemisphere": hemisphere,
                "region_pixels_unit_id": unit_map.get("pixels"),
                "region_area_unit_id": unit_map.get("pixels"),
                "object_count_unit_id": unit_map.get("count"),
                "object_pixels_unit_id": unit_map.get("pixels"),
                "object_area_unit_id": unit_map.get("pixels"),
                "load_unit_id": unit_map.get("pixels"),
            }
        )

    df_counts = pd.DataFrame(rows)
    return df_counts.dropna(subset=["region_pixels", "load"])
