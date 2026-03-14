"""
Generate Structural Links
─────────────────────────
Creates meaningful, explainable connections between songs
based on shared metadata. Uses rarity scoring so common
attributes (like "Drums") don't create useless links.

Caps at 5 links per node to keep the graph clean.
"""
import psycopg
from collections import Counter
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Fetch all songs
cur.execute("""
    SELECT id, name, artist, bpm, key, mode, energy,
           prominent_instruments, producer, mood, year,
           studio, label, rhythm_feel, vocal_type
    FROM songs
""")
rows = cur.fetchall()
columns = ['id', 'name', 'artist', 'bpm', 'key', 'mode', 'energy',
           'instruments', 'producer', 'mood', 'year',
           'studio', 'label', 'rhythm_feel', 'vocal_type']
songs = [dict(zip(columns, row)) for row in rows]
total_songs = len(songs)

print(f"Analyzing {total_songs} songs for structural connections...\n")

# ─── Compute rarity scores ───
# Count how often each attribute value appears
instrument_counts = Counter()
mood_counts = Counter()
producer_counts = Counter()
key_counts = Counter()

for s in songs:
    if s['instruments']:
        for inst in s['instruments']:
            instrument_counts[inst] += 1
    if s['mood']:
        for m in s['mood']:
            mood_counts[m] += 1
    if s['producer']:
        producer_counts[s['producer']] += 1
    if s['key']:
        key_counts[s['key']] += 1


def rarity_score(count, total):
    """Higher score for rarer attributes. Returns 0-1."""
    if total == 0 or count == 0:
        return 0
    frequency = count / total
    if frequency > 0.5:  # More than half the songs have it — useless
        return 0
    if frequency > 0.3:
        return 0.2
    if frequency > 0.15:
        return 0.5
    if frequency > 0.05:
        return 0.8
    return 1.0  # Very rare


def instrument_rarity(instrument):
    return rarity_score(instrument_counts.get(instrument, 0), total_songs)


def mood_rarity(mood_tag):
    return rarity_score(mood_counts.get(mood_tag, 0), total_songs)


# Print rarity info
print("Most common instruments (will be filtered out):")
for inst, count in instrument_counts.most_common(10):
    freq = count / total_songs * 100
    rarity = instrument_rarity(inst)
    print(f"  {inst}: {count} songs ({freq:.0f}%) — rarity: {rarity}")

print(f"\nMost common moods:")
for m, count in mood_counts.most_common(10):
    freq = count / total_songs * 100
    print(f"  {m}: {count} songs ({freq:.0f}%)")

# ─── Clear old links ───
cur.execute("DELETE FROM links")
conn.commit()

# ─── Generate all candidate links ───
all_links = []  # (source_id, target_id, reason, type, score)

