"""
One-time migration: add umap_sonic_x/y, umap_vibe_x/y, umap_genetics_x/y columns to songs table.
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
    "umap_sonic_x",
    "umap_sonic_y",
    "umap_vibe_x",
    "umap_vibe_y",
    "umap_genetics_x",
    "umap_genetics_y",
]

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

for col in COLUMNS:
    cur.execute(f"""
        ALTER TABLE songs
        ADD COLUMN IF NOT EXISTS {col} FLOAT;
    """)
    print(f"  ✓ {col}")

conn.commit()
cur.close()
conn.close()
print("Migration complete.")
