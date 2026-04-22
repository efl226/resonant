import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psycopg
import json
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

app = FastAPI(title="Resonant API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"name": "Resonant API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/graph")
def get_graph(collection: str = "default"):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, artist, album, year, img,
               bpm, key, energy, duration, prominent_instruments,
               producer, mixing_engineer, studio, songwriter, featuring, label,
               primary_color, palette, texture,
               mood, themes, ai_summary,
               umap_x, umap_y,
               scale, mode, time_signature, key_changes, key_changes_detail,
               energy_shape, bass_weight, mid_weight, treble_weight,
               vocal_type, rhythm_feel,
               country_recorded, conductor, musician_credits, samples_from,
               fun_fact, sonic_fingerprint,
               lyrics, lyrics_source,
               is_live, spotify_uri,
               cluster_id,
               umap_sonic_x, umap_sonic_y,
               umap_vibe_x, umap_vibe_y,
               umap_genetics_x, umap_genetics_y,
               umap_sonic_x3, umap_sonic_y3, umap_sonic_z3,
               umap_vibe_x3, umap_vibe_y3, umap_vibe_z3,
               umap_genetics_x3, umap_genetics_y3, umap_genetics_z3
        FROM songs
        WHERE collection_id = %s
    """, (collection,))

    nodes = []
    for row in cur.fetchall():
        musician_credits = row[38]
        if isinstance(musician_credits, str):
            try: musician_credits = json.loads(musician_credits)
            except: musician_credits = None

        samples_from = row[39]
        if isinstance(samples_from, str):
            try: samples_from = json.loads(samples_from)
            except: samples_from = None

        lyrics_preview = None
        if row[42]:
            lyrics_preview = row[42][:300] + "..." if len(row[42]) > 300 else row[42]

        nodes.append({
            "id": row[0], "name": row[1], "artist": row[2],
            "album": row[3], "year": row[4], "img": row[5],
            "sonic_dna": {
                "bpm": row[6], "key": row[7], "energy": row[8],
                "duration": row[9], "prominent_instruments": row[10] or [],
                "scale": row[25], "mode": row[26], "time_signature": row[27],
                "key_changes": row[28], "key_changes_detail": row[29] or [],
                "energy_shape": row[30], "bass_weight": row[31],
                "mid_weight": row[32], "treble_weight": row[33],
                "vocal_type": row[34], "rhythm_feel": row[35],
            },
            "genetic_dna": {
                "producer": row[11], "mixing_engineer": row[12],
                "studio": row[13], "songwriter": row[14] or [],
                "featuring": row[15] or [], "label": row[16],
                "country_recorded": row[36], "conductor": row[37],
                "musician_credits": musician_credits,
                "samples_from": samples_from,
            },
            "visual_dna": {
                "primary_color": row[17], "palette": row[18] or [],
                "texture": row[19],
            },
            "semantic_dna": {
                "mood": row[20] or [], "themes": row[21] or [],
                "ai_summary": row[22], "fun_fact": row[40],
                "sonic_fingerprint": row[41],
            },
            "lyrics_preview": lyrics_preview,
            "has_lyrics": row[42] is not None,
            "is_live": row[44],
            "spotify_uri": row[45],
            "cluster_id": row[46],
            "umap_x": row[23], "umap_y": row[24],
            "layouts": {
                "sonic":    {"x": row[47], "y": row[48]},
                "vibe":     {"x": row[49], "y": row[50]},
                "genetics": {"x": row[51], "y": row[52]},
            },
            "layouts3d": {
                "sonic":    {"x": row[53], "y": row[54], "z": row[55]},
                "vibe":     {"x": row[56], "y": row[57], "z": row[58]},
                "genetics": {"x": row[59], "y": row[60], "z": row[61]},
            },
        })

    # Get links
    song_ids = [n["id"] for n in nodes]
    if song_ids:
        cur.execute("""
            SELECT source_id, target_id, reason, score, type FROM links
            WHERE source_id = ANY(%s) AND target_id = ANY(%s)
        """, (song_ids, song_ids))
        links = [{"source": r[0], "target": r[1], "reason": r[2], "score": r[3], "type": r[4]} for r in cur.fetchall()]
    else:
        links = []

    cur.close()
    conn.close()
    return {"nodes": nodes, "links": links}


@app.get("/api/songs/{song_id}")
def get_song(song_id: str):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, artist, album, year, img, lyrics,
               musician_credits, samples_from, fun_fact, sonic_fingerprint,
               producer, label, songwriter, studio, country_recorded
        FROM songs WHERE id = %s
    """, (song_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return {"error": "Not found"}, 404
    musician_credits = row[7]
    if isinstance(musician_credits, str):
        try: musician_credits = json.loads(musician_credits)
        except: musician_credits = None
    samples_from = row[8]
    if isinstance(samples_from, str):
        try: samples_from = json.loads(samples_from)
        except: samples_from = None
    return {
        "id": row[0], "name": row[1], "artist": row[2],
        "album": row[3], "year": row[4], "img": row[5],
        "lyrics": row[6], "musician_credits": musician_credits,
        "samples_from": samples_from, "fun_fact": row[9],
        "sonic_fingerprint": row[10], "producer": row[11],
        "label": row[12], "songwriter": row[13],
        "studio": row[14], "country_recorded": row[15],
    }


@app.get("/api/clusters")
def get_clusters(collection: str = "default"):
    try:
        with open(f"pipeline/output/clusters_{collection}.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        pass
    try:
        with open("pipeline/output/clusters.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"clusters": [], "unclustered_count": 0, "total_songs": 0}


@app.get("/api/search")
def search_songs(q: str = "", limit: int = 20):
    if not q.strip():
        return {"query": "", "results": [], "total": 0}
    from search import search
    return search(q, limit)


@app.post("/api/filter-direct")
def filter_direct(filters: dict, collection: str = "default"):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()
    conditions = ["collection_id = %s"]
    params = [collection]
    if filters.get("artist"):
        conditions.append("artist ILIKE %s")
        params.append(f"%{filters['artist']}%")
    if filters.get("year_min"):
        conditions.append("year >= %s")
        params.append(filters["year_min"])
    if filters.get("year_max"):
        conditions.append("year <= %s")
        params.append(filters["year_max"])
    if filters.get("bpm_min"):
        conditions.append("bpm >= %s")
        params.append(filters["bpm_min"])
    if filters.get("bpm_max"):
        conditions.append("bpm <= %s")
        params.append(filters["bpm_max"])
    if filters.get("energy_min"):
        conditions.append("energy >= %s")
        params.append(filters["energy_min"])
    if filters.get("energy_max"):
        conditions.append("energy <= %s")
        params.append(filters["energy_max"])
    if filters.get("key"):
        conditions.append("key ILIKE %s")
        params.append(f"%{filters['key']}%")
    if filters.get("mode"):
        conditions.append("mode = %s")
        params.append(filters["mode"])
    if filters.get("vocal_type"):
        conditions.append("vocal_type = %s")
        params.append(filters["vocal_type"])
    if filters.get("rhythm_feel"):
        conditions.append("rhythm_feel = %s")
        params.append(filters["rhythm_feel"])
    if filters.get("producer"):
        conditions.append("producer ILIKE %s")
        params.append(f"%{filters['producer']}%")
    if filters.get("label"):
        conditions.append("label ILIKE %s")
        params.append(f"%{filters['label']}%")
    if filters.get("instruments"):
        for inst in filters["instruments"]:
            conditions.append("EXISTS (SELECT 1 FROM unnest(prominent_instruments) AS i WHERE i ILIKE %s)")
            params.append(f"%{inst}%")
    if filters.get("mood"):
        for m in filters["mood"]:
            conditions.append("EXISTS (SELECT 1 FROM unnest(mood) AS mo WHERE mo ILIKE %s)")
            params.append(f"%{m}%")
    if filters.get("themes"):
        for t in filters["themes"]:
            conditions.append("EXISTS (SELECT 1 FROM unnest(themes) AS th WHERE th ILIKE %s)")
            params.append(f"%{t}%")
    if filters.get("songwriter"):
        conditions.append("EXISTS (SELECT 1 FROM unnest(songwriter) AS sw WHERE sw ILIKE %s)")
        params.append(f"%{filters['songwriter']}%")
    if filters.get("studio"):
        conditions.append("studio ILIKE %s")
        params.append(f"%{filters['studio']}%")
    if filters.get("mixing_engineer"):
        conditions.append("mixing_engineer ILIKE %s")
        params.append(f"%{filters['mixing_engineer']}%")
    if filters.get("decade"):
        decade_map = {
            "60s": (1960, 1969), "1960s": (1960, 1969),
            "70s": (1970, 1979), "1970s": (1970, 1979),
            "80s": (1980, 1989), "1980s": (1980, 1989),
            "90s": (1990, 1999), "1990s": (1990, 1999),
            "00s": (2000, 2009), "2000s": (2000, 2009),
            "10s": (2010, 2019), "2010s": (2010, 2019),
            "20s": (2020, 2029), "2020s": (2020, 2029),
        }
        if filters["decade"] in decade_map:
            y_min, y_max = decade_map[filters["decade"]]
            conditions.append("year >= %s AND year <= %s")
            params.extend([y_min, y_max])
    if len(conditions) <= 1:
        cur.close()
        conn.close()
        return {"results": [], "total": 0}
    where_clause = " AND ".join(conditions)
    cur.execute(f"""
        SELECT id, name, artist, album, year, img, primary_color, mood, energy, bpm, key
        FROM songs WHERE {where_clause}
        ORDER BY artist, name
    """, params)
    results = []
    for row in cur.fetchall():
        results.append({
            "id": row[0], "name": row[1], "artist": row[2], "album": row[3],
            "year": row[4], "img": row[5], "primary_color": row[6],
            "mood": row[7] or [], "energy": row[8], "bpm": row[9], "key": row[10],
        })
    cur.close()
    conn.close()
    return {"results": results, "total": len(results)}


@app.get("/api/stats")
def get_stats():
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM songs")
    total_songs = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM links")
    total_links = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT artist) FROM songs")
    artists = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM songs WHERE lyrics IS NOT NULL")
    with_lyrics = cur.fetchone()[0]
    cur.close()
    conn.close()
    return {
        "total_songs": total_songs, "total_links": total_links,
        "artists": artists, "with_lyrics": with_lyrics,
    }