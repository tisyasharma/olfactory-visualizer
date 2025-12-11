"""
scRNA endpoints backed by the CSVs we ship with the repo (clusters, terms, membership).
Keeps RNA lookups separate from the upload routes.
"""
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/v1", tags=["scrna"])

RNA_DIR = Path(__file__).resolve().parents[2] / "data" / "RNAseq_data"
_clusters_df = None
_terms_df = None
_membership_df = None


def load_rna_tables():
    """
    Parameters:
        None

    Returns:
        bool: True if all required CSVs are loaded; False if missing.

    Does:
        Loads scRNA CSVs into module-level DataFrames, returning False when files are absent.
    """
    global _clusters_df, _terms_df, _membership_df
    if _clusters_df is not None and _terms_df is not None and _membership_df is not None:
        return True
    cluster_path = RNA_DIR / "cluster.csv"
    term_path = RNA_DIR / "cluster_annotation_term.csv"
    membership_path = RNA_DIR / "cluster_to_cluster_annotation_membership.csv"
    if not (cluster_path.exists() and term_path.exists() and membership_path.exists()):
        # Keep the API up even if the optional RNA files are missing
        return False
    _clusters_df = pd.read_csv(cluster_path)
    _terms_df = pd.read_csv(term_path)
    _membership_df = pd.read_csv(membership_path)
    return True


def scrna_samples_data():
    """
    Parameters:
        None

    Returns:
        list[dict]: Sample metadata rows for scRNA datasets.

    Does:
        Returns a static sample description if the RNA tables are loaded, else an empty list.
    """
    if not load_rna_tables():
        return []
    return [{
        "sample_id": "WMB-10Xv2-OLF",
        "modality": "rna_seq",
        "n_clusters": int(len(_clusters_df)),
        "notes": "Clusters and annotations loaded from CSV; expression in .h5ad stored on disk."
    }]


def scrna_clusters_data():
    """
    Parameters:
        None

    Returns:
        list[dict]: Cluster rows with ids, labels, and cell counts.

    Does:
        Projects the clusters CSV into JSON-ready dicts when RNA tables are available.
    """
    if not load_rna_tables():
        return []
    return [
        {
            "sample_id": "WMB-10Xv2-OLF",
            "cluster_id": str(row.cluster_alias),
            "n_cells": int(row.number_of_cells),
            "label": row.label,
        }
        for row in _clusters_df.itertuples()
    ]


def scrna_markers_data(cluster_id: str, limit: int):
    """
    Parameters:
        cluster_id (str): Cluster identifier to retrieve markers for.
        limit (int): Maximum number of marker rows to return.

    Returns:
        list[dict]: Marker rows with gene names and colors for the cluster.

    Does:
        Validates cluster_id, filters membership for the cluster, joins term metadata, and returns up to limit markers.
    """
    if not load_rna_tables():
        return []
    try:
        cid_int = int(cluster_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="cluster_id must be an integer")
    m = _membership_df[_membership_df["cluster_alias"] == cid_int]
    if m.empty:
        return []
    merged = m.merge(_terms_df, left_on="cluster_annotation_term_label", right_on="label", how="left")
    merged = merged.head(limit)
    results = []
    for row in merged.itertuples():
        results.append({
            "cluster_id": cluster_id,
            "gene": getattr(row, "cluster_annotation_term_label"),
            "name": getattr(row, "name_x", None) or getattr(row, "name_y", None),
            "logfc": None,
            "pval_adj": None,
            "color": getattr(row, "color_hex_triplet_x", None) or getattr(row, "color_hex_triplet_y", None),
        })
    return results


@router.get("/scrna/samples")
def scrna_samples():
    """
    Parameters:
        None

    Returns:
        list[dict]: scRNA sample metadata or empty list if not configured.

    Does:
        Calls scrna_samples_data and returns sample rows without raising when data is missing.
    """
    data = scrna_samples_data()
    if not data:
        # Return 204 to signal "no scRNA configured" without throwing
        return []
    return data


@router.get("/scrna/clusters")
def scrna_clusters(sample_id: Optional[str] = None):
    """
    Parameters:
        sample_id (str | None): Optional sample filter (unused in current data).

    Returns:
        list[dict]: Cluster rows for the scRNA sample set.

    Does:
        Returns clusters regardless of sample_id; kept for future filtering.
    """
    return scrna_clusters_data()


@router.get("/scrna/markers")
def scrna_markers(sample_id: str, cluster_id: str, limit: int = Query(50, ge=1, le=500)):
    """
    Parameters:
        sample_id (str): Sample identifier (placeholder for future use).
        cluster_id (str): Cluster id to fetch marker genes for.
        limit (int): Maximum number of markers to return.

    Returns:
        list[dict]: Marker rows with gene names/colors for the cluster.

    Does:
        Delegates to scrna_markers_data to fetch markers for a cluster, capped by limit.
    """
    return scrna_markers_data(cluster_id, limit)
