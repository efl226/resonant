"""
Create Collection
─────────────────
Takes a text file of songs (one per line, "Artist - Song Title" format)
and builds a complete collection: ingest, embed, UMAP, clusters, links.

Usage:
    python create_collection.py --file alex_songs.txt --name "Alex's Music" --id alex
    python create_collection.py --file playlist.txt --name "Demo Collection" --id demo1
"""
import argparse
import json
import time
import os
import sys
import numpy as np

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import vertexai
from vertexai.generative_models import GenerativeModel
from vertexai.language_models import TextEmbeddingModel
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Spotify
sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
))

# Gemini + Embeddings
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
        "sonic_fingerprint": "<2-3 sentence description for vector clustering.>"
    }},
    "genetic": {{
        "producer": "<producer name if known, otherwise null>",
        "studio": "<studio name if known, otherwise null>",
        "songwriter": ["<songwriter names if known>"],
        "label": "<record label if known, otherwise null>"
    }},
    "fun_fact": "<One interesting production detail or historical context>"
}}
"""


def search_spotify(query):
    """Search Spotify for a track."""
    try:
        results = sp.search(q=query, limit=1)
        items = results["tracks"]["items"]
        if not items:
            return None
        track = items[0]
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
            "isrc": track.get("external_ids", {}).get("isrc"),
        }
    except Exception as e:
        print(f"    ✗ Spotify error: {e}")
        return None


def analyze_with_gemini(song):
    """Run Gemini text analysis."""
    prompt = ANALYSIS_PROMPT.format(
        name=song["name"], artist=song["artist"],
        album=song["album"], year=song["year"] or "Unknown",
        duration=song["duration"],
    )
    try:
        response = gemini.generate_content(
            prompt, generation_config={"response_mime_type": "application/json"}
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"    ✗ Gemini error: {e}")
        return None


def generate_embedding(song, analysis):
    """Generate embedding from combined data."""
    sonic = analysis.get("sonic", {})
    semantic = analysis.get("semantic", {})
    genetic = analysis.get("genetic", {})

    parts = [
        f"{song['name']} by {song['artist']}",
        f"{song['album']} ({song['year']})" if song.get("year") else "",
        f"BPM: {sonic.get('bpm')}. Key: {sonic.get('key')}. Mode: {sonic.get('mode')}",
        f"Rhythm: {sonic.get('rhythm_feel')}",
        f"Instruments: {', '.join(sonic.get('prominent_instruments', []))}",
        f"Mood: {', '.join(semantic.get('mood', []))}",
        f"Themes: {', '.join(semantic.get('themes', []))}",
        semantic.get("sonic_fingerprint", ""),
    ]
    if genetic.get("producer"):
        parts.append(f"Producer: {genetic['producer']}")

    embedding_text = ". ".join([p for p in parts if p])
    embeddings = embed_model.get_embeddings([embedding_text])
    return embeddings[0].values


def insert_song(cur, conn, song, analysis, embedding, collection_id):
    """Insert a song into the database."""
    sonic = analysis.get("sonic", {})
    semantic = analysis.get("semantic", {})
    genetic = analysis.get("genetic", {})

    song_id = f"sp-{song['spotify_uri'].split(':')[-1]}"

    songwriter = genetic.get("songwriter", [])
    if isinstance(songwriter, str):
        songwriter = [songwriter]

    try:
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
                embedding, collection_id, source,
                spotify_uri, isrc
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s::vector, %s, %s,
                %s, %s
            )
            ON CONFLICT (id) DO UPDATE SET collection_id = EXCLUDED.collection_id
        """, (
            song_id, song["name"], song["artist"], song["album"],
            song["year"], song["img"], song["duration"],
            sonic.get("bpm"), sonic.get("key"), sonic.get("scale"),
            sonic.get("mode"), sonic.get("time_signature"),
            sonic.get("key_changes", False), sonic.get("key_changes_detail", []),
            sonic.get("energy"), sonic.get("energy_shape"),
            sonic.get("bass_weight"), sonic.get("mid_weight"), sonic.get("treble_weight"),
            sonic.get("vocal_type"), sonic.get("rhythm_feel"),
            sonic.get("prominent_instruments", []),
            genetic.get("producer"), genetic.get("studio"),
            songwriter, genetic.get("label"),
            semantic.get("mood", []), semantic.get("themes", []),
            semantic.get("sonic_fingerprint"), analysis.get("fun_fact"),
            str(embedding), collection_id, "spotify_gemini",
            song.get("spotify_uri"), song.get("isrc"),
        ))
        conn.commit()
        return song_id
    except Exception as e:
        conn.rollback()
        print(f"    ✗ DB error: {e}")
        return None


