from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psycopg
import json
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

app = FastAPI(title="Resonant API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    conn = psycopg.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()


@app.get("/")
def root():
    return {"name": "Resonant API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/graph")
def get_graph():
    """The main endpoint — returns everything the frontend needs."""
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
               is_live, spotify_uri
        FROM songs
    """)

    nodes = []
    for row in cur.fetchall():
        # Parse JSONB fields
        musician_credits = row[38]
        if isinstance(musician_credits, str):
            try:
                musician_credits = json.loads(musician_credits)
            except:
                musician_credits = None
        
        samples_from = row[39]
        if isinstance(samples_from, str):
            try:
                samples_from = json.loads(samples_from)
            except:
                samples_from = None

        # Trim lyrics for the graph response (full lyrics available via /api/songs/:id)
        lyrics_preview = None
        if row[42]:
            lyrics_preview = row[42][:300] + "..." if len(row[42]) > 300 else row[42]

        nodes.append({
            "id": row[0],
            "name": row[1],
            "artist": row[2],
            "album": row[3],
            "year": row[4],
            "img": row[5],
            "sonic_dna": {
                "bpm": row[6],
                "key": row[7],
                "energy": row[8],
                "duration": row[9],
                "prominent_instruments": row[10] or [],
                "scale": row[25],
                "mode": row[26],
                "time_signature": row[27],
                "key_changes": row[28],
                "key_changes_detail": row[29] or [],
                "energy_shape": row[30],
                "bass_weight": row[31],
                "mid_weight": row[32],
                "treble_weight": row[33],
                "vocal_type": row[34],
                "rhythm_feel": row[35],
            },
            "genetic_dna": {
                "producer": row[11],
                "mixing_engineer": row[12],
                "studio": row[13],
                "songwriter": row[14] or [],
                "featuring": row[15] or [],
                "label": row[16],
                "country_recorded": row[36],
                "conductor": row[37],
                "musician_credits": musician_credits,
                "samples_from": samples_from,
            },
            "visual_dna": {
                "primary_color": row[17],
                "palette": row[18] or [],
                "texture": row[19],
            },
            "semantic_dna": {
                "mood": row[20] or [],
                "themes": row[21] or [],
                "ai_summary": row[22],
                "fun_fact": row[40],
                "sonic_fingerprint": row[41],
            },
            "lyrics_preview": lyrics_preview,
            "has_lyrics": row[42] is not None,
            "is_live": row[44],
            "spotify_uri": row[45],
            "umap_x": row[23],
            "umap_y": row[24],
        })

    # Fetch all links
    cur.execute("SELECT source_id, target_id, reason, score, type FROM links")
    links = []
    for row in cur.fetchall():
        links.append({
            "source": row[0],
            "target": row[1],
            "reason": row[2],
            "score": row[3],
            "type": row[4],
        })

    cur.close()
    conn.close()

    return {"nodes": nodes, "links": links}


@app.get("/api/songs/{song_id}")
def get_song(song_id: str):
    """Get a single song with FULL data including complete lyrics."""
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
        try:
            musician_credits = json.loads(musician_credits)
        except:
            musician_credits = None

    samples_from = row[8]
    if isinstance(samples_from, str):
        try:
            samples_from = json.loads(samples_from)
        except:
            samples_from = None

    return {
        "id": row[0],
        "name": row[1],
        "artist": row[2],
        "album": row[3],
        "year": row[4],
        "img": row[5],
        "lyrics": row[6],
        "musician_credits": musician_credits,
        "samples_from": samples_from,
        "fun_fact": row[9],
        "sonic_fingerprint": row[10],
        "producer": row[11],
        "label": row[12],
        "songwriter": row[13],
        "studio": row[14],
        "country_recorded": row[15],
    }


@app.get("/api/clusters")
def get_clusters():
    """Return cluster regions for the graph visualization."""
    try:
        with open("pipeline/output/clusters.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"clusters": [], "unclustered_count": 0, "total_songs": 0}


@app.get("/api/stats")
def get_stats():
    """Database-level statistics."""
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
        "total_songs": total_songs,
        "total_links": total_links,
        "artists": artists,
        "with_lyrics": with_lyrics,
    }