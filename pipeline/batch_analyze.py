import json
import random
import time
import psycopg
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from vertexai.language_models import TextEmbeddingModel
from google.cloud import storage
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
BUCKET_NAME = "resonantdesign_bucket1"
BATCH_SIZE = 20

vertexai.init(project="resonant-design", location="us-central1")
model = GenerativeModel("gemini-2.5-flash")
embed_model = TextEmbeddingModel.from_pretrained("text-embedding-005")

prompt = """
You are an expert music producer and musicologist. Analyze this audio track.

Return ONLY a valid JSON object with this EXACT structure:

{
    "identity": {
        "name": "<song title if recognizable, otherwise use the filename hint>",
        "artist": "<artist if recognizable, otherwise 'Unknown'>",
        "album": "<album if recognizable, otherwise null>",
        "year": <year if recognizable, otherwise null>
    },
    "sonic": {
        "bpm": <number>,
        "key": "<e.g. C# Minor>",
        "scale": "<e.g. Natural Minor, Pentatonic, Mixolydian>",
        "mode": "<major|minor|modal|atonal>",
        "time_signature": "<e.g. 4/4, 3/4, 6/8, 7/8>",
        "key_changes": <true|false>,
        "key_changes_detail": ["<description of each key change with approximate timestamp>"],
        "energy": <0.0 to 1.0>,
        "energy_shape": "<steady|slow_burn|builds|drops|dynamic>",
        "bass_weight": <0.0 to 1.0>,
        "mid_weight": <0.0 to 1.0>,
        "treble_weight": <0.0 to 1.0>,
        "vocal_type": "<sung|rapped|spoken|instrumental|mixed>",
        "rhythm_feel": "<straight|swung|syncopated|polyrhythmic|freeform>",
        "prominent_instruments": ["<specific instrument names>"]
    },
    "semantic": {
        "mood": ["<single word moods, 2-4 tags>"],
        "themes": ["<thematic tags, 2-4>"],
        "sonic_fingerprint": "<2-3 sentence description for vector clustering. Describe the sonic character, production style, and what makes this track distinctive.>"
    },
    "fun_fact": "<One interesting production detail, musical technique, or historical context about this style of music>"
}
"""


def analyze_song(gcs_uri, filename):
    """Analyze one song and return structured data + embedding."""
    audio_part = Part.from_uri(uri=gcs_uri, mime_type="audio/mpeg")

    # Add filename as a hint for identity
    full_prompt = f"Filename hint: {filename}\n\n{prompt}"

    try:
        response = model.generate_content(
            [full_prompt, audio_part],
            generation_config={"response_mime_type": "application/json"}
        )
        analysis = json.loads(response.text)
    except Exception as e:
        print(f"    ✗ Gemini error: {e}")
        return None

    # Build embedding text
    identity = analysis.get("identity", {})
    sonic = analysis.get("sonic", {})
    semantic = analysis.get("semantic", {})

    embedding_text = (
        f"{identity.get('name', filename)} by {identity.get('artist', 'Unknown')}. "
        f"BPM: {sonic.get('bpm')}. Key: {sonic.get('key')}. Mode: {sonic.get('mode')}. "
        f"Time signature: {sonic.get('time_signature')}. "
        f"Rhythm: {sonic.get('rhythm_feel')}. "
        f"Instruments: {', '.join(sonic.get('prominent_instruments', []))}. "
        f"Mood: {', '.join(semantic.get('mood', []))}. "
        f"Themes: {', '.join(semantic.get('themes', []))}. "
        f"{semantic.get('sonic_fingerprint', '')}"
    )

    try:
        embeddings = embed_model.get_embeddings([embedding_text])
        vector = embeddings[0].values
    except Exception as e:
        print(f"    ✗ Embedding error: {e}")
        return None

    return {
        "analysis": analysis,
        "embedding": vector,
        "gcs_uri": gcs_uri,
    }


