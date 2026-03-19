"""
Detect Sampling Relationships
─────────────────────────────
Asks Gemini which songs sample other songs.
Stores results in the samples_from JSONB field.

Usage:
    python detect_samples.py
"""
import json
import time
import psycopg
import vertexai
from vertexai.generative_models import GenerativeModel
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

vertexai.init(project="resonant-design", location="us-central1")
gemini = GenerativeModel("gemini-2.5-flash")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Get all songs
cur.execute("SELECT id, name, artist, album, year FROM songs ORDER BY artist, name")
rows = cur.fetchall()
songs = [{"id": r[0], "name": r[1], "artist": r[2], "album": r[3], "year": r[4]} for r in rows]

print(f"Checking sampling history for {len(songs)} songs...\n")

# Build a song list string so Gemini knows what's in our database
song_list = "\n".join([f"- \"{s['name']}\" by {s['artist']} ({s['year']})" for s in songs])

# Process in batches of 10 to reduce API calls
BATCH_SIZE = 10
total_batches = (len(songs) + BATCH_SIZE - 1) // BATCH_SIZE

all_samples = {}  # song_id -> [{"song": ..., "artist": ..., "element": ...}]

for batch_idx in range(total_batches):
    start = batch_idx * BATCH_SIZE
    end = min(start + BATCH_SIZE, len(songs))
    batch = songs[start:end]

    batch_list = "\n".join([
        f'{i+1}. "{s["name"]}" by {s["artist"]} ({s["year"]})'
        for i, s in enumerate(batch)
    ])

    prompt = f"""You are a music historian with deep knowledge of sampling in music.

For each song below, identify if it contains any known samples from other songs.
Only include confirmed, well-documented samples — not rumors or speculation.

Songs to analyze:
{batch_list}

Also, here are all the songs in our database. If a sampled song matches one in this list, include "in_database": true:
{song_list}

Return ONLY a valid JSON object with this structure:
{{
    "results": [
        {{
            "song": "<song name>",
            "artist": "<artist>",
            "samples": [
                {{
                    "sampled_song": "<name of the sampled song>",
                    "sampled_artist": "<artist of sampled song>",
                    "element": "<what was sampled: e.g. drum break, vocal hook, bassline, melody>",
                    "in_database": <true if the sampled song is in the database list above, false otherwise>
                }}
            ]
        }}
    ]
}}

If a song has no known samples, set "samples" to an empty array [].
"""

    print(f"[Batch {batch_idx+1}/{total_batches}] Analyzing {len(batch)} songs...")

    try:
        response = gemini.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        data = json.loads(response.text)
        results = data.get("results", [])

        for result, song in zip(results, batch):
            samples = result.get("samples", [])
            if samples:
                all_samples[song["id"]] = samples
                sample_strs = [f"{s['sampled_song']} ({s.get('element', '?')})" for s in samples]
                print(f"    {song['artist']} — {song['name']}")
                for s in samples:
                    db_flag = " [IN DB]" if s.get("in_database") else ""
                    print(f"      ← {s['sampled_artist']} — {s['sampled_song']} ({s.get('element', '?')}){db_flag}")

    except Exception as e:
        print(f"    ✗ Error: {e}")

    time.sleep(2)  # Rate limiting

# ─── Store results in database ───
print(f"\nStoring sampling data...")

updated = 0
for song_id, samples in all_samples.items():
    cur.execute(
        "UPDATE songs SET samples_from = %s::jsonb WHERE id = %s",
        (json.dumps(samples), song_id)
    )
    updated += 1

conn.commit()

# ─── Summary ───
print(f"\n{'='*60}")
print(f"Sampling Analysis Complete")
print(f"{'='*60}")
print(f"  Songs with samples: {len(all_samples)}/{len(songs)}")

total_samples = sum(len(s) for s in all_samples.values())
print(f"  Total sample connections found: {total_samples}")

in_db_count = sum(
    1 for samples in all_samples.values()
    for s in samples if s.get("in_database")
)
print(f"  Samples where both songs are in database: {in_db_count}")
print(f"  (These can become direct graph links!)")

# Show all in-database connections
if in_db_count > 0:
    print(f"\nDirect in-database sampling connections:")
    for song_id, samples in all_samples.items():
        cur.execute("SELECT name, artist FROM songs WHERE id = %s", (song_id,))
        song_row = cur.fetchone()
        for s in samples:
            if s.get("in_database"):
                print(f"  {song_row[1]} — {song_row[0]}")
                print(f"    samples: {s['sampled_artist']} — {s['sampled_song']} ({s.get('element', '')})")

cur.close()
conn.close()