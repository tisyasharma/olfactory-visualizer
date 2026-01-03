"""
Read-only endpoints for core data: subjects, sessions, files, regions, and basic counts.
"""
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, Query
from pydantic import BaseModel

from code.api.dependencies import fetch_all
from code.config import DATA_DIR

router = APIRouter(prefix="/api/v1", tags=["data"])


class Subject(BaseModel):
    subject_id: str
    sex: Optional[str] = None
    experiment_type: Optional[str] = None
    details: Optional[str] = None


@router.get("/subjects", response_model=List[Subject])
def list_subjects():
    """Fetches all subjects ordered by subject_id."""
    rows = fetch_all(
        "SELECT subject_id, sex, experiment_type, details FROM subjects ORDER BY subject_id"
    )
    return rows


@router.get("/sessions")
def list_sessions(subject_id: Optional[str] = None):
    """Retrieves sessions, optionally filtered by subject_id."""
    q = "SELECT session_id, subject_id, modality, session_date, protocol, notes FROM sessions"
    params = {}
    if subject_id:
        q += " WHERE subject_id = :sid"
        params["sid"] = subject_id
    q += " ORDER BY session_id"
    return fetch_all(q, params)


@router.get("/regions/tree")
def regions_tree():
    """Returns the full brain_regions table ordered by region_id."""
    rows = fetch_all(
        "SELECT region_id, name, acronym, parent_id, st_level, atlas_id, ontology_id "
        "FROM brain_regions ORDER BY region_id"
    )
    return rows


@router.get("/files")
def list_files(session_id: Optional[str] = None, subject_id: Optional[str] = None):
    """Lists microscopy files with optional session/subject filters."""
    q = """
    SELECT mf.file_id, mf.session_id, s.subject_id, mf.run, mf.hemisphere,
           mf.path, mf.sha256, mf.created_at
    FROM microscopy_files mf
    JOIN sessions s ON mf.session_id = s.session_id
    """
    params = {}
    where = []
    if session_id:
        where.append("mf.session_id = :sess")
        params["sess"] = session_id
    if subject_id:
        where.append("s.subject_id = :subj")
        params["subj"] = subject_id
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY mf.session_id, mf.run NULLS LAST"
    return fetch_all(q, params)


@router.get("/microscopy-stacks")
def list_microscopy_stacks():
    """
    Returns all OME-Zarr microscopy stacks available for viewing.
    Returns stacks with subject info, experiment type, and URL path.
    """
    try:
        q = """
        SELECT 
            mf.file_id,
            mf.session_id,
            s.subject_id,
            mf.run,
            mf.hemisphere,
            mf.path,
            subj.experiment_type
        FROM microscopy_files mf
        JOIN sessions s ON mf.session_id = s.session_id
        JOIN subjects subj ON s.subject_id = subj.subject_id
        WHERE mf.path LIKE '%.zarr'
        ORDER BY s.subject_id, mf.run NULLS LAST
        """
        rows = fetch_all(q)
        
        # Convert file paths to URLs and create display names
        stacks = []
        for row in rows:
            try:
                # Convert path to URL
                # Paths in DB can be absolute or relative
                # The server mounts /data to serve DATA_DIR (which is ROOT / "data")
                path_str = str(row.get("path", ""))
                if not path_str:
                    continue
                    
                path = Path(path_str)
                
                # If absolute path, make it relative to DATA_DIR
                if path.is_absolute():
                    try:
                        # Try to make it relative to DATA_DIR
                        rel_path = path.relative_to(DATA_DIR)
                        url = f"/data/{rel_path}"
                    except ValueError:
                        # If not under DATA_DIR, try to extract just the relative part
                        # Look for "raw_bids" or "data" in the path
                        path_parts = path.parts
                        if "raw_bids" in path_parts:
                            idx = path_parts.index("raw_bids")
                            rel_path = Path(*path_parts[idx:])
                            url = f"/data/{rel_path}"
                        elif "data" in path_parts:
                            idx = path_parts.index("data")
                            rel_path = Path(*path_parts[idx:])
                            url = f"/{rel_path}"
                        else:
                            # Fallback: use as-is and prepend /data/
                            url = f"/data/{path_str}"
                else:
                    # Already relative, prepend /data/ if needed
                    if path_str.startswith("data/") or path_str.startswith("/data/"):
                        url = path_str if path_str.startswith("/") else f"/{path_str}"
                    elif path_str.startswith("raw_bids/"):
                        url = f"/data/{path_str}"
                    else:
                        url = f"/data/{path_str}"
                
                # Create display name
                subject_id = row.get("subject_id", "unknown")
                exp_type = row.get("experiment_type", "unknown")
                exp_label = "Rabies" if exp_type == "rabies" else "Dual Injection"
                name = f"{subject_id} ({exp_label})"
                
                stacks.append({
                    "id": f"{subject_id}_run{row.get('run', 0)}",
                    "file_id": row.get("file_id", 0),
                    "subject_id": subject_id,
                    "session_id": row.get("session_id", ""),
                    "run": row.get("run", 0),
                    "hemisphere": row.get("hemisphere"),
                    "name": name,
                    "url": url,
                    "path": path_str,
                })
            except Exception:
                continue

        return stacks
    except Exception:
        raise


