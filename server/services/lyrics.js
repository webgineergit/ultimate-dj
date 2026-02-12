import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const lyricsDir = path.join(__dirname, '../../data/lyrics');
const projectRoot = path.join(__dirname, '../..');
const venvPython = path.join(projectRoot, '.venv/bin/python');
const lyricsScript = path.join(__dirname, '../scripts/fetch_ytmusic_lyrics.py');

// Ensure lyrics directory exists
if (!fs.existsSync(lyricsDir)) {
  fs.mkdirSync(lyricsDir, { recursive: true });
}

/**
 * Fetch lyrics from multiple sources
 * Priority: Synced lyrics (any source) > Plain lyrics
 * Within synced: LRCLIB > YouTube Music (LRCLIB has better timing accuracy)
 */
export async function fetchLyrics(title, artist, youtubeId = null) {
  console.log(`Fetching lyrics for: "${title}" by "${artist}"${youtubeId ? ` (YT: ${youtubeId})` : ''}`);

  // Clean up title - remove common suffixes
  const cleanTitle = title
    .replace(/\s*\|.*$/, '') // Remove everything after |
    .replace(/\s*\(Official.*\)/i, '')
    .replace(/\s*\[Official.*\]/i, '')
    .replace(/\s*-\s*Official.*$/i, '')
    .replace(/\s*\(Lyric.*\)/i, '')
    .replace(/\s*\(Audio.*\)/i, '')
    .replace(/\s*\(Music Video\)/i, '')
    .replace(/\s*HD$/i, '')
    .replace(/\s*HQ$/i, '')
    .trim();

  // Also extract song name if title is in "Artist - Song" format
  let songName = cleanTitle;
  if (cleanTitle.includes(' - ')) {
    const parts = cleanTitle.split(' - ');
    if (parts.length >= 2) {
      songName = parts.slice(1).join(' - ').trim();
    }
  }

  const cleanArtist = artist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();

  // Try LRCLIB first - it has synced lyrics timed to original audio tracks
  // which better matches YouTube official music videos
  const lrclibResult = await tryLrclib(songName, cleanArtist);
  if (lrclibResult && lrclibResult.source === 'lrclib') {
    console.log('Using LRCLIB synced lyrics (best match for official videos)');
    return lrclibResult;
  }

  // Try YouTube Music - but note it may match remix versions with different timing
  const ytMusicResult = await tryYouTubeMusic(youtubeId, cleanTitle, cleanArtist);

  // Only use YouTube Music synced lyrics (not plain)
  if (ytMusicResult && ytMusicResult.source === 'youtube_music_synced') {
    console.log('Using YouTube Music synced lyrics');
    return ytMusicResult;
  }

  // Fall back to plain lyrics from YouTube Music (correct text, estimated timing)
  if (ytMusicResult) {
    console.log('Using YouTube Music plain lyrics');
    return ytMusicResult;
  }

  // Try lyrics.ovh as last resort (plain lyrics only)
  const lyricsOvhResult = await tryLyricsOvh(songName, cleanArtist);
  if (lyricsOvhResult) {
    console.log('Using lyrics.ovh plain lyrics');
    return lyricsOvhResult;
  }

  return null;
}

/**
 * Try YouTube Music for synced lyrics via Python script
 */
async function tryYouTubeMusic(videoId, title, artist) {
  // Check if Python venv exists
  if (!fs.existsSync(venvPython)) {
    console.log('YouTube Music: Python venv not found, skipping');
    return null;
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const args = [lyricsScript, videoId || '', title || '', artist || ''];
      const proc = spawn(venvPython, args, {
        cwd: projectRoot,
        timeout: 30000
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Timeout'));
      }, 30000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0 && stdout) {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(stderr || 'Process failed'));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    if (result.success && result.lyrics) {
      console.log(`YouTube Music: Found ${result.synced ? 'synced' : 'plain'} lyrics`);

      if (result.synced) {
        // Already in LRC format
        return {
          raw: result.lyrics,
          parsed: parseLRC(result.lyrics),
          source: 'youtube_music_synced'
        };
      } else {
        // Plain lyrics - convert to LRC with estimated timing
        return {
          raw: convertToLRC(result.lyrics),
          parsed: parseSimpleLyrics(result.lyrics),
          source: 'youtube_music'
        };
      }
    }
  } catch (err) {
    console.log('YouTube Music failed:', err.message);
  }

  return null;
}

/**
 * Try lyrics.ovh API (free, no key required)
 */
async function tryLyricsOvh(title, artist) {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'UltimateDJ/1.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.lyrics) {
      // Convert plain lyrics to simple timed format (estimate timing)
      return {
        raw: convertToLRC(data.lyrics),
        parsed: parseSimpleLyrics(data.lyrics),
        source: 'lyrics.ovh'
      };
    }
  } catch (err) {
    console.log('lyrics.ovh failed:', err.message);
  }
  return null;
}

/**
 * Try LRCLIB API (free, provides synced lyrics)
 */
async function tryLrclib(title, artist) {
  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'UltimateDJ/1.0' },
      signal: AbortSignal.timeout(20000)  // 20 second timeout
    });

    if (!response.ok) return null;

    const results = await response.json();
    if (results && results.length > 0) {
      // Prefer synced lyrics
      const withSync = results.find(r => r.syncedLyrics);
      const result = withSync || results[0];

      if (result.syncedLyrics) {
        return {
          raw: result.syncedLyrics,
          parsed: parseLRC(result.syncedLyrics),
          source: 'lrclib'
        };
      } else if (result.plainLyrics) {
        return {
          raw: convertToLRC(result.plainLyrics),
          parsed: parseSimpleLyrics(result.plainLyrics),
          source: 'lrclib'
        };
      }
    }
  } catch (err) {
    console.log('lrclib failed:', err.message);
  }
  return null;
}

/**
 * Parse LRC format lyrics
 */
export function parseLRC(lrcContent) {
  const lines = lrcContent.split('\n');
  const lyrics = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  for (const line of lines) {
    const matches = [...line.matchAll(timeRegex)];
    if (matches.length === 0) continue;

    const text = line.replace(timeRegex, '').trim();
    if (!text) continue;

    for (const match of matches) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, '0'));
      const time = minutes * 60000 + seconds * 1000 + ms;

      lyrics.push({ time, text });
    }
  }

  return lyrics.sort((a, b) => a.time - b.time);
}

/**
 * Parse simple lyrics (no timing) - estimate 4 seconds per line
 */
function parseSimpleLyrics(text) {
  const lines = text.split('\n').filter(line => line.trim());
  return lines.map((line, index) => ({
    time: index * 4000, // 4 seconds per line estimate
    text: line.trim()
  }));
}

/**
 * Convert plain lyrics to LRC format with estimated timing
 */
function convertToLRC(text) {
  const lines = text.split('\n').filter(line => line.trim());
  return lines.map((line, index) => {
    const totalSeconds = index * 4;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.00]${line.trim()}`;
  }).join('\n');
}

/**
 * Save lyrics to file
 */
export function saveLyrics(trackId, lrcContent) {
  const filePath = path.join(lyricsDir, `${trackId}.lrc`);
  fs.writeFileSync(filePath, lrcContent);
  return filePath;
}

/**
 * Load lyrics from file
 */
export function loadLyrics(trackId) {
  const filePath = path.join(lyricsDir, `${trackId}.lrc`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return null;
}
