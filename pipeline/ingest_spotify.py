"""
Spotify Ingestion Pipeline
--------------------------
Takes song queries, a text file, or a Spotify playlist URL, pulls metadata
from Spotify, runs Gemini analysis, generates embeddings, and stores in DB.

Usage:
    python ingest_spotify.py --songs "Radiohead - Creep, Tame Impala - Let It Happen"
    python ingest_spotify.py --file my_songs.txt --collection alex
    python ingest_spotify.py --playlist https://open.spotify.com/playlist/XXX --collection alex
"""
import argparse
import json
import time
import os
import sys

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials, SpotifyOAuth
import vertexai
from vertexai.generative_models import GenerativeModel
from vertexai.language_models import TextEmbeddingModel
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Spotify setup — OAuth for playlist access, client creds for search
_client_id = os.getenv("SPOTIFY_CLIENT_ID")
_client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
_redirect_uri = os.getenv("SPOTIPY_REDIRECT_URI", "http://localhost:8888/callback")

sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=_client_id,
    client_secret=_client_secret,
    redirect_uri=_redirect_uri,
    scope="playlist-read-private playlist-read-collaborative",
    open_browser=True,
))

sp_cc = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
    client_id=_client_id,
    client_secret=_client_secret,
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
        "prominent_instruments": ["<general instrument names, e.g. electric guitar, piano, drums>"],
        "instrument_credits": [
            {{
                "instrument": "<general instrument type>",
                "make": "<brand/manufacturer if known, else null>",
                "model": "<specific model if known, else null>",
                "player": "<musician who played it on this recording, else null>"
            }}
        ]
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

