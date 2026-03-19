"""
Generate Structural Links — Final Version
──────────────────────────────────────────
Creates meaningful, explainable connections between songs.
Includes: sampling, shared musicians, same producer,
shared instruments (rarity-scored), same key/BPM, same mood.

Tier 1 (always interesting): sampling, shared musicians, same producer
Tier 2 (on-click discovery): key/BPM, rare instruments, mood overlap

Caps at 5 links per node, prioritizing Tier 1.
"""
import json
import psycopg
from collections import Counter
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Fetch all songs with full data
cur.execute("""
    SELECT id, name, artist, bpm, key, mode, energy,
           prominent_instruments, producer, mood, year,
           studio, label, rhythm_feel, vocal_type,
           musician_credits, samples_from, featuring
    FROM songs
""")
rows = cur.fetchall()
columns = ['id', 'name', 'artist', 'bpm', 'key', 'mode', 'energy',
           'instruments', 'producer', 'mood', 'year',
           'studio', 'label', 'rhythm_feel', 'vocal_type',
           'musician_credits', 'samples_from', 'featuring']
songs = []
for row in rows:
    s = dict(zip(columns, row))
    # Parse JSONB fields
    if isinstance(s['musician_credits'], str):
        try:
            s['musician_credits'] = json.loads(s['musician_credits'])
        except:
            s['musician_credits'] = {}
    if not s['musician_credits']:
        s['musician_credits'] = {}
    if isinstance(s['samples_from'], str):
        try:
            s['samples_from'] = json.loads(s['samples_from'])
        except:
            s['samples_from'] = []
    if not s['samples_from']:
        s['samples_from'] = []
    songs.append(s)

total_songs = len(songs)
print(f"Analyzing {total_songs} songs for structural connections...\n")

# Build lookup by name for sampling cross-references
song_lookup = {}
for s in songs:
    key_name = f"{s['name'].lower().split(' - ')[0].strip()}"
    song_lookup[key_name] = s['id']
    # Also index by just the core name without remaster tags
    clean = s['name'].lower().replace('- remastered', '').replace('- remaster', '').replace('2009', '').replace('2011', '').replace('2017', '').replace('2015', '').replace('2019', '').replace('2020', '').strip()
    song_lookup[clean] = s['id']

# ─── Compute rarity scores ───
instrument_counts = Counter()
mood_counts = Counter()
producer_counts = Counter()
key_counts = Counter()
musician_song_count = Counter()  # How many songs each musician appears on

for s in songs:
    if s['instruments']:
        for inst in s['instruments']:
            instrument_counts[inst.lower()] += 1
    if s['mood']:
        for m in s['mood']:
            mood_counts[m.lower()] += 1
    if s['producer']:
        producer_counts[s['producer']] += 1
    if s['key']:
        key_counts[s['key']] += 1
    if s['musician_credits']:
        for musician in s['musician_credits'].keys():
            musician_song_count[musician] += 1


def rarity_score(count, total):
    if total == 0 or count == 0:
        return 0
    frequency = count / total
    if frequency > 0.5:
        return 0
    if frequency > 0.3:
        return 0.2
    if frequency > 0.15:
        return 0.5
    if frequency > 0.05:
        return 0.8
    return 1.0


# ─── Clear old links ───
cur.execute("DELETE FROM links")
conn.commit()

# ─── Generate all candidate links ───
all_links = []  # (source_id, target_id, reason, type, score, tier)

