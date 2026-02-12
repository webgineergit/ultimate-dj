import { useEffect } from 'react'
import { useSocket } from '../hooks/useSocket'
import { useDJStore } from '../store/djStore'
import VideoPlayer from '../components/display/VideoPlayer'
import ShaderBackdrop from '../components/display/ShaderBackdrop'
import PolaroidSlideshow from '../components/display/PolaroidSlideshow'
import LyricsOverlay from '../components/display/LyricsOverlay'
import './DisplayWindow.css'

function DisplayWindow() {
  useSocket() // Connect and sync state

  const { display, mainDeck, decks } = useDJStore()
  const mainDeckState = decks[mainDeck]

  // Request fullscreen on double-click
  const handleDoubleClick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  // Fetch track details when main deck's trackId changes
  useEffect(() => {
    const trackId = mainDeckState.trackId
    const currentTrack = mainDeckState.track

    // Fetch if we have a trackId but no track, or if trackId doesn't match current track
    if (trackId && (!currentTrack || currentTrack.id !== trackId)) {
      fetch(`/api/tracks/${trackId}`)
        .then(res => res.json())
        .then(track => {
          // Only update if this is still the current track (avoid race conditions)
          const currentState = useDJStore.getState().decks[mainDeck]
          if (currentState.trackId === trackId) {
            useDJStore.getState().setDeckState(mainDeck, { track })
          }
        })
        .catch(console.error)
    }
  }, [mainDeckState.trackId, mainDeckState.track, mainDeck])

  return (
    <div className="display-window" onDoubleClick={handleDoubleClick}>
      {/* Layer 1: Shader Backdrop (bottom) */}
      {display.backdrop && (
        <ShaderBackdrop />
      )}

      {/* Layer 2: Video Player */}
      {display.video && mainDeckState.track && (
        <VideoPlayer
          track={mainDeckState.track}
          playing={mainDeckState.playing}
          currentTime={mainDeckState.time}
          pitch={mainDeckState.pitch || 1}
        />
      )}

      {/* Layer 3: Polaroid Slideshow */}
      {display.slideshow && (
        <PolaroidSlideshow />
      )}

      {/* Layer 4: Lyrics Overlay (top) */}
      {display.lyrics && mainDeckState.track && (
        <LyricsOverlay
          trackId={mainDeckState.trackId}
          currentTime={mainDeckState.time}
          playing={mainDeckState.playing}
          pitch={mainDeckState.pitch || 1}
        />
      )}

      {/* Hint overlay when nothing is playing */}
      {!mainDeckState.track && (
        <div className="display-hint">
          <div className="hint-content">
            <h2>Ultimate DJ</h2>
            <p>Load a track in the control window to begin</p>
            <p className="hint-small">Double-click for fullscreen</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default DisplayWindow
