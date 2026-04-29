"""
Add Enrichment Columns
──────────────────────
Adds isrc and mb_credits columns to the songs table.
Run once before fetch_musicbrainz.py or backfill_isrc.py.

Usage:
    python add_enrichment_columns.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("ALTER TABLE songs ADD COLUMN IF NOT EXISTS isrc TEXT")
cur.execute("ALTER TABLE songs ADD COLUMN IF NOT EXISTS mb_credits JSONB")
conn.commit()

cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'songs' AND column_name IN ('isrc', 'mb_credits')
    ORDER BY column_name
""")
cols = [r[0] for r in cur.fetchall()]
print(f"Confirmed columns: {cols}")

cur.close()
conn.close()
print("Done.")
