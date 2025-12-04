# ETL package initialization.
# Modules under this folder split the pipeline into testable pieces:
# - paths: shared filesystem roots
# - utils: helpers (hashing, CSV load, hemisphere detection, session ids)
# - subjects: seed subjects/sessions from config_map
# - bids: scan OME-Zarr/BIDS, dedupe by hash, register sessions/files
# - atlas: load Allen atlas into brain_regions
# - counts: ingest quantification CSVs with checksum dedupe
# - stats: simple counter/summary helpers
# - runner: orchestrates the end-to-end ETL