for i in range(len(songs)):
    for j in range(i + 1, len(songs)):
        a = songs[i]
        b = songs[j]

        # ═══ TIER 1: Always interesting ═══

        # Same artist
        if a['artist'] and b['artist'] and a['artist'] == b['artist']:
            all_links.append((
                a['id'], b['id'],
                f"Same artist: {a['artist']}",
                "same_artist", 0.95, 1
            ))

        # Sampling connections
        for sample in a.get('samples_from', []):
            sampled_name = sample.get('sampled_song', '').lower().strip()
            sampled_artist = sample.get('sampled_artist', '').lower().strip()
            # Check if the sampled song is song b
            b_name = b['name'].lower().split(' - ')[0].strip()
            b_artist = b['artist'].lower().split(',')[0].strip()
            if (sampled_name and b_name and
                    (sampled_name in b_name or b_name in sampled_name) and
                    (sampled_artist in b_artist or b_artist in sampled_artist)):
                element = sample.get('element', 'sample')
                all_links.append((
                    a['id'], b['id'],
                    f"Samples \"{b['name']}\" by {b['artist']} ({element})",
                    "samples", 0.98, 1
                ))

        # Check reverse — does b sample a?
        for sample in b.get('samples_from', []):
            sampled_name = sample.get('sampled_song', '').lower().strip()
            sampled_artist = sample.get('sampled_artist', '').lower().strip()
            a_name = a['name'].lower().split(' - ')[0].strip()
            a_artist = a['artist'].lower().split(',')[0].strip()
            if (sampled_name and a_name and
                    (sampled_name in a_name or a_name in sampled_name) and
                    (sampled_artist in a_artist or a_artist in sampled_artist)):
                element = sample.get('element', 'sample')
                all_links.append((
                    b['id'], a['id'],
                    f"Samples \"{a['name']}\" by {a['artist']} ({element})",
                    "samples", 0.98, 1
                ))

        # Shared musicians (different artists but same person played on both)
        if (a['musician_credits'] and b['musician_credits']
                and a['artist'] != b['artist']):
            shared_musicians = set(a['musician_credits'].keys()) & set(b['musician_credits'].keys())
            # Filter out the main artists themselves
            a_artist_names = set(n.strip().lower() for n in a['artist'].split(','))
            b_artist_names = set(n.strip().lower() for n in b['artist'].split(','))
            interesting_shared = [
                m for m in shared_musicians
                if m.lower() not in a_artist_names and m.lower() not in b_artist_names
            ]
            if interesting_shared:
                musician = interesting_shared[0]
                role_a = a['musician_credits'].get(musician, 'musician')
                role_b = b['musician_credits'].get(musician, 'musician')
                rarity = rarity_score(musician_song_count.get(musician, 0), total_songs)
                if rarity > 0.3:
                    all_links.append((
                        a['id'], b['id'],
                        f"Shared musician: {musician} ({role_a} / {role_b})",
                        "shared_musician", 0.85 + rarity * 0.1, 1
                    ))

        # Same producer (different artists)
        if (a['producer'] and b['producer']
                and a['producer'] == b['producer']
                and a['artist'] != b['artist']):
            prod_rarity = rarity_score(producer_counts[a['producer']], total_songs)
            if prod_rarity > 0.3:
                all_links.append((
                    a['id'], b['id'],
                    f"Same producer: {a['producer']}",
                    "same_producer", 0.85 + prod_rarity * 0.1, 1
                ))

        # ═══ TIER 2: Discovery links ═══

        # Same key + similar BPM
        if (a['key'] and b['key'] and a['bpm'] and b['bpm']
                and a['key'] == b['key']
                and abs(a['bpm'] - b['bpm']) <= 8
                and a['artist'] != b['artist']):
            key_rarity = rarity_score(key_counts[a['key']], total_songs)
            if key_rarity > 0.2:
                all_links.append((
                    a['id'], b['id'],
                    f"Same key ({a['key']}) & similar BPM ({a['bpm']:.0f} vs {b['bpm']:.0f})",
                    "same_key_bpm", 0.65 + key_rarity * 0.2, 2
                ))

        # Shared rare instruments (case-insensitive, at least 2)
        if a['instruments'] and b['instruments']:
            a_inst = set(i.lower() for i in a['instruments'])
            b_inst = set(i.lower() for i in b['instruments'])
            shared = a_inst & b_inst
            if len(shared) >= 2:
                avg_rarity = sum(rarity_score(instrument_counts.get(inst, 0), total_songs) for inst in shared) / len(shared)
                if avg_rarity > 0.4:
                    shared_list = ', '.join(sorted(shared)[:3])
                    all_links.append((
                        a['id'], b['id'],
                        f"Shared instruments: {shared_list}",
                        "shared_instruments", 0.6 + avg_rarity * 0.25, 2
                    ))

        # Shared rare moods (case-insensitive, at least 2)
        if a['mood'] and b['mood']:
            a_moods = set(m.lower() for m in a['mood'])
            b_moods = set(m.lower() for m in b['mood'])
            shared_moods = a_moods & b_moods
            if len(shared_moods) >= 2:
                avg_rarity = sum(rarity_score(mood_counts.get(m, 0), total_songs) for m in shared_moods) / len(shared_moods)
                if avg_rarity > 0.3:
                    mood_list = ', '.join(sorted(shared_moods)[:3])
                    all_links.append((
                        a['id'], b['id'],
                        f"Similar mood: {mood_list}",
                        "same_mood", 0.55 + avg_rarity * 0.2, 2
                    ))

        # Same uncommon rhythm + mode
        if (a['rhythm_feel'] and b['rhythm_feel']
                and a['mode'] and b['mode']
                and a['rhythm_feel'] == b['rhythm_feel']
                and a['mode'] == b['mode']
                and a['rhythm_feel'] != 'straight'
                and a['artist'] != b['artist']):
            all_links.append((
                a['id'], b['id'],
                f"Both {a['rhythm_feel']} and {a['mode']}",
                "same_feel", 0.6, 2
            ))

