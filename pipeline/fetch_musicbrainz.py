"""
Fetch MusicBrainz Credits
──────────────────────────
Uses each song's ISRC to look up detailed recording credits from MusicBrainz:
  - Per-instrument musician credits with real names
  - Recording engineer / producer / mixing credits
  - Recording location and dates
  - Publisher / label info

MusicBrainz rate limit: 1 req/sec. For 1,400 songs this takes ~45 min
(2 API calls per song: ISRC lookup + recording detail).
Safe to re-run — skips songs that already have mb_credits.

Usage:
    python fetch_musicbrainz.py
"""
import os
import time
import json
import requests
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

HEADERS = {
    "User-Agent": "Resonant/1.0 (personal music collection tool; contact@example.com)",
    "Accept": "application/json",
}
MB_BASE = "https://musicbrainz.org/ws/2"


def mb_get(url, params=None):
    """GET a MusicBrainz endpoint, respecting 1 req/sec."""
    resp = requests.get(url, headers=HEADERS, params=params, timeout=15)
    time.sleep(1.1)
    resp.raise_for_status()
    return resp.json()


def lookup_isrc(isrc):
    """Return the first recording MBID for an ISRC, or None."""
    try:
        data = mb_get(f"{MB_BASE}/isrc/{isrc}", {"fmt": "json"})
        recordings = data.get("recordings", [])
        if not recordings:
            return None
        # Prefer the recording with the most relations data (highest-confidence match)
        # The first result is usually the canonical one
        return recordings[0]["id"]
    except Exception as e:
        print(f"    ISRC lookup failed: {e}")
        return None


def fetch_recording(mbid):
    """
    Fetch full recording detail including artist relations and place relations.
    Returns structured mb_credits dict or None.
    """
    try:
        data = mb_get(
            f"{MB_BASE}/recording/{mbid}",
            {"fmt": "json", "inc": "artist-rels+place-rels+label-rels+work-rels"},
        )
    except Exception as e:
        print(f"    Recording fetch failed: {e}")
        return None

    relations = data.get("relations", [])

    credits = []
    location = None
    begin_date = None
    end_date = None

    for rel in relations:
        target_type = rel.get("target-type")
        rel_type = rel.get("type", "")
        attrs = rel.get("attributes", [])

        if target_type == "artist":
            artist = rel.get("artist", {})
            name = artist.get("name", "")
            if not name:
                continue

            # Normalise role name
            role = rel_type.lower()

            # Collapse attribute list into readable form
            attr_str = ", ".join(attrs) if attrs else ""

            credits.append({
                "role": role,
                "name": name,
                "attributes": attrs,
                "attr_str": attr_str,
                "begin": rel.get("begin"),
                "end": rel.get("end"),
            })

            # Capture recording window from producer/engineer relations
            if not begin_date and rel.get("begin"):
                begin_date = rel["begin"]
            if not end_date and rel.get("end"):
                end_date = rel["end"]

        elif target_type == "place":
            place = rel.get("place", {})
            if rel_type in ("recorded at", "engineered at", "mixed at"):
                location = place.get("name")

        elif target_type == "area":
            area = rel.get("area", {})
            if rel_type in ("recorded in",) and not location:
                location = area.get("name")

    if not credits and not location:
        return None

    return {
        "mbid": mbid,
        "begin": begin_date,
        "end": end_date,
        "location": location,
        "credits": credits,
    }


conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    SELECT id, name, artist, isrc
    FROM songs
    WHERE isrc IS NOT NULL AND mb_credits IS NULL
    ORDER BY artist, name
""")
rows = cur.fetchall()
print(f"Found {len(rows)} songs to enrich from MusicBrainz\n")

success = 0
no_match = 0
failed = 0

for i, (song_id, name, artist, isrc) in enumerate(rows):
    safe_name = name.encode("ascii", "replace").decode("ascii")
    safe_artist = artist.encode("ascii", "replace").decode("ascii")
    print(f"[{i+1}/{len(rows)}] {safe_artist} - {safe_name} ({isrc})")

    mbid = lookup_isrc(isrc)
    if not mbid:
        print(f"    No MusicBrainz recording found")
        no_match += 1
        # Store empty dict so we don't re-query this song
        cur.execute("UPDATE songs SET mb_credits = %s WHERE id = %s",
                    (json.dumps({}), song_id))
        conn.commit()
        continue

    credits_data = fetch_recording(mbid)
    if not credits_data:
        print(f"    Recording found but no usable credits")
        no_match += 1
        cur.execute("UPDATE songs SET mb_credits = %s WHERE id = %s",
                    (json.dumps({}), song_id))
        conn.commit()
        continue

    cur.execute("UPDATE songs SET mb_credits = %s WHERE id = %s",
                (json.dumps(credits_data), song_id))
    conn.commit()

    n_credits = len(credits_data.get("credits", []))
    loc = credits_data.get("location") or ""
    print(f"    OK  {n_credits} credits  {loc}")
    success += 1

print(f"\n{'='*50}")
print(f"Done: {success} enriched, {no_match} no match, {failed} errors")

cur.execute("SELECT COUNT(*) FROM songs WHERE mb_credits IS NOT NULL AND mb_credits != '{}'::jsonb")
total = cur.fetchone()[0]
print(f"Songs with MB credits: {total}")

cur.close()
conn.close()
