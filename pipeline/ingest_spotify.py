"""
Spotify Ingestion Pipeline
─────────────────────────
Takes a list of song queries, pulls metadata from Spotify,
runs Gemini text analysis for sonic data, generates embeddings,
and stores everything in the database.

Usage:
    python ingest_spotify.py --songs "Radiohead - Everything In Its Right Place, Tame Impala - Let It Happen"
    python ingest_spotify.py --file my_songs.txt --collection alex
"""
import argparse
import json
import time
import os
import sys

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import vertexai
from vertexai.generative_models import GenerativeModel
from vertexai.language_models import TextEmbeddingModel
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Spotify setup
sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
))

# Gemini setup
vertexai.init(project="resonant-design", location="us-central1")
gemini = GenerativeModel("gemini-2.5-flash")
embed_model = TextEmbeddingModel.from_pretrained("text-embedding-005")

ANALYSIS_PROMPT = """
You are an expert music producer and musicologist. 
I will give you a song name and artist. Based on your deep knowledge of this song, provide a detailed sonic analysis.

Song: "{name}" by {artist}
Album: {album} ({year})
Duration: {duration}

Return ONLY a valid JSON object with this EXACT structure:

{{
    "sonic": {{
        "bpm": <number>,
        "key": "<e.g. C# Minor>",
        "scale": "<e.g. Natural Minor, Pentatonic, Mixolydian>",
        "mode": "<major|minor|modal|atonal>",
        "time_signature": "<e.g. 4/4, 3/4, 6/8, 7/8>",
        "key_changes": <true|false>,
        "key_changes_detail": ["<description of each key change>"],
        "energy": <0.0 to 1.0>,
        "energy_shape": "<steady|slow_burn|builds|drops|dynamic>",
        "bass_weight": <0.0 to 1.0>,
        "mid_weight": <0.0 to 1.0>,
        "treble_weight": <0.0 to 1.0>,
        "vocal_type": "<sung|rapped|spoken|instrumental|mixed>",
        "rhythm_feel": "<straight|swung|syncopated|polyrhythmic|freeform>",
        "prominent_instruments": ["<specific instrument names>"]
    }},
    "semantic": {{
        "mood": ["<single word moods, 2-4 tags>"],
        "themes": ["<thematic tags, 2-4>"],
        "sonic_fingerprint": "<2-3 sentence description for vector clustering. Describe the sonic character, production style, and what makes this track distinctive.>"
    }},
    "genetic": {{
        "producer": "<producer name if known, otherwise null>",
        "studio": "<studio name if known, otherwise null>",
        "songwriter": ["<songwriter names if known>"],
        "label": "<record label if known, otherwise null>"
    }},
    "fun_fact": "<One interesting production detail or historical context about this song>"
}}
"""


def search_spotify(query):
    """Search Spotify for a track and return metadata."""
    results = sp.search(q=query, limit=1)
    items = results["tracks"]["items"]
    if not items:
        return None

    track = items[0]
    artist_id = track["artists"][0]["id"]
    artist_info = sp.artist(artist_id)

    duration_ms = track["duration_ms"]
    mins = duration_ms // 60000
    secs = (duration_ms % 60000) // 1000

    return {
        "name": track["name"],
        "artist": ", ".join([a["name"] for a in track["artists"]]),
        "album": track["album"]["name"],
        "year": int(track["album"]["release_date"][:4]) if track["album"]["release_date"] else None,
        "img": track["album"]["images"][0]["url"] if track["album"]["images"] else None,
        "duration": f"{mins}:{secs:02d}",
        "spotify_uri": track["uri"],
        "spotify_url": track["external_urls"]["spotify"],
        "isrc": track.get("external_ids", {}).get("isrc"),
        "genres": artist_info.get("genres", []),
    }


def analyze_with_gemini(song):
    """Run Gemini text-based analysis on a song."""
    prompt = ANALYSIS_PROMPT.format(
        name=song["name"],
        artist=song["artist"],
        album=song["album"],
        year=song["year"] or "Unknown",
        duration=song["duration"],
    )

    try:
        response = gemini.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"    ✗ Gemini error: {e}")
        return None


