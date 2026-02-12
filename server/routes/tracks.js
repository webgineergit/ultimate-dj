import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fetchLyrics, saveLyrics } from '../services/lyrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function tracksRouter(db) {
  const router = express.Router();

  // Helper to parse waveform JSON
  const parseTrack = (track) => {
    if (track && track.waveform) {
      try {
        track.waveform = JSON.parse(track.waveform);
      } catch (e) {
        track.waveform = null;
      }
    }
    return track;
  };

  // Get all tracks
  router.get('/', (req, res) => {
    try {
      const tracks = db.prepare('SELECT * FROM tracks ORDER BY created_at DESC').all();
      res.json(tracks.map(parseTrack));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single track
  router.get('/:id', (req, res) => {
    try {
      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }
      res.json(parseTrack(track));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update track (for BPM, lyrics offset, etc.)
  router.patch('/:id', (req, res) => {
    try {
      const { bpm, lyrics_offset, artist, title } = req.body;
      const updates = [];
      const values = [];

      if (bpm !== undefined) {
        updates.push('bpm = ?');
        values.push(bpm);
      }
      if (lyrics_offset !== undefined) {
        updates.push('lyrics_offset = ?');
        values.push(lyrics_offset);
      }
      if (artist !== undefined) {
        updates.push('artist = ?');
        values.push(artist);
      }
      if (title !== undefined) {
        updates.push('title = ?');
        values.push(title);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id);

      const stmt = db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
      res.json(parseTrack(track));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete track
  router.delete('/:id', (req, res) => {
    try {
      // Get track info first to delete files
      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      // Delete from database
      db.prepare('DELETE FROM tracks WHERE id = ?').run(req.params.id);

      // Delete physical files
      const videosDir = path.join(__dirname, '../../data/videos');
      const lyricsDir = path.join(__dirname, '../../data/lyrics');

      // Delete video file
      if (track.video_path) {
        const videoPath = path.join(videosDir, track.video_path);
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
      }

      // Delete thumbnail
      if (track.thumbnail_path) {
        const thumbPath = path.join(videosDir, track.thumbnail_path);
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      }

      // Delete lyrics file
      if (track.lyrics_path) {
        const lyricsPath = path.join(lyricsDir, track.lyrics_path);
        if (fs.existsSync(lyricsPath)) {
          fs.unlinkSync(lyricsPath);
        }
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Search tracks
  router.get('/search/:query', (req, res) => {
    try {
      const query = `%${req.params.query}%`;
      const tracks = db.prepare(`
        SELECT * FROM tracks
        WHERE title LIKE ? OR artist LIKE ?
        ORDER BY created_at DESC
      `).all(query, query);
      res.json(tracks.map(parseTrack));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Regenerate waveform for a track
  router.post('/:id/waveform', async (req, res) => {
    try {
      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const videosDir = path.join(__dirname, '../../data/videos');
      const videoPath = path.join(videosDir, track.video_path);

      const waveform = await generateWaveform(videoPath);
      if (waveform) {
        db.prepare('UPDATE tracks SET waveform = ? WHERE id = ?')
          .run(JSON.stringify(waveform), req.params.id);
        res.json({ success: true, waveform });
      } else {
        res.status(500).json({ error: 'Failed to generate waveform' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Regenerate waveforms for all tracks missing them
  router.post('/regenerate-waveforms', async (req, res) => {
    try {
      const tracks = db.prepare('SELECT * FROM tracks WHERE waveform IS NULL').all();
      const videosDir = path.join(__dirname, '../../data/videos');

      res.json({ message: `Regenerating waveforms for ${tracks.length} tracks`, count: tracks.length });

      // Process in background
      for (const track of tracks) {
        try {
          const videoPath = path.join(videosDir, track.video_path);
          const waveform = await generateWaveform(videoPath);
          if (waveform) {
            db.prepare('UPDATE tracks SET waveform = ? WHERE id = ?')
              .run(JSON.stringify(waveform), track.id);
            console.log(`Waveform generated for: ${track.title}`);
          }
        } catch (err) {
          console.log(`Failed to generate waveform for ${track.title}: ${err.message}`);
        }
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh lyrics for a track (re-fetch from sources)
  router.post('/:id/lyrics', async (req, res) => {
    try {
      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      console.log(`Refreshing lyrics for: ${track.title} by ${track.artist} (YT: ${track.youtube_id})`);

      const lyrics = await fetchLyrics(track.title, track.artist, track.youtube_id);

      if (lyrics) {
        saveLyrics(track.id, lyrics.raw);
        db.prepare('UPDATE tracks SET lyrics_path = ? WHERE id = ?')
          .run(`${track.id}.lrc`, track.id);

        res.json({
          success: true,
          source: lyrics.source,
          message: `Lyrics refreshed from ${lyrics.source}`
        });
      } else {
        res.json({
          success: false,
          message: 'No lyrics found from any source'
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh lyrics for all tracks
  router.post('/refresh-all-lyrics', async (req, res) => {
    try {
      const tracks = db.prepare('SELECT * FROM tracks').all();

      res.json({ message: `Refreshing lyrics for ${tracks.length} tracks`, count: tracks.length });

      // Process in background
      for (const track of tracks) {
        try {
          console.log(`Refreshing lyrics for: ${track.title}`);
          const lyrics = await fetchLyrics(track.title, track.artist, track.youtube_id);

          if (lyrics) {
            saveLyrics(track.id, lyrics.raw);
            db.prepare('UPDATE tracks SET lyrics_path = ? WHERE id = ?')
              .run(`${track.id}.lrc`, track.id);
            console.log(`Lyrics refreshed for ${track.title} (source: ${lyrics.source})`);
          } else {
            console.log(`No lyrics found for ${track.title}`);
          }
        } catch (err) {
          console.log(`Failed to refresh lyrics for ${track.title}: ${err.message}`);
        }
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// Helper function to generate waveform from video/audio file
function generateWaveform(filePath, numSamples = 800) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', filePath,
      '-ac', '1',
      '-ar', '8000',
      '-f', 's16le',
      '-'
    ];

    const ffmpeg = spawn('ffmpeg', args);
    const chunks = [];
    let stderr = '';

    ffmpeg.stdout.on('data', (data) => {
      chunks.push(data);
    });

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed`));
        return;
      }

      try {
        const buffer = Buffer.concat(chunks);
        const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
        const samplesPerBar = Math.floor(samples.length / numSamples);

        if (samplesPerBar < 1) {
          resolve(null);
          return;
        }

        const waveform = [];
        for (let i = 0; i < numSamples; i++) {
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, samples.length);
          let sum = 0, peak = 0;

          for (let j = start; j < end; j++) {
            const value = Math.abs(samples[j]) / 32768;
            sum += value;
            if (value > peak) peak = value;
          }

          waveform.push({
            avg: Math.round((sum / (end - start)) * 1000) / 1000,
            peak: Math.round(peak * 1000) / 1000
          });
        }

        const maxPeak = Math.max(...waveform.map(w => w.peak));
        if (maxPeak > 0) {
          for (const w of waveform) {
            w.avg = Math.round((w.avg / maxPeak) * 1000) / 1000;
            w.peak = Math.round((w.peak / maxPeak) * 1000) / 1000;
          }
        }

        resolve(waveform);
      } catch (err) {
        reject(new Error(`Failed to process audio: ${err.message}`));
      }
    });
  });
}