@router.get("/fluor/counts")
def fluor_counts(
    subject_id: Optional[str] = None,
    region_id: Optional[int] = None,
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    limit: int = Query(500, ge=1, le=5000),
):
    """Queries region_counts joined to brain_regions with optional filters."""
    q = """
    SELECT rc.subject_id, rc.region_id, br.name AS region_name, rc.region_pixels,
           rc.region_area_mm, rc.object_count, rc.object_pixels, rc.object_area_mm,
           rc.load, rc.norm_load, rc.hemisphere, rc.file_id
    FROM region_counts rc
    JOIN brain_regions br ON rc.region_id = br.region_id
    """
    params = {}
    where = []
    if subject_id:
        where.append("rc.subject_id = :sid")
        params["sid"] = subject_id
    if region_id:
        where.append("rc.region_id = :rid")
        params["rid"] = region_id
    if hemisphere:
        where.append("rc.hemisphere = :hemi")
        params["hemi"] = hemisphere
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY rc.subject_id, rc.region_id LIMIT :lim"
    params["lim"] = limit
    return fetch_all(q, params)


@router.get("/fluor/summary")
def fluor_summary(
    experiment_type: Optional[str] = Query(None, regex="^(double_injection|rabies)$"),
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    subject_id: Optional[str] = None,
    region_id: Optional[int] = None,
    group_by: Optional[str] = Query(None, regex="^(genotype|subject)$"),
    limit: int = Query(500, ge=1, le=5000),
):
    """Builds a grouped summary query over region_counts with optional filters."""
    grouping = []
    select_group = []
    q = """
    SELECT br.region_id,
           br.name AS region_name,
           rc.hemisphere,
           COUNT(*) AS records,
           SUM(rc.region_pixels) AS region_pixels_sum,
           AVG(rc.region_pixels) AS region_pixels_avg,
           SUM(rc.load) AS load_sum,
           AVG(rc.load) AS load_avg,
           SUM(rc.object_count) AS object_count_sum,
           AVG(rc.object_count) AS object_count_avg
    """
    if group_by == "genotype":
        select_group.append("COALESCE(s.details, s.experiment_type) AS group_label")
        grouping.append("COALESCE(s.details, s.experiment_type)")
    elif group_by == "subject":
        select_group.append("s.subject_id AS group_label")
        grouping.append("s.subject_id")

    if select_group:
        q = q.replace("SELECT ", "SELECT " + ", ".join(select_group) + ", ")

    q += """
    FROM region_counts rc
    JOIN brain_regions br ON rc.region_id = br.region_id
    JOIN subjects s ON rc.subject_id = s.subject_id
    """
    params = {}
    where = []
    if experiment_type:
        if experiment_type == "double_injection":
            where.append(
                "(s.experiment_type = :exp OR s.details ILIKE '%retro%' "
                "OR s.details ILIKE '%contra%' OR s.details ILIKE '%commiss%')"
            )
        else:
            where.append("s.experiment_type = :exp")
        params["exp"] = experiment_type
    if hemisphere:
        where.append("rc.hemisphere = :hemi")
        params["hemi"] = hemisphere
    if subject_id:
        where.append("rc.subject_id = :sid")
        params["sid"] = subject_id
    if region_id:
        where.append("rc.region_id = :rid")
        params["rid"] = region_id
    if where:
        q += " WHERE " + " AND ".join(where)
    group_clause = ["br.region_id", "br.name", "rc.hemisphere"] + grouping
    q += "\n    GROUP BY " + ", ".join(group_clause)
    order_clause = ["br.region_id"]
    if grouping:
        order_clause.append(", ".join(grouping))
    q += "\n    ORDER BY " + ", ".join(order_clause)
    q += "\n    LIMIT :lim"
    params["lim"] = limit
    return fetch_all(q, params)


@router.get("/status")
def status():
    """Returns counts of subjects, files, and region_count rows."""
    rows = fetch_all("SELECT count(*) AS subjects FROM subjects")
    subs = rows[0]["subjects"]
    rows = fetch_all("SELECT count(*) AS files FROM microscopy_files")
    files = rows[0]["files"]
    rows = fetch_all("SELECT count(*) AS counts FROM region_counts")
    counts = rows[0]["counts"]
    return {"subjects": subs, "files": files, "counts": counts}
