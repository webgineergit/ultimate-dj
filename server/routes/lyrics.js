import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function lyricsRouter(db) {
  const router = express.Router();
  const lyricsDir = path.join(__dirname, '../../data/lyrics');

  // Ensure lyrics directory exists
  if (!fs.existsSync(lyricsDir)) {
    fs.mkdirSync(lyricsDir, { recursive: true });
  }

  // Get lyrics for a track
  router.get('/:trackId', async (req, res) => {
    try {
      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.trackId);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      // Check if we have cached lyrics
      const lyricsPath = path.join(lyricsDir, `${track.id}.lrc`);
      if (fs.existsSync(lyricsPath)) {
        const lyrics = fs.readFileSync(lyricsPath, 'utf-8');
        return res.json({
          trackId: track.id,
          lyrics: parseLRC(lyrics),
          offset: track.lyrics_offset || 0,
          source: 'cache'
        });
      }

      // Try to fetch from external API
      const lyrics = await fetchLyrics(track.title, track.artist);
      if (lyrics) {
        // Cache the lyrics
        fs.writeFileSync(lyricsPath, lyrics.raw);

        // Update database
        db.prepare('UPDATE tracks SET lyrics_path = ? WHERE id = ?')
          .run(`${track.id}.lrc`, track.id);

        return res.json({
          trackId: track.id,
          lyrics: lyrics.parsed,
          offset: track.lyrics_offset || 0,
          source: 'api'
        });
      }

      res.status(404).json({ error: 'Lyrics not found' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Save/update lyrics for a track
  router.post('/:trackId', (req, res) => {
    try {
      const { lyrics } = req.body;
      if (!lyrics) {
        return res.status(400).json({ error: 'Lyrics content is required' });
      }

      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.trackId);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const lyricsPath = path.join(lyricsDir, `${track.id}.lrc`);
      fs.writeFileSync(lyricsPath, lyrics);

      db.prepare('UPDATE tracks SET lyrics_path = ? WHERE id = ?')
        .run(`${track.id}.lrc`, track.id);

      res.json({
        trackId: track.id,
        lyrics: parseLRC(lyrics),
        source: 'manual'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update lyrics offset
  router.patch('/:trackId/offset', (req, res) => {
    try {
      const { offset } = req.body;
      if (offset === undefined) {
        return res.status(400).json({ error: 'Offset is required' });
      }

      const result = db.prepare('UPDATE tracks SET lyrics_offset = ? WHERE id = ?')
        .run(offset, req.params.trackId);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Track not found' });
      }

      res.json({ trackId: req.params.trackId, offset });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// Parse LRC format lyrics
function parseLRC(lrcContent) {
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

// Fetch lyrics from external API (placeholder - implement with actual API)
async function fetchLyrics(title, artist) {
  // TODO: Implement actual lyrics fetching from Genius or Musixmatch
  // This requires API keys to be configured
  // For now, return null to indicate no lyrics found

  // Example implementation would look like:
  // const response = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(title + ' ' + artist)}`, {
  //   headers: { 'Authorization': `Bearer ${process.env.GENIUS_API_KEY}` }
  // });

  return null;
}
