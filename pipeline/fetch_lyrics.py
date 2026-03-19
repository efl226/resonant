"""
Genius Lyrics Enrichment
────────────────────────
Fetches full lyrics for all songs from Genius API.

Usage:
    python fetch_lyrics.py
"""
import lyricsgenius
import psycopg
import time
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GENIUS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN")

genius = lyricsgenius.Genius(GENIUS_TOKEN, verbose=False, timeout=15)
genius.remove_section_headers = True  # Clean up [Verse 1] etc.

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Get songs without lyrics
cur.execute("""
    SELECT id, name, artist 
    FROM songs 
    WHERE lyrics IS NULL
    ORDER BY artist, name
""")
rows = cur.fetchall()
print(f"Fetching lyrics for {len(rows)} songs...\n")

success = 0
failed = 0
instrumental = 0

for i, (song_id, name, artist) in enumerate(rows):
    # Clean up artist name — take first artist if multiple
    clean_artist = artist.split(",")[0].strip()
    # Remove common suffixes that confuse Genius
    clean_name = name.replace(" - Remastered", "").replace(" - Remaster", "")
    clean_name = clean_name.split(" - ")[0].strip()
    clean_name = clean_name.split(" (feat.")[0].strip()

    print(f"[{i+1}/{len(rows)}] {clean_artist} — {clean_name}")

    try:
        song = genius.search_song(clean_name, clean_artist)

        if song and song.lyrics:
            lyrics = song.lyrics

            # Clean up common Genius artifacts
            # Remove the song title header that Genius prepends
            lines = lyrics.split("\n")
            if lines and "Lyrics" in lines[0]:
                lines = lines[1:]
            lyrics = "\n".join(lines).strip()

            # Remove trailing "Embed" text
            if lyrics.endswith("Embed"):
                lyrics = lyrics[:-5].strip()
            # Remove trailing numbers (like "123Embed" or "45")
            while lyrics and lyrics[-1].isdigit():
                lyrics = lyrics[:-1].strip()

            cur.execute(
                "UPDATE songs SET lyrics = %s, lyrics_source = %s WHERE id = %s",
                (lyrics, "genius", song_id)
            )
            conn.commit()

            word_count = len(lyrics.split())
            print(f"    ✓ {word_count} words")
            success += 1
        else:
            # Might be instrumental
            print(f"    ✗ Not found (may be instrumental)")
            cur.execute(
                "UPDATE songs SET lyrics_source = %s WHERE id = %s",
                ("not_found", song_id)
            )
            conn.commit()
            failed += 1

    except Exception as e:
        print(f"    ✗ Error: {e}")
        failed += 1

    time.sleep(1.5)  # Rate limiting

print(f"\n{'='*50}")
print(f"✓ Complete: {success} found, {failed} not found")

# Summary
cur.execute("SELECT COUNT(*) FROM songs WHERE lyrics IS NOT NULL")
with_lyrics = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM songs")
total = cur.fetchone()[0]
print(f"  Songs with lyrics: {with_lyrics}/{total}")

# Show word count stats
cur.execute("""
    SELECT name, artist, LENGTH(lyrics) as chars, 
           array_length(string_to_array(lyrics, ' '), 1) as words
    FROM songs 
    WHERE lyrics IS NOT NULL 
    ORDER BY words DESC 
    LIMIT 5
""")
print(f"\nLongest lyrics:")
for row in cur.fetchall():
    print(f"  {row[1]} — {row[0]}: {row[3]} words")

cur.close()
conn.close()