"""
Detect clusters with adaptive sizing and Gemini-generated names.
"""
import json
import numpy as np
from sklearn.cluster import DBSCAN
from collections import Counter
import psycopg
import vertexai
from vertexai.generative_models import GenerativeModel
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

vertexai.init(project="resonant-design", location="us-central1")
gemini = GenerativeModel("gemini-2.5-flash")


def name_clusters_with_gemini(clusters_data):
    """Send all clusters to Gemini in one call to get evocative names."""
    cluster_descriptions = []
    for cid, data in clusters_data.items():
        songs_list = "\n".join([f"  - {s['artist']} — {s['name']}" for s in data['songs']])
        moods = ", ".join(data.get('top_moods', []))
        cluster_descriptions.append(
            f"Cluster {cid} ({len(data['songs'])} songs, moods: {moods}):\n{songs_list}"
        )

    all_clusters_text = "\n\n".join(cluster_descriptions)

    prompt = f"""You are naming regions on a music discovery map. Each cluster is a group of songs that sound similar.

Give each cluster a short, evocative name (2-4 words max) that captures the VIBE, not just the genre. 
Think like a record store section name or a playlist title. Be creative and specific.

Good examples: "Late Night Drive", "Basement Punk", "Golden Hour Soul", "Digital Dreamscape", "Smoke & Velvet"
Bad examples: "Rock Music", "Sad Songs", "2010s Hits", "Cluster 1"

{all_clusters_text}

Return ONLY a valid JSON object mapping cluster IDs to names:
{{
    "0": "name for cluster 0",
    "1": "name for cluster 1"
}}
"""

    try:
        response = gemini.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        names = json.loads(response.text)
        print(f"  Gemini cluster names:")
        for cid, name in names.items():
            print(f"    Cluster {cid}: {name}")
        return names
    except Exception as e:
        print(f"  ✗ Gemini naming failed: {e}")
        return {}


def compute_adaptive_eps(coords, n_songs):
    """Compute eps based on collection size and density."""
    # Base eps on the average nearest-neighbor distance
    from sklearn.neighbors import NearestNeighbors

    # Use k=4 nearest neighbors to estimate density
    k = min(4, n_songs - 1)
    nn = NearestNeighbors(n_neighbors=k + 1)
    nn.fit(coords)
    distances, _ = nn.kneighbors(coords)

    # Average distance to kth nearest neighbor
    avg_knn_dist = np.mean(distances[:, k])

    # Scale factor based on collection size
    # Smaller collections need larger eps (more lenient grouping)
    # Larger collections can afford tighter clusters
    if n_songs < 30:
        scale = 2.0
    elif n_songs < 60:
        scale = 1.5
    elif n_songs < 120:
        scale = 1.2
    else:
        scale = 1.0

    eps = avg_knn_dist * scale

    # Clamp to reasonable range
    eps = max(40, min(150, eps))

    print(f"  Adaptive eps: {eps:.1f} (avg kNN dist: {avg_knn_dist:.1f}, scale: {scale}, n={n_songs})")
    return eps


