import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useDJStore } from '../store/djStore'

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io('/', {
      transports: ['websocket', 'polling']
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
    setLyricsOffset,
    setFullState,
    promoteDeck
  } = useDJStore()

  useEffect(() => {
    socketRef.current = getSocket()
    const socket = socketRef.current

    // Request initial state
    socket.emit('sync:request')

    // Handle full state sync
    socket.on('sync:state', (state) => {
      setFullState(state)
    })

    // Deck events
    socket.on('deck:load', ({ deck, trackId, autoplay }) => {
      setDeckState(deck, { trackId, time: 0, playing: autoplay || false })
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

    // Lyrics
    socket.on('lyrics:offset', ({ offset }) => {
      setLyricsOffset(offset)
    })

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
      socket.off('lyrics:offset')
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
