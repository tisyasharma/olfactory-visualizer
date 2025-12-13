'''
File responsible for connecting the Postgres server to the Python Client.
Now modularized so other scripts (like etl.py) can import the connection.
'''
import os
import sys
from sqlalchemy import create_engine, text

# CONNECTION SETTINGS
# Prefer env override so dev/prod can differ without code changes
DB_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://tisyasharma@localhost:5432/murthy_db")
# Fix Render/Supabase style prefixes (postgres://) that SQLAlchemy doesn't accept
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql://", 1)

def get_engine():
    """Creates and returns a database engine."""
    try:
        engine = create_engine(DB_URL)
        return engine
    except Exception as e:
        print(f"❌ Error creating engine: {e}")
        sys.exit(1)

def test_connection():
    """Runs a quick check to see if Postgres is awake."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version();"))
            version = result.fetchone()[0]
            print(f"✅ SUCCESS: Connected to Postgres!")
            print(f"   Version: {version}")
            return True
    except Exception as e:
        print(f"❌ CONNECTION FAILED: {e}")
        print("   Is the Postgres app running?")
        return False

# This block only runs if you execute this file directly (python connect.py)
if __name__ == "__main__":
    test_connection()
