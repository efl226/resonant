"""
One-time migration: add 3D UMAP columns to songs table.
Adds umap_sonic_x3/y3/z3, umap_vibe_x3/y3/z3, umap_genetics_x3/y3/z3.
Safe to run multiple times (uses IF NOT EXISTS).

Run:
  python pipeline/add_layout_columns_3d.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

COLUMNS = [
    "umap_sonic_x3",
    "umap_sonic_y3",
    "umap_sonic_z3",
    "umap_vibe_x3",
    "umap_vibe_y3",
    "umap_vibe_z3",
    "umap_genetics_x3",
    "umap_genetics_y3",
    "umap_genetics_z3",
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
