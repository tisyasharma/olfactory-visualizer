"""
Lightweight helpers for post-query munging/normalization.
"""
from collections import defaultdict
from typing import Iterable, Mapping


def add_load_fraction(
    rows: Iterable[Mapping],
    mouse_id_field: str = "subject_id",
    load_field: str = "load",
    out_field: str = "load_fraction",
    totals_map: Mapping | None = None,
):
    """
    Parameters:
        rows (Iterable[Mapping]): Row dicts to enrich.
        mouse_id_field (str): Field name to group by (per-mouse).
        load_field (str): Field name holding load values.
        out_field (str): Field name to write load_fraction into.

    Returns:
        list[dict]: Copy of rows with load_fraction added.

    Does:
        Computes load_fraction per mouse (row load / total load per mouse) and appends it to each row copy.
    """
    rows = list(rows)
    totals = defaultdict(float)
    if totals_map:
        for k, v in totals_map.items():
            try:
                totals[k] = float(v) if v is not None else 0.0
            except Exception:
                totals[k] = 0.0
    else:
        for r in rows:
            try:
                val = r.get(load_field)
                if val is None:
                    continue
                totals[r.get(mouse_id_field)] += float(val)
            except Exception:
                continue
    enriched = []
    for r in rows:
        r_copy = dict(r)
        load_val = r_copy.get(load_field)
        subj = r_copy.get(mouse_id_field)
        total = totals.get(subj) or 0.0
        if load_val is None or total == 0:
            r_copy[out_field] = None
        else:
            r_copy[out_field] = float(load_val) / float(total)
        enriched.append(r_copy)
    return enriched


def derive_genotype(details: str = None, experiment_type: str = None):
    """
    Parameters:
        details (str | None): Freeform subject details.
        experiment_type (str | None): Experiment type tag.

    Returns:
        str: Genotype label ('Vgat', 'Vglut1', or 'other').

    Does:
        Quick string-based tagger to pick a genotype label from subject notes/experiment type.
    """
    """
    Quick string-based genotype tag so the client doesn't have to guess.
    """
    label = " ".join([details or "", experiment_type or ""]).lower()
    if "vgat" in label:
        return "Vgat"
    if "vglut" in label:
        return "Vglut1"
    return "other"
