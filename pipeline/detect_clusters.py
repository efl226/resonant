"""
Detect clusters from UMAP positions and label them
based on the most common attributes within each cluster.
"""
import json
import numpy as np
from sklearn.cluster import DBSCAN
from collections import Counter
import psycopg
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

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

print(f"Clustering {len(songs)} songs...\n")

# Extract UMAP coordinates
coords = np.array([[s['umap_x'], s['umap_y']] for s in songs])

# Run DBSCAN — eps controls how close songs need to be to form a cluster
# min_samples controls minimum cluster size
dbscan = DBSCAN(eps=120, min_samples=3)
labels = dbscan.fit_predict(coords)

n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
n_noise = list(labels).count(-1)
print(f"Found {n_clusters} clusters ({n_noise} unclustered songs)\n")

# Analyze each cluster
clusters = {}
for cluster_id in sorted(set(labels)):
    if cluster_id == -1:
        continue

    cluster_songs = [songs[i] for i in range(len(songs)) if labels[i] == cluster_id]
    cluster_coords = coords[labels == cluster_id]

    # Center point of the cluster
    center_x = float(cluster_coords[:, 0].mean())
    center_y = float(cluster_coords[:, 1].mean())
    radius = float(np.max(np.sqrt(
        (cluster_coords[:, 0] - center_x)**2 +
        (cluster_coords[:, 1] - center_y)**2
    ))) + 40  # padding

    # Find dominant attributes
    all_moods = []
    all_modes = []
    all_vocal_types = []
    all_rhythm = []
    all_decades = []
    all_artists = []
    energies = []
    bpms = []

    for s in cluster_songs:
        if s['mood']:
            all_moods.extend(s['mood'])
        if s['mode']:
            all_modes.append(s['mode'])
        if s['vocal_type']:
            all_vocal_types.append(s['vocal_type'])
        if s['rhythm_feel']:
            all_rhythm.append(s['rhythm_feel'])
        if s['year']:
            all_decades.append(f"{(s['year'] // 10) * 10}s")
        if s['artist']:
            all_artists.append(s['artist'])
        if s['energy'] is not None:
            energies.append(s['energy'])
        if s['bpm'] is not None:
            bpms.append(s['bpm'])

    top_moods = [m for m, _ in Counter(all_moods).most_common(3)]
    top_mode = Counter(all_modes).most_common(1)[0][0] if all_modes else None
    top_vocal = Counter(all_vocal_types).most_common(1)[0][0] if all_vocal_types else None
    top_decade = Counter(all_decades).most_common(1)[0][0] if all_decades else None
    top_rhythm = Counter(all_rhythm).most_common(1)[0][0] if all_rhythm else None
    avg_energy = np.mean(energies) if energies else 0.5
    avg_bpm = np.mean(bpms) if bpms else 120

    # Generate a descriptive label
    label_parts = []
    if top_moods:
        label_parts.append(top_moods[0])
    if top_mode:
        label_parts.append(top_mode.title())
    if top_vocal and top_vocal != 'sung':
        label_parts.append(top_vocal.title())
    if top_decade:
        label_parts.append(top_decade)

    label = " / ".join(label_parts[:3]) if label_parts else f"Cluster {cluster_id}"

    # Pick a color based on dominant mood
    mood_colors = {
        'Melancholic': '#4A6FA5',
        'Melancholy': '#4A6FA5',
        'Energetic': '#E85D3A',
        'Dark': '#6B3FA0',
        'Introspective': '#2E86AB',
        'Confident': '#E8A838',
        'Dreamy': '#9B72CF',
        'Aggressive': '#D63230',
        'Smooth': '#3AA68E',
        'Cool': '#5C88C4',
        'Nostalgic': '#C4956A',
        'Atmospheric': '#5E7B99',
        'Reflective': '#7BA7BC',
        'Groovy': '#D4A843',
        'Psychedelic': '#B54FC4',
        'Cathartic': '#CF6B5F',
        'Ethereal': '#8FB8DE',
        'Defiant': '#CC4A4A',
        'Sultry': '#8E4585',
        'Haunting': '#4A5568',
        'Wistful': '#8BA5B5',
    }
    cluster_color = '#666666'
    for mood in top_moods:
        if mood in mood_colors:
            cluster_color = mood_colors[mood]
            break

    clusters[int(cluster_id)] = {
        'id': int(cluster_id),
        'label': label,
        'center_x': center_x,
        'center_y': center_y,
        'radius': radius,
        'color': cluster_color,
        'song_count': len(cluster_songs),
        'avg_energy': round(avg_energy, 2),
        'avg_bpm': round(avg_bpm, 0),
        'top_moods': top_moods,
        'top_mode': top_mode,
        'top_vocal': top_vocal,
        'top_decade': top_decade,
        'top_rhythm': top_rhythm,
        'songs': [{'name': s['name'], 'artist': s['artist']} for s in cluster_songs],
    }

    # Print cluster info
    print(f"Cluster {cluster_id}: {label}")
    print(f"  Center: ({center_x:.0f}, {center_y:.0f}), Radius: {radius:.0f}")
    print(f"  Songs: {len(cluster_songs)}")
    print(f"  Moods: {top_moods}")
    print(f"  Mode: {top_mode} | Vocal: {top_vocal} | Rhythm: {top_rhythm}")
    print(f"  Avg Energy: {avg_energy:.2f} | Avg BPM: {avg_bpm:.0f}")
    print(f"  Color: {cluster_color}")
    for s in cluster_songs:
        print(f"    • {s['artist']} — {s['name']}")
    print()

# Save clusters to a JSON file for the API
output = {
    'clusters': list(clusters.values()),
    'unclustered_count': n_noise,
    'total_songs': len(songs),
}

os.makedirs('pipeline/output', exist_ok=True)
with open('pipeline/output/clusters.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f"✓ Saved {n_clusters} clusters to pipeline/output/clusters.json")

# Also store cluster_id on each song in the database
for i, song in enumerate(songs):
    cluster_id = int(labels[i])
    cur.execute(
        "UPDATE songs SET source = source WHERE id = %s",
        (song['id'],)
    )

conn.commit()
cur.close()
conn.close()