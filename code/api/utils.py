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
):
    """
    Add per-mouse load_fraction (load / sum(load) per mouse) to a list of row dicts.
    Expects rows to have a load value; returns a new list with an added key.
    """
    rows = list(rows)
    totals = defaultdict(float)
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


def derive_genotype(details: str = None, experiment_type: str = None) -> str:
    """
    Quick string-based genotype tag so the client doesn't have to guess.
    """
    label = " ".join([details or "", experiment_type or ""]).lower()
    if "vgat" in label:
        return "Vgat"
    if "vglut" in label:
        return "Vglut1"
    return "other"
