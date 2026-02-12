#!/usr/bin/env python3
"""
Search YouTube and check lyrics availability on YouTube Music.
Usage: python search_youtube.py <query>
Output: JSON array of search results with lyrics availability
"""

import sys
import json
from ytmusicapi import YTMusic
from yt_dlp import YoutubeDL

def check_lyrics_available(yt, video_id):
    """Check if synced lyrics are available for a video ID on YouTube Music"""
    try:
        watch_playlist = yt.get_watch_playlist(video_id)
        lyrics_browse_id = watch_playlist.get('lyrics')

        if not lyrics_browse_id:
            return False, None

        # Try to get timestamped lyrics
        try:
            lyrics_data = yt.get_lyrics(lyrics_browse_id, timestamps=True)
            if lyrics_data and 'lyrics' in lyrics_data:
                timed_lyrics = lyrics_data['lyrics']
                if isinstance(timed_lyrics, list) and len(timed_lyrics) > 0:
                    # Check if it has actual timestamps (not just plain text)
                    first_item = timed_lyrics[0]
                    if hasattr(first_item, 'start_time') or (isinstance(first_item, dict) and 'cueRange' in first_item):
                        return True, 'synced'
        except Exception:
            pass

        return False, None
    except Exception:
        return False, None

def search_youtube(query, limit=10):
    """Search YouTube and check lyrics availability for each result"""
    results = []

    # Initialize YouTube Music API for lyrics checking
    yt = YTMusic()

    # Use yt-dlp to search YouTube
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'default_search': 'ytsearch' + str(limit),
    }

    with YoutubeDL(ydl_opts) as ydl:
        try:
            search_results = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

            if not search_results or 'entries' not in search_results:
                return []

            for entry in search_results['entries']:
                if not entry:
                    continue

                video_id = entry.get('id')
                if not video_id:
                    continue

                # Check if synced lyrics are available
                has_lyrics, lyrics_type = check_lyrics_available(yt, video_id)

                results.append({
                    'id': video_id,
                    'title': entry.get('title', ''),
                    'channel': entry.get('channel', entry.get('uploader', '')),
                    'duration': entry.get('duration'),
                    'thumbnail': f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg",
                    'url': f"https://www.youtube.com/watch?v={video_id}",
                    'hasSyncedLyrics': has_lyrics
                })
        except Exception as e:
            print(json.dumps({'error': str(e)}), file=sys.stderr)
            return []

    return results

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: search_youtube.py <query>'}))
        sys.exit(1)

    query = ' '.join(sys.argv[1:])
    results = search_youtube(query)

    # Sort results: videos with synced lyrics first
    results.sort(key=lambda x: (not x.get('hasSyncedLyrics', False), x.get('title', '')))

    print(json.dumps(results))

if __name__ == '__main__':
    main()
