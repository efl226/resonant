import psycopg
import vertexai
from vertexai.language_models import TextEmbeddingModel
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

vertexai.init(project="resonant-design", location="us-central1")
embed_model = TextEmbeddingModel.from_pretrained("text-embedding-005")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Get songs without embeddings
cur.execute("""
    SELECT id, name, artist, album, year,
           bpm, key, energy, duration, prominent_instruments,
           producer, studio, label,
           mood, themes, ai_summary
    FROM songs WHERE embedding IS NULL
""")
rows = cur.fetchall()
print(f"Found {len(rows)} songs without embeddings")

for i, row in enumerate(rows):
    song_id, name, artist, album, year = row[0], row[1], row[2], row[3], row[4]
    bpm, key, energy, duration, instruments = row[5], row[6], row[7], row[8], row[9]
    producer, studio, label = row[10], row[11], row[12]
    mood, themes, ai_summary = row[13], row[14], row[15]

    # Build embedding text from existing metadata
    parts = [f"{name} by {artist}"]
    if album:
        parts.append(f"{album} ({year})" if year else album)
    if bpm:
        parts.append(f"BPM: {bpm}")
    if key:
        parts.append(f"Key: {key}")
    if energy is not None:
        parts.append(f"Energy: {energy}")
    if instruments:
        parts.append(f"Instruments: {', '.join(instruments)}")
    if producer:
        parts.append(f"Producer: {producer}")
    if studio:
        parts.append(f"Studio: {studio}")
    if mood:
        parts.append(f"Mood: {', '.join(mood)}")
    if themes:
        parts.append(f"Themes: {', '.join(themes)}")
    if ai_summary:
        parts.append(ai_summary)

    embedding_text = ". ".join(parts)

    print(f"[{i+1}/{len(rows)}] {artist} — {name}")
    print(f"    Text: {embedding_text[:120]}...")

    try:
        embeddings = embed_model.get_embeddings([embedding_text])
        vector = embeddings[0].values

        cur.execute(
            "UPDATE songs SET embedding = %s::vector WHERE id = %s",
            (str(vector), song_id)
        )
        conn.commit()
        print(f"    ✓ Embedded ({len(vector)} dims)")
    except Exception as e:
        print(f"    ✗ Error: {e}")

# Verify
cur.execute("SELECT COUNT(*) FROM songs WHERE embedding IS NOT NULL")
total = cur.fetchone()[0]
print(f"\n✓ Total songs with embeddings: {total}")

cur.close()
conn.close()