For instrument_credits: include every instrument you can identify. Be specific about make/model when the song is famous for a particular instrument (e.g. Dave Gilmour's Black Strat, John Bonham's Ludwig kit). If make/model/player is unknown, use null.
"""


def fetch_playlist_tracks(playlist_url):
    """Fetch all tracks from a Spotify playlist URL. Returns list of track dicts."""
    # Extract playlist ID from URL
    playlist_id = playlist_url.split("/playlist/")[-1].split("?")[0]
    print(f"  Fetching playlist: {playlist_id}")

    tracks = []
    results = sp.playlist_items(playlist_id, limit=50)
    while results:
        for item in results["items"]:
            track = item.get("item") or item.get("track")
            if not track or not track.get("id"):
                continue
            duration_ms = track.get("duration_ms", 0)
            mins = duration_ms // 60000
            secs = (duration_ms % 60000) // 1000
            try:
                artist_id = track["artists"][0]["id"]
                artist_info = sp_cc.artist(artist_id)
                genres = artist_info.get("genres", [])
            except Exception:
                genres = []
            tracks.append({
                "name": track["name"],
                "artist": ", ".join([a["name"] for a in track["artists"]]),
                "album": track["album"]["name"],
                "year": int(track["album"]["release_date"][:4]) if track["album"].get("release_date") else None,
                "img": track["album"]["images"][0]["url"] if track["album"].get("images") else None,
                "duration": f"{mins}:{secs:02d}",
                "spotify_uri": track["uri"],
                "spotify_url": track["external_urls"].get("spotify", ""),
                "isrc": (track.get("external_ids") or {}).get("isrc"),
                "genres": genres,
            })
        results = sp.next(results) if results.get("next") else None

    print(f"  Found {len(tracks)} tracks in playlist")
    return tracks


def search_spotify(query):
    """Search Spotify for a track and return metadata."""
    results = sp_cc.search(q=query, limit=1)
    items = results["tracks"]["items"]
    if not items:
        return None

    track = items[0]
    artist_id = track["artists"][0]["id"]
    artist_info = sp_cc.artist(artist_id)

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


def build_embed_text(song, analysis):
    """Build embedding input text from song + analysis. No API calls."""
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
    return ". ".join([p for p in parts if p])


def batch_embed_songs(cur, conn, pending):
    """
    Batch-embed a list of (song_id, embed_text) pairs using a single API call.
    Vertex AI text-embedding-005 accepts up to 250 texts per request.
    Updates the embedding column in the DB for each song.
    """
    if not pending:
        return

    CHUNK = 250
    print(f"\n  Batch embedding {len(pending)} songs ({(len(pending)-1)//CHUNK+1} request(s))...")
    ids = [p[0] for p in pending]
    texts = [p[1] for p in pending]

    for ci in range(0, len(texts), CHUNK):
        chunk_ids = ids[ci:ci + CHUNK]
        chunk_texts = texts[ci:ci + CHUNK]
        try:
            embeds = embed_model.get_embeddings(chunk_texts)
            for song_id, emb in zip(chunk_ids, embeds):
                cur.execute(
                    "UPDATE songs SET embedding = %s::vector WHERE id = %s",
                    (str(emb.values), song_id),
                )
            conn.commit()
            print(f"    Embedded {ci + len(chunk_ids)} / {len(texts)}")
        except Exception as e:
            conn.rollback()
            print(f"    Embedding chunk failed: {e}")


def extract_colors_for_songs(cur, conn, song_ids):
    """Extract album art colors for any songs in the list that are still missing them."""
    import io
    import requests
    from colorthief import ColorThief

    cur.execute(
        "SELECT id, img FROM songs WHERE id = ANY(%s) AND primary_color IS NULL AND img IS NOT NULL",
        (song_ids,),
    )
    rows = cur.fetchall()
    if not rows:
        return

    print(f"\n  Extracting colors for {len(rows)} songs...")
    ok = 0
    for song_id, img_url in rows:
        try:
            resp = requests.get(img_url, timeout=8)
            resp.raise_for_status()
            ct = ColorThief(io.BytesIO(resp.content))
            primary = "#{:02x}{:02x}{:02x}".format(*ct.get_color(quality=1))
            palette = ["#{:02x}{:02x}{:02x}".format(*c) for c in ct.get_palette(color_count=5, quality=1)]
            cur.execute(
                "UPDATE songs SET primary_color = %s, palette = %s WHERE id = %s",
                (primary, palette, song_id),
            )
            conn.commit()
            ok += 1
        except Exception:
            pass
        time.sleep(0.15)
    print(f"    Colors extracted for {ok} / {len(rows)} songs")


def insert_song(cur, song, analysis, collection_id):
    """Insert a fully processed song (without embedding — batched separately)."""
    sonic = analysis.get("sonic", {})
    semantic = analysis.get("semantic", {})
    genetic = analysis.get("genetic", {})

    song_id = f"sp-{song['spotify_uri'].split(':')[-1]}"

    songwriter = genetic.get("songwriter", [])
    if isinstance(songwriter, str):
        songwriter = [songwriter]

    instrument_credits = sonic.get("instrument_credits", [])
    if not isinstance(instrument_credits, list):
        instrument_credits = []

    cur.execute("""
        INSERT INTO songs (
            id, name, artist, album, year, img, duration,
            bpm, key, scale, mode, time_signature,
            key_changes, key_changes_detail,
            energy, energy_shape,
            bass_weight, mid_weight, treble_weight,
            vocal_type, rhythm_feel, prominent_instruments,
            instrument_credits,
            producer, studio, songwriter, label,
            mood, themes, sonic_fingerprint, fun_fact,
            collection_id, source, isrc
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s,
            %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s
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
        json.dumps(instrument_credits),
        genetic.get("producer"),
        genetic.get("studio"),
        songwriter,
        genetic.get("label"),
        semantic.get("mood", []),
        semantic.get("themes", []),
        semantic.get("sonic_fingerprint"),
        analysis.get("fun_fact"),
        collection_id,
        "spotify_gemini",
        song.get("isrc"),
    ))
    return song_id


