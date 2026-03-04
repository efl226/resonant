import json
import psycopg
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Load your existing seed data
with open("frontend/src/data/songsseed.json", "r") as f:
    data = json.load(f)

print(f"Found {len(data['nodes'])} songs and {len(data['links'])} links")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Clear existing data so we can re-run cleanly
cur.execute("DELETE FROM songs")

for song in data["nodes"]:
    sonic = song.get("sonic_dna", {})
    genetic = song.get("genetic_dna", {})
    visual = song.get("visual_dna", {})
    semantic = song.get("semantic_dna", {})

    # Handle featuring — can be string, list, or null
    featuring = genetic.get("featuring")
    if isinstance(featuring, str):
        featuring = [featuring] if featuring else []
    elif featuring is None:
        featuring = []

    # Handle songwriter — can be string or list
    songwriter = genetic.get("songwriter")
    if isinstance(songwriter, str):
        songwriter = [songwriter] if songwriter else []
    elif songwriter is None:
        songwriter = []

    cur.execute("""
        INSERT INTO songs (
            id, name, artist, album, year, img,
            bpm, key, energy, duration, prominent_instruments,
            producer, mixing_engineer, studio, songwriter, featuring, label,
            primary_color, palette, texture,
            mood, themes, ai_summary,
            source
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s
        )
        ON CONFLICT (id) DO NOTHING
    """, (
        str(song["id"]),
        song.get("name"),
        song.get("artist"),
        song.get("album"),
        song.get("year"),
        song.get("img"),
        sonic.get("bpm"),
        sonic.get("key"),
        sonic.get("energy"),
        sonic.get("duration"),
        sonic.get("prominent_instruments", []),
        genetic.get("producer"),
        genetic.get("mixing_engineer"),
        genetic.get("studio"),
        songwriter,
        featuring,
        genetic.get("label"),
        visual.get("primary_color"),
        visual.get("palette", []),
        visual.get("texture"),
        semantic.get("mood"),
        semantic.get("themes", []),
        semantic.get("ai_summary"),
        "seed_json",
    ))

conn.commit()
print(f"✓ Inserted {len(data['nodes'])} songs")

# Verify
cur.execute("SELECT COUNT(*) FROM songs")
count = cur.fetchone()[0]
print(f"✓ Total songs in database: {count}")

# Quick sample
cur.execute("SELECT name, artist, bpm, key, mood FROM songs LIMIT 3")
for row in cur.fetchall():
    print(f"  {row[1]} — {row[0]} | BPM: {row[2]} | Key: {row[3]} | Mood: {row[4]}")

# Seed links
cur.execute("DELETE FROM links")

for i, link in enumerate(data.get("links", [])):
    cur.execute("""
        INSERT INTO links (id, source_id, target_id, reason, type)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """, (
        str(i + 1),
        str(link["source"]),
        str(link["target"]),
        link.get("reason"),
        link.get("type", "ai_generated"),
    ))

conn.commit()

cur.execute("SELECT COUNT(*) FROM links")
link_count = cur.fetchone()[0]
print(f"✓ Inserted {link_count} links")

# Show a few connections
cur.execute("""
    SELECT s1.name, s1.artist, s2.name, s2.artist, l.reason
    FROM links l
    JOIN songs s1 ON l.source_id = s1.id
    JOIN songs s2 ON l.target_id = s2.id
    LIMIT 3
""")
for row in cur.fetchall():
    print(f"  {row[0]} ({row[1]}) → {row[2]} ({row[3]})")
    print(f"    Reason: {row[4]}")
cur.close()
conn.close()
