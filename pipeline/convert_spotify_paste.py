"""
Convert Spotify Paste
─────────────────────
Converts various Spotify paste formats into a clean song list.
Handles:
  - Spotify track URLs (https://open.spotify.com/track/xxx)
  - Tab-separated paste (Song\tArtist\tAlbum)
  - Plain text (Artist - Song)

Usage:
    python convert_spotify_paste.py --input paste.txt --output songs.txt
"""
import argparse
import os
import re
import time

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv

load_dotenv()

sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
))


def extract_track_id(text):
    """Extract Spotify track ID from a URL or URI."""
    # Match URLs like https://open.spotify.com/track/43T7iuLZob3xMY9g0ayLXT
    url_match = re.search(r'open\.spotify\.com/track/([a-zA-Z0-9]+)', text)
    if url_match:
        return url_match.group(1)
    
    # Match URIs like spotify:track:43T7iuLZob3xMY9g0ayLXT
    uri_match = re.search(r'spotify:track:([a-zA-Z0-9]+)', text)
    if uri_match:
        return uri_match.group(1)
    
    return None


def lookup_track(track_id):
    """Look up a track by Spotify ID."""
    try:
        track = sp.track(track_id)
        artist = ", ".join([a["name"] for a in track["artists"]])
        return f"{artist} - {track['name']}"
    except Exception as e:
        print(f"  ✗ Could not look up track {track_id}: {e}")
        return None


def convert_paste(input_path, output_path=None):
    with open(input_path, 'r', encoding='utf-8') as f:
        raw = f.read()

    lines = raw.strip().split('\n')
    songs = []
    spotify_lookups = 0

    print(f"Processing {len(lines)} lines...\n")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check if it's a Spotify URL/URI
        track_id = extract_track_id(line)
        if track_id:
            result = lookup_track(track_id)
            if result:
                songs.append(result)
                print(f"  ✓ {result}")
            spotify_lookups += 1
            time.sleep(0.1)  # Rate limit
            continue

        # Try tab-separated (Spotify desktop paste)
        parts = line.split('\t')
        if len(parts) >= 2:
            song = parts[0].strip()
            artist = parts[1].strip()
            if song.lower() not in ['title', 'song', 'track', '#']:
                songs.append(f"{artist} - {song}")
                continue

        # Already in "Artist - Song" format
        if ' - ' in line:
            songs.append(line)
        elif ' – ' in line:
            songs.append(line.replace(' – ', ' - '))
        else:
            songs.append(line)

    # Deduplicate
    seen = set()
    unique = []
    for s in songs:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)

    output_text = '\n'.join(unique)

    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(output_text)
        print(f"\n✓ Converted {len(unique)} songs → {output_path}")
        if spotify_lookups > 0:
            print(f"  ({spotify_lookups} Spotify lookups)")
    else:
        print(output_text)

    return unique


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert Spotify paste to song list")
    parser.add_argument("--input", required=True, help="Path to pasted text file")
    parser.add_argument("--output", help="Output file path")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"✗ File not found: {args.input}")
        exit(1)

    convert_paste(args.input, args.output)