import { useEffect, useState } from 'react'
import { useSocket } from '../hooks/useSocket'
import { useDJStore } from '../store/djStore'
import Deck from '../components/control/Deck'
import Crossfader from '../components/control/Crossfader'
import TrackLibrary from '../components/control/TrackLibrary'
import TrackQueue from '../components/control/TrackQueue'
import YouTubeSearch from '../components/control/YouTubeSearch'
import DisplayToggles from '../components/control/DisplayToggles'
import Soundboard from '../components/control/Soundboard'
import './ControlWindow.css'

function ControlWindow() {
  useSocket()
  const { tracks, setTracks, mainDeck } = useDJStore()
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // Load tracks on mount
  useEffect(() => {
    fetch('/api/tracks')
      .then(res => res.json())
      .then(setTracks)
      .catch(console.error)
  }, [setTracks])

  // Unlock audio on first user interaction
  const unlockAudio = () => {
    if (audioUnlocked) return

    // Create a silent audio context to unlock audio (no oscillator = no pop)
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (AudioContext) {
      const ctx = new AudioContext()
      // Just resume the context - no need to play anything
      ctx.resume().then(() => {
        // Close this temporary context
        ctx.close()
        setAudioUnlocked(true)
      })
    } else {
      setAudioUnlocked(true)
    }
  }

  return (
    <div className="control-window" onClick={unlockAudio}>
      {!audioUnlocked && (
        <div className="audio-unlock-banner">
          Click anywhere to enable audio playback
        </div>
      )}


      <main className="control-main">
        <div className="decks-section">
          <Deck deckId="B" isMain={mainDeck === 'B'} />
          <Crossfader />
          <Deck deckId="A" isMain={mainDeck === 'A'} />
        </div>

        <div className="bottom-section">
          <div className="library-queue-section">
            <div className="search-library-container">
              <YouTubeSearch />
              <TrackLibrary />
            </div>
            <TrackQueue />
          </div>
          <div className="controls-section">
            <DisplayToggles />
            <Soundboard />
          </div>
        </div>
      </main>

    </div>
  )
}

export default ControlWindow
