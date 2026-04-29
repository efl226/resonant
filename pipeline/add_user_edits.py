"""Add user_notes (TEXT) and user_edits (JSONB) columns to songs table."""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

conn = psycopg.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()
try:
    cur.execute("ALTER TABLE songs ADD COLUMN IF NOT EXISTS user_notes TEXT")
    cur.execute("ALTER TABLE songs ADD COLUMN IF NOT EXISTS user_edits JSONB DEFAULT '{}'::jsonb")
    conn.commit()
    print("✓ Added user_notes, user_edits columns to songs table")
except Exception as e:
    conn.rollback()
    print(f"✗ Error: {e}")
finally:
    cur.close()
    conn.close()
