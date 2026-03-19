"""
MusicBrainz Credit Enrichment
──────────────────────────────
1. Backfill ISRC codes from Spotify (if missing)
2. Look up each song on MusicBrainz via ISRC
3. Extract: producer, studio, songwriter, label, mixing_engineer,
           country_recorded, musician_credits

Usage:
    python enrich_musicbrainz.py
"""
import time
import json
import requests
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import psycopg
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Spotify client for ISRC lookup
sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
))

# MusicBrainz config
MB_BASE = "https://musicbrainz.org/ws/2"
MB_HEADERS = {
    "User-Agent": "Resonant/1.0 (academic capstone project)",
    "Accept": "application/json",
}

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()


# ─── Step 1: Backfill ISRCs from Spotify ───

def backfill_isrcs():
    """Search Spotify for each song and store the ISRC code."""
    cur.execute("""
        SELECT id, name, artist 
        FROM songs 
        WHERE isrc IS NULL
    """)
    rows = cur.fetchall()
    print(f"Step 1: Backfilling ISRCs for {len(rows)} songs...\n")

    found = 0
    for i, (song_id, name, artist) in enumerate(rows):
        query = f"{artist} {name}"
        try:
            results = sp.search(q=query, limit=1)
            items = results["tracks"]["items"]
            if items:
                track = items[0]
                isrc = track.get("external_ids", {}).get("isrc")
                spotify_uri = track.get("uri")
                if isrc:
                    cur.execute(
                        "UPDATE songs SET isrc = %s, spotify_uri = %s WHERE id = %s",
                        (isrc, spotify_uri, song_id)
                    )
                    conn.commit()
                    found += 1
                    if (i + 1) % 20 == 0:
                        print(f"  [{i+1}/{len(rows)}] Found {found} ISRCs so far...")
        except Exception as e:
            pass  # Skip failures silently
        
        time.sleep(0.3)  # Rate limit

    print(f"  ✓ Found ISRCs for {found}/{len(rows)} songs\n")


# ─── Step 2: MusicBrainz lookup ───

def mb_lookup_by_isrc(isrc):
    """Look up a recording on MusicBrainz by ISRC."""
    try:
        resp = requests.get(
            f"{MB_BASE}/isrc/{isrc}",
            params={"fmt": "json", "inc": "artist-credits+releases"},
            headers=MB_HEADERS,
            timeout=10,
        )
        time.sleep(1.1)  # MusicBrainz rate limit: 1 req/sec
        
        if resp.status_code != 200:
            return None
        
        data = resp.json()
        recordings = data.get("recordings", [])
        if not recordings:
            return None
        
        return recordings[0]  # Best match
    except Exception:
        return None


def mb_get_recording_relations(recording_id):
    """Get full recording details with relationships (credits)."""
    try:
        resp = requests.get(
            f"{MB_BASE}/recording/{recording_id}",
            params={
                "fmt": "json",
                "inc": "artist-credits+artist-rels+work-rels+releases+tags",
            },
            headers=MB_HEADERS,
            timeout=10,
        )
        time.sleep(1.1)
        
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


def mb_get_release_details(release_id):
    """Get release details for label and country."""
    try:
        resp = requests.get(
            f"{MB_BASE}/release/{release_id}",
            params={
                "fmt": "json",
                "inc": "labels+release-groups+artist-credits",
            },
            headers=MB_HEADERS,
            timeout=10,
        )
        time.sleep(1.1)
        
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


def extract_credits(recording, release_details):
    """Extract structured credits from MusicBrainz data."""
    credits = {
        "producer": None,
        "mixing_engineer": None,
        "songwriter": [],
        "label": None,
        "studio": None,
        "country_recorded": None,
        "musician_credits": {},
    }

    # Extract from recording relationships
    relations = recording.get("relations", [])
    for rel in relations:
        rel_type = rel.get("type", "").lower()
        target = rel.get("artist", {})
        name = target.get("name", "")

        if not name:
            continue

        if "producer" in rel_type:
            if not credits["producer"]:
                credits["producer"] = name
        elif "mix" in rel_type:
            if not credits["mixing_engineer"]:
                credits["mixing_engineer"] = name
        elif "writer" in rel_type or "composer" in rel_type or "lyricist" in rel_type:
            if name not in credits["songwriter"]:
                credits["songwriter"].append(name)
        elif "engineer" in rel_type or "recording" in rel_type:
            pass  # Could capture recording engineer
        elif "perform" in rel_type:
            # Musician credits
            attributes = rel.get("attributes", [])
            instrument = ", ".join(attributes) if attributes else "performer"
            credits["musician_credits"][name] = instrument
        elif "vocal" in rel_type:
            credits["musician_credits"][name] = "vocals"
        elif rel_type in ["instrument", "guitar", "bass", "drums", "piano", "keyboard", "saxophone"]:
            credits["musician_credits"][name] = rel_type

    # Work relations (for songwriter if not found above)
    work_relations = recording.get("relations", [])
    for rel in work_relations:
        if rel.get("type") == "performance" and "work" in rel:
            work = rel["work"]
            work_relations_inner = work.get("relations", [])
            for wr in work_relations_inner:
                if wr.get("type") in ["writer", "composer", "lyricist"]:
                    name = wr.get("artist", {}).get("name", "")
                    if name and name not in credits["songwriter"]:
                        credits["songwriter"].append(name)

    # Release details
    if release_details:
        # Label
        label_info = release_details.get("label-info", [])
        if label_info:
            label_name = label_info[0].get("label", {}).get("name")
            if label_name:
                credits["label"] = label_name

        # Country
        country = release_details.get("country")
        if country:
            credits["country_recorded"] = country

    return credits


