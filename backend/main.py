import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
import psycopg
import json
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

app = FastAPI(title="Resonant API", version="0.1.0")

now_playing_state = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/now-playing")
def set_now_playing(body: dict = Body(...)):
    global now_playing_state
    now_playing_state = body
    return {"ok": True}


@app.get("/api/now-playing")
def get_now_playing():
    return now_playing_state


@app.get("/")
def root():
    return {"name": "Resonant API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _build_nodes(rows, has_new_layout_cols: bool):
    """
    Convert raw DB rows to node dicts.

    has_new_layout_cols=True  → decade/dna columns + cluster_*_id cols present
    has_new_layout_cols=False → legacy genetics columns, no per-layout cluster IDs
    """
    nodes = []
    for row in rows:
        musician_credits = row[38]
        if isinstance(musician_credits, str):
            try: musician_credits = json.loads(musician_credits)
            except: musician_credits = None

        samples_from = row[39]
        if isinstance(samples_from, str):
            try: samples_from = json.loads(samples_from)
            except: samples_from = None

        instrument_credits = None
        if has_new_layout_cols and len(row) > 71:
            ic = row[71]
            if isinstance(ic, str):
                try: instrument_credits = json.loads(ic)
                except: instrument_credits = None
            elif isinstance(ic, list):
                instrument_credits = ic

        user_notes = None
        user_edits = {}
        if has_new_layout_cols and len(row) > 72:
            user_notes = row[72]
        if has_new_layout_cols and len(row) > 73:
            ue = row[73]
            if isinstance(ue, str):
                try: user_edits = json.loads(ue)
                except: user_edits = {}
            elif isinstance(ue, dict):
                user_edits = ue

        isrc = None
        if has_new_layout_cols and len(row) > 74:
            isrc = row[74]

        mb_credits = None
        if has_new_layout_cols and len(row) > 75:
            mc = row[75]
            if isinstance(mc, str):
                try: mb_credits = json.loads(mc)
                except: mb_credits = None
            elif isinstance(mc, dict):
                mb_credits = mc if mc else None

        lyrics_full = row[42] if row[42] else None
        lyrics_preview = None
        if lyrics_full:
            lyrics_preview = lyrics_full[:300] + "..." if len(lyrics_full) > 300 else lyrics_full

        if has_new_layout_cols:
            # Indices 47-54: sonic/vibe/decade/dna 2D
            # Indices 55-66: sonic/vibe/decade/dna 3D
            # Indices 67-70: per-layout cluster IDs
            layouts = {
                "sonic":  {"x": row[47], "y": row[48]},
                "vibe":   {"x": row[49], "y": row[50]},
                "decade": {"x": row[51], "y": row[52]},
                "dna":    {"x": row[53], "y": row[54]},
            }
            layouts3d = {
                "sonic":  {"x": row[55], "y": row[56], "z": row[57]},
                "vibe":   {"x": row[58], "y": row[59], "z": row[60]},
                "decade": {"x": row[61], "y": row[62], "z": row[63]},
                "dna":    {"x": row[64], "y": row[65], "z": row[66]},
            }
            cluster_ids = {
                "sonic":  row[67],
                "vibe":   row[68],
                "decade": row[69],
                "dna":    row[70],
            }
        else:
            # Legacy: genetics columns mapped to both decade and dna for backwards compat
            layouts = {
                "sonic":    {"x": row[47], "y": row[48]},
                "vibe":     {"x": row[49], "y": row[50]},
                "decade":   {"x": row[51], "y": row[52]},
                "dna":      {"x": row[51], "y": row[52]},
                "genetics": {"x": row[51], "y": row[52]},
            }
            layouts3d = {
                "sonic":    {"x": row[53], "y": row[54], "z": row[55]},
                "vibe":     {"x": row[56], "y": row[57], "z": row[58]},
                "decade":   {"x": row[59], "y": row[60], "z": row[61]},
                "dna":      {"x": row[59], "y": row[60], "z": row[61]},
                "genetics": {"x": row[59], "y": row[60], "z": row[61]},
            }
            cluster_ids = {
                "sonic": None, "vibe": None, "decade": None, "dna": None,
            }

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
                "instrument_credits": instrument_credits or [],
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
            "lyrics": lyrics_full,
            "lyrics_preview": lyrics_preview,
            "has_lyrics": lyrics_full is not None,
            "is_live": row[44],
            "spotify_uri": row[45] or (f"spotify:track:{row[0][3:]}" if str(row[0]).startswith("sp-") else None),
            "cluster_id": row[46],
            "cluster_ids": cluster_ids,
            "umap_x": row[23], "umap_y": row[24],
            "layouts": layouts,
            "layouts3d": layouts3d,
            "user_notes": user_notes,
            "user_edits": user_edits,
            "isrc": isrc,
            "mb_credits": mb_credits,
        })
    return nodes


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/api/graph")
def get_graph(collection: str = "default"):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    nodes = []
    try:
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
                   umap_decade_x, umap_decade_y,
                   umap_dna_x, umap_dna_y,
                   umap_sonic_x3, umap_sonic_y3, umap_sonic_z3,
                   umap_vibe_x3, umap_vibe_y3, umap_vibe_z3,
                   umap_decade_x3, umap_decade_y3, umap_decade_z3,
                   umap_dna_x3, umap_dna_y3, umap_dna_z3,
                   cluster_sonic_id, cluster_vibe_id, cluster_decade_id, cluster_dna_id,
                   instrument_credits,
                   user_notes, user_edits,
                   isrc, mb_credits
            FROM songs WHERE collection_id = %s
        """, (collection,))
        nodes = _build_nodes(cur.fetchall(), has_new_layout_cols=True)
    except Exception:
        conn.rollback()
        try:
            # Level 2: legacy genetics layout columns, no isrc/mb_credits
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
                FROM songs WHERE collection_id = %s
            """, (collection,))
            nodes = _build_nodes(cur.fetchall(), has_new_layout_cols=False)
        except Exception:
            conn.rollback()
            # Level 3: minimal — only umap_x/umap_y exist, repeat them for all layout slots
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
                       umap_x, umap_y,
                       umap_x, umap_y,
                       umap_x, umap_y,
                       umap_x, umap_y, NULL::float,
                       umap_x, umap_y, NULL::float,
                       umap_x, umap_y, NULL::float
                FROM songs WHERE collection_id = %s
            """, (collection,))
            nodes = _build_nodes(cur.fetchall(), has_new_layout_cols=False)

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
def get_clusters(collection: str = "default", layout: str = ""):
    # Try local files first (dev environment)
    candidates = []
    if layout:
        candidates.append(f"pipeline/output/clusters_{collection}_{layout}.json")
    candidates += [
        f"pipeline/output/clusters_{collection}.json",
        "pipeline/output/clusters.json",
    ]
    for path in candidates:
        try:
            with open(path, "r") as f:
                return json.load(f)
        except FileNotFoundError:
            continue

    # Fall back to DB (production / Render)
    layout_key = layout if layout else "default"
    try:
        conn = psycopg.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            "SELECT data FROM cluster_snapshots WHERE collection_id = %s AND layout = %s",
            (collection, layout_key),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row:
            return row[0]
    except Exception:
        pass

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
    if filters.get("instrument_make"):
        conditions.append("EXISTS (SELECT 1 FROM jsonb_array_elements(instrument_credits) AS ic WHERE ic->>'make' ILIKE %s)")
        params.append(f"%{filters['instrument_make']}%")
    if filters.get("instrument_model"):
        conditions.append("EXISTS (SELECT 1 FROM jsonb_array_elements(instrument_credits) AS ic WHERE ic->>'model' ILIKE %s)")
        params.append(f"%{filters['instrument_model']}%")
    if filters.get("gear"):
        conditions.append("EXISTS (SELECT 1 FROM jsonb_array_elements(instrument_credits) AS ic WHERE concat_ws(' ', ic->>'make', ic->>'model') ILIKE %s)")
        params.append(f"%{filters['gear']}%")
    if filters.get("mb_location"):
        conditions.append("mb_credits->>'location' ILIKE %s")
        params.append(f"%{filters['mb_location']}%")
    if filters.get("mb_credit"):
        names = filters["mb_credit"] if isinstance(filters["mb_credit"], list) else [filters["mb_credit"]]
        for name in names:
            conditions.append("EXISTS (SELECT 1 FROM jsonb_array_elements(mb_credits->'credits') AS c WHERE c->>'name' ILIKE %s)")
            params.append(f"%{name}%")
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


@app.patch("/api/songs/{song_id}/edits")
def save_song_edits(song_id: str, body: dict = Body(...)):
    edits = body.get("edits") or {}
    notes = body.get("notes") or None
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute(
        "UPDATE songs SET user_edits = %s, user_notes = %s WHERE id = %s",
        (json.dumps(edits), notes, song_id),
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"ok": True}


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
