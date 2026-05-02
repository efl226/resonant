"""
Backfill embeddings for songs that are missing them.
Rebuilds embed text from existing DB columns — no Gemini calls needed.

Usage:
    python pipeline/backfill_embeddings.py
    python pipeline/backfill_embeddings.py --collection testuser
"""
import argparse
import os

import psycopg
import vertexai
from dotenv import load_dotenv
from vertexai.language_models import TextEmbeddingModel

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
vertexai.init(project="resonant-design", location="us-central1")
embed_model = TextEmbeddingModel.from_pretrained("text-embedding-005")

CHUNK = 75


def build_embed_text(row):
    (id_, name, artist, album, year, bpm, key_, mode, time_sig,
     rhythm_feel, instruments, mood, themes, fingerprint, producer, genres) = row

    parts = [
        f"{name} by {artist}",
        f"{album} ({year})" if year else "",
        f"BPM: {bpm}. Key: {key_}. Mode: {mode}" if any([bpm, key_, mode]) else "",
        f"Time signature: {time_sig}" if time_sig else "",
        f"Rhythm: {rhythm_feel}" if rhythm_feel else "",
        f"Instruments: {', '.join(instruments)}" if instruments else "",
        f"Mood: {', '.join(mood)}" if mood else "",
        f"Themes: {', '.join(themes)}" if themes else "",
        fingerprint or "",
        f"Producer: {producer}" if producer else "",
        f"Genres: {', '.join(genres[:5])}" if genres else "",
    ]
    return ". ".join([p for p in parts if p])


def run(collection_id=None):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    where = "embedding IS NULL"
    params = []
    if collection_id:
        where += " AND collection_id = %s"
        params.append(collection_id)

    cur.execute(f"""
        SELECT id, name, artist, album, year,
               bpm, key, mode, time_signature,
               rhythm_feel, prominent_instruments,
               mood, themes, sonic_fingerprint,
               producer, ARRAY[]::text[] AS genres
        FROM songs
        WHERE {where}
        ORDER BY id
    """, params)

    rows = cur.fetchall()
    if not rows:
        print("No songs missing embeddings.")
        return

    print(f"Found {len(rows)} songs missing embeddings...")

    ids = [r[0] for r in rows]
    texts = [build_embed_text(r) for r in rows]

    ok = 0
    for i in range(0, len(texts), CHUNK):
        chunk_ids = ids[i:i + CHUNK]
        chunk_texts = texts[i:i + CHUNK]
        try:
            embeds = embed_model.get_embeddings(chunk_texts)
            for song_id, emb in zip(chunk_ids, embeds):
                cur.execute(
                    "UPDATE songs SET embedding = %s::vector WHERE id = %s",
                    (str(emb.values), song_id),
                )
            conn.commit()
            ok += len(chunk_ids)
            print(f"  Embedded {ok} / {len(rows)}")
        except Exception as e:
            conn.rollback()
            print(f"  Chunk failed: {e}")

    cur.close()
    conn.close()
    print(f"\nDone: {ok} embeddings backfilled.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default=None)
    args = parser.parse_args()
    run(args.collection)
