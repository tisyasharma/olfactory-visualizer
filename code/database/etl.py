"""
Thin ETL entrypoint.
Reason: delegate to modular pipeline in code.database.etl.runner.
"""
import sys
from pathlib import Path

# Ensure project root is on path so `code` package is importable when run as a script
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from code.database.etl.runner import run_etl

if __name__ == "__main__":
    run_etl()
