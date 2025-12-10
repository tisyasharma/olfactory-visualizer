"""
Read-only endpoints for the basics (subjects, sessions, files, fluor metrics).
Kept separate from upload routes so the wiring stays sane.
"""
from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel
from code.api.deps import fetch_all
from code.api.utils import add_load_fraction, derive_genotype
from code.api.models import RegionLoadSummary, RegionLoadByMouse
import math

router = APIRouter(prefix="/api/v1", tags=["data"])


class Subject(BaseModel):
    subject_id: str
    sex: Optional[str] = None
    experiment_type: Optional[str] = None
    details: Optional[str] = None


@router.get("/subjects", response_model=List[Subject])
def list_subjects():
    rows = fetch_all("SELECT subject_id, sex, experiment_type, details FROM subjects ORDER BY subject_id")
    return rows


@router.get("/sessions")
def list_sessions(subject_id: Optional[str] = None):
    q = "SELECT session_id, subject_id, modality, session_date, protocol, notes FROM sessions"
    params = {}
    if subject_id:
        q += " WHERE subject_id = :sid"
        params["sid"] = subject_id
    q += " ORDER BY session_id"
    return fetch_all(q, params)


@router.get("/regions/tree")
def regions_tree():
    rows = fetch_all(
        "SELECT region_id, name, acronym, parent_id, st_level, atlas_id, ontology_id " \
        "FROM brain_regions " \
        "ORDER BY region_id"
    )
    return rows


@router.get("/files")
def list_files(session_id: Optional[str] = None, subject_id: Optional[str] = None):
    q = """
    SELECT mf.file_id, mf.session_id, s.subject_id, mf.run, mf.hemisphere, mf.path, mf.sha256, mf.created_at
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


@router.get("/fluor/counts")
def fluor_counts(
    subject_id: Optional[str] = None,
    region_id: Optional[int] = None,
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    limit: int = Query(500, ge=1, le=5000),
):
    q = """
    SELECT rc.subject_id, rc.region_id, br.name AS region_name, rc.region_pixels, rc.region_area_mm,
           rc.object_count, rc.object_pixels, rc.object_area_mm, rc.load, rc.norm_load,
           rc.hemisphere, rc.file_id
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
    """
    Aggregated region-level summary so the frontend doesn't have to crunch it.
    """
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
    rows = fetch_all("SELECT count(*) AS subjects FROM subjects")
    subs = rows[0]["subjects"]
    rows = fetch_all("SELECT count(*) AS files FROM microscopy_files")
    files = rows[0]["files"]
    rows = fetch_all("SELECT count(*) AS counts FROM region_counts")
    counts = rows[0]["counts"]
    return {"subjects": subs, "files": files, "counts": counts}


@router.get("/region-load/summary", response_model=List[RegionLoadSummary])
def region_load_summary(
    experiment_type: Optional[str] = Query("rabies", regex="^(rabies|double_injection)$"),
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    limit: int = Query(20000, ge=1, le=50000),
):
    """
    Region-level load fraction summary:
    - load_fraction = load / sum(load) per subject (mouse) within the filtered set.
    - Returns mean + SEM across mice for each region/hemisphere combo.
    """
    q = """
    SELECT rc.subject_id, br.name AS region, rc.hemisphere, rc.load, s.details, s.experiment_type
    FROM region_counts rc
    JOIN brain_regions br ON rc.region_id = br.region_id
    LEFT JOIN subjects s ON rc.subject_id = s.subject_id
    """
    params = {}
    where = []
    if experiment_type:
        where.append("s.experiment_type = :exp")
        params["exp"] = experiment_type
    if hemisphere:
        where.append("rc.hemisphere = :hemi")
        params["hemi"] = hemisphere
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY rc.subject_id, br.name LIMIT :lim"
    params["lim"] = limit
    rows = fetch_all(q, params)
    rows = add_load_fraction(rows, mouse_id_field="subject_id", load_field="load", out_field="load_fraction")

    # Group by region + hemisphere + genotype
    grouped = {}
    regions_seen = set()
    for r in rows:
        geno = derive_genotype(r.get("details"), r.get("experiment_type"))
        if geno not in ("Vglut1", "Vgat"):
            continue
        region = r["region"]
        hemi = r.get("hemisphere") or "bilateral"
        regions_seen.add((region, hemi))
        key = (region, hemi, geno)
        bucket = grouped.setdefault(key, {"values": [], "subjects": set()})
        lf = r.get("load_fraction")
        if lf is None:
            continue
        bucket["values"].append(lf)
        subj = r.get("subject_id")
        if subj:
            bucket["subjects"].add(subj)

    results = []
    for (region, hemi) in sorted(regions_seen):
        for geno in ("Vglut1", "Vgat"):
            key = (region, hemi, geno)
            data = grouped.get(key, {"values": [], "subjects": set()})
            vals = data["values"]
            n = len(vals)
            n_mice = len(data["subjects"])
            if not n:
                mean = 0.0
                sem = 0.0
            else:
                mean = sum(vals) / n
                if n > 1:
                    var = sum((v - mean) ** 2 for v in vals) / (n - 1)
                    sem = math.sqrt(var) / math.sqrt(n)
                else:
                    sem = 0.0
            results.append({
                "region": region,
                "hemisphere": hemi,
                "genotype": geno,
                "mean_load_fraction": mean,
                "sem_load_fraction": sem,
                "n_mice": n_mice
            })
    return results


@router.get("/region-load/by-mouse", response_model=List[RegionLoadByMouse])
def region_load_by_mouse(
    experiment_type: Optional[str] = Query("rabies", regex="^(rabies|double_injection)$"),
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    limit: int = Query(20000, ge=1, le=50000),
):
    """
    Per-mouse load and load_fraction for each region. Helpful for debugging normalization.
    """
    q = """
    SELECT rc.subject_id, br.name AS region, rc.hemisphere, rc.load, s.details, s.experiment_type
    FROM region_counts rc
    JOIN brain_regions br ON rc.region_id = br.region_id
    LEFT JOIN subjects s ON rc.subject_id = s.subject_id
    """
    params = {}
    where = []
    if experiment_type:
        where.append("s.experiment_type = :exp")
        params["exp"] = experiment_type
    if hemisphere:
        where.append("rc.hemisphere = :hemi")
        params["hemi"] = hemisphere
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY rc.subject_id, br.name LIMIT :lim"
    params["lim"] = limit
    rows = fetch_all(q, params)
    rows = add_load_fraction(rows, mouse_id_field="subject_id", load_field="load", out_field="load_fraction")
    results = []
    for r in rows:
        geno = derive_genotype(r.get("details"), r.get("experiment_type"))
        if geno not in ("Vglut1", "Vgat"):
            continue
        results.append({
            "subject_id": r["subject_id"],
            "region": r["region"],
            "hemisphere": r.get("hemisphere") or "bilateral",
            "load": r.get("load"),
            "load_fraction": r.get("load_fraction"),
            "genotype": geno,
        })
    return results
