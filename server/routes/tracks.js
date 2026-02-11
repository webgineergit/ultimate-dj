import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function tracksRouter(db) {
  const router = express.Router();

  // Get all tracks
  router.get('/', (req, res) => {
    try {
      const tracks = db.prepare('SELECT * FROM tracks ORDER BY created_at DESC').all();
      res.json(tracks);
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
      res.json(track);
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
      res.json(track);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete track
  router.delete('/:id', (req, res) => {
    try {
      const result = db.prepare('DELETE FROM tracks WHERE id = ?').run(req.params.id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Track not found' });
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
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
