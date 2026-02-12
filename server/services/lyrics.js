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
 * Fetch synced lyrics from YouTube Music only.
 * Returns null if synced lyrics are not available - no fallbacks.
 */
export async function fetchLyrics(title, artist, youtubeId = null) {
  console.log(`Fetching lyrics for: "${title}" by "${artist}"${youtubeId ? ` (YT: ${youtubeId})` : ''}`);

  // Only try YouTube Music synced lyrics
  const result = await tryYouTubeMusic(youtubeId, title, artist);

  if (result && result.synced) {
    console.log('YouTube Music: Found synced lyrics');
    return result;
  }

  console.log('No synced lyrics available');
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

    if (result.success && result.lyrics && result.synced) {
      // Only return synced lyrics
      return {
        raw: result.lyrics,
        parsed: parseLRC(result.lyrics),
        source: 'youtube_music',
        synced: true
      };
    }
  } catch (err) {
    console.log('YouTube Music failed:', err.message);
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

/**
 * Delete lyrics file
 */
export function deleteLyrics(trackId) {
  const filePath = path.join(lyricsDir, `${trackId}.lrc`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
