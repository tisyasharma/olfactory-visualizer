"""Database connection utilities for Postgres."""
import os
from sqlalchemy import create_engine, text

# Prefer env override so dev/prod can differ without code changes
DB_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://localhost:5432/murthy_db")
# Fix Render/Supabase style prefixes (postgres://) that SQLAlchemy doesn't accept
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql://", 1)

def get_engine():
    """Creates and returns a database engine."""
    try:
        engine = create_engine(DB_URL)
        return engine
    except Exception as e:
        raise RuntimeError(f"Failed to create database engine: {e}") from e

def test_connection(verbose=True):
    """Runs a quick check to see if Postgres is awake."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version();"))
            version = result.fetchone()[0]
            if verbose:
                print(f"Connected to Postgres\n  Version: {version}")
            return True
    except Exception as e:
        if verbose:
            print(f"Connection failed: {e}\n  Is the Postgres app running?")
        return False

# This block only runs if you execute this file directly (python connect.py)
if __name__ == "__main__":
    test_connection()
