import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useDJStore } from '../store/djStore'

let socket = null

export function getSocket() {
  if (!socket) {
    // Connect directly to backend server - Vite proxy has issues with websocket events
    const serverUrl = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
    console.log('Connecting socket to:', serverUrl)
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000
    })

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id)
    })

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      // Clear decks when connection is lost so display doesn't show stale content
      useDJStore.getState().clearDecks()
    })

    socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts')
    })

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message)
    })

    // Audio level listener - set up here so it persists
    socket.on('audio:level', ({ level }) => {
      useDJStore.getState().setAudioLevel(level)
    })
  }
  return socket
}

export function useSocket() {
  const socketRef = useRef(null)
  const {
    setDeckState,
    setCrossfader,
    setMainDeck,
    setDisplayState,
    setShader,
    setPhotosFolder,
    setAudioLevel,
    setFullState,
    promoteDeck
  } = useDJStore()

  useEffect(() => {
    console.log('useSocket effect running - setting up listeners')
    socketRef.current = getSocket()
    const socket = socketRef.current
    console.log('useSocket - socket connected:', socket.connected, 'id:', socket.id)

    // Request initial state
    socket.emit('sync:request')

    // Handle full state sync
    socket.on('sync:state', (state) => {
      setFullState(state)
    })

    // Deck events
    socket.on('deck:load', ({ deck, trackId, autoplay }) => {
      // Clear the old track and set new trackId - DisplayWindow will fetch the track details
      setDeckState(deck, { trackId, track: null, time: 0, playing: autoplay || false })
    })

    socket.on('deck:play', ({ deck, time }) => {
      setDeckState(deck, { playing: true, time })
    })

    socket.on('deck:pause', ({ deck }) => {
      setDeckState(deck, { playing: false })
    })

    socket.on('deck:seek', ({ deck, time }) => {
      setDeckState(deck, { time })
    })

    socket.on('deck:volume', ({ deck, volume }) => {
      setDeckState(deck, { volume })
    })

    socket.on('deck:pitch', ({ deck, pitch }) => {
      setDeckState(deck, { pitch })
    })

    socket.on('deck:timeUpdate', ({ deck, time }) => {
      setDeckState(deck, { time })
    })

    socket.on('deck:promote', ({ fromDeck }) => {
      // Note: promoteDeck is called locally by the initiating client,
      // this handler is for syncing other clients (like the display window)
      if (fromDeck === 'B') {
        promoteDeck()
      }
    })

    // Crossfader
    socket.on('crossfader', ({ position }) => {
      setCrossfader(position)
    })

    // Display toggles
    socket.on('display:toggle', ({ layer, visible }) => {
      setDisplayState(layer, visible)
    })

    // Shader
    socket.on('shader:select', ({ preset }) => {
      setShader(preset)
    })

    // Photos
    socket.on('photos:folder', ({ folder }) => {
      setPhotosFolder(folder)
    })

    // Audio level listener is now set up in getSocket() to persist

    return () => {
      // Don't disconnect on cleanup - we want to keep the connection alive
      socket.off('sync:state')
      socket.off('deck:load')
      socket.off('deck:play')
      socket.off('deck:pause')
      socket.off('deck:seek')
      socket.off('deck:volume')
      socket.off('deck:pitch')
      socket.off('deck:timeUpdate')
      socket.off('deck:promote')
      socket.off('crossfader')
      socket.off('display:toggle')
      socket.off('shader:select')
      socket.off('photos:folder')
      // audio:level listener is set up in getSocket() and should persist
    }
  }, [])

  // Emit functions
  const emit = useCallback((event, data) => {
    if (socketRef.current) {
      socketRef.current.emit(event, data)
    }
  }, [])

  return { socket: socketRef.current, emit }
}