def detect_clusters(collection_id=None):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    if collection_id:
        cur.execute("""
            SELECT id, name, artist, umap_x, umap_y,
                   mood, key, mode, year, vocal_type,
                   rhythm_feel, prominent_instruments, producer,
                   energy, bpm
            FROM songs
            WHERE umap_x IS NOT NULL AND collection_id = %s
        """, (collection_id,))
    else:
        cur.execute("""
            SELECT id, name, artist, umap_x, umap_y,
                   mood, key, mode, year, vocal_type,
                   rhythm_feel, prominent_instruments, producer,
                   energy, bpm
            FROM songs
            WHERE umap_x IS NOT NULL
        """)

    rows = cur.fetchall()
    columns = ['id', 'name', 'artist', 'umap_x', 'umap_y',
               'mood', 'key', 'mode', 'year', 'vocal_type',
               'rhythm_feel', 'instruments', 'producer',
               'energy', 'bpm']
    songs = [dict(zip(columns, row)) for row in rows]

    if len(songs) < 5:
        print(f"Only {len(songs)} songs — need at least 5 for clustering")
        cur.close()
        conn.close()
        return

    print(f"Clustering {len(songs)} songs...\n")

    coords = np.array([[s['umap_x'], s['umap_y']] for s in songs])

    # Adaptive eps
    eps = compute_adaptive_eps(coords, len(songs))
    min_samples = 3 if len(songs) > 30 else 2

    dbscan = DBSCAN(eps=eps, min_samples=min_samples)
    labels = dbscan.fit_predict(coords)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)
    print(f"  Found {n_clusters} clusters ({n_noise} unclustered songs)\n")

    # If too few or too many clusters, adjust
    if n_clusters < 3 and len(songs) > 20:
        print(f"  Too few clusters, tightening eps...")
        eps *= 0.7
        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        labels = dbscan.fit_predict(coords)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = list(labels).count(-1)
        print(f"  Retry: {n_clusters} clusters ({n_noise} unclustered)\n")

    if n_clusters > 20:
        print(f"  Too many clusters, loosening eps...")
        eps *= 1.4
        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        labels = dbscan.fit_predict(coords)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = list(labels).count(-1)
        print(f"  Retry: {n_clusters} clusters ({n_noise} unclustered)\n")

    # Save cluster_id on each song
    for i, song in enumerate(songs):
        cur.execute("UPDATE songs SET cluster_id = %s WHERE id = %s",
                    (int(labels[i]), song['id']))
    conn.commit()

    # Build cluster data
    cluster_palette = [
        '#4A9EE8', '#E8724A', '#6BCB77', '#B84AE8', '#E8C94A',
        '#4AE8D4', '#E84A6A', '#8B9FE8', '#E8A04A', '#4AE88B',
        '#D44AE8', '#E8E04A', '#4A7BE8', '#E86B4A', '#7BE84A',
        '#E84AB8', '#4AE8E8', '#C4E84A',
    ]

    clusters_data = {}
    for cluster_id in sorted(set(labels)):
        if cluster_id == -1:
            continue

        cluster_songs = [songs[i] for i in range(len(songs)) if labels[i] == cluster_id]
        cluster_coords = coords[labels == cluster_id]

        center_x = float(cluster_coords[:, 0].mean())
        center_y = float(cluster_coords[:, 1].mean())
        distances = np.sqrt((cluster_coords[:, 0] - center_x)**2 + (cluster_coords[:, 1] - center_y)**2)
        radius = float(np.max(distances)) + 50

        # Top moods for Gemini context
        all_moods = []
        for s in cluster_songs:
            if s['mood']: all_moods.extend(s['mood'])
        top_moods = [m for m, _ in Counter(all_moods).most_common(3)]

        # Generate blobs
        np.random.seed(cluster_id * 42)
        blobs = [{'x': center_x, 'y': center_y, 'radius': radius, 'opacity': 0.10}]
        for _ in range(np.random.randint(3, 6)):
            angle = np.random.uniform(0, 2 * np.pi)
            dist = np.random.uniform(radius * 0.2, radius * 0.6)
            blobs.append({
                'x': center_x + np.cos(angle) * dist,
                'y': center_y + np.sin(angle) * dist,
                'radius': np.random.uniform(radius * 0.4, radius * 0.8),
                'opacity': np.random.uniform(0.04, 0.09),
            })

        color = cluster_palette[int(cluster_id) % len(cluster_palette)]

        clusters_data[int(cluster_id)] = {
            'id': int(cluster_id),
            'center_x': center_x,
            'center_y': center_y,
            'radius': radius,
            'color': color,
            'blobs': blobs,
            'song_count': len(cluster_songs),
            'top_moods': top_moods,
            'songs': [{'name': s['name'], 'artist': s['artist']} for s in cluster_songs],
        }

    # Get Gemini names
    print("Asking Gemini to name clusters...")
    gemini_names = name_clusters_with_gemini(clusters_data)

    # Apply names and print
    for cid, data in clusters_data.items():
        data['label'] = gemini_names.get(str(cid), f"Cluster {cid}")
        print(f"\nCluster {cid}: {data['label']} ({data['color']})")
        print(f"  Songs: {data['song_count']}")
        for s in data['songs']:
            print(f"    • {s['artist']} — {s['name']}")

    # Save
    output = {
        'clusters': list(clusters_data.values()),
        'unclustered_count': n_noise,
        'total_songs': len(songs),
    }

    os.makedirs('pipeline/output', exist_ok=True)
    filename = f'pipeline/output/clusters_{collection_id}.json' if collection_id else 'pipeline/output/clusters.json'
    with open(filename, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Saved {n_clusters} clusters to {filename}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default=None)
    args = parser.parse_args()
    detect_clusters(args.collection)