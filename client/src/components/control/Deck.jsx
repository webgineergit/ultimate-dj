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
  const zoomCanvasRef = useRef(null)
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

  // Full track waveform data - from server or built progressively
  const [waveformData, setWaveformData] = useState(null)
  const waveformDataRef = useRef(null) // Ref for animation loop to avoid stale closures
  const waveformSamplesRef = useRef([]) // Raw samples collected during playback (fallback)
  const lastWaveformTimeRef = useRef(0)

  // Refs to avoid stale closures in animation loop
  const durationRef = useRef(0)
  const isScrrubbingRef = useRef(false)
  const scrubTimeRef = useRef(0)

  // Keep refs in sync with state
  useEffect(() => {
    waveformDataRef.current = waveformData
  }, [waveformData])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    isScrrubbingRef.current = isScrubbing
  }, [isScrubbing])

  useEffect(() => {
    scrubTimeRef.current = scrubTime
  }, [scrubTime])

  // Scrub state refs (to avoid stale closures)
  const wasPlayingRef = useRef(false)
  const lastScrubXRef = useRef(0)
  const lastScrubTimeRef = useRef(0)
  const seekOnLoadRef = useRef(null)  // Time to seek to after track loads
  const scrubVelocityRef = useRef(0)
  const scrubStoppedTimeoutRef = useRef(null)

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

  // Sample audio levels and build waveform progressively during playback
  const sampleWaveform = useCallback(() => {
    if (!analyserRef.current || !audioRef.current || !duration) return

    const analyser = analyserRef.current
    const currentTime = audioRef.current.currentTime
    const numSamples = 200

    // Calculate which sample index this time corresponds to
    const sampleIndex = Math.floor((currentTime / duration) * numSamples)

    // Only sample if we've moved to a new position
    if (sampleIndex === lastWaveformTimeRef.current) return
    lastWaveformTimeRef.current = sampleIndex

    // Get frequency data
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)

    // Calculate energy level (average of all frequencies)
    let sum = 0
    let peak = 0
    for (let i = 0; i < bufferLength; i++) {
      const value = dataArray[i] / 255
      sum += value
      if (value > peak) peak = value
    }
    const avg = sum / bufferLength

    // Store this sample
    const samples = waveformSamplesRef.current
    samples[sampleIndex] = { avg, peak }

    // Update waveform state periodically (every 10 samples to avoid too many re-renders)
    if (sampleIndex % 10 === 0 || sampleIndex === numSamples - 1) {
      // Create full waveform array, filling gaps with interpolated values
      const fullWaveform = []
      for (let i = 0; i < numSamples; i++) {
        if (samples[i]) {
          fullWaveform.push(samples[i])
        } else {
          // For unsampled positions, use a default low value
          fullWaveform.push({ avg: 0.1, peak: 0.15 })
        }
      }
      setWaveformData(fullWaveform)
    }
  }, [duration])

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

  // Draw full track waveform with playhead and zoomed view
  const drawWaveform = useCallback(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height

    const draw = () => {
      // Get zoom canvas inside draw loop to ensure it's available
      const zoomCanvas = zoomCanvasRef.current
      const zoomCtx = zoomCanvas?.getContext('2d')
      const zoomWidth = zoomCanvas?.width || 400
      const zoomHeight = zoomCanvas?.height || 70
      animationRef.current = requestAnimationFrame(draw)

      // Get current values from refs (avoids stale closures)
      const currentWaveformData = waveformDataRef.current
      const currentDuration = durationRef.current
      const currentIsScrubbing = isScrrubbingRef.current
      const currentScrubTime = scrubTimeRef.current

      // Sample waveform in real-time only if no pre-generated data
      const hasPreGeneratedWaveform = currentWaveformData && currentWaveformData.length >= 200
      if (!hasPreGeneratedWaveform && audioRef.current && !audioRef.current.paused) {
        sampleWaveform()
      }

      // Get current playback position
      const currentTime = currentIsScrubbing ? currentScrubTime : (audioRef.current?.currentTime || 0)
      const progress = currentDuration > 0 ? currentTime / currentDuration : 0
      const playheadX = progress * width

      // Use actual waveform length or default to 200 for real-time sampling
      const numSamples = currentWaveformData?.length || 200
      const barWidth = width / numSamples
      const centerY = height / 2
      const color = deckId === 'A' ? '#6366f1' : '#8b5cf6'
      const playedColor = deckId === 'A' ? '#818cf8' : '#a78bfa'
      const dimColor = deckId === 'A' ? '#3730a3' : '#5b21b6'

      // === DRAW OVERVIEW WAVEFORM ===
      ctx.fillStyle = '#1a1a25'
      ctx.fillRect(0, 0, width, height)

      for (let i = 0; i < numSamples; i++) {
        const x = i * barWidth
        const sample = currentWaveformData?.[i]
        const isPlayed = x < playheadX

        if (sample) {
          const peakHeight = sample.peak * (height * 0.45)
          const avgHeight = sample.avg * (height * 0.45)

          ctx.fillStyle = isPlayed ? playedColor : color
          ctx.globalAlpha = 0.4
          ctx.fillRect(x, centerY - peakHeight, barWidth - 1, peakHeight * 2)

          ctx.globalAlpha = 1
          ctx.fillRect(x, centerY - avgHeight, barWidth - 1, avgHeight * 2)
        } else {
          ctx.fillStyle = dimColor
          ctx.globalAlpha = 0.3
          const placeholderHeight = height * 0.15
          ctx.fillRect(x, centerY - placeholderHeight, barWidth - 1, placeholderHeight * 2)
          ctx.globalAlpha = 1
        }
      }

      // Draw playhead line on overview
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fillRect(playheadX - 1, 0, 2, height)
      ctx.shadowColor = 'rgba(255, 255, 255, 0.3)'
      ctx.shadowBlur = 4
      ctx.fillRect(playheadX - 1, 0, 2, height)
      ctx.shadowBlur = 0

      // === DRAW ZOOMED WAVEFORM ===
      if (zoomCtx && currentWaveformData && currentWaveformData.length > 0) {
        zoomCtx.fillStyle = '#1a1a25'
        zoomCtx.fillRect(0, 0, zoomWidth, zoomHeight)

        // Show ~10% of the track, centered on playhead
        const zoomRange = 0.1 // 10% of track visible
        const zoomSamples = Math.floor(numSamples * zoomRange)
        const currentSampleIndex = Math.floor(progress * numSamples)

        // Calculate start/end indices, keeping playhead centered
        let startIdx = currentSampleIndex - Math.floor(zoomSamples / 2)
        let endIdx = startIdx + zoomSamples

        // Clamp to valid range
        if (startIdx < 0) {
          startIdx = 0
          endIdx = zoomSamples
        }
        if (endIdx > numSamples) {
          endIdx = numSamples
          startIdx = Math.max(0, numSamples - zoomSamples)
        }

        const zoomBarWidth = zoomWidth / zoomSamples
        const zoomCenterY = zoomHeight / 2
        const playheadZoomX = ((currentSampleIndex - startIdx) / zoomSamples) * zoomWidth

        // Draw zoomed waveform bars with exaggerated contrast
        for (let i = 0; i < zoomSamples; i++) {
          const sampleIdx = startIdx + i
          const sample = currentWaveformData[sampleIdx]
          if (!sample) continue

          const x = i * zoomBarWidth
          const isPlayed = sampleIdx < currentSampleIndex

          // Apply power curve to exaggerate differences (quiet stays low, loud pops)
          // Using sqrt makes loud parts stand out more
          const boostPeak = Math.pow(sample.peak, 0.6)  // Boost loud parts
          const boostAvg = Math.pow(sample.avg, 0.7)

          const peakHeight = boostPeak * (zoomHeight * 0.48)
          const avgHeight = boostAvg * (zoomHeight * 0.48)

          // Color intensity based on volume - brighter for louder
          const intensity = sample.peak

          // Peak bars (beats/transients) - use brighter color for loud parts
          if (intensity > 0.7) {
            // Loud - use bright accent color
            zoomCtx.fillStyle = isPlayed ? '#c4b5fd' : '#a78bfa'
          } else if (intensity > 0.4) {
            // Medium
            zoomCtx.fillStyle = isPlayed ? playedColor : color
          } else {
            // Quiet - dimmer
            zoomCtx.fillStyle = isPlayed ? '#6366f1' : '#4f46e5'
          }

          zoomCtx.globalAlpha = 0.6
          zoomCtx.fillRect(x, zoomCenterY - peakHeight, zoomBarWidth - 0.5, peakHeight * 2)

          // Average bars (body) - same color logic
          zoomCtx.globalAlpha = 1
          zoomCtx.fillRect(x, zoomCenterY - avgHeight, zoomBarWidth - 0.5, avgHeight * 2)
        }

        // Draw playhead on zoomed view
        zoomCtx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        zoomCtx.shadowColor = 'rgba(255, 255, 255, 0.3)'
        zoomCtx.shadowBlur = 3
        zoomCtx.fillRect(playheadZoomX - 1, 0, 2, zoomHeight)
        zoomCtx.shadowBlur = 0
      }
    }

    draw()
  }, [deckId, sampleWaveform])

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
      setWaveformData(null)
      // Stop waveform animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    setIsReady(false)
    setError(null)

    const videoUrl = `/media/videos/${deck.track.video_path}`

    // Use pre-generated waveform if available, otherwise reset for real-time sampling
    if (deck.track.waveform && Array.isArray(deck.track.waveform)) {
      setWaveformData(deck.track.waveform)
    } else {
      // Reset for progressive sampling during playback
      waveformSamplesRef.current = []
      lastWaveformTimeRef.current = 0
      setWaveformData(null)
    }

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

      // Start waveform drawing animation
      if (!animationRef.current) {
        drawWaveform()
      }

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
      // Ensure waveform animation is running
      if (!animationRef.current) {
        drawWaveform()
      }
    }

    const handlePause = () => {
      // Keep waveform animation running to show playhead position
      // Animation will be stopped when track is cleared
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

  // Vinyl-style scrubbing handlers
  const handleScrubStart = useCallback((e) => {
    const audio = audioRef.current
    if (!audio || !isReady) return

    e.preventDefault()

    // Remember if we were playing
    wasPlayingRef.current = !audio.paused

    setIsScrubbing(true)

    const rect = scrubRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = percent * duration

    // Jump to click position
    audio.currentTime = time
    setScrubTime(time)
    setDeckState(deckId, { time })

    // Initialize tracking
    lastScrubXRef.current = e.clientX
    lastScrubTimeRef.current = Date.now()
    scrubVelocityRef.current = 0

    // Resume audio context if needed and start playing for scrub audio
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume()
    }

    // Start playing (we'll control rate during scrub)
    audio.playbackRate = 0.5
    audio.play().catch(() => {})
  }, [isReady, duration, deckId, setDeckState])

  const handleScrubMove = useCallback((e) => {
    if (!isScrubbing) return

    const audio = audioRef.current
    if (!audio || !scrubRef.current) return

    const rect = scrubRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = percent * duration

    // Calculate velocity for playback rate
    const now = Date.now()
    const deltaTime = now - lastScrubTimeRef.current
    const deltaX = e.clientX - lastScrubXRef.current

    if (deltaTime > 0 && deltaTime < 100) {
      // Calculate scrub speed as playback rate
      const pixelsPerSecond = Math.abs(deltaX / deltaTime) * 1000
      const waveformWidth = rect.width

      // Map pixel velocity to playback rate (faster scrub = higher rate)
      const rate = Math.min(2.0, Math.max(0.25, pixelsPerSecond / waveformWidth * 3))
      audio.playbackRate = rate

      // Make sure audio is playing
      if (audio.paused) {
        audio.play().catch(() => {})
      }
    }

    // Seek to position
    try {
      audio.currentTime = time
    } catch (e) {
      // Ignore seek errors
    }

    setScrubTime(time)
    setDeckState(deckId, { time })
    emit('deck:timeUpdate', { deck: deckId, time })

    lastScrubXRef.current = e.clientX
    lastScrubTimeRef.current = now

    // Pause if mouse stops moving
    if (scrubStoppedTimeoutRef.current) {
      clearTimeout(scrubStoppedTimeoutRef.current)
    }
    scrubStoppedTimeoutRef.current = setTimeout(() => {
      if (audio && !audio.paused) {
        audio.pause()
      }
    }, 150)
  }, [isScrubbing, duration, deckId, setDeckState, emit])

  const handleScrubEnd = useCallback(() => {
    if (!isScrubbing) return

    const audio = audioRef.current
    if (!audio) return

    // Clear the stopped timeout
    if (scrubStoppedTimeoutRef.current) {
      clearTimeout(scrubStoppedTimeoutRef.current)
      scrubStoppedTimeoutRef.current = null
    }

    setIsScrubbing(false)

    // Reset playback rate to normal (accounting for pitch setting)
    const currentPitch = useDJStore.getState().decks[deckId].pitch || 1
    audio.playbackRate = currentPitch

    // Set final position
    try {
      audio.currentTime = scrubTime
    } catch (e) {
      // Ignore seek errors
    }

    setDeckState(deckId, { time: scrubTime })
    emit('deck:seek', { deck: deckId, time: scrubTime })

    // Resume or pause based on original state
    if (wasPlayingRef.current) {
      audio.play().then(() => {
        setDeckState(deckId, { playing: true })
        emit('deck:play', { deck: deckId, time: scrubTime })
      }).catch(() => {})
    } else {
      audio.pause()
      setDeckState(deckId, { playing: false })
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
        // Only show error for permission issues, not abort errors from scrubbing
        if (err.name === 'NotAllowedError') {
          setError('Click page first to enable audio')
        }
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

      {/* Zoomed waveform - detailed view around playhead */}
      <div className="waveform-zoom-container">
        <canvas ref={zoomCanvasRef} width={400} height={70} className="waveform-zoom-canvas" />
        {!deck.track && <div className="waveform-placeholder">No track loaded</div>}
      </div>

      {/* Video + Overview Waveform row */}
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

        {/* Overview waveform / Progress display - draggable */}
        <div
          ref={scrubRef}
          className={`waveform-container ${isScrubbing ? 'scrubbing' : ''}`}
          onMouseDown={handleScrubStart}
        >
          <canvas ref={canvasRef} width={400} height={60} className="waveform-canvas" />
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
