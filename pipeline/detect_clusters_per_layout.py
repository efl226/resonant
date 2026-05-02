"""
Detect clusters independently for each layout (sonic, vibe, decade, dna).
Each layout gets its own DBSCAN run, Gemini-generated name + description,
and saves to pipeline/output/clusters_{collection}_{layout}.json.

Also updates per-layout cluster ID columns in the DB:
  cluster_sonic_id, cluster_vibe_id, cluster_decade_id, cluster_dna_id

Run:
  python pipeline/detect_clusters_per_layout.py [--collection default] [--layouts sonic vibe decade dna]
"""

import argparse
import json
import os
from collections import Counter

import numpy as np
import psycopg
import vertexai
from dotenv import load_dotenv
from sklearn.cluster import DBSCAN
from sklearn.neighbors import NearestNeighbors
from vertexai.generative_models import GenerativeModel

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
vertexai.init(project="resonant-design", location="us-central1")
gemini = GenerativeModel("gemini-2.5-flash")

CLUSTER_PALETTE = [
    '#4A9EE8', '#E8724A', '#6BCB77', '#B84AE8', '#E8C94A',
    '#4AE8D4', '#E84A6A', '#8B9FE8', '#E8A04A', '#4AE88B',
    '#D44AE8', '#E8E04A', '#4A7BE8', '#E86B4A', '#7BE84A',
    '#E84AB8', '#4AE8E8', '#C4E84A',
]

# Layout → DB coordinate columns + cluster ID column
LAYOUT_CONFIG = {
    "sonic": {
        "x_col": "umap_sonic_x",
        "y_col": "umap_sonic_y",
        "cluster_col": "cluster_sonic_id",
        "context": "sonic characteristics (BPM, energy, key, mode, rhythm, instrumentation)",
    },
    "vibe": {
        "x_col": "umap_vibe_x",
        "y_col": "umap_vibe_y",
        "cluster_col": "cluster_vibe_id",
        "context": "emotional mood and lyrical themes",
    },
    "decade": {
        "x_col": "umap_decade_x",
        "y_col": "umap_decade_y",
        "cluster_col": "cluster_decade_id",
        "context": "era and decade of release",
    },
    "dna": {
        "x_col": "umap_dna_x",
        "y_col": "umap_dna_y",
        "cluster_col": "cluster_dna_id",
        "context": "shared production lineage (producers, labels, studios, songwriters)",
    },
}


def compute_adaptive_eps(coords, n_songs):
    k = min(4, n_songs - 1)
    nn = NearestNeighbors(n_neighbors=k + 1)
    nn.fit(coords)
    distances, _ = nn.kneighbors(coords)
    avg_knn_dist = np.mean(distances[:, k])

    if n_songs < 30:
        scale = 2.0
    elif n_songs < 60:
        scale = 1.5
    elif n_songs < 120:
        scale = 1.2
    elif n_songs < 300:
        scale = 1.0
    elif n_songs < 600:
        scale = 0.8
    else:
        scale = 0.65

    eps = avg_knn_dist * scale
    eps = max(25, min(90, eps))  # tighter cap for larger collections
    print(f"  Adaptive eps: {eps:.1f} (avg kNN dist: {avg_knn_dist:.1f}, scale: {scale})")
    return eps


