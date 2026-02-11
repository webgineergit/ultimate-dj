import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './db/schema.js';
import tracksRouter from './routes/tracks.js';
import downloadRouter from './routes/download.js';
import photosRouter from './routes/photos.js';
import lyricsRouter from './routes/lyrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Static file serving for media
app.use('/media/videos', express.static(path.join(__dirname, '../data/videos')));
app.use('/media/audio', express.static(path.join(__dirname, '../data/audio')));
app.use('/media/photos', express.static(path.join(__dirname, '../data/photos')));
app.use('/media/sounds', express.static(path.join(__dirname, '../data/sounds')));
app.use('/media/lyrics', express.static(path.join(__dirname, '../data/lyrics')));

// Initialize database
const db = initDatabase();

// API routes
app.use('/api/tracks', tracksRouter(db));
app.use('/api/download', downloadRouter(db));
app.use('/api/photos', photosRouter);
app.use('/api/lyrics', lyricsRouter(db));

// DJ State - shared between control and display windows
let djState = {
  decks: {
    A: { trackId: null, playing: false, time: 0, volume: 1, pitch: 1 },
    B: { trackId: null, playing: false, time: 0, volume: 1, pitch: 1 }
  },
  crossfader: 50, // 0 = full A, 100 = full B
  mainDeck: 'A',
  display: {
    video: true,
    backdrop: true,
    slideshow: false,
    lyrics: false
  },
  shader: 'plasma',
  photosFolder: null,
  lyricsOffset: 0
};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current state to newly connected client
  socket.emit('sync:state', djState);

  // Handle sync requests
  socket.on('sync:request', () => {
    socket.emit('sync:state', djState);
  });

  // Deck controls
  socket.on('deck:load', ({ deck, trackId, autoplay }) => {
    djState.decks[deck].trackId = trackId;
    djState.decks[deck].time = 0;
    djState.decks[deck].playing = autoplay || false;
    // Broadcast to others only - sender already updated locally
    socket.broadcast.emit('deck:load', { deck, trackId, autoplay });
  });

  socket.on('deck:play', ({ deck, time }) => {
    djState.decks[deck].playing = true;
    djState.decks[deck].time = time;
    io.emit('deck:play', { deck, time });
  });

  socket.on('deck:pause', ({ deck }) => {
    djState.decks[deck].playing = false;
    io.emit('deck:pause', { deck });
  });

  socket.on('deck:seek', ({ deck, time }) => {
    djState.decks[deck].time = time;
    io.emit('deck:seek', { deck, time });
  });

  socket.on('deck:volume', ({ deck, volume }) => {
    djState.decks[deck].volume = volume;
    io.emit('deck:volume', { deck, volume });
  });

  socket.on('deck:pitch', ({ deck, pitch }) => {
    djState.decks[deck].pitch = pitch;
    socket.broadcast.emit('deck:pitch', { deck, pitch });
  });

  socket.on('deck:promote', ({ fromDeck }) => {
    // Promote: move deck B (Next Up) to deck A (Live)
    if (fromDeck === 'B') {
      const deckB = { ...djState.decks.B };
      djState.decks.A = {
        trackId: deckB.trackId,
        playing: deckB.playing,
        time: deckB.time,
        volume: 1
      };
      djState.decks.B = {
        trackId: null,
        playing: false,
        time: 0,
        volume: 1
      };
      djState.mainDeck = 'A';
      djState.crossfader = 100;
    }
    // Broadcast to other clients only (sender already updated locally)
    socket.broadcast.emit('deck:promote', { fromDeck });
  });

  // Crossfader
  socket.on('crossfader', ({ position }) => {
    djState.crossfader = position;
    io.emit('crossfader', { position });
  });

  // Display toggles
  socket.on('display:toggle', ({ layer, visible }) => {
    djState.display[layer] = visible;
    io.emit('display:toggle', { layer, visible });
  });

  // Shader selection
  socket.on('shader:select', ({ preset }) => {
    djState.shader = preset;
    io.emit('shader:select', { preset });
  });

  // Photos folder
  socket.on('photos:folder', ({ folder }) => {
    djState.photosFolder = folder;
    io.emit('photos:folder', { folder });
  });

  // Lyrics offset
  socket.on('lyrics:offset', ({ offset }) => {
    djState.lyricsOffset = offset;
    io.emit('lyrics:offset', { offset });
  });

  // Time sync (frequent updates from control to display)
  socket.on('deck:timeUpdate', ({ deck, time }) => {
    djState.decks[deck].time = time;
    socket.broadcast.emit('deck:timeUpdate', { deck, time });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
