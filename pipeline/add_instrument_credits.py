"""
One-time migration: add instrument_credits JSONB column to songs table.
Safe to run multiple times (uses IF NOT EXISTS).

Run:
  python pipeline/add_instrument_credits.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS instrument_credits JSONB;
""")
print("  + instrument_credits JSONB")

conn.commit()
cur.close()
conn.close()
print("Migration complete.")