print(f"Total candidate links: {len(all_links)}")

# Count by tier
tier1 = sum(1 for l in all_links if l[5] == 1)
tier2 = sum(1 for l in all_links if l[5] == 2)
print(f"  Tier 1 (always interesting): {tier1}")
print(f"  Tier 2 (discovery): {tier2}")

# ─── Cap at 5 links per node, prioritizing Tier 1 ───
# Sort: tier 1 first, then by score descending
all_links.sort(key=lambda x: (-x[5] == 1, -x[4]))
# Actually sort tier 1 first (tier 1 = lower number = higher priority)
all_links.sort(key=lambda x: (x[5], -x[4]))

node_link_count = Counter()
MAX_LINKS_PER_NODE = 5
final_links = []
seen = set()

for source, target, reason, link_type, score, tier in all_links:
    pair = tuple(sorted([source, target]))
    if pair in seen:
        continue
    if (node_link_count[source] < MAX_LINKS_PER_NODE
            and node_link_count[target] < MAX_LINKS_PER_NODE):
        final_links.append((source, target, reason, link_type, score, tier))
        seen.add(pair)
        node_link_count[source] += 1
        node_link_count[target] += 1

print(f"After capping at {MAX_LINKS_PER_NODE} per node: {len(final_links)} links")

# ─── Insert final links ───
for i, (source, target, reason, link_type, score, tier) in enumerate(final_links):
    cur.execute("""
        INSERT INTO links (id, source_id, target_id, reason, score, type)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        f"struct-{i}",
        source, target, reason, round(score, 3), link_type,
    ))

conn.commit()

# ─── Summary ───
cur.execute("""
    SELECT type, COUNT(*), ROUND(AVG(score)::numeric, 2)
    FROM links
    GROUP BY type
    ORDER BY AVG(score) DESC
""")

print(f"\n{'='*55}")
print(f"{'Type':<25} {'Count':>6} {'Avg Score':>10}")
print(f"{'='*55}")
for row in cur.fetchall():
    print(f"{row[0]:<25} {row[1]:>6} {row[2]:>10}")

# Show Tier 1 connections
print(f"\nTier 1 — Most Interesting Connections:")
print(f"{'='*70}")
cur.execute("""
    SELECT s1.name, s1.artist, s2.name, s2.artist, l.reason, l.type, l.score
    FROM links l
    JOIN songs s1 ON l.source_id = s1.id
    JOIN songs s2 ON l.target_id = s2.id
    WHERE l.type IN ('samples', 'shared_musician', 'same_producer')
    ORDER BY l.score DESC
    LIMIT 20
""")
for row in cur.fetchall():
    print(f"  {row[0]} ({row[1]})")
    print(f"    ↔ {row[2]} ({row[3]})")
    print(f"    [{row[5]}] {row[4]}")
    print()

# Orphan check
cur.execute("""
    SELECT COUNT(*) FROM songs s
    WHERE NOT EXISTS (
        SELECT 1 FROM links WHERE source_id = s.id OR target_id = s.id
    )
""")
orphans = cur.fetchone()[0]
print(f"Songs with no connections: {orphans}")

cur.close()
conn.close()