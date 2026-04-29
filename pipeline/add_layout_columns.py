"""
One-time migration: add 2D layout UMAP columns to songs table.
Adds sonic, vibe, decade, dna layout columns + per-layout cluster IDs.
Safe to run multiple times (uses IF NOT EXISTS).

Run:
  python pipeline/add_layout_columns.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

COLUMNS = [
    ("umap_sonic_x",    "FLOAT"),
    ("umap_sonic_y",    "FLOAT"),
    ("umap_vibe_x",     "FLOAT"),
    ("umap_vibe_y",     "FLOAT"),
    ("umap_decade_x",   "FLOAT"),
    ("umap_decade_y",   "FLOAT"),
    ("umap_dna_x",      "FLOAT"),
    ("umap_dna_y",      "FLOAT"),
    # per-layout cluster IDs
    ("cluster_sonic_id",   "INT"),
    ("cluster_vibe_id",    "INT"),
    ("cluster_decade_id",  "INT"),
    ("cluster_dna_id",     "INT"),
]

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

for col, dtype in COLUMNS:
    cur.execute(f"""
        ALTER TABLE songs
        ADD COLUMN IF NOT EXISTS {col} {dtype};
    """)
    print(f"  ✓ {col}")

conn.commit()
cur.close()
conn.close()
print("Migration complete.")