for i in range(len(songs)):
    for j in range(i + 1, len(songs)):
        a = songs[i]
        b = songs[j]

        # Same artist
        if a['artist'] and b['artist'] and a['artist'] == b['artist']:
            all_links.append((
                a['id'], b['id'],
                f"Same artist: {a['artist']}",
                "same_artist", 0.95
            ))

        # Same producer (only if producer isn't super common)
        if (a['producer'] and b['producer']
                and a['producer'] == b['producer']
                and a['artist'] != b['artist']):  # Skip if same artist
            prod_rarity = rarity_score(producer_counts[a['producer']], total_songs)
            if prod_rarity > 0.3:
                score = 0.8 + (prod_rarity * 0.15)
                all_links.append((
                    a['id'], b['id'],
                    f"Same producer: {a['producer']}",
                    "same_producer", score
                ))

        # Same key + similar BPM (within 8) — only for less common keys
        if (a['key'] and b['key'] and a['bpm'] and b['bpm']
                and a['key'] == b['key']
                and abs(a['bpm'] - b['bpm']) <= 8
                and a['artist'] != b['artist']):
            key_rarity = rarity_score(key_counts[a['key']], total_songs)
            if key_rarity > 0.2:
                score = 0.65 + (key_rarity * 0.2)
                all_links.append((
                    a['id'], b['id'],
                    f"Same key ({a['key']}) & similar BPM ({a['bpm']:.0f} vs {b['bpm']:.0f})",
                    "same_key_bpm", score
                ))

        # Shared rare instruments (at least 2, and average rarity must be high)
        if a['instruments'] and b['instruments']:
            shared = set(a['instruments']) & set(b['instruments'])
            if len(shared) >= 2:
                avg_rarity = sum(instrument_rarity(inst) for inst in shared) / len(shared)
                if avg_rarity > 0.4:
                    shared_list = ', '.join(sorted(shared)[:3])
                    score = 0.6 + (avg_rarity * 0.25)
                    all_links.append((
                        a['id'], b['id'],
                        f"Shared instruments: {shared_list}",
                        "shared_instruments", min(score, 0.9)
                    ))

        # Shared rare moods (at least 2, with rarity filter)
        if a['mood'] and b['mood']:
            shared_moods = set(a['mood']) & set(b['mood'])
            if len(shared_moods) >= 2:
                avg_rarity = sum(mood_rarity(m) for m in shared_moods) / len(shared_moods)
                if avg_rarity > 0.3:
                    mood_list = ', '.join(sorted(shared_moods)[:3])
                    score = 0.55 + (avg_rarity * 0.2)
                    all_links.append((
                        a['id'], b['id'],
                        f"Similar mood: {mood_list}",
                        "same_mood", score
                    ))

        # Same uncommon rhythm feel + same mode
        if (a['rhythm_feel'] and b['rhythm_feel']
                and a['mode'] and b['mode']
                and a['rhythm_feel'] == b['rhythm_feel']
                and a['mode'] == b['mode']
                and a['rhythm_feel'] != 'straight'
                and a['artist'] != b['artist']):
            all_links.append((
                a['id'], b['id'],
                f"Both {a['rhythm_feel']} and {a['mode']}",
                "same_feel", 0.6
            ))

print(f"\nTotal candidate links: {len(all_links)}")

# ─── Cap at 5 links per node ───
# Sort all links by score descending
all_links.sort(key=lambda x: x[4], reverse=True)

node_link_count = Counter()
MAX_LINKS_PER_NODE = 5
final_links = []

for source, target, reason, link_type, score in all_links:
    if (node_link_count[source] < MAX_LINKS_PER_NODE
            and node_link_count[target] < MAX_LINKS_PER_NODE):
        final_links.append((source, target, reason, link_type, score))
        node_link_count[source] += 1
        node_link_count[target] += 1

print(f"After capping at {MAX_LINKS_PER_NODE} per node: {len(final_links)} links")

# ─── Insert final links ───
for i, (source, target, reason, link_type, score) in enumerate(final_links):
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
    ORDER BY COUNT(*) DESC
""")

print(f"\n{'='*55}")
print(f"{'Type':<25} {'Count':>6} {'Avg Score':>10}")
print(f"{'='*55}")
for row in cur.fetchall():
    print(f"{row[0]:<25} {row[1]:>6} {row[2]:>10}")

# Show some interesting connections
print(f"\nMost interesting connections:")
print(f"{'='*70}")
cur.execute("""
    SELECT s1.name, s1.artist, s2.name, s2.artist, l.reason, l.type, l.score
    FROM links l
    JOIN songs s1 ON l.source_id = s1.id
    JOIN songs s2 ON l.target_id = s2.id
    ORDER BY l.score DESC
    LIMIT 20
""")
for row in cur.fetchall():
    print(f"  {row[0]} ({row[1]})")
    print(f"    ↔ {row[2]} ({row[3]})")
    print(f"    [{row[5]}] {row[4]} (score: {row[6]})")
    print()

# Node connectivity stats
print(f"Node connectivity:")
cur.execute("""
    SELECT name, artist, cnt FROM (
        SELECT s.name, s.artist, 
               (SELECT COUNT(*) FROM links WHERE source_id = s.id OR target_id = s.id) as cnt
        FROM songs s
    ) sub
    ORDER BY cnt DESC
    LIMIT 10
""")
print(f"  Most connected:")
for row in cur.fetchall():
    print(f"    {row[1]} — {row[0]}: {row[2]} links")

cur.execute("""
    SELECT COUNT(*) FROM songs s
    WHERE NOT EXISTS (
        SELECT 1 FROM links WHERE source_id = s.id OR target_id = s.id
    )
""")
orphans = cur.fetchone()[0]
print(f"\n  Songs with no connections: {orphans}")

cur.close()
conn.close()