import sys
import os
from pathlib import Path
from sqlalchemy import text

# Fix path so we can import 'connect.py' regardless of where this script is run
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.append(str(HERE))
try:
    from connect import get_engine
except ImportError:
    # fallback to repo root layout
    sys.path.append(str(ROOT / "code" / "database"))
    try:
        from connect import get_engine
    except ImportError:
        print("❌ ERROR: Could not find connect.py. Run from repo root or ensure code/database is on PYTHONPATH.")
        sys.exit(1)

def init_database():
    engine = get_engine()
    schema_path = HERE / "schema.sql"
    
    print(f"Reading schema from: {schema_path}")
    
    try:
        with open(schema_path, 'r') as f:
            sql_commands = f.read()

        with engine.connect() as conn:
            # Execute the entire SQL script
            conn.execute(text(sql_commands))
            conn.commit()
            print("✅ SUCCESS: Tables created! (public imaging + rna schema)")
            
    except FileNotFoundError:
        print(f"❌ ERROR: schema.sql not found at {schema_path}. Run from repo root or ensure the file exists.")

if __name__ == "__main__":
    init_database()