def insert_song(cur, song_id, result):
    """Insert an analyzed song into the database."""
    a = result["analysis"]
    identity = a.get("identity", {})
    sonic = a.get("sonic", {})
    semantic = a.get("semantic", {})

    cur.execute("""
        INSERT INTO songs (
            id, name, artist, album, year,
            bpm, key, scale, mode, time_signature,
            key_changes, key_changes_detail,
            energy, energy_shape,
            bass_weight, mid_weight, treble_weight,
            vocal_type, rhythm_feel, prominent_instruments,
            mood, themes, sonic_fingerprint, fun_fact,
            embedding, audio_gcs_uri, source
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s,
            %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s,
            %s::vector, %s, %s
        )
        ON CONFLICT (id) DO NOTHING
    """, (
        song_id,
        identity.get("name", "Unknown"),
        identity.get("artist", "Unknown"),
        identity.get("album"),
        identity.get("year"),
        sonic.get("bpm"),
        sonic.get("key"),
        sonic.get("scale"),
        sonic.get("mode"),
        sonic.get("time_signature"),
        sonic.get("key_changes", False),
        sonic.get("key_changes_detail", []),
        sonic.get("energy"),
        sonic.get("energy_shape"),
        sonic.get("bass_weight"),
        sonic.get("mid_weight"),
        sonic.get("treble_weight"),
        sonic.get("vocal_type"),
        sonic.get("rhythm_feel"),
        sonic.get("prominent_instruments", []),
        semantic.get("mood", []),
        semantic.get("themes", []),
        semantic.get("sonic_fingerprint"),
        a.get("fun_fact"),
        str(result["embedding"]),
        result["gcs_uri"],
        "gemini_audio",
    ))


def main():
    # Get all mp3s from bucket
    print("Fetching song list from GCS...")
    storage_client = storage.Client(project="resonant-design")
    bucket = storage_client.bucket(BUCKET_NAME)
    all_songs = [b.name for b in bucket.list_blobs() if b.name.endswith(".mp3")]
    print(f"Found {len(all_songs)} songs in bucket")

    # Check which songs are already in the database
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT audio_gcs_uri FROM songs WHERE audio_gcs_uri IS NOT NULL")
    already_processed = {row[0] for row in cur.fetchall()}

    # Filter out already processed
    new_songs = [s for s in all_songs if f"gs://{BUCKET_NAME}/{s}" not in already_processed]
    print(f"Already processed: {len(already_processed)}")
    print(f"New songs available: {len(new_songs)}")

    # Pick random batch
    batch = random.sample(new_songs, min(BATCH_SIZE, len(new_songs)))
    print(f"\nProcessing batch of {len(batch)} songs...\n")

    success = 0
    failed = 0

    for i, filename in enumerate(batch):
        gcs_uri = f"gs://{BUCKET_NAME}/{filename}"
        clean_name = filename.replace(".mp3", "").replace("_", " ")
        print(f"[{i+1}/{len(batch)}] {clean_name}")

        result = analyze_song(gcs_uri, filename)

        if result:
            song_id = f"gemini-{filename.replace('.mp3', '').replace(' ', '-').lower()}"
            try:
                insert_song(cur, song_id, result)
                conn.commit()
                sonic = result["analysis"].get("sonic", {})
                semantic = result["analysis"].get("semantic", {})
                print(f"    ✓ BPM: {sonic.get('bpm')} | Key: {sonic.get('key')} | Mood: {semantic.get('mood')}")
                success += 1
            except Exception as e:
                conn.rollback()
                print(f"    ✗ DB error: {e}")
                failed += 1
        else:
            failed += 1

        # Rate limiting — respect free tier
        time.sleep(4)

    cur.close()
    conn.close()

    print(f"\n{'='*50}")
    print(f"✓ Batch complete: {success} succeeded, {failed} failed")

    # Quick count
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM songs")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM songs WHERE embedding IS NOT NULL")
    with_embeddings = cur.fetchone()[0]
    cur.close()
    conn.close()
    print(f"  Total songs in DB: {total}")
    print(f"  Songs with embeddings: {with_embeddings}")


if __name__ == "__main__":
    main()