from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psycopg
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

    # Fetch all songs
    cur.execute("""
        SELECT id, name, artist, album, year, img,
               bpm, key, energy, duration, prominent_instruments,
               producer, mixing_engineer, studio, songwriter, featuring, label,
               primary_color, palette, texture,
               mood, themes, ai_summary,
               umap_x, umap_y
        FROM songs
    """)

    nodes = []
    for row in cur.fetchall():
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
            },
            "genetic_dna": {
                "producer": row[11],
                "mixing_engineer": row[12],
                "studio": row[13],
                "songwriter": row[14] or [],
                "featuring": row[15] or [],
                "label": row[16],
            },
            "visual_dna": {
                "primary_color": row[17],
                "palette": row[18] or [],
                "texture": row[19],
            },
            "semantic_dna": {
                "mood": row[20],
                "themes": row[21] or [],
                "ai_summary": row[22],
            },
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

@app.get("/api/clusters")
def get_clusters():
    """Return cluster regions for the graph visualization."""
    import json
    try:
        with open("pipeline/output/clusters.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"clusters": [], "unclustered_count": 0, "total_songs": 0}
    