"""
End-to-end ETL runner.
Reason: orchestrates modular stages so etl.py can stay thin and testable.
"""
from sqlalchemy import text
from code.database.connect import get_engine
from .paths import DATA_ROOT, BIDS_ROOT, ATLAS_JSON
from . import subjects, bids, atlas, counts
from .stats import summarize
from .atlas import load_atlas
from code.src.conversion.config_map import SUBJECT_MAP


def run_etl():
    engine = get_engine()
    stats = {
        "sessions_seeded": 0,
        "sessions_from_counts": 0,
        "sessions_from_bids": 0,
        "microscopy_inserted": 0,
        "microscopy_skipped_dupe": 0,
        "counts_ingested_rows": 0,
        "counts_skipped_dupe_files": 0,
        "counts_skipped_missing_file": 0,
    }

    print(f"\n🚀 Starting ETL Pipeline...")
    print(f"Reading data from: {DATA_ROOT}")

    # Step 1: subjects/sessions from config
    print("\n--- Step 1: Loading Subjects ---")
    with engine.begin() as conn:
        allowed_subjects = {meta["subject"] for meta in SUBJECT_MAP.values()}
        subjects.cleanup_unknown_subjects(conn, allowed_subjects, stats)
        subjects.seed_subjects_and_sessions(conn, stats)
        conn.execute(text("INSERT INTO ingest_log (source_path, status, message) VALUES (:p, :s, :m)"),
                     {"p": str(DATA_ROOT), "s": "started", "m": "ETL started"})
    # Also clean disallowed subject directories on disk so they don't reappear
    subjects.cleanup_unknown_subject_dirs(allowed_subjects, stats)

    # Step 2: BIDS imaging files
    print("\n--- Step 2: Registering imaging files (BIDS) ---")
    print(f"BIDS root: {BIDS_ROOT}")
    bids.load_bids_files(engine, stats, allowed_subjects=allowed_subjects)
    file_map = bids.build_file_map(engine)

    # Step 3: Atlas
    print("\n--- Step 3: Loading Allen Atlas Regions ---")
    load_atlas(engine)
    atlas_map = {}
    with engine.connect() as conn:
        atlas_map = {row.region_id: row.name for row in conn.execute(text("SELECT region_id, name FROM brain_regions"))}
        # ensure units present
        unit_map = {r._mapping["name"]: r._mapping["unit_id"] for r in conn.execute(text("SELECT unit_id, name FROM units"))}

    # Step 4: Quantification CSVs
    print("\n--- Step 4: Processing Quantification Files ---")
    count_rows, session_rows_from_counts, extra_regions = counts.ingest_counts(engine, unit_map, atlas_map, file_map, stats)
    counts.insert_counts(engine, count_rows, session_rows_from_counts, extra_regions)

    # Log end
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO ingest_log (source_path, status, message) VALUES (:p, :s, :m)"),
                     {"p": str(DATA_ROOT), "s": "success", "m": "ETL complete"})

    print("\n✅ ETL Complete. Database hydrated.")
    print("\n--- Summary ---")
    print(summarize(stats))


if __name__ == "__main__":
    run_etl()
