"""
Subject/session seeding stage.
Reason: seed subjects and one microscopy session per subject from subject_map; reusable in pipeline.
"""
from sqlalchemy import text
import pandas as pd
from code.src.conversion.subject_map import SUBJECT_MAP
from .paths import BIDS_ROOT
import re
from .stats import bump


def seed_subjects_and_sessions(conn, stats: dict):
    # Insert subjects
    for original_id, meta in SUBJECT_MAP.items():
        exp_type = "rabies" if "Rabies" in original_id else "double_injection"
        conn.execute(
            text("""
                INSERT INTO subjects (subject_id, original_id, sex, experiment_type, details)
                VALUES (:sub, :orig, :sex, :exp, :det)
                ON CONFLICT (subject_id) DO NOTHING;
            """),
            {
                "sub": meta["subject"],
                "orig": original_id,
                "sex": meta.get("sex", "U"),
                "exp": exp_type,
                "det": meta.get("details", ""),
            },
        )
    # Baseline sessions per subject (microscopy modality)
    existing_subj_with_session = {r.subject_id for r in conn.execute(text("SELECT DISTINCT subject_id FROM sessions"))}
    sess_rows = []
    for original_id, meta in SUBJECT_MAP.items():
        subj = meta["subject"]
        if subj in existing_subj_with_session:
            continue
        session_label = meta.get("session", "ses-01")
        sess_rows.append({"session_id": f"{subj}_{session_label}", "subject_id": subj, "modality": "micr"})
    if sess_rows:
        df = pd.DataFrame(sess_rows)
        stage = "_sessions_seed_stage"
        df.to_sql(
            stage,
            con=conn,
            if_exists="replace",
            index=False,
            method="multi",
        )
        conn.execute(
            text(
                f"""
                INSERT INTO sessions (session_id, subject_id, modality)
                SELECT session_id, subject_id, modality FROM {stage}
                ON CONFLICT (session_id) DO NOTHING;
                """
            )
        )
        conn.execute(text(f"DROP TABLE IF EXISTS {stage};"))
        stats["sessions_seeded"] = stats.get("sessions_seeded", 0) + len(df)


def cleanup_unknown_subjects(conn, allowed_subjects: set, stats: dict):
    """
    Remove any subjects/sessions/files not in the allowed set.
    Reason: prevent stray test subjects (e.g., sub-Z) from persisting across ETL runs.
    """
    # Extend allowed to include any well-formed IDs (sub-rabNN, sub-dblNN) already present
    pattern = re.compile(r"^sub-(rab|dbl)\\d+$", re.IGNORECASE)
    dyn_allowed = set()
    for row in conn.execute(text("SELECT DISTINCT subject_id FROM subjects")):
        sid = row.subject_id or ""
        if pattern.match(sid):
            dyn_allowed.add(sid)
    allowed_list = list(set(allowed_subjects) | dyn_allowed)
    # Delete region_counts for unknown subjects
    rc_deleted = conn.execute(
        text("DELETE FROM region_counts WHERE NOT (subject_id = ANY(:allowed))"),
        {"allowed": allowed_list},
    ).rowcount
    # Delete microscopy_files for unknown sessions
    mf_deleted = conn.execute(
        text("""
            DELETE FROM microscopy_files
            WHERE session_id IN (
                SELECT session_id FROM sessions WHERE NOT (subject_id = ANY(:allowed))
            )
        """),
        {"allowed": allowed_list},
    ).rowcount
    # Delete sessions
    sess_deleted = conn.execute(
        text("DELETE FROM sessions WHERE NOT (subject_id = ANY(:allowed))"),
        {"allowed": allowed_list},
    ).rowcount
    # Delete subjects
    subj_deleted = conn.execute(
        text("DELETE FROM subjects WHERE NOT (subject_id = ANY(:allowed))"),
        {"allowed": allowed_list},
    ).rowcount
    bump(stats, "cleanup_region_counts", rc_deleted)
    bump(stats, "cleanup_microscopy_files", mf_deleted)
    bump(stats, "cleanup_sessions", sess_deleted)
    bump(stats, "cleanup_subjects", subj_deleted)


def cleanup_unknown_subject_dirs(allowed_subjects: set, stats: dict):
    """
    Remove stray subject folders under data/raw_bids that are not in the allowed set.
    This keeps the on-disk BIDS tree aligned with subject_map to prevent sub-A/sub-Z from reappearing.
    """
    if not BIDS_ROOT.exists():
        return
    removed = 0
    pattern = re.compile(r"^sub-(rab|dbl)\\d+$", re.IGNORECASE)
    for child in BIDS_ROOT.iterdir():
        if not child.is_dir():
            continue
        name = child.name
        if not name.startswith("sub-"):
            continue
        if name in allowed_subjects or pattern.match(name):
            continue
        # remove disallowed subject directory
        import shutil
        shutil.rmtree(child, ignore_errors=True)
        removed += 1
    bump(stats, "cleanup_subject_dirs", removed)
