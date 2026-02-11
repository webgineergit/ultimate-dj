import { useEffect, useRef, useState, useCallback } from 'react'
import { useDJStore } from '../../store/djStore'
import { useSocket } from '../../hooks/useSocket'
import './Deck.css'

function Deck({ deckId, isMain }) {
  const { emit } = useSocket()
  const { decks, crossfader, queue, setDeckState, setDeckTrack, promoteDeck, setCrossfader, removeFromQueue, getEffectiveVolumes } = useDJStore()
  const deck = decks[deckId]
  const effectiveVolume = getEffectiveVolumes()[deckId]

  const audioRef = useRef(null)
  const canvasRef = useRef(null)
  const scrubRef = useRef(null)
  const analyserRef = useRef(null)
  const audioContextRef = useRef(null)
  const gainNodeRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const animationRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubTime, setScrubTime] = useState(0)

  // BPM detection state
  const [detectingBpm, setDetectingBpm] = useState(false)
  const bpmDetectionRef = useRef(null)

  // Track when audio context is ready for volume control
  const [audioContextReady, setAudioContextReady] = useState(false)

  // Audio output device selection
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState('default')

  // Scrub state refs (to avoid stale closures)
  const wasPlayingRef = useRef(false)
  const lastScrubXRef = useRef(0)
  const lastScrubTimeRef = useRef(0)
  const seekOnLoadRef = useRef(null)  // Time to seek to after track loads

  // Enumerate audio output devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permission first (needed for device labels)
        await navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => stream.getTracks().forEach(track => track.stop()))
          .catch(() => {}) // Ignore if permission denied

        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput')
        setAudioDevices(audioOutputs)
      } catch (err) {
        console.log('Could not enumerate audio devices:', err.message)
      }
    }

    getDevices()

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices)
  }, [])

  // Apply selected audio output device
  useEffect(() => {
    const video = audioRef.current
    if (!video || !selectedDevice) return

    if (typeof video.setSinkId === 'function') {
      video.setSinkId(selectedDevice)
        .catch(err => console.log('Could not set audio output:', err.message))
    }
  }, [selectedDevice])

  // Handle device selection change
  const handleDeviceChange = useCallback((e) => {
    setSelectedDevice(e.target.value)
  }, [])

  // Setup audio analyzer for waveform
  const setupAnalyzer = useCallback(() => {
    if (!audioRef.current) return

    // Only create context once
    if (!audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        audioContextRef.current = new AudioContext()

        // Create source node (can only be done once per audio element)
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current)

        // Create analyser for visualization/BPM
        analyserRef.current = audioContextRef.current.createAnalyser()
        analyserRef.current.fftSize = 256

        // Audio graph: source -> analyser -> destination
        sourceNodeRef.current.connect(analyserRef.current)
        analyserRef.current.connect(audioContextRef.current.destination)
      } catch (err) {
        console.log('Audio context setup:', err.message)
      }
    }
  }, [deckId])

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyserRef.current.getByteFrequencyData(dataArray)

      ctx.fillStyle = '#1a1a25'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const barWidth = (canvas.width / bufferLength) * 2.5
      let x = 0

      const color = deckId === 'A' ? '#6366f1' : '#8b5cf6'

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8

        ctx.fillStyle = color
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight)

        x += barWidth
      }
    }

    draw()
  }, [deckId])

  // Load track
  useEffect(() => {
    const video = audioRef.current
    if (!video) return

    // Handle track being cleared
    if (!deck.track) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      setIsReady(false)
      setDuration(0)
      setError(null)
      return
    }

    setIsReady(false)
    setError(null)

    const videoUrl = `/media/videos/${deck.track.video_path}`

    // Check current time from store to detect promotion (continuing from a position)
    const currentTime = useDJStore.getState().decks[deckId].time
    const isPromotion = currentTime > 0

    // Save the time to seek to after load (for seamless promotion)
    seekOnLoadRef.current = isPromotion ? currentTime : null

    if (isPromotion) {
      // For promotion: load immediately, no delay
      if (audioRef.current) {
        audioRef.current.src = videoUrl
        audioRef.current.load()
      }
    } else {
      // For new tracks: small delay to prevent audio pop
      const timeoutId = setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = videoUrl
          audioRef.current.load()
        }
      }, 50)
      return () => clearTimeout(timeoutId)
    }
  }, [deck.track, deckId])

  // Audio element event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setIsReady(true)
      setError(null)
      setupAnalyzer()

      const isSeekNeeded = seekOnLoadRef.current !== null

      // Seek to saved position (for seamless promotion or queue autoplay)
      if (isSeekNeeded) {
        audio.currentTime = seekOnLoadRef.current
        seekOnLoadRef.current = null
      }

      // Autoplay if deck state says playing
      const currentDeck = useDJStore.getState().decks[deckId]
      if (currentDeck.playing && audio.paused) {
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume()
        }
        audio.play().catch(err => console.log('Autoplay failed:', err.message))
      }
    }

    const handleError = (e) => {
      // Ignore errors during scrubbing - they're often transient
      if (isScrubbing) {
        console.log('Audio error during scrub (ignored)')
        return
      }
      // Only show error if we haven't loaded successfully before
      if (!isReady) {
        console.error('Audio error:', e)
        setError('Failed to load audio')
      }
    }

    const handleTimeUpdate = () => {
      if (audio && !audio.paused && !isScrubbing) {
        setDeckState(deckId, { time: audio.currentTime })
        emit('deck:timeUpdate', { deck: deckId, time: audio.currentTime })
      }
    }

    const handleEnded = () => {
      // Autoplay next track from queue when deck A (Live) finishes
      if (deckId === 'A') {
        const currentQueue = useDJStore.getState().queue
        if (currentQueue.length > 0) {
          const nextTrack = currentQueue[0]
          setDeckTrack('A', nextTrack, true) // true = autoplay
          removeFromQueue(0)
          emit('deck:load', { deck: 'A', trackId: nextTrack.id, autoplay: true })
          return // Don't set playing to false since we're loading next track
        }
      }

      // Only set playing to false if not loading next track
      setDeckState(deckId, { playing: false })
      emit('deck:pause', { deck: deckId })
    }

    const handlePlay = () => {
      if (analyserRef.current && !animationRef.current) {
        drawWaveform()
      }
    }

    const handlePause = () => {
      if (animationRef.current && !isScrubbing) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('error', handleError)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [deckId, emit, setDeckState, setDeckTrack, removeFromQueue, setupAnalyzer, drawWaveform, isScrubbing])

  // Sync play/pause state
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isReady || isScrubbing) return

    if (deck.playing && audio.paused) {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }
      audio.play().catch(err => {
        console.log('Play failed:', err.message)
        setDeckState(deckId, { playing: false })
      })
    } else if (!deck.playing && !audio.paused) {
      audio.pause()
    }
  }, [deck.playing, isReady, deckId, setDeckState, isScrubbing])

  // Sync volume (includes crossfader effect) - use element volume for control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = effectiveVolume
    }
  }, [effectiveVolume])

  // Scrubbing handlers
  const handleScrubStart = useCallback((e) => {
    const audio = audioRef.current
    if (!audio || !isReady) return

    e.preventDefault()

    // Remember if we were playing
    wasPlayingRef.current = !audio.paused

    // Pause during scrub
    if (!audio.paused) {
      audio.pause()
      setDeckState(deckId, { playing: false })
    }

    setIsScrubbing(true)

    const rect = scrubRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = percent * duration

    setScrubTime(time)
    setDeckState(deckId, { time })
  }, [isReady, duration, deckId, setDeckState])

  const handleScrubMove = useCallback((e) => {
    if (!isScrubbing) return

    const audio = audioRef.current
    if (!audio || !scrubRef.current) return

    const rect = scrubRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = percent * duration

    // Update position without playing (smoother, no errors)
    setScrubTime(time)
    setDeckState(deckId, { time })
    emit('deck:timeUpdate', { deck: deckId, time })

    lastScrubXRef.current = e.clientX
    lastScrubTimeRef.current = Date.now()
  }, [isScrubbing, duration, deckId, setDeckState, emit])

  const handleScrubEnd = useCallback(() => {
    if (!isScrubbing) return

    const audio = audioRef.current
    if (!audio) return

    setIsScrubbing(false)

    // Reset playback rate
    audio.playbackRate = 1

    // Set final position
    try {
      audio.currentTime = scrubTime
    } catch (e) {
      console.log('Seek error:', e)
    }

    setDeckState(deckId, { time: scrubTime })
    emit('deck:seek', { deck: deckId, time: scrubTime })

    // Resume playing if it was playing before
    if (wasPlayingRef.current) {
      // Small delay to let the audio element settle
      setTimeout(() => {
        audio.play().then(() => {
          setDeckState(deckId, { playing: true })
          emit('deck:play', { deck: deckId, time: scrubTime })
        }).catch(err => {
          console.log('Resume play failed:', err.message)
        })
      }, 50)
    }
  }, [isScrubbing, scrubTime, deckId, setDeckState, emit])

  // Global mouse events for scrubbing
  useEffect(() => {
    if (isScrubbing) {
      window.addEventListener('mousemove', handleScrubMove)
      window.addEventListener('mouseup', handleScrubEnd)
      return () => {
        window.removeEventListener('mousemove', handleScrubMove)
        window.removeEventListener('mouseup', handleScrubEnd)
      }
    }
  }, [isScrubbing, handleScrubMove, handleScrubEnd])

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !isReady) return

    if (deck.playing) {
      audio.pause()
      emit('deck:pause', { deck: deckId })
      setDeckState(deckId, { playing: false })
    } else {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }

      audio.play().then(() => {
        emit('deck:play', { deck: deckId, time: audio.currentTime })
        setDeckState(deckId, { playing: true, time: audio.currentTime })
      }).catch(err => {
        console.error('Play failed:', err)
        setError('Click page first to enable audio')
      })
    }
  }, [deck.playing, deckId, emit, setDeckState, isReady])

  const handleVolumeChange = useCallback((e) => {
    const volume = parseFloat(e.target.value)
    setDeckState(deckId, { volume })
    emit('deck:volume', { deck: deckId, volume })
  }, [deckId, emit, setDeckState])

  const handlePromote = useCallback(() => {
    if (deckId !== 'B') return // Only promote from deck B (Next Up)

    // Promote: move B to A, crossfader to A
    promoteDeck()
    emit('deck:promote', { fromDeck: 'B' })
    emit('crossfader', { position: 100 })
  }, [deckId, emit, promoteDeck])

  // Pitch/tempo control
  const handlePitchChange = useCallback((e) => {
    const pitch = parseFloat(e.target.value)
    setDeckState(deckId, { pitch })
    if (audioRef.current) {
      audioRef.current.playbackRate = pitch
    }
    emit('deck:pitch', { deck: deckId, pitch })
  }, [deckId, emit, setDeckState])

  // Apply pitch when it changes externally
  useEffect(() => {
    if (audioRef.current && deck.pitch) {
      audioRef.current.playbackRate = deck.pitch
    }
  }, [deck.pitch])

  // Load stored BPM when track loads
  useEffect(() => {
    if (deck.track?.bpm && !deck.detectedBpm) {
      setDeckState(deckId, { detectedBpm: deck.track.bpm })
    }
  }, [deck.track?.bpm, deck.detectedBpm, deckId, setDeckState])

  // BPM detection using beat tracking
  const detectBPM = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) {
      console.log('BPM: analyser not ready')
      return
    }

    setDetectingBpm(true)
    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const peaks = []
    let lastPeakTime = 0
    const startTime = Date.now()
    const duration = 8000 // Analyze for 8 seconds

    const detect = () => {
      if (Date.now() - startTime > duration) {
        // Calculate BPM from peaks
        if (peaks.length > 2) {
          const intervals = []
          for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1])
          }
          // Sort and take median
          intervals.sort((a, b) => a - b)
          const medianInterval = intervals[Math.floor(intervals.length / 2)]

          let bpm = Math.round(60000 / medianInterval)

          // Normalize to 70-170 range
          while (bpm < 70) bpm *= 2
          while (bpm > 170) bpm /= 2

          console.log(`BPM detected: ${bpm} from ${peaks.length} peaks`)
          setDeckState(deckId, { detectedBpm: bpm })

          // Save to database only if pitch is at 0% (1.0) to ensure accurate BPM
          const currentPitch = useDJStore.getState().decks[deckId].pitch || 1
          if (deck.track?.id && Math.abs(currentPitch - 1) < 0.01) {
            fetch(`/api/tracks/${deck.track.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bpm })
            }).catch(console.error)
            console.log(`BPM ${bpm} saved to database (pitch at 0%)`)
          } else if (deck.track?.id) {
            console.log(`BPM ${bpm} NOT saved - pitch is at ${((currentPitch - 1) * 100).toFixed(0)}%`)
          }
        } else {
          console.log('BPM: not enough peaks detected')
        }
        setDetectingBpm(false)
        bpmDetectionRef.current = null
        return
      }

      analyser.getByteFrequencyData(dataArray)

      // Calculate bass energy (first 10 bins ~0-400Hz)
      let bassEnergy = 0
      for (let i = 0; i < 10; i++) {
        bassEnergy += dataArray[i]
      }

      const now = Date.now()
      // Detect peak when bass energy is high and enough time has passed
      if (bassEnergy > 1500 && now - lastPeakTime > 200) {
        peaks.push(now)
        lastPeakTime = now
      }

      bpmDetectionRef.current = requestAnimationFrame(detect)
    }

    detect()
  }, [deckId, deck.track?.id, setDeckState])

  // Start BPM detection when track plays
  useEffect(() => {
    if (deck.playing && isReady && !deck.detectedBpm && !detectingBpm && analyserRef.current) {
      // Use stored BPM if available
      if (deck.track?.bpm) {
        setDeckState(deckId, { detectedBpm: deck.track.bpm })
      } else {
        // Wait a moment for audio to stabilize, then detect
        const timer = setTimeout(() => {
          detectBPM()
        }, 1000)
        return () => clearTimeout(timer)
      }
    }

    // Cleanup on unmount or track change
    return () => {
      if (bpmDetectionRef.current) {
        cancelAnimationFrame(bpmDetectionRef.current)
        bpmDetectionRef.current = null
      }
    }
  }, [deck.playing, isReady, deck.detectedBpm, deck.track?.bpm, detectingBpm, detectBPM, deckId, setDeckState])

  // Sync to other deck's BPM
  const handleSync = useCallback(() => {
    const otherDeckId = deckId === 'A' ? 'B' : 'A'
    const otherDeck = useDJStore.getState().decks[otherDeckId]

    if (!deck.detectedBpm || !otherDeck.detectedBpm) return

    // Calculate pitch adjustment to match BPMs
    const targetBpm = otherDeck.detectedBpm * otherDeck.pitch
    const currentBpm = deck.detectedBpm
    const newPitch = targetBpm / currentBpm

    // Clamp to reasonable range
    const clampedPitch = Math.max(0.5, Math.min(2, newPitch))

    setDeckState(deckId, { pitch: clampedPitch })
    if (audioRef.current) {
      audioRef.current.playbackRate = clampedPitch
    }
    emit('deck:pitch', { deck: deckId, pitch: clampedPitch })
  }, [deckId, deck.detectedBpm, emit, setDeckState])

  // Beat sync - align this deck's beats with the other deck's beats
  const handleBeatSync = useCallback(() => {
    const otherDeckId = deckId === 'A' ? 'B' : 'A'
    const otherDeck = useDJStore.getState().decks[otherDeckId]

    if (!deck.detectedBpm || !otherDeck.detectedBpm) return
    if (!audioRef.current) return

    // Calculate effective BPMs (accounting for pitch)
    const thisBpm = deck.detectedBpm * (deck.pitch || 1)
    const otherBpm = otherDeck.detectedBpm * (otherDeck.pitch || 1)

    // Beat intervals in seconds
    const thisBeatInterval = 60 / thisBpm
    const otherBeatInterval = 60 / otherBpm

    // Current positions
    const thisTime = audioRef.current.currentTime
    const otherTime = otherDeck.time

    // Calculate phase (0-1) within current beat
    const thisPhase = (thisTime % thisBeatInterval) / thisBeatInterval
    const otherPhase = (otherTime % otherBeatInterval) / otherBeatInterval

    // Calculate phase difference (-0.5 to 0.5)
    let phaseDiff = otherPhase - thisPhase
    if (phaseDiff > 0.5) phaseDiff -= 1
    if (phaseDiff < -0.5) phaseDiff += 1

    // Convert phase difference to time offset
    const timeOffset = phaseDiff * thisBeatInterval

    // Apply the offset to align beats
    const newTime = Math.max(0, thisTime + timeOffset)
    audioRef.current.currentTime = newTime
    setDeckState(deckId, { time: newTime })
    emit('deck:seek', { deck: deckId, time: newTime })
  }, [deckId, deck.detectedBpm, deck.pitch, emit, setDeckState])

  // Calculate effective BPM (base BPM * pitch)
  const effectiveBpm = deck.detectedBpm ? Math.round(deck.detectedBpm * (deck.pitch || 1)) : null

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const displayTime = isScrubbing ? scrubTime : deck.time
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0

  return (
    <div className={`deck ${deckId === 'A' ? 'deck-main' : 'deck-cue'}`}>
      <div className="deck-header">
        <span className="deck-id">{deckId}</span>
        <span className="deck-label">{deckId === 'B' ? 'Next Up' : 'Now Playing'}</span>
        {deckId === 'A' && <span className="main-badge">LIVE</span>}
      </div>

      <div className="deck-track-info">
        {deck.track ? (
          <>
            <div className="track-title">{deck.track.title}</div>
            <div className="track-artist">{deck.track.artist || 'Unknown Artist'}</div>
          </>
        ) : (
          <div className="no-track">Load a track from the library</div>
        )}
      </div>

      {/* Video + Waveform row */}
      <div className="deck-media-row">
        {/* Video thumbnail */}
        <div className="deck-video-container">
          <video
            ref={audioRef}
            preload="metadata"
            className="deck-video"
            playsInline
          />
        </div>

        {/* Waveform / Progress display - now draggable */}
        <div
          ref={scrubRef}
          className={`waveform-container ${isScrubbing ? 'scrubbing' : ''}`}
          onMouseDown={handleScrubStart}
        >
          <canvas ref={canvasRef} width={400} height={80} className="waveform-canvas" />
          <div className="progress-overlay" style={{ width: `${progressPercent}%` }} />
          <div className="scrub-handle" style={{ left: `${progressPercent}%` }} />
          {!deck.track && <div className="waveform-placeholder">No track loaded</div>}
          {deck.track && !isReady && !error && <div className="waveform-placeholder">Loading...</div>}
          {error && <div className="waveform-error">{error}</div>}
        </div>
      </div>

      <div className="deck-time">
        <span>{formatTime(displayTime)}</span>
        <span>/</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* BPM and Pitch controls */}
      <div className="deck-bpm-row">
        <div className={`bpm-display ${detectingBpm ? 'detecting' : ''}`}>
          <span className="bpm-label">{detectingBpm ? 'DETECTING' : 'BPM'}</span>
          <span className="bpm-value">
            {detectingBpm ? '...' : effectiveBpm || '--'}
          </span>
        </div>

        <div className="pitch-control">
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.01"
            value={deck.pitch || 1}
            onChange={handlePitchChange}
            className="pitch-slider"
          />
          <span className="pitch-value">{((deck.pitch || 1) * 100 - 100).toFixed(0)}%</span>
          <button
            className="pitch-reset"
            onClick={() => handlePitchChange({ target: { value: 1 } })}
            disabled={(deck.pitch || 1) === 1}
            title="Reset pitch to 0%"
          >
            0
          </button>
        </div>

        <button
          className="sync-btn"
          onClick={handleSync}
          disabled={!deck.detectedBpm}
          title="Match BPM to other deck"
        >
          SYNC
        </button>
        <button
          className="sync-btn beat-sync-btn"
          onClick={handleBeatSync}
          disabled={!deck.detectedBpm}
          title="Align beats with other deck"
        >
          BEAT
        </button>
      </div>

      <div className="deck-controls">
        <button
          className={`play-btn ${deck.playing ? 'playing' : ''}`}
          onClick={handlePlayPause}
          disabled={!deck.track || !isReady}
        >
          {deck.playing ? '⏸' : '▶'}
        </button>

        <div className="volume-control">
          <span>Vol</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={deck.volume}
            onChange={handleVolumeChange}
          />
        </div>

        {audioDevices.length > 0 && (
          <select
            className="audio-output-select"
            value={selectedDevice}
            onChange={handleDeviceChange}
            title="Audio output device"
          >
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        )}

        {deckId === 'B' && (
          <button
            className="promote-btn"
            onClick={handlePromote}
            disabled={!deck.track}
          >
            → Go Live
          </button>
        )}
      </div>
    </div>
  )
}

export default Deck
