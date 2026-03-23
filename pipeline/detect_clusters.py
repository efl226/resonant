"""
Detect clusters from UMAP positions, label them with
human-friendly genre names, save cluster_id on each song,
and output organic shape data.
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

    print(f"Clustering {len(songs)} songs...\n")

    coords = np.array([[s['umap_x'], s['umap_y']] for s in songs])

    dbscan = DBSCAN(eps=65, min_samples=3)
    labels = dbscan.fit_predict(coords)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)
    print(f"Found {n_clusters} clusters ({n_noise} unclustered songs)\n")

    # ─── Save cluster_id on each song ───
    for i, song in enumerate(songs):
        cur.execute("UPDATE songs SET cluster_id = %s WHERE id = %s",
                    (int(labels[i]), song['id']))
    conn.commit()
    print(f"Saved cluster assignments to database\n")

    # ─── Genre labeling ───
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
        'Erykah Badu': 'Neo-Soul', "D'Angelo": 'Neo-Soul',
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
        'Tame Impala': 'Psychedelic Pop', 'Mac DeMarco': 'Indie Pop',
        'LCD Soundsystem': 'Dance-Punk',
        'Billie Eilish': 'Dark Pop', 'Lana Del Rey': 'Dream Pop',
        'Amy Winehouse': 'Neo-Soul', 'Beyoncé': 'Pop / R&B',
        'Childish Gambino': 'Funk / R&B', 'Anderson .Paak': 'Funk / R&B',
        'Thundercat': 'Funk / R&B',
        'Bob Marley & The Wailers': 'Reggae', 'Fela Kuti': 'Afrobeat',
        'Kraftwerk': 'Electronic', 'FKA twigs': 'Art Pop',
        'Sampha': 'Alt R&B', 'Flying Lotus': 'Experimental',
        'Blood Orange': 'Alt R&B', 'Moses Sumney': 'Art Pop',
        'Weyes Blood': 'Art Pop', 'King Krule': 'Post-Punk',
        'Khruangbin': 'Psychedelic Soul',
        'Japanese Breakfast': 'Indie Pop',
        'Jeff Buckley': 'Art Rock',
        'Talking Heads': 'New Wave', 'Pixies': 'Alt Rock',
        'Sonic Youth': 'Noise Rock', 'MGMT': 'Psychedelic Pop',
        'The Who': 'Classic Rock', 'Jimi Hendrix': 'Classic Rock',
        'Gorillaz': 'Alt Rock',
        'Drake': 'Hip-Hop / R&B', 'The Weeknd': 'Alt R&B',
        'Bad Bunny': 'Reggaeton', 'Doja Cat': 'Pop / Rap',
        'Harry Styles': 'Pop Rock', 'Olivia Rodrigo': 'Pop Rock',
        'Dua Lipa': 'Dance Pop', 'Post Malone': 'Pop / Rap',
        'Lizzo': 'Pop / R&B', 'Ariana Grande': 'Pop',
        'Travis Scott': 'Hip-Hop', 'J. Cole': 'Hip-Hop',
        'Mac Miller': 'Hip-Hop', 'Brockhampton': 'Hip-Hop',
        'Steve Lacy': 'Alt R&B', 'Rex Orange County': 'Indie Pop',
        'Clairo': 'Indie Pop', 'Dominic Fike': 'Indie Pop',
    }

    def guess_label(cluster_songs):
        genre_votes = Counter()
        for s in cluster_songs:
            artist_name = s['artist'].split(',')[0].strip() if s['artist'] else ''
            if artist_name in artist_genres:
                genre_votes[artist_genres[artist_name]] += 1
        if genre_votes:
            top = genre_votes.most_common(2)
            if len(top) >= 2 and top[1][1] >= len(cluster_songs) * 0.2:
                return f"{top[0][0]} / {top[1][0]}"
            return top[0][0]
        
        # Fallback
        all_moods = []
        for s in cluster_songs:
            if s['mood']: all_moods.extend(s['mood'])
        top_mood = Counter(all_moods).most_common(1)[0][0] if all_moods else 'Mixed'
        return top_mood

    # ─── Color palette ───
    cluster_palette = [
        '#4A9EE8', '#E8724A', '#6BCB77', '#B84AE8', '#E8C94A',
        '#4AE8D4', '#E84A6A', '#8B9FE8', '#E8A04A', '#4AE88B',
        '#D44AE8', '#E8E04A', '#4A7BE8', '#E86B4A', '#7BE84A',
        '#E84AB8', '#4AE8E8', '#C4E84A',
    ]

    clusters = {}
    for cluster_id in sorted(set(labels)):
        if cluster_id == -1:
            continue

        cluster_songs = [songs[i] for i in range(len(songs)) if labels[i] == cluster_id]
        cluster_coords = coords[labels == cluster_id]

        center_x = float(cluster_coords[:, 0].mean())
        center_y = float(cluster_coords[:, 1].mean())
        distances = np.sqrt((cluster_coords[:, 0] - center_x)**2 + (cluster_coords[:, 1] - center_y)**2)
        radius = float(np.max(distances)) + 50

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

        label = guess_label(cluster_songs)
        color = cluster_palette[int(cluster_id) % len(cluster_palette)]

        clusters[int(cluster_id)] = {
            'id': int(cluster_id),
            'label': label,
            'center_x': center_x,
            'center_y': center_y,
            'radius': radius,
            'color': color,
            'blobs': blobs,
            'song_count': len(cluster_songs),
            'songs': [{'name': s['name'], 'artist': s['artist']} for s in cluster_songs],
        }

        print(f"Cluster {cluster_id}: {label} ({color})")
        print(f"  Songs: {len(cluster_songs)}")
        for s in cluster_songs:
            print(f"    • {s['artist']} — {s['name']}")
        print()

    output = {
        'clusters': list(clusters.values()),
        'unclustered_count': n_noise,
        'total_songs': len(songs),
    }

    os.makedirs('pipeline/output', exist_ok=True)
    filename = f'pipeline/output/clusters_{collection_id}.json' if collection_id else 'pipeline/output/clusters.json'
    with open(filename, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"✓ Saved {n_clusters} clusters to {filename}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default=None)
    args = parser.parse_args()
    detect_clusters(args.collection)