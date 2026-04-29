"""
Fetch Lyrics from Genius
─────────────────────────
Searches Genius for each song and scrapes the full lyrics.
Requires a Genius API token — get one free at https://genius.com/api-clients

Add to your .env:
    GENIUS_ACCESS_TOKEN=your_token_here

Safe to re-run — skips songs that already have lyrics.

Usage:
    python fetch_lyrics.py
    python fetch_lyrics.py --limit 100   # process only first N songs
"""
import os
import re
import time
import argparse
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GENIUS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN")

if not GENIUS_TOKEN:
    print("ERROR: GENIUS_ACCESS_TOKEN not set in .env")
    print("Get a free token at https://genius.com/api-clients")
    raise SystemExit(1)

try:
    import lyricsgenius
except ImportError:
    print("ERROR: lyricsgenius not installed. Run: pip install lyricsgenius")
    raise SystemExit(1)

genius = lyricsgenius.Genius(
    GENIUS_TOKEN,
    skip_non_songs=True,
    excluded_terms=["(Remix)", "(Live)", "(Cover)"],
    verbose=False,
    timeout=15,
    retries=2,
)
genius.remove_section_headers = False  # keep section headers — useful for display


def clean_lyrics(raw):
    """Remove Genius boilerplate and normalise whitespace."""
    if not raw:
        return None
    lines = raw.split("\n")
    # Genius prepends a "SongTitle Lyrics" line — drop it
    if lines and "Lyrics" in lines[0] and len(lines[0]) < 100:
        lines = lines[1:]
    text = "\n".join(lines).strip()
    # Remove trailing "Embed" / digit suffixes Genius appends
    text = re.sub(r'\d*Embed$', '', text).strip()
    return text if len(text) > 20 else None


parser = argparse.ArgumentParser()
parser.add_argument("--limit", type=int, default=0, help="Max songs to process (0 = all)")
args = parser.parse_args()

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

query = "SELECT id, name, artist FROM songs WHERE lyrics IS NULL ORDER BY artist, name"
if args.limit:
    query += f" LIMIT {args.limit}"

cur.execute(query)
rows = cur.fetchall()
print(f"Found {len(rows)} songs needing lyrics\n")

success = 0
no_match = 0
failed = 0

for i, (song_id, name, artist) in enumerate(rows):
    safe_name = name.encode("ascii", "replace").decode("ascii")
    safe_artist = artist.encode("ascii", "replace").decode("ascii")
    print(f"[{i+1}/{len(rows)}] {safe_artist} - {safe_name}")

    # Use only the first credited artist for better Genius match rate
    primary_artist = artist.split(",")[0].strip()
    # Strip version suffixes that confuse Genius
    search_name = re.sub(r'\s*[-–]\s*(Remaster(ed)?|Radio Edit|Deluxe).*', '', name, flags=re.IGNORECASE)
    search_name = re.sub(r'\s*\(feat\..*?\)', '', search_name, flags=re.IGNORECASE).strip()

    try:
        song = genius.search_song(search_name, primary_artist)
        if not song:
            print(f"    Not found on Genius")
            cur.execute("UPDATE songs SET lyrics_source = 'not_found' WHERE id = %s", (song_id,))
            conn.commit()
            no_match += 1
            continue

        lyrics = clean_lyrics(song.lyrics)
        if not lyrics:
            print(f"    Found but lyrics empty after cleaning")
            cur.execute("UPDATE songs SET lyrics_source = 'not_found' WHERE id = %s", (song_id,))
            conn.commit()
            no_match += 1
            continue

        cur.execute(
            "UPDATE songs SET lyrics = %s, lyrics_source = 'genius' WHERE id = %s",
            (lyrics, song_id),
        )
        conn.commit()
        word_count = len(lyrics.split())
        print(f"    OK  {word_count} words")
        success += 1

    except Exception as e:
        print(f"    ERROR: {e}")
        conn.rollback()
        failed += 1

    time.sleep(1.5)

print(f"\n{'='*50}")
print(f"Done: {success} saved, {no_match} not found, {failed} errors")

cur.execute("SELECT COUNT(*) FROM songs WHERE lyrics IS NOT NULL")
total = cur.fetchone()[0]
print(f"Songs with lyrics: {total}")

cur.close()
conn.close()
