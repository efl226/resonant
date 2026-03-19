"""
Detect clusters from UMAP positions, label them with
human-friendly genre names, and output organic shape data.
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

coords = np.array([[s['umap_x'], s['umap_y']] for s in songs])

dbscan = DBSCAN(eps=65, min_samples=3)
labels = dbscan.fit_predict(coords)

n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
n_noise = list(labels).count(-1)
print(f"Found {n_clusters} clusters ({n_noise} unclustered songs)\n")

# ─── Genre labeling logic ───
def guess_cluster_label(cluster_songs):
    """Generate a human-friendly label based on the songs in the cluster."""
    artists = [s['artist'] for s in cluster_songs if s['artist']]
    all_moods = []
    all_modes = []
    all_vocal = []
    all_rhythm = []
    decades = []
    energies = []
    instruments = []

    for s in cluster_songs:
        if s['mood']:
            all_moods.extend(s['mood'])
        if s['mode']:
            all_modes.append(s['mode'])
        if s['vocal_type']:
            all_vocal.append(s['vocal_type'])
        if s['rhythm_feel']:
            all_rhythm.append(s['rhythm_feel'])
        if s['year']:
            decades.append((s['year'] // 10) * 10)
        if s['energy'] is not None:
            energies.append(s['energy'])
        if s['instruments']:
            instruments.extend(s['instruments'])

    top_mode = Counter(all_modes).most_common(1)[0][0] if all_modes else None
    top_vocal = Counter(all_vocal).most_common(1)[0][0] if all_vocal else None
    top_rhythm = Counter(all_rhythm).most_common(1)[0][0] if all_rhythm else None
    top_decade = Counter(decades).most_common(1)[0][0] if decades else None
    avg_energy = np.mean(energies) if energies else 0.5
    top_instruments = [i for i, _ in Counter(instruments).most_common(5)]

    # Known artist → genre mappings for well-known artists
    artist_genres = {
        'Radiohead': 'Art Rock', 'Pink Floyd': 'Prog Rock',
        'Led Zeppelin': 'Classic Rock', 'The Beatles': 'Classic Rock',
        'Queen': 'Classic Rock', 'David Bowie': 'Art Rock',
        'Fleetwood Mac': 'Classic Rock', 'The Rolling Stones': 'Classic Rock',
        'Nirvana': 'Grunge', 'The Smiths': 'Post-Punk',
        'Joy Division': 'Post-Punk', 'The Cure': 'Post-Punk',
        'Depeche Mode': 'Synth-Pop', 'New Order': 'Synth-Pop',
        'Kendrick Lamar': 'Hip-Hop', 'Kanye West': 'Hip-Hop',
        'JAŸ-Z': 'Hip-Hop', 'Nas': 'Hip-Hop',
        'OutKast': 'Hip-Hop', 'Outkast': 'Hip-Hop',
        'A Tribe Called Quest': 'Hip-Hop',
        'Tyler, The Creator': 'Hip-Hop', 'MF DOOM': 'Hip-Hop',
        'Frank Ocean': 'Alt R&B', 'SZA': 'Alt R&B',
        'Daniel Caesar': 'Alt R&B', 'Solange': 'Alt R&B',
        'Erykah Badu': 'Neo-Soul', 'D\'Angelo': 'Neo-Soul',
        'Ms. Lauryn Hill': 'Neo-Soul', 'J Dilla': 'Neo-Soul',
        'Stevie Wonder': 'Soul', 'Marvin Gaye': 'Soul',
        'Al Green': 'Soul', 'Otis Redding': 'Soul',
        'Nina Simone': 'Jazz / Soul', 'Miles Davis': 'Jazz',
        'John Coltrane': 'Jazz', 'Herbie Hancock': 'Jazz',
        'Daft Punk': 'Electronic', 'Aphex Twin': 'Electronic',
        'Boards of Canada': 'Ambient', 'Brian Eno': 'Ambient',
        'Burial': 'Electronic', 'James Blake': 'Electronic',
        'Massive Attack': 'Trip-Hop', 'Portishead': 'Trip-Hop',
        'Beach House': 'Dream Pop', 'Cocteau Twins': 'Dream Pop',
        'Mazzy Star': 'Dream Pop', 'Slowdive': 'Shoegaze',
        'my bloody valentine': 'Shoegaze',
        'Sigur Rós': 'Post-Rock', 'Björk': 'Art Pop',
        'Bon Iver': 'Indie Folk', 'Sufjan Stevens': 'Indie Folk',
        'Elliott Smith': 'Indie Folk', 'Nick Drake': 'Folk',
        'Phoebe Bridgers': 'Indie Rock', 'Mitski': 'Indie Rock',
        'Arctic Monkeys': 'Indie Rock', 'The Strokes': 'Indie Rock',
        'Arcade Fire': 'Indie Rock', 'Vampire Weekend': 'Indie Rock',
        'Interpol': 'Post-Punk Revival',
        'Tame Impala': 'Psychedelic Pop',
        'Mac DeMarco': 'Indie Pop',
        'LCD Soundsystem': 'Dance-Punk',
        'Billie Eilish': 'Dark Pop', 'Lana Del Rey': 'Dream Pop',
        'Amy Winehouse': 'Neo-Soul', 'Beyoncé': 'Pop / R&B',
        'Childish Gambino': 'Funk / R&B', 'Anderson .Paak': 'Funk / R&B',
        'Thundercat': 'Funk / R&B',
        'Bob Marley & The Wailers': 'Reggae', 'Fela Kuti': 'Afrobeat',
        'Kraftwerk': 'Electronic', 'FKA twigs': 'Art Pop',
        'Sampha': 'Alt R&B', 'Flying Lotus': 'Experimental Hip-Hop',
        'Blood Orange': 'Alt R&B', 'Moses Sumney': 'Art Pop',
        'Weyes Blood': 'Art Pop', 'King Krule': 'Post-Punk',
        'Khruangbin': 'Psychedelic Soul',
        'Japanese Breakfast': 'Indie Pop',
        'Jeff Buckley': 'Art Rock',
        'Talking Heads': 'New Wave', 'Pixies': 'Alt Rock',
        'Sonic Youth': 'Noise Rock', 'MGMT': 'Psychedelic Pop',
        'The Who': 'Classic Rock', 'Jimi Hendrix': 'Classic Rock',
        'Gorillaz': 'Alt Rock',
    }

    # Count genre votes from known artists
    genre_votes = Counter()
    for s in cluster_songs:
        artist_name = s['artist'].split(',')[0].strip() if s['artist'] else ''
        if artist_name in artist_genres:
            genre_votes[artist_genres[artist_name]] += 1

    if genre_votes:
        top_genre = genre_votes.most_common(1)[0][0]
        # If there's a strong consensus, use it
        if genre_votes.most_common(1)[0][1] >= len(cluster_songs) * 0.4:
            return top_genre
        # If there are two strong genres, combine them
        if len(genre_votes) >= 2:
            top_two = genre_votes.most_common(2)
            if top_two[1][1] >= len(cluster_songs) * 0.2:
                return f"{top_two[0][0]} / {top_two[1][0]}"
            return top_genre

    # Fallback: derive from attributes
    if top_vocal == 'rapped':
        return 'Hip-Hop'
    if top_vocal == 'instrumental':
        if top_rhythm == 'swung':
            return 'Jazz'
        return 'Instrumental'
    if top_rhythm == 'swung' and top_mode == 'modal':
        return 'Jazz / Soul'
    if avg_energy > 0.8 and top_mode == 'minor':
        return 'High Energy'
    if avg_energy < 0.35:
        return 'Ambient / Ethereal'
    if top_decade and top_decade <= 1970:
        return 'Classic'
    
    # Last resort
    top_mood = Counter(all_moods).most_common(1)[0][0] if all_moods else 'Mixed'
    return f"{top_mood} {top_mode.title() if top_mode else ''}".strip()


# ─── Distinct color palette ───
# These are visually distinct from each other on a dark background
cluster_palette = [
    '#4A9EE8',  # bright blue
    '#E8724A',  # warm orange
    '#6BCB77',  # soft green
    '#B84AE8',  # purple
    '#E8C94A',  # gold
    '#4AE8D4',  # teal
    '#E84A6A',  # rose
    '#8B9FE8',  # periwinkle
    '#E8A04A',  # amber
    '#4AE88B',  # mint
    '#D44AE8',  # magenta
    '#E8E04A',  # yellow
    '#4A7BE8',  # royal blue
    '#E86B4A',  # coral
    '#7BE84A',  # lime
    '#E84AB8',  # pink
    '#4AE8E8',  # cyan
    '#C4E84A',  # chartreuse
]

clusters = {}
for cluster_id in sorted(set(labels)):
    if cluster_id == -1:
        continue

    cluster_songs = [songs[i] for i in range(len(songs)) if labels[i] == cluster_id]
    cluster_coords = coords[labels == cluster_id]

    center_x = float(cluster_coords[:, 0].mean())
    center_y = float(cluster_coords[:, 1].mean())
    
    # Calculate radius from actual song positions
    distances = np.sqrt(
        (cluster_coords[:, 0] - center_x)**2 +
        (cluster_coords[:, 1] - center_y)**2
    )
    radius = float(np.max(distances)) + 50

    # Generate organic shape data — multiple offset blobs
    np.random.seed(cluster_id * 42)
    blobs = []
    # Main blob
    blobs.append({
        'x': center_x,
        'y': center_y,
        'radius': radius,
        'opacity': 0.10,
    })
    # 3-5 secondary blobs offset from center for organic feel
    n_secondary = np.random.randint(3, 6)
    for _ in range(n_secondary):
        angle = np.random.uniform(0, 2 * np.pi)
        dist = np.random.uniform(radius * 0.2, radius * 0.6)
        blob_radius = np.random.uniform(radius * 0.4, radius * 0.8)
        blobs.append({
            'x': center_x + np.cos(angle) * dist,
            'y': center_y + np.sin(angle) * dist,
            'radius': blob_radius,
            'opacity': np.random.uniform(0.04, 0.09),
        })

    label = guess_cluster_label(cluster_songs)
    color = cluster_palette[int(cluster_id) % len(cluster_palette)]

    energies = [s['energy'] for s in cluster_songs if s['energy'] is not None]
    bpms = [s['bpm'] for s in cluster_songs if s['bpm'] is not None]

    clusters[int(cluster_id)] = {
        'id': int(cluster_id),
        'label': label,
        'center_x': center_x,
        'center_y': center_y,
        'radius': radius,
        'color': color,
        'blobs': blobs,
        'song_count': len(cluster_songs),
        'avg_energy': round(np.mean(energies), 2) if energies else 0.5,
        'avg_bpm': round(np.mean(bpms), 0) if bpms else 120,
        'songs': [{'name': s['name'], 'artist': s['artist']} for s in cluster_songs],
    }

    print(f"Cluster {cluster_id}: {label} ({color})")
    print(f"  Center: ({center_x:.0f}, {center_y:.0f}), Radius: {radius:.0f}")
    print(f"  Songs: {len(cluster_songs)}, Blobs: {len(blobs)}")
    for s in cluster_songs:
        print(f"    • {s['artist']} — {s['name']}")
    print()

output = {
    'clusters': list(clusters.values()),
    'unclustered_count': n_noise,
    'total_songs': len(songs),
}

os.makedirs('pipeline/output', exist_ok=True)
with open('pipeline/output/clusters.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f"✓ Saved {n_clusters} clusters to pipeline/output/clusters.json")

cur.close()
conn.close()