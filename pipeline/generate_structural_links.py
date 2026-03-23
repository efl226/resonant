"""
Generate Interesting Links
──────────────────────────
Only creates connections that are genuinely surprising.
If a user could figure it out in 2 seconds, don't show it.

Tier 1 (score 0.9+): Sampling, shared musician across artists, 
                      cross-artist producer, cross-artist songwriter
Tier 2 (score 0.7-0.9): Rare label, rare studio, rare shared instruments,
                         cross-genre key+BPM match

Removed: same artist, common moods, common instruments, same decade

Max 5 per node. If nothing interesting, show nothing.

Usage:
    python generate_links.py
    python generate_links.py --collection testuser
"""
import json
import psycopg
from collections import Counter
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def generate_links(collection_id=None):
    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    # Fetch all songs with full data
    if collection_id:
        cur.execute("""
            SELECT id, name, artist, bpm, key, mode, energy,
                   prominent_instruments, producer, mood, year,
                   studio, label, rhythm_feel, vocal_type,
                   musician_credits, samples_from, songwriter,
                   cluster_id
            FROM songs WHERE collection_id = %s
        """, (collection_id,))
    else:
        cur.execute("""
            SELECT id, name, artist, bpm, key, mode, energy,
                   prominent_instruments, producer, mood, year,
                   studio, label, rhythm_feel, vocal_type,
                   musician_credits, samples_from, songwriter,
                   cluster_id
            FROM songs
        """)

    rows = cur.fetchall()
    columns = ['id', 'name', 'artist', 'bpm', 'key', 'mode', 'energy',
               'instruments', 'producer', 'mood', 'year',
               'studio', 'label', 'rhythm_feel', 'vocal_type',
               'musician_credits', 'samples_from', 'songwriter',
               'cluster_id']
    songs = []
    for row in rows:
        s = dict(zip(columns, row))
        # Parse JSONB
        if isinstance(s['musician_credits'], str):
            try: s['musician_credits'] = json.loads(s['musician_credits'])
            except: s['musician_credits'] = {}
        if not s['musician_credits']: s['musician_credits'] = {}
        if isinstance(s['samples_from'], str):
            try: s['samples_from'] = json.loads(s['samples_from'])
            except: s['samples_from'] = []
        if not s['samples_from']: s['samples_from'] = []
        if not s['songwriter']: s['songwriter'] = []
        songs.append(s)

    total = len(songs)
    print(f"Analyzing {total} songs for interesting connections...\n")

    # ─── Compute rarity ───
    instrument_counts = Counter()
    label_counts = Counter()
    studio_counts = Counter()
    producer_counts = Counter()
    musician_song_count = Counter()

    # Common instruments to always skip
    BORING_INSTRUMENTS = {
        'drums', 'guitar', 'bass', 'bass guitar', 'electric guitar',
        'acoustic guitar', 'vocals', 'piano', 'keyboard', 'percussion',
        'backing vocals', 'lead vocals', 'voice', 'drum machine',
        'synthesizer', 'synth', 'keys',
    }

    for s in songs:
        if s['instruments']:
            for inst in s['instruments']:
                instrument_counts[inst.lower()] += 1
        if s['label']:
            label_counts[s['label']] += 1
        if s['studio']:
            studio_counts[s['studio']] += 1
        if s['producer']:
            producer_counts[s['producer']] += 1
        if s['musician_credits']:
            for musician in s['musician_credits'].keys():
                musician_song_count[musician] += 1

    def rarity(count):
        if total == 0 or count == 0: return 0
        freq = count / total
        if freq > 0.4: return 0      # Too common
        if freq > 0.25: return 0.2
        if freq > 0.1: return 0.5
        if freq > 0.04: return 0.8
        return 1.0                    # Very rare

    def is_different_artist(a, b):
        """Check if two songs are by genuinely different artists."""
        a_artist = a['artist'].split(',')[0].strip().lower()
        b_artist = b['artist'].split(',')[0].strip().lower()
        return a_artist != b_artist

    def is_different_cluster(a, b):
        """Check if two songs are in different clusters."""
        if a['cluster_id'] is None or b['cluster_id'] is None:
            return True  # Unclustered songs count as different
        return a['cluster_id'] != b['cluster_id']

    # ─── Clear old links ───
    if collection_id:
        cur.execute("DELETE FROM links WHERE collection_id = %s", (collection_id,))
    else:
        cur.execute("DELETE FROM links")
    conn.commit()

    # ─── Find interesting connections ───
    all_links = []

    for i in range(len(songs)):
        for j in range(i + 1, len(songs)):
            a = songs[i]
            b = songs[j]

            # ═══════════════════════════════════
            # TIER 1: Genuinely surprising
            # ═══════════════════════════════════

            # Sampling — Song A samples Song B (both in collection)
            for sample in a.get('samples_from', []):
                sampled_name = sample.get('sampled_song', '').lower().strip()
                sampled_artist = sample.get('sampled_artist', '').lower().strip()
                b_name = b['name'].lower().split(' - ')[0].strip()
                b_artist = b['artist'].lower().split(',')[0].strip()
                if (sampled_name and b_name and
                        (sampled_name in b_name or b_name in sampled_name) and
                        (sampled_artist in b_artist or b_artist in sampled_artist)):
                    element = sample.get('element', 'sample')
                    all_links.append((a['id'], b['id'],
                        f"Samples \"{b['name']}\" ({element})",
                        "samples", 0.98))

            # Reverse sampling check
            for sample in b.get('samples_from', []):
                sampled_name = sample.get('sampled_song', '').lower().strip()
                sampled_artist = sample.get('sampled_artist', '').lower().strip()
                a_name = a['name'].lower().split(' - ')[0].strip()
                a_artist = a['artist'].lower().split(',')[0].strip()
                if (sampled_name and a_name and
                        (sampled_name in a_name or a_name in sampled_name) and
                        (sampled_artist in a_artist or a_artist in sampled_artist)):
                    element = sample.get('element', 'sample')
                    all_links.append((b['id'], a['id'],
                        f"Samples \"{a['name']}\" ({element})",
                        "samples", 0.98))

            # Shared musician across DIFFERENT artists
            if a['musician_credits'] and b['musician_credits'] and is_different_artist(a, b):
                a_artists_lower = set(n.strip().lower() for n in a['artist'].split(','))
                b_artists_lower = set(n.strip().lower() for n in b['artist'].split(','))
                shared = set(a['musician_credits'].keys()) & set(b['musician_credits'].keys())
                
                for musician in shared:
                    # Skip if the musician IS one of the main artists
                    if musician.lower() in a_artists_lower or musician.lower() in b_artists_lower:
                        continue
                    # Skip if this musician is on too many songs (session musicians on everything)
                    if musician_song_count.get(musician, 0) > total * 0.15:
                        continue
                    
                    role_a = a['musician_credits'].get(musician, '')
                    role_b = b['musician_credits'].get(musician, '')
                    all_links.append((a['id'], b['id'],
                        f"{musician} plays on both ({role_a} / {role_b})",
                        "shared_musician", 0.92))
                    break  # Only one musician link per pair

            # Same producer across DIFFERENT artists
            if (a['producer'] and b['producer'] and a['producer'] == b['producer']
                    and is_different_artist(a, b)):
                # Skip self-produced artists
                a_main = a['artist'].split(',')[0].strip().lower()
                b_main = b['artist'].split(',')[0].strip().lower()
                prod_lower = a['producer'].lower()
                if prod_lower != a_main and prod_lower != b_main:
                    r = rarity(producer_counts[a['producer']])
                    if r > 0.2:
                        all_links.append((a['id'], b['id'],
                            f"Both produced by {a['producer']}",
                            "same_producer", 0.90))

            # Same songwriter writing for DIFFERENT performing artists
            if a['songwriter'] and b['songwriter'] and is_different_artist(a, b):
                a_writers = set(w.strip().lower() for w in a['songwriter'])
                b_writers = set(w.strip().lower() for w in b['songwriter'])
                a_artists_lower = set(n.strip().lower() for n in a['artist'].split(','))
                b_artists_lower = set(n.strip().lower() for n in b['artist'].split(','))
                shared_writers = a_writers & b_writers
                # Remove the performing artists themselves
                interesting_writers = shared_writers - a_artists_lower - b_artists_lower
                if interesting_writers:
                    writer = list(interesting_writers)[0]
                    # Find original case
                    original = next((w for w in a['songwriter'] if w.strip().lower() == writer), writer)
                    all_links.append((a['id'], b['id'],
                        f"Both written by {original}",
                        "same_songwriter", 0.90))

            # ═══════════════════════════════════
            # TIER 2: Interesting with conditions
            # ═══════════════════════════════════

            # Same rare label (different artists)
            if (a['label'] and b['label'] and a['label'] == b['label']
                    and is_different_artist(a, b)):
                r = rarity(label_counts[a['label']])
                if r > 0.4:
                    all_links.append((a['id'], b['id'],
                        f"Both on {a['label']}",
                        "same_label", 0.70 + r * 0.15))

            # Same rare studio (different artists)
            if (a['studio'] and b['studio'] and a['studio'] == b['studio']
                    and is_different_artist(a, b)):
                r = rarity(studio_counts[a['studio']])
                if r > 0.4:
                    all_links.append((a['id'], b['id'],
                        f"Both recorded at {a['studio']}",
                        "same_studio", 0.70 + r * 0.15))

            # Shared RARE instruments (different artists, skip boring ones)
            if a['instruments'] and b['instruments'] and is_different_artist(a, b):
                a_inst = set(i.lower() for i in a['instruments']) - BORING_INSTRUMENTS
                b_inst = set(i.lower() for i in b['instruments']) - BORING_INSTRUMENTS
                shared = a_inst & b_inst
                if shared:
                    # Check rarity of shared instruments
                    rare_shared = [i for i in shared if rarity(instrument_counts.get(i, 0)) > 0.4]
                    if rare_shared:
                        inst_display = ', '.join(sorted(rare_shared)[:2])
                        avg_r = sum(rarity(instrument_counts.get(i, 0)) for i in rare_shared) / len(rare_shared)
                        all_links.append((a['id'], b['id'],
                            f"Both feature {inst_display}",
                            "shared_instruments", 0.70 + avg_r * 0.15))

            # Cross-genre key + BPM match (ONLY if different clusters)
            if (a['key'] and b['key'] and a['bpm'] and b['bpm']
                    and a['key'] == b['key']
                    and abs(a['bpm'] - b['bpm']) <= 8
                    and is_different_artist(a, b)
                    and is_different_cluster(a, b)):
                all_links.append((a['id'], b['id'],
                    f"Cross-genre harmonic match: {a['key']} at ~{int((a['bpm']+b['bpm'])/2)} BPM",
                    "harmonic_bridge", 0.78))

    print(f"Total interesting connections found: {len(all_links)}")

    # ─── Deduplicate ───
    seen = set()
    deduped = []
    for link in all_links:
        pair = tuple(sorted([link[0], link[1]]))
        pair_type = (pair, link[3])
        if pair_type not in seen:
            seen.add(pair_type)
            deduped.append(link)
    all_links = deduped

    print(f"After dedup: {len(all_links)}")

    # ─── Cap at 5 per node, prioritize highest scores ───
    all_links.sort(key=lambda x: -x[4])
    node_count = Counter()
    final = []
    seen_pairs = set()

    for source, target, reason, ltype, score in all_links:
        pair = tuple(sorted([source, target]))
        if pair in seen_pairs:
            continue
        if node_count[source] < 5 and node_count[target] < 5:
            final.append((source, target, reason, ltype, score))
            seen_pairs.add(pair)
            node_count[source] += 1
            node_count[target] += 1

    print(f"After capping at 5/node: {len(final)} links\n")

    # ─── Insert ───
    coll_prefix = f"{collection_id}-" if collection_id else ""
    for i, (source, target, reason, ltype, score) in enumerate(final):
        cur.execute("""
            INSERT INTO links (id, source_id, target_id, reason, score, type, collection_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (f"{coll_prefix}link-{i}", source, target, reason,
              round(score, 3), ltype, collection_id or 'default'))
    conn.commit()

    # ─── Summary ───
    type_counts = Counter(l[3] for l in final)
    print(f"{'Type':<25} {'Count':>6}")
    print(f"{'='*35}")
    for ltype, count in type_counts.most_common():
        print(f"  {ltype:<23} {count:>4}")

    # Show the connections
    if final:
        print(f"\nAll connections:")
        print(f"{'='*70}")
        for source, target, reason, ltype, score in final:
            s = next((s for s in songs if s['id'] == source), {})
            t = next((s for s in songs if s['id'] == target), {})
            print(f"  {s.get('name', '?')} ({s.get('artist', '?')})")
            print(f"    ↔ {t.get('name', '?')} ({t.get('artist', '?')})")
            print(f"    [{ltype}] {reason}")
            print()

    # Bridge songs
    songs_with_cross = set()
    for source, target, reason, ltype, score in final:
        s = next((s for s in songs if s['id'] == source), {})
        t = next((s for s in songs if s['id'] == target), {})
        if s.get('cluster_id') != t.get('cluster_id') and s.get('cluster_id') is not None:
            songs_with_cross.add(source)
            songs_with_cross.add(target)

    if songs_with_cross:
        print(f"\nBridge songs (connect different clusters):")
        for sid in songs_with_cross:
            s = next((s for s in songs if s['id'] == sid), {})
            print(f"  🌉 {s.get('artist')} — {s.get('name')} (cluster {s.get('cluster_id')})")

    # Songs with no connections
    connected = set()
    for s, t, _, _, _ in final:
        connected.add(s)
        connected.add(t)
    orphans = total - len(connected)
    print(f"\nSongs with no connections: {orphans}/{total}")
    print(f"(This is fine — it means those songs have nothing genuinely interesting to link to)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default=None)
    args = parser.parse_args()
    generate_links(args.collection)