import json
import psycopg
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from vertexai.language_models import TextEmbeddingModel
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

vertexai.init(project="resonant-design", location="us-central1")

# The song to analyze
GCS_URI = "gs://resonantdesign_bucket1/AS_THE_SUN_RISES.mp3"
SONG_TITLE = "As the Sun Rises"

print(f"Analyzing: {SONG_TITLE}")
print("Sending audio to Gemini...")

model = GenerativeModel("gemini-2.5-flash")
audio_part = Part.from_uri(uri=GCS_URI, mime_type="audio/mpeg")

prompt = """
You are an expert music producer and musicologist. Analyze this audio track.

Return ONLY a valid JSON object with this EXACT structure:

{
    "identity": {
        "name": "<song title if recognizable, otherwise 'Unknown'>",
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

response = model.generate_content(
    [prompt, audio_part],
    generation_config={"response_mime_type": "application/json"}
)

analysis = json.loads(response.text)
print("\n--- Gemini Analysis ---")
print(json.dumps(analysis, indent=2))

# Generate embedding from the sonic fingerprint
print("\nGenerating embedding...")
embed_model = TextEmbeddingModel.from_pretrained("text-embedding-005")

# Build rich embedding text from the analysis
identity = analysis.get("identity", {})
sonic = analysis.get("sonic", {})
semantic = analysis.get("semantic", {})

embedding_text = (
    f"{identity.get('name', SONG_TITLE)} by {identity.get('artist', 'Unknown')}. "
    f"BPM: {sonic.get('bpm')}. Key: {sonic.get('key')}. Mode: {sonic.get('mode')}. "
    f"Time signature: {sonic.get('time_signature')}. "
    f"Rhythm: {sonic.get('rhythm_feel')}. "
    f"Instruments: {', '.join(sonic.get('prominent_instruments', []))}. "
    f"Mood: {', '.join(semantic.get('mood', []))}. "
    f"Themes: {', '.join(semantic.get('themes', []))}. "
    f"{semantic.get('sonic_fingerprint', '')}"
)

print(f"\nEmbedding text: {embedding_text[:200]}...")

embeddings = embed_model.get_embeddings([embedding_text])
vector = embeddings[0].values
print(f"Embedding dimensions: {len(vector)}")

# Insert into database
print("\nInserting into database...")
conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

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
""", (
    "gemini-test-1",
    identity.get("name", SONG_TITLE),
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
    analysis.get("fun_fact"),
    str(vector),
    GCS_URI,
    "gemini_audio",
))

conn.commit()
cur.close()
conn.close()

print("\n✓ Song analyzed, embedded, and stored in database!")
print(f"  Name: {identity.get('name', SONG_TITLE)}")
print(f"  BPM: {sonic.get('bpm')} | Key: {sonic.get('key')} | Mode: {sonic.get('mode')}")
print(f"  Mood: {semantic.get('mood')}")
print(f"  Rhythm: {sonic.get('rhythm_feel')} | Time: {sonic.get('time_signature')}")
print(f"  Embedding: {len(vector)} dimensions")