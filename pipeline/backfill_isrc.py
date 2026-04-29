"""
Backfill ISRC Codes
────────────────────
Fetches ISRC codes from Spotify for all songs that don't have one yet.
Safe to re-run — skips songs that already have an ISRC.

Usage:
    python backfill_isrc.py
"""
import os
import time
import psycopg
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
))

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("SELECT id FROM songs WHERE isrc IS NULL AND id LIKE 'sp-%'")
rows = cur.fetchall()
song_ids = [r[0] for r in rows]
print(f"Found {len(song_ids)} songs needing ISRC backfill\n")

BATCH = 50  # Spotify's /tracks endpoint accepts up to 50 IDs at once
success = 0
failed = 0

for batch_start in range(0, len(song_ids), BATCH):
    batch = song_ids[batch_start:batch_start + BATCH]
    track_ids = [sid.replace("sp-", "") for sid in batch]

    try:
        result = sp.tracks(track_ids)
        for song_id, track in zip(batch, result["tracks"]):
            if not track:
                failed += 1
                continue
            isrc = (track.get("external_ids") or {}).get("isrc")
            if isrc:
                cur.execute("UPDATE songs SET isrc = %s WHERE id = %s", (isrc, song_id))
                success += 1
            else:
                failed += 1
        conn.commit()
        end = min(batch_start + BATCH, len(song_ids))
        print(f"  Batch {batch_start+1}–{end}: {success} ISRCs saved so far")
    except Exception as e:
        print(f"  Batch {batch_start+1} ERROR: {e}")
        conn.rollback()
        failed += len(batch)

    time.sleep(0.2)

print(f"\nDone: {success} ISRCs saved, {failed} not found")

cur.execute("SELECT COUNT(*) FROM songs WHERE isrc IS NOT NULL")
total = cur.fetchone()[0]
print(f"Songs with ISRC: {total}")

cur.close()
conn.close()
