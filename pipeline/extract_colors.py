"""
Extract Colors from Album Art
─────────────────────────────
Downloads album art from Spotify URLs and extracts
primary color + 5-color palette using ColorThief.

Usage:
    python extract_colors.py
"""
import io
import requests
import psycopg
from colorthief import ColorThief
from dotenv import load_dotenv
import os
import time

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

# Get songs with album art but no colors extracted yet
cur.execute("""
    SELECT id, name, artist, img 
    FROM songs 
    WHERE img IS NOT NULL 
    AND primary_color IS NULL
""")
rows = cur.fetchall()
print(f"Found {len(rows)} songs needing color extraction\n")


def rgb_to_hex(rgb):
    """Convert (r, g, b) tuple to hex string."""
    return '#{:02x}{:02x}{:02x}'.format(rgb[0], rgb[1], rgb[2])


def extract_colors(image_url):
    """Download image and extract primary color + palette."""
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        
        img_bytes = io.BytesIO(response.content)
        ct = ColorThief(img_bytes)
        
        primary = ct.get_color(quality=1)
        palette = ct.get_palette(color_count=5, quality=1)
        
        return {
            'primary_color': rgb_to_hex(primary),
            'palette': [rgb_to_hex(c) for c in palette],
        }
    except Exception as e:
        print(f"    ✗ Error: {e}")
        return None


success = 0
failed = 0

for i, (song_id, name, artist, img_url) in enumerate(rows):
    print(f"[{i+1}/{len(rows)}] {artist} — {name}")
    
    colors = extract_colors(img_url)
    
    if colors:
        cur.execute("""
            UPDATE songs 
            SET primary_color = %s, palette = %s 
            WHERE id = %s
        """, (
            colors['primary_color'],
            colors['palette'],
            song_id,
        ))
        conn.commit()
        print(f"    ✓ Primary: {colors['primary_color']} | Palette: {colors['palette']}")
        success += 1
    else:
        failed += 1
    
    # Small delay to be polite to Spotify's CDN
    time.sleep(0.3)

print(f"\n{'='*50}")
print(f"✓ Extracted colors: {success} succeeded, {failed} failed")

# Verify
cur.execute("SELECT COUNT(*) FROM songs WHERE primary_color IS NOT NULL")
total = cur.fetchone()[0]
print(f"  Songs with colors: {total}")

# Show a few samples
cur.execute("""
    SELECT name, artist, primary_color, palette 
    FROM songs 
    WHERE primary_color IS NOT NULL 
    LIMIT 5
""")
print(f"\nSamples:")
for row in cur.fetchall():
    print(f"  {row[1]} — {row[0]}")
    print(f"    Primary: {row[2]} | Palette: {row[3]}")

cur.close()
conn.close()