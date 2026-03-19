"""
Rebuild All Embeddings
──────────────────────
Re-generates embeddings for ALL songs using the full data
including lyrics. Run this after adding new data fields.

Usage:
    python rebuild_embeddings.py
"""
import psycopg
import vertexai
from vertexai.language_models import TextEmbeddingModel
from dotenv import load_dotenv
import os
import time

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

vertexai.init(project="resonant-design", location="us-central1")
embed_model = TextEmbeddingModel.from_pretrained("text-embedding-005")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Get ALL songs
cur.execute("""
    SELECT id, name, artist, album, year,
           bpm, key, mode, scale, time_signature,
           energy, energy_shape, rhythm_feel, vocal_type,
           prominent_instruments, producer, studio, label,
           mood, themes, ai_summary, sonic_fingerprint,
           lyrics, fun_fact
    FROM songs
""")
rows = cur.fetchall()
columns = ['id', 'name', 'artist', 'album', 'year',
           'bpm', 'key', 'mode', 'scale', 'time_signature',
           'energy', 'energy_shape', 'rhythm_feel', 'vocal_type',
           'instruments', 'producer', 'studio', 'label',
           'mood', 'themes', 'ai_summary', 'sonic_fingerprint',
           'lyrics', 'fun_fact']
songs = [dict(zip(columns, row)) for row in rows]

print(f"Rebuilding embeddings for {len(songs)} songs...\n")

# Count how many have lyrics
with_lyrics = sum(1 for s in songs if s['lyrics'])
print(f"  Songs with lyrics: {with_lyrics}/{len(songs)}")
print()


def build_embedding_text(song):
    """Build rich embedding text from all available data."""
    parts = []

    # Identity
    parts.append(f"{song['name']} by {song['artist']}")
    if song['album']:
        year_str = f" ({song['year']})" if song['year'] else ""
        parts.append(f"{song['album']}{year_str}")

    # Sonic
    if song['bpm']:
        parts.append(f"BPM: {song['bpm']}")
    if song['key']:
        parts.append(f"Key: {song['key']}")
    if song['mode']:
        parts.append(f"Mode: {song['mode']}")
    if song['time_signature']:
        parts.append(f"Time signature: {song['time_signature']}")
    if song['energy'] is not None:
        parts.append(f"Energy: {song['energy']}")
    if song['energy_shape']:
        parts.append(f"Energy shape: {song['energy_shape']}")
    if song['rhythm_feel']:
        parts.append(f"Rhythm: {song['rhythm_feel']}")
    if song['vocal_type']:
        parts.append(f"Vocal type: {song['vocal_type']}")
    if song['instruments']:
        parts.append(f"Instruments: {', '.join(song['instruments'])}")

    # Genetic
    if song['producer']:
        parts.append(f"Producer: {song['producer']}")
    if song['studio']:
        parts.append(f"Studio: {song['studio']}")
    if song['label']:
        parts.append(f"Label: {song['label']}")

    # Semantic
    if song['mood']:
        parts.append(f"Mood: {', '.join(song['mood'])}")
    if song['themes']:
        parts.append(f"Themes: {', '.join(song['themes'])}")
    if song['sonic_fingerprint']:
        parts.append(song['sonic_fingerprint'])
    if song['ai_summary']:
        parts.append(song['ai_summary'])

    # Lyrics — include a trimmed version so it doesn't overwhelm the other signals
    if song['lyrics']:
        # Take first ~500 chars of lyrics to capture themes without dominating
        lyrics_snippet = song['lyrics'][:500].strip()
        parts.append(f"Lyrics: {lyrics_snippet}")

    return ". ".join(parts)


# Process in batches of 5 (Vertex AI can handle batches)
BATCH_SIZE = 5
total_batches = (len(songs) + BATCH_SIZE - 1) // BATCH_SIZE

for batch_idx in range(total_batches):
    start = batch_idx * BATCH_SIZE
    end = min(start + BATCH_SIZE, len(songs))
    batch = songs[start:end]

    texts = []
    for song in batch:
        text = build_embedding_text(song)
        texts.append(text)

    try:
        embeddings = embed_model.get_embeddings(texts)

        for song, embedding in zip(batch, embeddings):
            vector = embedding.values
            cur.execute(
                "UPDATE songs SET embedding = %s::vector WHERE id = %s",
                (str(vector), song['id'])
            )

        conn.commit()

        # Progress
        names = [f"{s['artist']} — {s['name']}" for s in batch]
        has_lyrics = sum(1 for s in batch if s['lyrics'])
        print(f"  [{end}/{len(songs)}] Batch {batch_idx+1}/{total_batches} "
              f"({has_lyrics}/{len(batch)} with lyrics)")

    except Exception as e:
        print(f"  ✗ Batch {batch_idx+1} error: {e}")
        conn.rollback()

    time.sleep(0.3)

print(f"\n✓ All {len(songs)} embeddings rebuilt")

# Verify
cur.execute("SELECT COUNT(*) FROM songs WHERE embedding IS NOT NULL")
total = cur.fetchone()[0]
print(f"  Songs with embeddings: {total}")

cur.close()
conn.close()