def process_songs(songs, collection_id, cur, conn):
    """
    Phase 1: Gemini analysis per song (rate-limited, 1s sleep).
             Inserts each song immediately so progress is saved if it crashes.
    Phase 2: Batch embed all newly inserted songs in one API call.
    Phase 3: Extract album art colors for all new songs.
    """
    success = 0
    failed = 0
    total = len(songs)
    to_embed = []   # (song_id, embed_text)
    new_ids = []    # song IDs successfully inserted this run

    # ── Phase 1: Gemini ────────────────────────────────────────────────────────
    for i, song in enumerate(songs):
        print(f"\n[{i+1}/{total}] {song['name']} -- {song['artist']}")

        song_id = f"sp-{song['spotify_uri'].split(':')[-1]}"
        cur.execute("SELECT id FROM songs WHERE id = %s AND collection_id = %s",
                    (song_id, collection_id))
        if cur.fetchone():
            print(f"    Already in collection, skipping")
            success += 1
            continue

        analysis = analyze_with_gemini(song)
        if not analysis:
            failed += 1
            continue

        sonic = analysis.get("sonic", {})
        credits = sonic.get("instrument_credits", [])
        print(f"    BPM:{sonic.get('bpm')} Key:{sonic.get('key')} Credits:{len(credits)}")

        try:
            insert_song(cur, song, analysis, collection_id)
            conn.commit()
            embed_text = build_embed_text(song, analysis)
            to_embed.append((song_id, embed_text))
            new_ids.append(song_id)
            print(f"    Stored: {song_id}")
            success += 1
        except Exception as e:
            conn.rollback()
            print(f"    DB error: {e}")
            failed += 1

        time.sleep(1)   # 1s is safe for Gemini 2.5 Flash rate limits

    # ── Phase 2: Batch embeddings ──────────────────────────────────────────────
    batch_embed_songs(cur, conn, to_embed)

    # ── Phase 3: Colors ────────────────────────────────────────────────────────
    if new_ids:
        extract_colors_for_songs(cur, conn, new_ids)

    return success, failed


def main():
    parser = argparse.ArgumentParser(description="Ingest songs via Spotify + Gemini")
    parser.add_argument("--songs", help="Comma-separated song queries")
    parser.add_argument("--file", help="Text file with one song per line")
    parser.add_argument("--playlist", nargs="+", help="One or more Spotify playlist URLs")
    parser.add_argument("--collection", default="default", help="Collection ID")
    args = parser.parse_args()

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    total_success = 0
    total_failed = 0

    if args.playlist:
        all_tracks = []
        seen_ids = set()
        for url in args.playlist:
            print(f"\nFetching playlist: {url}")
            tracks = fetch_playlist_tracks(url)
            for t in tracks:
                tid = t["spotify_uri"]
                if tid not in seen_ids:
                    seen_ids.add(tid)
                    all_tracks.append(t)
        print(f"\nTotal unique tracks: {len(all_tracks)}")
        s, f = process_songs(all_tracks, args.collection, cur, conn)
        total_success += s
        total_failed += f

    else:
        queries = []
        if args.songs:
            queries = [s.strip() for s in args.songs.split(",")]
        elif args.file:
            with open(args.file) as f:
                queries = [line.strip() for line in f if line.strip()]
        else:
            print("Provide --songs, --file, or --playlist")
            sys.exit(1)

        songs = []
        for query in queries:
            song = search_spotify(query)
            if song:
                songs.append(song)
            else:
                print(f"  Not found: {query}")
                total_failed += 1

        s, f = process_songs(songs, args.collection, cur, conn)
        total_success += s
        total_failed += f

    cur.close()
    conn.close()

    print(f"\n{'='*50}")
    print(f"Complete: {total_success} succeeded, {total_failed} failed")
    print(f"Collection: {args.collection}")
    print(f"\nNext steps (run in order):")
    print(f"  python pipeline/run_umap.py")
    print(f"  python pipeline/generate_links.py")
    print(f"  python pipeline/run_umap_layouts.py --collection {args.collection}")
    print(f"  python pipeline/run_umap_layouts_3d.py --collection {args.collection}")
    print(f"  python pipeline/detect_clusters.py")
    print(f"  python pipeline/detect_clusters_per_layout.py --collection {args.collection}")


if __name__ == "__main__":
    main()