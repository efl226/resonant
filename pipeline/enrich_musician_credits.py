"""
Enrich Musician Credits
───────────────────────
Uses Gemini to fill in specific instruments for musician credits
and add missing musicians that MusicBrainz didn't have.

Usage:
    python enrich_musician_credits.py
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
cur.execute("""
    SELECT id, name, artist, album, year, musician_credits
    FROM songs
    ORDER BY artist, name
""")
rows = cur.fetchall()
songs = [{
    "id": r[0], "name": r[1], "artist": r[2],
    "album": r[3], "year": r[4],
    "existing_credits": json.loads(r[5]) if isinstance(r[5], str) and r[5] != 'null' else (r[5] if isinstance(r[5], dict) else {})
} for r in rows]

print(f"Enriching musician credits for {len(songs)} songs...\n")

# Process in batches of 10
BATCH_SIZE = 10
total_batches = (len(songs) + BATCH_SIZE - 1) // BATCH_SIZE

updated = 0

for batch_idx in range(total_batches):
    start = batch_idx * BATCH_SIZE
    end = min(start + BATCH_SIZE, len(songs))
    batch = songs[start:end]

    batch_list = "\n".join([
        f'{i+1}. "{s["name"]}" by {s["artist"]} ({s["album"]}, {s["year"]})'
        for i, s in enumerate(batch)
    ])

    prompt = f"""You are a music historian. For each song below, list the key musicians who performed on the recording and what instrument they played.

Songs:
{batch_list}

Return ONLY a valid JSON object:
{{
    "results": [
        {{
            "song": "<song name>",
            "artist": "<artist>",
            "musicians": {{
                "<Musician Name>": "<specific instrument, e.g. drums, bass guitar, lead guitar, piano, saxophone, synthesizer, vocals, backing vocals>",
                "<Musician Name>": "<instrument>"
            }}
        }}
    ]
}}

Rules:
- Only include musicians you are confident about
- Use specific instrument names (not just "instrument")
- Include the main artist's role too (e.g. "vocals", "guitar and vocals")
- For bands, list individual members and their instruments
- Keep it to the most important 3-6 musicians per song
"""

    print(f"[Batch {batch_idx+1}/{total_batches}] {len(batch)} songs...")

    try:
        response = gemini.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        data = json.loads(response.text)
        results = data.get("results", [])

        for result, song in zip(results, batch):
            musicians = result.get("musicians", {})
            if not musicians:
                continue

            # Merge with existing credits — Gemini's specific instruments override "instrument"
            merged = {}
            existing = song.get("existing_credits") or {}

            # Start with Gemini's data (more specific)
            for name, role in musicians.items():
                merged[name] = role

            # Add any existing credits not in Gemini's response
            for name, role in existing.items():
                if name not in merged:
                    merged[name] = role

            cur.execute(
                "UPDATE songs SET musician_credits = %s::jsonb WHERE id = %s",
                (json.dumps(merged), song["id"])
            )
            updated += 1

            # Print interesting ones
            if len(musicians) >= 3:
                print(f"    {song['artist']} — {song['name']}")
                for name, role in list(musicians.items())[:4]:
                    print(f"      {name}: {role}")

    except Exception as e:
        print(f"    ✗ Error: {e}")

    conn.commit()
    time.sleep(2)

print(f"\n{'='*50}")
print(f"✓ Updated musician credits for {updated} songs")

# Show some examples
print(f"\nSample enriched credits:")
cur.execute("""
    SELECT name, artist, musician_credits 
    FROM songs 
    WHERE musician_credits IS NOT NULL 
    AND musician_credits != 'null'
    ORDER BY RANDOM()
    LIMIT 5
""")
for row in cur.fetchall():
    credits = json.loads(row[2]) if isinstance(row[2], str) else row[2]
    if credits:
        print(f"\n  {row[1]} — {row[0]}")
        for name, role in credits.items():
            print(f"    {name}: {role}")

# Coverage summary
cur.execute("SELECT COUNT(*) FROM songs WHERE musician_credits IS NOT NULL AND musician_credits != 'null' AND musician_credits != '{}'")
has = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM songs")
total = cur.fetchone()[0]
print(f"\nMusician credits coverage: {has}/{total}")

cur.close()
conn.close()