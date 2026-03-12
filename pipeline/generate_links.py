import json
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import psycopg
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Fetch all songs with embeddings
cur.execute("SELECT id, name, artist, embedding FROM songs WHERE embedding IS NOT NULL")
rows = cur.fetchall()
print(f"Computing similarity for {len(rows)} songs...")

song_ids = [row[0] for row in rows]
song_names = [f"{row[2]} — {row[1]}" for row in rows]
embeddings = np.array([json.loads(row[3]) for row in rows])

# Compute cosine similarity matrix
sim_matrix = cosine_similarity(embeddings)
print(f"Similarity matrix shape: {sim_matrix.shape}")

# Clear old similarity links (keep the original seed links)
cur.execute("DELETE FROM links WHERE type = 'embedding_similarity'")
conn.commit()

# Generate links: top-K most similar per song
TOP_K = 6
THRESHOLD = 0.60  # Lower threshold since we have mixed embedding sources

links_created = 0
seen = set()

for i in range(len(song_ids)):
    similarities = sim_matrix[i]
    # Get top-K indices excluding self
    top_indices = np.argsort(similarities)[::-1][1:TOP_K + 1]

    for j in top_indices:
        score = float(similarities[j])
        if score < THRESHOLD:
            continue

        # Deduplicate
        pair = tuple(sorted([song_ids[i], song_ids[j]]))
        if pair in seen:
            continue
        seen.add(pair)

        cur.execute("""
            INSERT INTO links (id, source_id, target_id, reason, score, type)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            f"sim-{links_created}",
            song_ids[i],
            song_ids[j],
            None,  # We'll generate reasons later with AI
            round(score, 4),
            "embedding_similarity",
        ))
        links_created += 1

conn.commit()

print(f"\n✓ Created {links_created} similarity links")

# Show the strongest connections
cur.execute("""
    SELECT s1.name, s1.artist, s2.name, s2.artist, l.score
    FROM links l
    JOIN songs s1 ON l.source_id = s1.id
    JOIN songs s2 ON l.target_id = s2.id
    WHERE l.type = 'embedding_similarity'
    ORDER BY l.score DESC
    LIMIT 15
""")

print(f"\nTop connections:")
print(f"{'='*70}")
for row in cur.fetchall():
    print(f"  {row[1]} — {row[0]}")
    print(f"    ↔ {row[3]} — {row[2]}")
    print(f"    Score: {row[4]}")
    print()

cur.close()
conn.close()