def run_dbscan(coords, n_songs):
    eps = compute_adaptive_eps(coords, n_songs)
    min_samples = 3 if n_songs > 30 else 2

    labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(coords)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)
    print(f"  Found {n_clusters} clusters ({n_noise} unclustered)")

    # Scale minimum target clusters with collection size
    min_target = max(5, n_songs // 80)
    max_target = max(20, n_songs // 40)

    if n_clusters < min_target and n_songs > 20:
        print(f"  Too few clusters (target ≥{min_target}), tightening eps...")
        labels = DBSCAN(eps=eps * 0.65, min_samples=min_samples).fit_predict(coords)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = list(labels).count(-1)
        print(f"  Retry: {n_clusters} clusters ({n_noise} unclustered)")

    if n_clusters > max_target:
        print(f"  Too many clusters (target ≤{max_target}), loosening eps...")
        labels = DBSCAN(eps=eps * 1.4, min_samples=min_samples).fit_predict(coords)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = list(labels).count(-1)
        print(f"  Retry: {n_clusters} clusters ({n_noise} unclustered)")

    return labels


def name_and_describe_clusters(clusters_data, layout, layout_context):
    """
    Single Gemini call: returns {cluster_id: {name, description}} for all clusters.
    Description is layout-aware — explains WHY songs grouped together per that dimension.
    """
    cluster_descriptions = []
    for cid, data in clusters_data.items():
        songs_list = "\n".join([f"  - {s['artist']} — {s['name']}" for s in data["songs"][:20]])
        moods = ", ".join(data.get("top_moods", []))
        years = sorted([s["year"] for s in data["songs"] if s.get("year")])
        year_range = f"{years[0]}–{years[-1]}" if years else "unknown era"
        producers = Counter([s.get("producer") for s in data["songs"] if s.get("producer")])
        top_producers = ", ".join([p for p, _ in producers.most_common(3)])

        cluster_descriptions.append(
            f"Cluster {cid} ({len(data['songs'])} songs, years: {year_range}, "
            f"moods: {moods}, top producers: {top_producers or 'various'}):\n{songs_list}"
        )

    all_text = "\n\n".join(cluster_descriptions)

    layout_instructions = {
        "sonic": (
            "These clusters are grouped by SONIC CHARACTERISTICS — BPM, energy, key, mode, "
            "rhythm feel, instrumentation. Describe what sonic qualities unify each cluster. "
            "Mention tempo range, energy level, dominant instruments, or rhythmic feel."
        ),
        "vibe": (
            "These clusters are grouped by MOOD AND THEMES — emotional content and lyrical subject matter. "
            "Describe the emotional thread or thematic connection. What feeling do these songs share? "
            "What are they about?"
        ),
        "decade": (
            "These clusters are grouped by ERA — decade and year of release. "
            "Describe the cultural/musical moment these songs represent. "
            "What era sounds, production styles, or cultural context unites them?"
        ),
        "dna": (
            "These clusters are grouped by PRODUCTION DNA — shared producers, labels, studios, songwriters. "
            "Describe the production lineage. Who made these songs? What studio or label ecosystem do they come from?"
        ),
    }

    prompt = f"""You are analyzing clusters on a music discovery map. Songs in each cluster
share similar {layout_context}.

{layout_instructions.get(layout, "")}

For each cluster provide:
1. A SHORT NAME (2-4 words) — evocative, like a playlist title or record store section
2. A DESCRIPTION (2-3 sentences) — explain specifically WHY these songs belong together based on {layout_context}. Be concrete, not generic.

Good name examples: "Late Night Drive", "Basement Punk", "Golden Hour Soul", "Studio 54 Era"
Bad name examples: "Rock Music", "Sad Songs", "Cluster 1", "Various Artists"

{all_text}

Return ONLY valid JSON:
{{
    "0": {{"name": "...", "description": "..."}},
    "1": {{"name": "...", "description": "..."}}
}}"""

    try:
        response = gemini.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        result = json.loads(response.text)
        print(f"  Gemini named {len(result)} clusters:")
        for cid, info in result.items():
            print(f"    [{cid}] {info.get('name', '?')}")
        return result
    except Exception as e:
        print(f"  ✗ Gemini failed: {e}")
        return {}


def detect_layout_clusters(collection_id, layout, conn, cur):
    cfg = LAYOUT_CONFIG[layout]
    x_col, y_col, cluster_col = cfg["x_col"], cfg["y_col"], cfg["cluster_col"]

    print(f"\n{'='*50}")
    print(f"  Layout: {layout.upper()}")
    print(f"{'='*50}")

    cur.execute(f"""
        SELECT id, name, artist, year,
               mood, key, mode, vocal_type, rhythm_feel,
               producer, label, studio, songwriter,
               {x_col}, {y_col}
        FROM songs
        WHERE collection_id = %s
          AND {x_col} IS NOT NULL
          AND {y_col} IS NOT NULL
    """, (collection_id,))

    rows = cur.fetchall()
    cols = ["id", "name", "artist", "year", "mood", "key", "mode",
            "vocal_type", "rhythm_feel", "producer", "label", "studio",
            "songwriter", "x", "y"]
    songs = [dict(zip(cols, r)) for r in rows]

    if len(songs) < 5:
        print(f"  Only {len(songs)} songs with {layout} layout — skipping")
        return None

    print(f"  Clustering {len(songs)} songs...")
    coords = np.array([[s["x"], s["y"]] for s in songs])
    labels = run_dbscan(coords, len(songs))

    # Write cluster IDs to DB
    for i, song in enumerate(songs):
        cur.execute(
            f"UPDATE songs SET {cluster_col} = %s WHERE id = %s",
            (int(labels[i]), song["id"])
        )
    conn.commit()

    # Build cluster data structures
    clusters_data = {}
    for cluster_id in sorted(set(labels)):
        if cluster_id == -1:
            continue

        cluster_songs = [songs[i] for i in range(len(songs)) if labels[i] == cluster_id]
        cluster_coords = coords[labels == cluster_id]

        center_x = float(cluster_coords[:, 0].mean())
        center_y = float(cluster_coords[:, 1].mean())
        distances = np.sqrt(
            (cluster_coords[:, 0] - center_x) ** 2 +
            (cluster_coords[:, 1] - center_y) ** 2
        )
        radius = float(np.max(distances)) + 50

        all_moods = []
        for s in cluster_songs:
            if s["mood"]:
                all_moods.extend(s["mood"])
        top_moods = [m for m, _ in Counter(all_moods).most_common(3)]

        np.random.seed(cluster_id * 42)
        blobs = [{"x": center_x, "y": center_y, "radius": radius, "opacity": 0.10}]
        for _ in range(np.random.randint(3, 6)):
            angle = np.random.uniform(0, 2 * np.pi)
            dist = np.random.uniform(radius * 0.2, radius * 0.6)
            blobs.append({
                "x": center_x + np.cos(angle) * dist,
                "y": center_y + np.sin(angle) * dist,
                "radius": np.random.uniform(radius * 0.4, radius * 0.8),
                "opacity": np.random.uniform(0.04, 0.09),
            })

        color = CLUSTER_PALETTE[int(cluster_id) % len(CLUSTER_PALETTE)]

        clusters_data[int(cluster_id)] = {
            "id": int(cluster_id),
            "center_x": center_x,
            "center_y": center_y,
            "radius": radius,
            "color": color,
            "blobs": blobs,
            "song_count": len(cluster_songs),
            "top_moods": top_moods,
            "songs": [
                {
                    "id": s["id"],
                    "name": s["name"],
                    "artist": s["artist"],
                    "year": s["year"],
                    "producer": s["producer"],
                }
                for s in cluster_songs
            ],
        }

    # Gemini naming + descriptions
    print(f"  Asking Gemini to name & describe {len(clusters_data)} clusters...")
    gemini_result = name_and_describe_clusters(clusters_data, layout, cfg["context"])

    for cid, data in clusters_data.items():
        info = gemini_result.get(str(cid), {})
        data["label"] = info.get("name", f"Cluster {cid}")
        data["description"] = info.get("description", "")

    n_noise = int(list(labels).count(-1))
    output = {
        "layout": layout,
        "clusters": list(clusters_data.values()),
        "unclustered_count": n_noise,
        "total_songs": len(songs),
    }

    os.makedirs("pipeline/output", exist_ok=True)
    filename = f"pipeline/output/clusters_{collection_id}_{layout}.json"
    with open(filename, "w") as f:
        json.dump(output, f, indent=2)

    n_clusters = len(clusters_data)
    print(f"  ✓ Saved {n_clusters} clusters → {filename}")

    # Also persist to DB so Render can serve it without local files
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cluster_snapshots (
                collection_id TEXT NOT NULL,
                layout TEXT NOT NULL,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (collection_id, layout)
            )
        """)
        cur.execute("""
            INSERT INTO cluster_snapshots (collection_id, layout, data)
            VALUES (%s, %s, %s)
            ON CONFLICT (collection_id, layout) DO UPDATE
                SET data = EXCLUDED.data, created_at = NOW()
        """, (collection_id, layout, json.dumps(output)))
        conn.commit()
        print(f"  ✓ Persisted to DB (cluster_snapshots: {collection_id}/{layout})")
    except Exception as e:
        conn.rollback()
        print(f"  Warning: could not persist to DB: {e}")

    return output


def run(collection_id="default", layouts=None):
    if layouts is None:
        layouts = list(LAYOUT_CONFIG.keys())

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    results = {}
    for layout in layouts:
        if layout not in LAYOUT_CONFIG:
            print(f"Unknown layout: {layout}, skipping")
            continue
        result = detect_layout_clusters(collection_id, layout, conn, cur)
        if result:
            results[layout] = result

    cur.close()
    conn.close()

    print(f"\n✓ Done. Processed {len(results)}/{len(layouts)} layouts.")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default="default")
    parser.add_argument(
        "--layouts", nargs="+",
        default=list(LAYOUT_CONFIG.keys()),
        help="Which layouts to cluster (default: all)"
    )
    args = parser.parse_args()
    run(args.collection, args.layouts)