def enrich_from_musicbrainz():
    """Main enrichment loop."""
    cur.execute("""
        SELECT id, name, artist, isrc, musicbrainz_id
        FROM songs
        WHERE isrc IS NOT NULL
        AND musicbrainz_id IS NULL
    """)
    rows = cur.fetchall()
    print(f"Step 2: Looking up {len(rows)} songs on MusicBrainz...\n")

    enriched = 0
    for i, (song_id, name, artist, isrc, _) in enumerate(rows):
        print(f"[{i+1}/{len(rows)}] {artist} — {name}")
        print(f"    ISRC: {isrc}")

        # Look up by ISRC
        recording = mb_lookup_by_isrc(isrc)
        if not recording:
            print(f"    ✗ Not found on MusicBrainz")
            continue

        mb_id = recording.get("id")
        print(f"    Found: {recording.get('title')} (MB: {mb_id})")

        # Get full recording with relationships
        full_recording = mb_get_recording_relations(mb_id)
        if not full_recording:
            print(f"    ✗ Could not fetch details")
            continue

        # Get release details for label/country
        releases = recording.get("releases", [])
        release_details = None
        if releases:
            release_details = mb_get_release_details(releases[0]["id"])

        # Extract credits
        credits = extract_credits(full_recording, release_details)

        # Update database — only fill in fields that are currently empty
        updates = []
        params = []

        if credits["producer"]:
            updates.append("producer = COALESCE(NULLIF(producer, ''), %s)")
            params.append(credits["producer"])
        if credits["mixing_engineer"]:
            updates.append("mixing_engineer = COALESCE(NULLIF(mixing_engineer, ''), %s)")
            params.append(credits["mixing_engineer"])
        if credits["songwriter"]:
            updates.append("songwriter = CASE WHEN songwriter IS NULL OR songwriter = '{}' THEN %s ELSE songwriter END")
            params.append(credits["songwriter"])
        if credits["label"]:
            updates.append("label = COALESCE(NULLIF(label, ''), %s)")
            params.append(credits["label"])
        if credits["country_recorded"]:
            updates.append("country_recorded = COALESCE(NULLIF(country_recorded, ''), %s)")
            params.append(credits["country_recorded"])
        if credits["musician_credits"]:
            updates.append("musician_credits = COALESCE(musician_credits, %s::jsonb)")
            params.append(json.dumps(credits["musician_credits"]))

        # Always store the MusicBrainz ID
        updates.append("musicbrainz_id = %s")
        params.append(mb_id)

        if updates:
            params.append(song_id)
            sql = f"UPDATE songs SET {', '.join(updates)} WHERE id = %s"
            cur.execute(sql, params)
            conn.commit()

            found_fields = []
            if credits["producer"]:
                found_fields.append(f"Producer: {credits['producer']}")
            if credits["label"]:
                found_fields.append(f"Label: {credits['label']}")
            if credits["songwriter"]:
                found_fields.append(f"Writers: {', '.join(credits['songwriter'][:3])}")
            if credits["musician_credits"]:
                found_fields.append(f"Musicians: {len(credits['musician_credits'])}")
            if credits["country_recorded"]:
                found_fields.append(f"Country: {credits['country_recorded']}")

            print(f"    ✓ {' | '.join(found_fields)}")
            enriched += 1
        else:
            print(f"    No new credits found")

    print(f"\n✓ Enriched {enriched}/{len(rows)} songs with MusicBrainz data")


def print_summary():
    """Show what we've collected."""
    print(f"\n{'='*60}")
    print("Credit Coverage Summary:")
    print(f"{'='*60}")
    
    fields = [
        ('producer', 'Producer'),
        ('mixing_engineer', 'Mixing Engineer'),
        ('label', 'Label'),
        ('country_recorded', 'Country'),
        ('musician_credits', 'Musician Credits'),
    ]
    
    cur.execute("SELECT COUNT(*) FROM songs")
    total = cur.fetchone()[0]
    
    for col, name in fields:
        if col == 'musician_credits':
            cur.execute(f"SELECT COUNT(*) FROM songs WHERE {col} IS NOT NULL AND {col} != 'null'")
        else:
            cur.execute(f"SELECT COUNT(*) FROM songs WHERE {col} IS NOT NULL AND {col} != ''")
        count = cur.fetchone()[0]
        pct = (count / total * 100) if total > 0 else 0
        print(f"  {name:<20} {count:>4}/{total} ({pct:.0f}%)")

    cur.execute("SELECT COUNT(*) FROM songs WHERE songwriter IS NOT NULL AND songwriter != '{}'")
    sw_count = cur.fetchone()[0]
    pct = (sw_count / total * 100) if total > 0 else 0
    print(f"  {'Songwriter':<20} {sw_count:>4}/{total} ({pct:.0f}%)")


if __name__ == "__main__":
    backfill_isrcs()
    enrich_from_musicbrainz()
    print_summary()
    cur.close()
    conn.close()