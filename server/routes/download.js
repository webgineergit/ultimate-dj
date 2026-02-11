import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { fetchLyrics, saveLyrics } from '../services/lyrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function downloadRouter(db) {
  const router = express.Router();
  const videosDir = path.join(__dirname, '../../data/videos');
  const thumbnailsDir = path.join(__dirname, '../../data/videos/thumbnails');

  // Ensure directories exist
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }

  // Download progress tracking
  const downloadProgress = new Map();

  // Get video info without downloading
  router.get('/info', async (req, res) => {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      const info = await getVideoInfo(url);
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Download video from YouTube
  router.post('/', async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const trackId = uuidv4();
    downloadProgress.set(trackId, { status: 'starting', progress: 0 });

    res.json({ trackId, message: 'Download started' });

    try {
      // Get video info first
      console.log(`[${trackId}] Fetching video info for: ${url}`);
      const info = await getVideoInfo(url);
      console.log(`[${trackId}] Got video info:`, info.title);
      downloadProgress.set(trackId, { status: 'downloading', progress: 0, info });

      // Download video
      const videoPath = path.join(videosDir, `${trackId}.mp4`);
      const thumbnailPath = path.join(thumbnailsDir, `${trackId}.jpg`);

      await downloadVideo(url, videoPath, thumbnailPath, (progress) => {
        downloadProgress.set(trackId, { status: 'downloading', progress, info });
      });

      // Insert into database
      const stmt = db.prepare(`
        INSERT INTO tracks (id, youtube_id, title, artist, duration, video_path, thumbnail_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        trackId,
        info.id,
        info.title,
        info.artist || info.uploader,
        info.duration,
        `${trackId}.mp4`,
        `thumbnails/${trackId}.jpg`
      );

      downloadProgress.set(trackId, { status: 'generating_waveform', progress: 100, info });

      // Generate waveform data
      try {
        const waveform = await generateWaveform(videoPath);
        if (waveform) {
          db.prepare('UPDATE tracks SET waveform = ? WHERE id = ?')
            .run(JSON.stringify(waveform), trackId);
          console.log(`Waveform generated for: ${info.title} (${waveform.length} samples)`);
        }
      } catch (waveformErr) {
        console.log('Waveform generation failed:', waveformErr.message);
      }

      downloadProgress.set(trackId, { status: 'fetching_lyrics', progress: 100, info });

      // Try to fetch lyrics in the background
      try {
        const lyrics = await fetchLyrics(info.title, info.artist || info.uploader);
        if (lyrics) {
          saveLyrics(trackId, lyrics.raw);
          db.prepare('UPDATE tracks SET lyrics_path = ? WHERE id = ?')
            .run(`${trackId}.lrc`, trackId);
          console.log(`Lyrics saved for: ${info.title} (source: ${lyrics.source})`);
        } else {
          console.log(`No lyrics found for: ${info.title}`);
        }
      } catch (lyricsErr) {
        console.log('Lyrics fetch failed:', lyricsErr.message);
      }

      downloadProgress.set(trackId, { status: 'complete', progress: 100, info });
    } catch (error) {
      console.error(`[${trackId}] Download error:`, error.message);
      downloadProgress.set(trackId, { status: 'error', error: error.message });
    }
  });

  // Get download progress
  router.get('/progress/:trackId', (req, res) => {
    const progress = downloadProgress.get(req.params.trackId);
    if (!progress) {
      return res.status(404).json({ error: 'Download not found' });
    }
    res.json(progress);
  });

  return router;
}

// Helper function to get video info using yt-dlp
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-download',
      '--no-playlist',
      url
    ];

    console.log('Starting yt-dlp with args:', args);
    const ytdlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    let settled = false;

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ytdlp.kill();
        reject(new Error('Timed out fetching video info'));
      }
    }, 30000);

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('yt-dlp stderr:', data.toString());
    });

    ytdlp.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        console.error('yt-dlp spawn error:', err);
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
      }
    });

    ytdlp.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        console.log('yt-dlp exited with code:', code);
        if (code !== 0) {
          reject(new Error(stderr || 'yt-dlp failed'));
          return;
        }

        try {
          const info = JSON.parse(stdout);
          resolve({
            id: info.id,
            title: info.title,
            artist: info.artist || info.uploader,
            uploader: info.uploader,
            duration: info.duration,
            thumbnail: info.thumbnail
          });
        } catch (e) {
          reject(new Error('Failed to parse video info'));
        }
      }
    });
  });
}

// Helper function to generate waveform from video/audio file
function generateWaveform(filePath, numSamples = 800) {
  return new Promise((resolve, reject) => {
    // Use ffmpeg to extract audio as raw PCM data
    const args = [
      '-i', filePath,
      '-ac', '1',           // Mono
      '-ar', '8000',        // 8kHz sample rate (good enough for waveform)
      '-f', 's16le',        // Raw 16-bit signed little-endian
      '-'                   // Output to stdout
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
        reject(new Error(`ffmpeg failed: ${stderr.slice(-200)}`));
        return;
      }

      try {
        // Combine all chunks into a single buffer
        const buffer = Buffer.concat(chunks);
        const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

        // Calculate samples per waveform bar
        const samplesPerBar = Math.floor(samples.length / numSamples);
        if (samplesPerBar < 1) {
          resolve(null);
          return;
        }

        const waveform = [];
        for (let i = 0; i < numSamples; i++) {
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, samples.length);

          let sum = 0;
          let peak = 0;

          for (let j = start; j < end; j++) {
            const value = Math.abs(samples[j]) / 32768; // Normalize to 0-1
            sum += value;
            if (value > peak) peak = value;
          }

          const avg = sum / (end - start);
          waveform.push({
            avg: Math.round(avg * 1000) / 1000,  // Round to 3 decimal places
            peak: Math.round(peak * 1000) / 1000
          });
        }

        // Normalize the waveform so the max peak is 1.0
        const maxPeak = Math.max(...waveform.map(w => w.peak));
        if (maxPeak > 0) {
          for (const w of waveform) {
            w.avg = Math.round((w.avg / maxPeak) * 1000) / 1000;
            w.peak = Math.round((w.peak / maxPeak) * 1000) / 1000;
          }
        }

        resolve(waveform);
      } catch (err) {
        reject(new Error(`Failed to process audio data: ${err.message}`));
      }
    });
  });
}

// Helper function to download video
function downloadVideo(url, videoPath, thumbnailPath, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bv*[ext=mp4][vcodec^=avc]+ba[ext=m4a]/b[ext=mp4]/b',
      '--merge-output-format', 'mp4',
      '--postprocessor-args', 'ffmpeg:-movflags +faststart',
      '--write-thumbnail',
      '--convert-thumbnails', 'jpg',
      '-o', videoPath,
      '--progress',
      '--no-warnings',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=web',
      url
    ];

    console.log('Starting video download...');
    const ytdlp = spawn('yt-dlp', args);
    let stderr = '';
    let settled = false;

    // Timeout after 5 minutes for download
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ytdlp.kill();
        reject(new Error('Download timed out'));
      }
    }, 300000);

    ytdlp.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        console.error('yt-dlp download spawn error:', err);
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
      }
    });

    ytdlp.stdout.on('data', (data) => {
      const output = data.toString();
      // Parse progress from yt-dlp output
      const match = output.match(/(\d+\.?\d*)%/);
      if (match) {
        onProgress(parseFloat(match[1]));
      }
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
      // Progress also appears in stderr sometimes
      const match = data.toString().match(/(\d+\.?\d*)%/);
      if (match) {
        onProgress(parseFloat(match[1]));
      }
    });

    ytdlp.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(stderr || 'Download failed'));
          return;
        }

        // Move thumbnail to correct location
        const downloadedThumb = videoPath.replace('.mp4', '.jpg');
        if (fs.existsSync(downloadedThumb)) {
          fs.renameSync(downloadedThumb, thumbnailPath);
        }

        resolve();
      }
    });
  });
}
