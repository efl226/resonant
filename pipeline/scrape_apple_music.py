"""
Apple Music Playlist Scraper
─────────────────────────────
Extracts song names and artists from Apple Music playlist URLs.
Apple Music embeds track data in the page source as JSON.

Usage:
    python scrape_apple_music.py --url "https://music.apple.com/us/playlist/name/pl.u-xxx" --output songs.txt
    python scrape_apple_music.py --urls urls.txt --output songs.txt
"""
import argparse
import json
import re
import os
import time

import httpx


HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}


def scrape_playlist(url):
    """Fetch an Apple Music playlist page and extract songs."""
    print(f"\nFetching: {url}")
    
    try:
        response = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=30)
        response.raise_for_status()
        html = response.text
    except Exception as e:
        print(f"  ✗ Failed to fetch: {e}")
        return []

    songs = []

    # Method 1: Look for JSON-LD structured data
    json_ld_match = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
    for blob in json_ld_match:
        try:
            data = json.loads(blob)
            if isinstance(data, dict) and data.get('@type') == 'MusicPlaylist':
                tracks = data.get('track', [])
                for track in tracks:
                    name = track.get('name', '')
                    artist = track.get('byArtist', {}).get('name', '')
                    if name and artist:
                        songs.append(f"{artist} - {name}")
        except:
            pass

    if songs:
        print(f"  ✓ Found {len(songs)} songs via JSON-LD")
        return songs

    # Method 2: Look for serialized server data (Apple embeds this in script tags)
    # Pattern: "name":"Song Name"..."artistName":"Artist Name"
    track_pattern = re.findall(
        r'"name"\s*:\s*"([^"]+)"[^}]*?"artistName"\s*:\s*"([^"]+)"',
        html
    )
    if track_pattern:
        seen = set()
        for name, artist in track_pattern:
            # Decode unicode escapes
            name = name.encode().decode('unicode_escape', errors='replace')
            artist = artist.encode().decode('unicode_escape', errors='replace')
            key = f"{artist} - {name}".lower()
            if key not in seen and len(name) > 1:
                seen.add(key)
                songs.append(f"{artist} - {name}")
        if songs:
            print(f"  ✓ Found {len(songs)} songs via embedded data")
            return songs

    # Method 3: Look for meta tags with song info
    meta_songs = re.findall(
        r'<meta\s+name="apple:content_id"[^>]*>.*?<meta\s+name="apple:title"\s+content="([^"]+)"',
        html, re.DOTALL
    )

    # Method 4: Parse the serialized Redux/Next.js state
    state_match = re.search(r'<script id="serialized-server-data" type="application/json">(.*?)</script>', html, re.DOTALL)
    if state_match:
        try:
            state_data = json.loads(state_match.group(1))
            # Walk the data structure looking for track objects
            songs = extract_tracks_from_state(state_data)
            if songs:
                print(f"  ✓ Found {len(songs)} songs via server state")
                return songs
        except Exception as e:
            print(f"  ⚠ Failed to parse server state: {e}")

    # Method 5: Simple regex for song links
    song_links = re.findall(
        r'href="/us/album/[^"]*?\?i=\d+"[^>]*>([^<]+)</a>',
        html
    )
    if song_links:
        print(f"  ⚠ Found {len(song_links)} song names but no artists")
        for name in song_links:
            songs.append(name.strip())
        return songs

    print(f"  ✗ Could not extract songs — page may require JavaScript")
    print(f"    Try opening the URL in a browser, selecting all songs, and copy-pasting")
    return songs


def extract_tracks_from_state(data, songs=None):
    """Recursively walk a data structure looking for track objects."""
    if songs is None:
        songs = []

    if isinstance(data, dict):
        # Check if this looks like a track
        if 'name' in data and 'artistName' in data and data.get('kind') == 'song':
            songs.append(f"{data['artistName']} - {data['name']}")
        elif 'name' in data and 'artistName' in data and 'durationInMillis' in data:
            songs.append(f"{data['artistName']} - {data['name']}")
        else:
            for value in data.values():
                extract_tracks_from_state(value, songs)
    elif isinstance(data, list):
        for item in data:
            extract_tracks_from_state(item, songs)

    return songs


def main():
    parser = argparse.ArgumentParser(description="Scrape Apple Music playlists")
    parser.add_argument("--url", help="Single Apple Music playlist URL")
    parser.add_argument("--urls", help="Text file with one URL per line")
    parser.add_argument("--output", help="Output file path")
    args = parser.parse_args()

    all_songs = []

    if args.url:
        all_songs.extend(scrape_playlist(args.url))

    if args.urls:
        with open(args.urls) as f:
            urls = [line.strip() for line in f if line.strip() and line.startswith('http')]
        for url in urls:
            songs = scrape_playlist(url)
            all_songs.extend(songs)
            time.sleep(1)  # Be polite

    # Deduplicate
    seen = set()
    unique = []
    for s in all_songs:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)

    if not unique:
        print("\n✗ No songs found. The playlist might be private or require JavaScript.")
        print("  Alternative: Open the playlist in a browser, manually copy the songs.")
        return

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write('\n'.join(unique))
        print(f"\n✓ Saved {len(unique)} songs to {args.output}")
    else:
        print(f"\n{'='*50}")
        for s in unique:
            print(s)
        print(f"{'='*50}")
        print(f"\n{len(unique)} songs total")


if __name__ == "__main__":
    main()