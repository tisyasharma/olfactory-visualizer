"""
Subject/session seeding stage.
Reason: seed subjects and one microscopy session per subject from config_map; reusable in pipeline.
"""
from sqlalchemy import text
import pandas as pd
from code.src.conversion.config_map import SUBJECT_MAP
from .utils import session_prefix
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
        exp_type = "rabies" if "Rabies" in original_id else "double_injection"
        pref = session_prefix(exp_type)
        sess_rows.append({"session_id": f"{subj}_ses-{pref}01", "subject_id": subj, "modality": "micr"})
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
    allowed_list = tuple(allowed_subjects)
    # Delete region_counts for unknown subjects
    rc_deleted = conn.execute(
        text("DELETE FROM region_counts WHERE subject_id NOT IN :allowed"),
        {"allowed": allowed_list},
    ).rowcount
    # Delete microscopy_files for unknown sessions
    mf_deleted = conn.execute(
        text("""
            DELETE FROM microscopy_files
            WHERE session_id IN (
                SELECT session_id FROM sessions WHERE subject_id NOT IN :allowed
            )
        """),
        {"allowed": allowed_list},
    ).rowcount
    # Delete sessions
    sess_deleted = conn.execute(
        text("DELETE FROM sessions WHERE subject_id NOT IN :allowed"),
        {"allowed": allowed_list},
    ).rowcount
    # Delete subjects
    subj_deleted = conn.execute(
        text("DELETE FROM subjects WHERE subject_id NOT IN :allowed"),
        {"allowed": allowed_list},
    ).rowcount
    bump(stats, "cleanup_region_counts", rc_deleted)
    bump(stats, "cleanup_microscopy_files", mf_deleted)
    bump(stats, "cleanup_sessions", sess_deleted)
    bump(stats, "cleanup_subjects", subj_deleted)