def generate_embedding(song, analysis):
    """Generate embedding from combined Spotify + Gemini data."""
    sonic = analysis.get("sonic", {})
    semantic = analysis.get("semantic", {})
    genetic = analysis.get("genetic", {})

    parts = [
        f"{song['name']} by {song['artist']}",
        f"{song['album']} ({song['year']})" if song["year"] else "",
        f"BPM: {sonic.get('bpm')}. Key: {sonic.get('key')}. Mode: {sonic.get('mode')}",
        f"Time signature: {sonic.get('time_signature')}",
        f"Rhythm: {sonic.get('rhythm_feel')}",
        f"Instruments: {', '.join(sonic.get('prominent_instruments', []))}",
        f"Mood: {', '.join(semantic.get('mood', []))}",
        f"Themes: {', '.join(semantic.get('themes', []))}",
        semantic.get("sonic_fingerprint", ""),
    ]

    if genetic.get("producer"):
        parts.append(f"Producer: {genetic['producer']}")
    if song.get("genres"):
        parts.append(f"Genres: {', '.join(song['genres'][:5])}")

    embedding_text = ". ".join([p for p in parts if p])

    embeddings = embed_model.get_embeddings([embedding_text])
    return embeddings[0].values, embedding_text


def insert_song(cur, song, analysis, embedding, collection_id):
    """Insert a fully processed song into the database."""
    sonic = analysis.get("sonic", {})
    semantic = analysis.get("semantic", {})
    genetic = analysis.get("genetic", {})

    song_id = f"sp-{song['spotify_uri'].split(':')[-1]}"

    songwriter = genetic.get("songwriter", [])
    if isinstance(songwriter, str):
        songwriter = [songwriter]

    cur.execute("""
        INSERT INTO songs (
            id, name, artist, album, year, img, duration,
            bpm, key, scale, mode, time_signature,
            key_changes, key_changes_detail,
            energy, energy_shape,
            bass_weight, mid_weight, treble_weight,
            vocal_type, rhythm_feel, prominent_instruments,
            producer, studio, songwriter, label,
            mood, themes, sonic_fingerprint, fun_fact,
            embedding, collection_id, source
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s,
            %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s::vector, %s, %s
        )
        ON CONFLICT (id) DO NOTHING
    """, (
        song_id,
        song["name"],
        song["artist"],
        song["album"],
        song["year"],
        song["img"],
        song["duration"],
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
        genetic.get("producer"),
        genetic.get("studio"),
        songwriter,
        genetic.get("label"),
        semantic.get("mood", []),
        semantic.get("themes", []),
        semantic.get("sonic_fingerprint"),
        analysis.get("fun_fact"),
        str(embedding),
        collection_id,
        "spotify_gemini",
    ))
    return song_id


def main():
    parser = argparse.ArgumentParser(description="Ingest songs via Spotify + Gemini")
    parser.add_argument("--songs", help="Comma-separated song queries")
    parser.add_argument("--file", help="Text file with one song per line")
    parser.add_argument("--collection", default="default", help="Collection ID for this user")
    args = parser.parse_args()

    # Get song list
    queries = []
    if args.songs:
        queries = [s.strip() for s in args.songs.split(",")]
    elif args.file:
        with open(args.file) as f:
            queries = [line.strip() for line in f if line.strip()]
    else:
        print("Provide --songs or --file")
        sys.exit(1)

    print(f"Processing {len(queries)} songs for collection '{args.collection}'")

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    success = 0
    failed = 0

    for i, query in enumerate(queries):
        print(f"\n[{i+1}/{len(queries)}] Searching: {query}")

        # Step 1: Spotify metadata
        song = search_spotify(query)
        if not song:
            print(f"    ✗ Not found on Spotify")
            failed += 1
            continue
        print(f"    Found: {song['name']} — {song['artist']}")

        # Step 2: Gemini analysis
        print(f"    Analyzing with Gemini...")
        analysis = analyze_with_gemini(song)
        if not analysis:
            failed += 1
            continue
        sonic = analysis.get("sonic", {})
        print(f"    ✓ BPM: {sonic.get('bpm')} | Key: {sonic.get('key')} | Mood: {analysis.get('semantic', {}).get('mood')}")

        # Step 3: Generate embedding
        print(f"    Generating embedding...")
        embedding, _ = generate_embedding(song, analysis)
        print(f"    ✓ {len(embedding)} dimensions")

        # Step 4: Store in database
        try:
            song_id = insert_song(cur, song, analysis, embedding, args.collection)
            conn.commit()
            print(f"    ✓ Stored as {song_id}")
            success += 1
        except Exception as e:
            conn.rollback()
            print(f"    ✗ DB error: {e}")
            failed += 1

        # Rate limiting
        time.sleep(2)

    cur.close()
    conn.close()

    print(f"\n{'='*50}")
    print(f"✓ Complete: {success} succeeded, {failed} failed")
    print(f"  Collection: {args.collection}")


if __name__ == "__main__":
    main()