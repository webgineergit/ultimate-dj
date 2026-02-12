#!/usr/bin/env python3
"""
Fetch synced lyrics from YouTube Music.
Usage: python fetch_ytmusic_lyrics.py <video_id> [title] [artist]
Output: JSON with lyrics data or error
"""

import sys
import json
import re
from ytmusicapi import YTMusic

def format_time_to_lrc(time_ms):
    """Convert milliseconds to LRC timestamp format [mm:ss.xx]"""
    total_seconds = time_ms / 1000
    minutes = int(total_seconds // 60)
    seconds = total_seconds % 60
    return f"[{minutes:02d}:{seconds:05.2f}]"

def convert_to_lrc(timed_lyrics):
    """Convert YouTube Music timed lyrics to LRC format"""
    lines = []
    for item in timed_lyrics:
        # Handle both old dict format and new LyricLine object format
        if hasattr(item, 'text'):
            # New LyricLine object format
            text = item.text
            start_time = getattr(item, 'start_time', 0)
            timestamp = format_time_to_lrc(start_time)
        elif isinstance(item, dict):
            # Old dict format
            timestamp = format_time_to_lrc(item.get('cueRange', {}).get('startTimeMilliseconds', 0))
            text = item.get('lyricLine', '')
        else:
            continue

        # Skip instrumental markers
        if text.strip() and text.strip() != '♪':
            lines.append(f"{timestamp}{text}")
    return '\n'.join(lines)

def clean_title(title, artist=None):
    """Clean up YouTube video title to extract just the song name"""
    if not title:
        return title

    clean = title

    # Remove artist prefix if present (e.g., "Artist - Song Title")
    if artist and clean.lower().startswith(artist.lower()):
        clean = clean[len(artist):].lstrip(' -–—:')

    # Also try pattern "Artist - Title"
    if ' - ' in clean:
        parts = clean.split(' - ', 1)
        # If the first part looks like an artist name, use the second part
        if len(parts) == 2 and len(parts[1]) > 3:
            clean = parts[1]

    # Remove common suffixes
    patterns = [
        r'\s*\(Official\s*(Music\s*)?Video\)',
        r'\s*\[Official\s*(Music\s*)?Video\]',
        r'\s*\(Official\s*Audio\)',
        r'\s*\[Official\s*Audio\]',
        r'\s*\(Lyric\s*Video\)',
        r'\s*\[Lyric\s*Video\]',
        r'\s*\(Lyrics\)',
        r'\s*\[Lyrics\]',
        r'\s*\(Audio\)',
        r'\s*\[Audio\]',
        r'\s*\(HD\)',
        r'\s*\[HD\]',
        r'\s*\(HQ\)',
        r'\s*\[HQ\]',
        r'\s*\|.*$',  # Everything after |
        r'\s*ft\.?\s+.*$',  # featuring artists at end
        r'\s*feat\.?\s+.*$',
        r'\s*\(ft\.?.*\)',
        r'\s*\(feat\.?.*\)',
        r'\s*\[ft\.?.*\]',
        r'\s*\[feat\.?.*\]',
        r'\s*-\s*Topic$',
        r'\s*VEVO$',
        r'\s*✨.*$',  # Emoji and everything after
        r'\s*\|\s*.*$',
    ]

    for pattern in patterns:
        clean = re.sub(pattern, '', clean, flags=re.IGNORECASE)

    return clean.strip()

def normalize_for_comparison(text):
    """Normalize text for fuzzy comparison"""
    if not text:
        return ''
    # Lowercase, remove punctuation, extra spaces
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def titles_match(title1, title2):
    """Check if two titles are similar enough to be the same song"""
    norm1 = normalize_for_comparison(title1)
    norm2 = normalize_for_comparison(title2)

    # Exact match
    if norm1 == norm2:
        return True

    # One contains the other
    if norm1 in norm2 or norm2 in norm1:
        return True

    # Check word overlap
    words1 = set(norm1.split())
    words2 = set(norm2.split())

    if not words1 or not words2:
        return False

    # Remove common filler words
    filler = {'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'it'}
    words1 = words1 - filler
    words2 = words2 - filler

    if not words1 or not words2:
        return True  # Only had filler words, consider it a match

    # Calculate overlap
    overlap = len(words1 & words2)
    min_len = min(len(words1), len(words2))

    # At least 50% word overlap
    return overlap >= min_len * 0.5

def get_lyrics_from_video(yt, video_id):
    """Try to get lyrics from a specific video ID"""
    try:
        watch_playlist = yt.get_watch_playlist(video_id)
        lyrics_browse_id = watch_playlist.get('lyrics')

        if not lyrics_browse_id:
            return None

        # Try to get timestamped lyrics
        try:
            lyrics_data = yt.get_lyrics(lyrics_browse_id, timestamps=True)
            if lyrics_data and 'lyrics' in lyrics_data:
                timed_lyrics = lyrics_data['lyrics']
                if isinstance(timed_lyrics, list) and len(timed_lyrics) > 0:
                    lrc_content = convert_to_lrc(timed_lyrics)
                    if lrc_content.strip():
                        return {
                            'success': True,
                            'lyrics': lrc_content,
                            'synced': True,
                            'source': 'youtube_music'
                        }
        except Exception:
            pass

        # Fall back to non-timestamped lyrics
        try:
            lyrics_data = yt.get_lyrics(lyrics_browse_id, timestamps=False)
            if lyrics_data and 'lyrics' in lyrics_data:
                plain_lyrics = lyrics_data['lyrics']
                if plain_lyrics:
                    return {
                        'success': True,
                        'lyrics': plain_lyrics,
                        'synced': False,
                        'source': 'youtube_music'
                    }
        except Exception:
            pass

    except Exception:
        pass

    return None

def search_and_get_lyrics(video_id, title=None, artist=None):
    """Search YouTube Music and get synced lyrics"""
    try:
        yt = YTMusic()

        # First try: use the video ID directly
        if video_id:
            result = get_lyrics_from_video(yt, video_id)
            if result and result.get('synced'):
                return result

        # Second try: search by title and artist
        # Clean up the title first
        cleaned_title = clean_title(title, artist) if title else None

        if cleaned_title:
            # Try with artist + cleaned title first, then just cleaned title
            search_queries = []
            if artist:
                search_queries.append(f"{artist} {cleaned_title}")
            search_queries.append(cleaned_title)

            # Collect all matching songs, prioritize ones with synced lyrics
            plain_lyrics_result = None

            for search_query in search_queries:
                try:
                    search_results = yt.search(search_query, filter='songs', limit=10)
                except Exception:
                    continue

                for result in search_results:
                    if result.get('resultType') != 'song':
                        continue

                    result_title = result.get('title', '')
                    result_artists = [a.get('name', '') for a in result.get('artists', [])]

                    # Verify this is actually the right song
                    if not titles_match(cleaned_title, result_title):
                        continue

                    # Check artist matches
                    if artist:
                        artist_match = any(
                            normalize_for_comparison(artist) in normalize_for_comparison(ra) or
                            normalize_for_comparison(ra) in normalize_for_comparison(artist)
                            for ra in result_artists
                        )
                        if not artist_match and result_artists:
                            continue

                    song_video_id = result.get('videoId')
                    if not song_video_id:
                        continue

                    lyrics_result = get_lyrics_from_video(yt, song_video_id)
                    if lyrics_result:
                        lyrics_result['matched_title'] = result_title

                        # If we found synced lyrics, return immediately
                        if lyrics_result.get('synced'):
                            return lyrics_result

                        # Save plain lyrics as fallback
                        if not plain_lyrics_result:
                            plain_lyrics_result = lyrics_result

            # Return plain lyrics if no synced found
            if plain_lyrics_result:
                return plain_lyrics_result

        return {
            'success': False,
            'error': 'No lyrics found'
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Usage: fetch_ytmusic_lyrics.py <video_id> [title] [artist]'}))
        sys.exit(1)

    video_id = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else None
    artist = sys.argv[3] if len(sys.argv) > 3 else None

    result = search_and_get_lyrics(video_id, title, artist)
    print(json.dumps(result))

if __name__ == '__main__':
    main()