def extract_colors_for_collection(cur, conn, collection_id):
    """Extract album art colors for songs in this collection."""
    import io
    import requests
    from colorthief import ColorThief

    cur.execute("""
        SELECT id, name, artist, img FROM songs
        WHERE collection_id = %s AND primary_color IS NULL AND img IS NOT NULL
    """, (collection_id,))
    rows = cur.fetchall()
    print(f"\n  Extracting colors for {len(rows)} songs...")

    for song_id, name, artist, img_url in rows:
        try:
            response = requests.get(img_url, timeout=10)
            response.raise_for_status()
            img_bytes = io.BytesIO(response.content)
            ct = ColorThief(img_bytes)
            primary = ct.get_color(quality=1)
            palette = ct.get_palette(color_count=5, quality=1)
            primary_hex = '#{:02x}{:02x}{:02x}'.format(*primary)
            palette_hex = ['#{:02x}{:02x}{:02x}'.format(*c) for c in palette]
            cur.execute(
                "UPDATE songs SET primary_color = %s, palette = %s WHERE id = %s",
                (primary_hex, palette_hex, song_id)
            )
            conn.commit()
        except:
            pass
        time.sleep(0.2)


def run_umap_for_collection(cur, conn, collection_id):
    """Run UMAP on just this collection's songs."""
    import umap as umap_lib

    cur.execute("""
        SELECT id, embedding FROM songs
        WHERE collection_id = %s AND embedding IS NOT NULL
    """, (collection_id,))
    rows = cur.fetchall()

    if len(rows) < 5:
        print(f"\n  Only {len(rows)} songs — need at least 5 for UMAP")
        return

    print(f"\n  Running UMAP on {len(rows)} songs...")
    song_ids = [r[0] for r in rows]
    embeddings = np.array([json.loads(r[1]) for r in rows])

    reducer = umap_lib.UMAP(
        n_components=2,
        n_neighbors=min(15, len(rows) - 1),
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(embeddings)

    # Normalize to [-500, 500]
    for dim in range(2):
        col = coords[:, dim]
        col_min, col_max = col.min(), col.max()
        if col_max - col_min > 0:
            coords[:, dim] = ((col - col_min) / (col_max - col_min) * 2 - 1) * 500

    for i, song_id in enumerate(song_ids):
        cur.execute("UPDATE songs SET umap_x = %s, umap_y = %s WHERE id = %s",
                     (float(coords[i, 0]), float(coords[i, 1]), song_id))
    conn.commit()
    print(f"  ✓ UMAP coordinates set for {len(rows)} songs")


def generate_links_for_collection(cur, conn, collection_id):
    """Generate structural links for this collection."""
    from sklearn.metrics.pairwise import cosine_similarity
    from collections import Counter

    cur.execute("""
        SELECT id, name, artist, bpm, key, mode, energy,
               prominent_instruments, producer, mood, year,
               rhythm_feel, vocal_type, embedding
        FROM songs WHERE collection_id = %s AND embedding IS NOT NULL
    """, (collection_id,))
    rows = cur.fetchall()
    columns = ['id', 'name', 'artist', 'bpm', 'key', 'mode', 'energy',
               'instruments', 'producer', 'mood', 'year',
               'rhythm_feel', 'vocal_type', 'embedding']
    songs = [dict(zip(columns, row)) for row in rows]

    print(f"\n  Generating links for {len(songs)} songs...")

    # Clear old links for this collection
    song_ids = [s['id'] for s in songs]
    if song_ids:
        cur.execute("""
            DELETE FROM links WHERE collection_id = %s
        """, (collection_id,))
        conn.commit()

    all_links = []
    instrument_counts = Counter()
    for s in songs:
        if s['instruments']:
            for inst in s['instruments']:
                instrument_counts[inst.lower()] += 1

    total = len(songs)

    def rarity(count):
        freq = count / total if total > 0 else 0
        if freq > 0.5: return 0
        if freq > 0.3: return 0.2
        if freq > 0.15: return 0.5
        return 0.8

    for i in range(len(songs)):
        for j in range(i + 1, len(songs)):
            a, b = songs[i], songs[j]

            # Same artist
            if a['artist'] and b['artist'] and a['artist'] == b['artist']:
                all_links.append((a['id'], b['id'], f"Same artist: {a['artist']}", "same_artist", 0.95))

            # Same producer (different artists)
            if (a['producer'] and b['producer'] and a['producer'] == b['producer']
                    and a['artist'] != b['artist']):
                all_links.append((a['id'], b['id'], f"Same producer: {a['producer']}", "same_producer", 0.85))

            # Same key + similar BPM
            if (a['key'] and b['key'] and a['bpm'] and b['bpm']
                    and a['key'] == b['key'] and abs(a['bpm'] - b['bpm']) <= 8
                    and a['artist'] != b['artist']):
                all_links.append((a['id'], b['id'],
                    f"Same key ({a['key']}) & similar BPM ({a['bpm']:.0f} vs {b['bpm']:.0f})",
                    "same_key_bpm", 0.75))

            # Shared rare instruments
            if a['instruments'] and b['instruments']:
                a_inst = set(i.lower() for i in a['instruments'])
                b_inst = set(i.lower() for i in b['instruments'])
                shared = a_inst & b_inst
                if len(shared) >= 2:
                    avg_r = sum(rarity(instrument_counts.get(i, 0)) for i in shared) / len(shared)
                    if avg_r > 0.3:
                        all_links.append((a['id'], b['id'],
                            f"Shared instruments: {', '.join(list(shared)[:3])}",
                            "shared_instruments", 0.65 + avg_r * 0.2))

            # Shared moods
            if a['mood'] and b['mood']:
                shared_m = set(m.lower() for m in a['mood']) & set(m.lower() for m in b['mood'])
                if len(shared_m) >= 2:
                    all_links.append((a['id'], b['id'],
                        f"Similar mood: {', '.join(list(shared_m)[:3])}",
                        "same_mood", 0.65))

    # Cap at 5 per node
    all_links.sort(key=lambda x: -x[4])
    node_count = Counter()
    final = []
    seen = set()
    for s, t, reason, ltype, score in all_links:
        pair = tuple(sorted([s, t]))
        if pair in seen: continue
        if node_count[s] < 5 and node_count[t] < 5:
            final.append((s, t, reason, ltype, score))
            seen.add(pair)
            node_count[s] += 1
            node_count[t] += 1

    for i, (s, t, reason, ltype, score) in enumerate(final):
        cur.execute("""
            INSERT INTO links (id, source_id, target_id, reason, score, type, collection_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (f"{collection_id}-link-{i}", s, t, reason, round(score, 3), ltype, collection_id))

    conn.commit()
    print(f"  ✓ Created {len(final)} links")


def detect_clusters_for_collection(collection_id):
    """Run cluster detection and save to collection-specific JSON."""
    # Re-use the existing cluster detection with a filter
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, artist, umap_x, umap_y, mood
        FROM songs WHERE collection_id = %s AND umap_x IS NOT NULL
    """, (collection_id,))
    rows = cur.fetchall()

    if len(rows) < 5:
        print(f"\n  Not enough songs for clustering")
        cur.close()
        conn.close()
        return

    from sklearn.cluster import DBSCAN

    coords = np.array([[r[3], r[4]] for r in rows])
    dbscan = DBSCAN(eps=65, min_samples=3)
    labels = dbscan.fit_predict(coords)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    print(f"\n  Found {n_clusters} clusters")

    # Simple cluster data
    cluster_palette = [
        '#4A9EE8', '#E8724A', '#6BCB77', '#B84AE8', '#E8C94A',
        '#4AE8D4', '#E84A6A', '#8B9FE8', '#E8A04A', '#4AE88B',
    ]

    clusters = []
    for cid in sorted(set(labels)):
        if cid == -1: continue
        c_songs = [rows[i] for i in range(len(rows)) if labels[i] == cid]
        c_coords = coords[labels == cid]
        cx, cy = float(c_coords[:, 0].mean()), float(c_coords[:, 1].mean())
        radius = float(np.max(np.sqrt((c_coords[:, 0]-cx)**2 + (c_coords[:, 1]-cy)**2))) + 50
        color = cluster_palette[int(cid) % len(cluster_palette)]

        # Generate blobs
        np.random.seed(cid * 42)
        blobs = [{'x': cx, 'y': cy, 'radius': radius, 'opacity': 0.10}]
        for _ in range(np.random.randint(3, 6)):
            angle = np.random.uniform(0, 2 * np.pi)
            dist = np.random.uniform(radius * 0.2, radius * 0.6)
            blobs.append({
                'x': cx + np.cos(angle) * dist,
                'y': cy + np.sin(angle) * dist,
                'radius': np.random.uniform(radius * 0.4, radius * 0.8),
                'opacity': np.random.uniform(0.04, 0.09),
            })

        # Simple label from moods
        all_moods = []
        for s in c_songs:
            if s[5]: all_moods.extend(s[5])
        from collections import Counter
        top_mood = Counter(all_moods).most_common(1)[0][0] if all_moods else "Mixed"

        clusters.append({
            'id': int(cid), 'label': top_mood, 'center_x': cx, 'center_y': cy,
            'radius': radius, 'color': color, 'blobs': blobs,
            'song_count': len(c_songs),
            'songs': [{'name': s[1], 'artist': s[2]} for s in c_songs],
        })

    os.makedirs('pipeline/output', exist_ok=True)
    with open(f'pipeline/output/clusters_{collection_id}.json', 'w') as f:
        json.dump({'clusters': clusters}, f, indent=2)

    print(f"  ✓ Saved clusters to pipeline/output/clusters_{collection_id}.json")
    cur.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="Create a collection for a tester")
    parser.add_argument("--file", required=True, help="Text file with one song per line (Artist - Title)")
    parser.add_argument("--name", required=True, help="Display name for the collection")
    parser.add_argument("--id", required=True, help="Collection ID (used in URL)")
    args = parser.parse_args()

    collection_id = args.id
    collection_name = args.name

    # Read songs
    with open(args.file) as f:
        queries = [line.strip() for line in f if line.strip() and not line.startswith('#')]

    print(f"{'='*60}")
    print(f"  Creating collection: {collection_name}")
    print(f"  ID: {collection_id}")
    print(f"  Songs: {len(queries)}")
    print(f"{'='*60}\n")

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    # ─── Step 1: Ingest songs ───
    print("Step 1: Ingesting songs via Spotify + Gemini...\n")
    success = 0
    failed = 0

    for i, query in enumerate(queries):
        print(f"[{i+1}/{len(queries)}] {query}")

        song = search_spotify(query)
        if not song:
            print(f"    ✗ Not found on Spotify")
            failed += 1
            continue

        print(f"    Found: {song['name']} — {song['artist']}")

        # Check if already exists
        cur.execute("SELECT id FROM songs WHERE id = %s", (f"sp-{song['spotify_uri'].split(':')[-1]}",))
        if cur.fetchone():
            # Update collection_id
            cur.execute("UPDATE songs SET collection_id = %s WHERE id = %s",
                        (collection_id, f"sp-{song['spotify_uri'].split(':')[-1]}"))
            conn.commit()
            print(f"    ✓ Already exists, assigned to collection")
            success += 1
            continue

        analysis = analyze_with_gemini(song)
        if not analysis:
            failed += 1
            continue

        embedding = generate_embedding(song, analysis)
        song_id = insert_song(cur, conn, song, analysis, embedding, collection_id)

        if song_id:
            sonic = analysis.get("sonic", {})
            print(f"    ✓ BPM: {sonic.get('bpm')} | Key: {sonic.get('key')}")
            success += 1
        else:
            failed += 1

        time.sleep(2)

    print(f"\n  Ingested: {success} succeeded, {failed} failed")

    # ─── Step 2: Extract colors ───
    print("\nStep 2: Extracting album art colors...")
    extract_colors_for_collection(cur, conn, collection_id)

    # ─── Step 3: UMAP ───
    print("\nStep 3: Computing UMAP coordinates...")
    run_umap_for_collection(cur, conn, collection_id)

    # ─── Step 4: Links ───
    print("\nStep 4: Generating structural links...")
    generate_links_for_collection(cur, conn, collection_id)

    cur.close()
    conn.close()

    # ─── Step 5: Clusters ───
    print("\nStep 5: Detecting clusters...")
    detect_clusters_for_collection(collection_id)

    # ─── Done ───
    print(f"\n{'='*60}")
    print(f"  ✓ Collection '{collection_name}' ready!")
    print(f"  URL: http://localhost:5173?collection={collection_id}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()