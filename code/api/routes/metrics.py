"""
Analytics endpoints for region load metrics and aggregations.
"""
from typing import List, Optional
import math

from fastapi import APIRouter, Query

from code.api.dependencies import fetch_all
from code.api.utils import add_load_fraction, derive_genotype
from code.api.models import RegionLoadSummary, RegionLoadByMouse

router = APIRouter(prefix="/api/v1", tags=["metrics"])


@router.get("/region-load/summary", response_model=List[RegionLoadSummary])
def region_load_summary(
    experiment_type: Optional[str] = Query("rabies", regex="^(rabies|double_injection)$"),
    hemisphere: Optional[str] = Query(None, regex="^(left|right|bilateral)$"),
    limit: int = Query(20000, ge=1, le=50000),
):
    """
    Parameters:
        experiment_type (str | None): Filter by experiment type (default rabies).
        hemisphere (str | None): Optional hemisphere filter.
        limit (int): Row cap for the base query.

    Returns:
        list[dict]: Mean and SEM load_fraction by region, hemisphere, genotype with mouse counts.

    Does:
        Fetches region load rows, normalizes per-mouse load_fraction, groups by
        region/hemisphere/genotype, and computes mean/SEM.
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
    else:
        where.append("rc.hemisphere IN ('left','right')")
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY rc.subject_id, br.name LIMIT :lim"
    params["lim"] = limit
    rows = fetch_all(q, params)

    total_rows = fetch_all(
        """
        SELECT rc.subject_id, SUM(rc.load) AS total_load
        FROM region_counts rc
        JOIN subjects s ON s.subject_id = rc.subject_id
        WHERE (:exp IS NULL OR s.experiment_type = :exp)
          AND rc.hemisphere = 'right'
        GROUP BY rc.subject_id
        """,
        {"exp": experiment_type} if experiment_type else {"exp": None},
    )
    totals_map = {r["subject_id"]: r["total_load"] for r in total_rows}
    rows = add_load_fraction(
        rows, mouse_id_field="subject_id", load_field="load",
        out_field="load_fraction", totals_map=totals_map
    )

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
    Parameters:
        experiment_type (str | None): Filter by experiment type (default rabies).
        hemisphere (str | None): Optional hemisphere filter.
        limit (int): Row cap for the base query.

    Returns:
        list[dict]: Per-mouse load and load_fraction per region with genotype tag.

    Does:
        Retrieves region load rows, computes load_fraction per mouse, filters to
        Vglut1/Vgat, and returns mouse-level values.
    """
    q = """
    SELECT rc.subject_id, br.name AS region, rc.hemisphere, rc.load,
           s.details, s.experiment_type
    FROM region_counts rc
    JOIN brain_regions br ON rc.region_id = br.region_id
    LEFT JOIN subjects s ON rc.subject_id = s.subject_id
    """
    params = {}
    where = []
    if experiment_type == "double_injection":
        where.append("""
            (
                (s.experiment_type ILIKE 'double%inj%') OR
                (s.details ILIKE '%retro%' OR s.details ILIKE '%contra%'
                 OR s.details ILIKE '%commiss%' OR s.details ILIKE '%double%inj%') OR
                (s.experiment_type ILIKE 'rabies' AND s.details ILIKE '%vglut%')
            )
        """)
    elif experiment_type:
        where.append("s.experiment_type = :exp")
        params["exp"] = experiment_type
    if hemisphere:
        where.append("rc.hemisphere = :hemi")
        params["hemi"] = hemisphere
    else:
        where.append("rc.hemisphere IN ('left','right')")
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY rc.subject_id, br.name LIMIT :lim"
    params["lim"] = limit
    rows = fetch_all(q, params)

    if experiment_type == "double_injection":
        total_q = """
        SELECT rc.subject_id, SUM(rc.load) AS total_load
        FROM region_counts rc
        JOIN subjects s ON s.subject_id = rc.subject_id
        WHERE rc.hemisphere = 'right' AND (
            s.experiment_type ILIKE 'double%inj%' OR
            s.details ILIKE '%retro%' OR s.details ILIKE '%contra%'
            OR s.details ILIKE '%commiss%' OR s.details ILIKE '%double%inj%' OR
            (s.experiment_type ILIKE 'rabies' AND s.details ILIKE '%vglut%')
        )
        GROUP BY rc.subject_id
        """
        total_rows = fetch_all(total_q, {})
    else:
        total_rows = fetch_all(
            """
            SELECT rc.subject_id, SUM(rc.load) AS total_load
            FROM region_counts rc
            JOIN subjects s ON s.subject_id = rc.subject_id
            WHERE (:exp IS NULL OR s.experiment_type = :exp)
              AND rc.hemisphere = 'right'
            GROUP BY rc.subject_id
            """,
            {"exp": experiment_type} if experiment_type else {"exp": None},
        )
    totals_map = {r["subject_id"]: r["total_load"] for r in total_rows}
    rows = add_load_fraction(
        rows, mouse_id_field="subject_id", load_field="load",
        out_field="load_fraction", totals_map=totals_map
    )

    allowed_genos = {"Vglut1", "Vgat"}
    if experiment_type == "double_injection":
        allowed_genos.add("Contra")

    results = []
    for r in rows:
        det = (r.get("details") or "").lower()
        exp_type = (r.get("experiment_type") or "").lower()
        geno = derive_genotype(r.get("details"), r.get("experiment_type"))
        is_contra = (
            exp_type.startswith("double") or "retro" in det
            or "contra" in det or "commiss" in det
        )
        if experiment_type == "double_injection" and is_contra:
            geno = "Contra"
        if geno not in allowed_genos:
            continue

        results.append({
            "subject_id": r["subject_id"],
            "region": r["region"],
            "hemisphere": r.get("hemisphere") or "bilateral",
            "load": r.get("load"),
            "load_fraction": r.get("load_fraction"),
            "genotype": geno,
            "details": r.get("details"),
            "experiment_type": r.get("experiment_type"),
        })
    return results
