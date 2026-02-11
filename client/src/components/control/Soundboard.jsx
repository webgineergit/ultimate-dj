import { useState, useEffect, useRef, useCallback } from 'react'
import './Soundboard.css'

const DEFAULT_SOUNDS = [
  { id: 'airhorn', name: 'Air Horn', key: '1' },
  { id: 'scratch', name: 'Scratch', key: '2' },
  { id: 'rewind', name: 'Rewind', key: '3' },
  { id: 'explosion', name: 'Explosion', key: '4' },
  { id: 'clap', name: 'Clap', key: '5' },
  { id: 'siren', name: 'Siren', key: '6' },
  { id: 'horn', name: 'Horn', key: '7' },
  { id: 'laser', name: 'Laser', key: '8' }
]

function Soundboard() {
  const [sounds, setSounds] = useState(DEFAULT_SOUNDS)
  const [activePad, setActivePad] = useState(null)
  const audioRefs = useRef({})

  // Load custom sounds from server
  useEffect(() => {
    // For now, use default sounds
    // TODO: Load from /api/sounds endpoint
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const sound = sounds.find(s => s.key === e.key)
      if (sound) {
        playSound(sound.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sounds])

  const playSound = useCallback((soundId) => {
    // For demo, just show visual feedback
    // In production, would play actual audio files
    setActivePad(soundId)

    if (audioRefs.current[soundId]) {
      audioRefs.current[soundId].currentTime = 0
      audioRefs.current[soundId].play()
    }

    setTimeout(() => setActivePad(null), 200)
  }, [])

  return (
    <div className="soundboard">
      <h3>Soundboard</h3>

      <div className="sound-grid">
        {sounds.map(sound => (
          <button
            key={sound.id}
            className={`sound-pad ${activePad === sound.id ? 'active' : ''}`}
            onClick={() => playSound(sound.id)}
          >
            <span className="pad-name">{sound.name}</span>
            <span className="pad-key">{sound.key}</span>
            <audio
              ref={el => audioRefs.current[sound.id] = el}
              src={`/media/sounds/${sound.id}.mp3`}
              preload="auto"
            />
          </button>
        ))}
      </div>

      <div className="soundboard-footer">
        <span className="hint">Press number keys 1-8 for quick trigger</span>
      </div>
    </div>
  )
}

export default Soundboard
