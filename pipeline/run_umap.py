import numpy as np
import psycopg
from dotenv import load_dotenv
import os
import json

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Fetch all songs with embeddings
cur.execute("SELECT id, name, artist, embedding FROM songs WHERE embedding IS NOT NULL")
rows = cur.fetchall()
print(f"Found {len(rows)} songs with embeddings")

if len(rows) < 5:
    print("Need at least 5 songs with embeddings for UMAP.")
    exit()

song_ids = [row[0] for row in rows]
song_names = [f"{row[2]} — {row[1]}" for row in rows]
embeddings = np.array([json.loads(row[3]) for row in rows])

print(f"Embedding matrix shape: {embeddings.shape}")

# Run UMAP
import umap

print("Running UMAP...")
reducer = umap.UMAP(
    n_components=2,
    n_neighbors=min(15, len(rows) - 1),
    min_dist=0.1,
    metric="cosine",
    random_state=42,
)

coords = reducer.fit_transform(embeddings)

# Normalize to [-500, 500] range
for dim in range(2):
    col = coords[:, dim]
    col_min, col_max = col.min(), col.max()
    if col_max - col_min > 0:
        coords[:, dim] = ((col - col_min) / (col_max - col_min) * 2 - 1) * 500

print(f"Coordinate ranges:")
print(f"  X: [{coords[:,0].min():.1f}, {coords[:,0].max():.1f}]")
print(f"  Y: [{coords[:,1].min():.1f}, {coords[:,1].max():.1f}]")

# Store coordinates back in database
for i, song_id in enumerate(song_ids):
    x = float(coords[i, 0])
    y = float(coords[i, 1])
    cur.execute("UPDATE songs SET umap_x = %s, umap_y = %s WHERE id = %s", (x, y, song_id))

conn.commit()

# Print the map
print(f"\n{'='*60}")
print("UMAP Song Map:")
print(f"{'='*60}")
for i, name in enumerate(song_names):
    x, y = coords[i]
    print(f"  ({x:7.1f}, {y:7.1f})  {name}")

cur.close()
conn.close()
print(f"\n✓ UMAP coordinates stored for {len(rows)} songs")