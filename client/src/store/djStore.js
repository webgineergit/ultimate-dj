import { create } from 'zustand'

export const useDJStore = create((set, get) => ({
  // Deck states
  decks: {
    A: { trackId: null, track: null, playing: false, time: 0, volume: 1, pitch: 1, detectedBpm: null },
    B: { trackId: null, track: null, playing: false, time: 0, volume: 1, pitch: 1, detectedBpm: null }
  },

  // Crossfader position (0 = full A, 100 = full B)
  crossfader: 50,

  // Which deck is the "main" one shown on display
  mainDeck: 'A',

  // Display visibility toggles
  display: {
    video: true,
    backdrop: true,
    slideshow: false,
    lyrics: false
  },

  // Current shader preset
  shader: 'plasma',

  // Current photos folder
  photosFolder: null,

  // Audio level for visualizations (0-1)
  audioLevel: 0,

  // Track library
  tracks: [],

  // Queue
  queue: [],

  // Actions
  setDeckState: (deck, updates) => set((state) => ({
    decks: {
      ...state.decks,
      [deck]: { ...state.decks[deck], ...updates }
    }
  })),

  setDeckTrack: (deck, track, autoplay = true) => set((state) => ({
    decks: {
      ...state.decks,
      [deck]: {
        ...state.decks[deck],
        trackId: track?.id || null,
        track,
        playing: autoplay && track !== null,  // Autoplay when loading a track
        time: 0,  // Reset time when loading new track
        pitch: 1,  // Reset pitch to 0%
        detectedBpm: track?.bpm || null  // Load stored BPM if available
      }
    }
  })),

  setCrossfader: (position) => set({ crossfader: position }),

  setMainDeck: (deck) => set({ mainDeck: deck }),

  // Promote: move track from B (Next Up) to A (Live)
  promoteDeck: () => set((state) => {
    const deckB = state.decks.B

    return {
      decks: {
        A: {
          trackId: deckB.trackId,
          track: deckB.track ? { ...deckB.track } : null,
          playing: deckB.playing,
          time: deckB.time,
          volume: 1,
          pitch: deckB.pitch || 1,
          detectedBpm: deckB.detectedBpm
        },
        B: { trackId: null, track: null, playing: false, time: 0, volume: 1, pitch: 1, detectedBpm: null }
      },
      crossfader: 100,
      mainDeck: 'A'
    }
  }),

  setDisplayState: (layer, visible) => set((state) => ({
    display: { ...state.display, [layer]: visible }
  })),

  setShader: (preset) => set({ shader: preset }),

  setPhotosFolder: (folder) => set({ photosFolder: folder }),

  setAudioLevel: (level) => set({ audioLevel: level }),

  // Clear all decks (used when connection is lost)
  clearDecks: () => set({
    decks: {
      A: { trackId: null, track: null, playing: false, time: 0, volume: 1, pitch: 1, detectedBpm: null },
      B: { trackId: null, track: null, playing: false, time: 0, volume: 1, pitch: 1, detectedBpm: null }
    }
  }),

  setTracks: (tracks) => set({ tracks }),

  addTrack: (track) => set((state) => ({
    tracks: [track, ...state.tracks]
  })),

  removeTrack: (trackId) => set((state) => ({
    tracks: state.tracks.filter(t => t.id !== trackId)
  })),

  setQueue: (queue) => set({ queue }),

  addToQueue: (track) => set((state) => ({
    queue: [...state.queue, track]
  })),

  removeFromQueue: (index) => set((state) => ({
    queue: state.queue.filter((_, i) => i !== index)
  })),

  setFullState: (serverState) => set({
    decks: {
      A: { ...get().decks.A, ...serverState.decks.A },
      B: { ...get().decks.B, ...serverState.decks.B }
    },
    crossfader: serverState.crossfader,
    mainDeck: serverState.mainDeck,
    display: serverState.display,
    shader: serverState.shader,
    photosFolder: serverState.photosFolder
  }),

  // Computed values
  // Crossfader: 0 = full left (B/Next Up), 100 = full right (A/Live)
  // Crossfader: 0 = full B (left), 100 = full A (right)
  getEffectiveVolumes: () => {
    const { crossfader, decks } = get()
    const fadeB = crossfader <= 50 ? 1 : (100 - crossfader) / 50
    const fadeA = crossfader >= 50 ? 1 : crossfader / 50
    return {
      A: decks.A.volume * fadeA,
      B: decks.B.volume * fadeB
    }
  }
}))
