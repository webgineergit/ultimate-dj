import { useState, useEffect, useMemo } from 'react'
import './LyricsOverlay.css'

function LyricsOverlay({ trackId, currentTime }) {
  const [lyrics, setLyrics] = useState([])
  const [loading, setLoading] = useState(false)

  // Load lyrics for track
  useEffect(() => {
    if (!trackId) {
      setLyrics([])
      return
    }

    setLoading(true)
    fetch(`/api/lyrics/${trackId}`)
      .then(res => {
        if (!res.ok) throw new Error('Lyrics not found')
        return res.json()
      })
      .then(data => {
        setLyrics(data.lyrics || [])
      })
      .catch(() => {
        setLyrics([])
      })
      .finally(() => setLoading(false))
  }, [trackId])

  // Current time in milliseconds
  const currentTimeMs = currentTime * 1000

  // Find current line index
  const currentLineIndex = useMemo(() => {
    if (lyrics.length === 0) return -1

    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= currentTimeMs) {
        return i
      }
    }
    return -1
  }, [lyrics, currentTimeMs])

  // Check if we're in the pre-lyrics window (2 seconds before first lyric)
  const isPreLyrics = useMemo(() => {
    if (lyrics.length === 0) return false
    const firstLyricTime = lyrics[0].time
    const previewWindow = 2000 // 2 seconds before
    return currentTimeMs >= firstLyricTime - previewWindow && currentTimeMs < firstLyricTime
  }, [lyrics, currentTimeMs])

  // Get visible lines (current + context)
  const visibleLines = useMemo(() => {
    if (lyrics.length === 0) return []

    // Show first few lines as preview before lyrics start
    if (isPreLyrics) {
      const end = Math.min(lyrics.length, 3)
      return lyrics.slice(0, end).map((line, i) => ({
        ...line,
        isCurrent: i === 0, // First line is "upcoming"
        relativeIndex: i
      }))
    }

    if (currentLineIndex === -1) return []

    const start = Math.max(0, currentLineIndex - 1)
    const end = Math.min(lyrics.length, currentLineIndex + 3)

    return lyrics.slice(start, end).map((line, i) => ({
      ...line,
      isCurrent: start + i === currentLineIndex,
      relativeIndex: i - (currentLineIndex - start)
    }))
  }, [lyrics, currentLineIndex, isPreLyrics])

  // Calculate progress within current line
  const lineProgress = useMemo(() => {
    // No progress during pre-lyrics preview
    if (isPreLyrics) return 0
    if (currentLineIndex === -1 || currentLineIndex >= lyrics.length - 1) return 0

    const currentLine = lyrics[currentLineIndex]
    const nextLine = lyrics[currentLineIndex + 1]
    const lineDuration = nextLine.time - currentLine.time
    const elapsed = currentTimeMs - currentLine.time

    // Vocals typically finish before the next line starts
    // Scale so progress reaches 100% at ~75% of the line duration
    const vocalDuration = lineDuration * 0.75
    return Math.min(1, Math.max(0, elapsed / vocalDuration))
  }, [lyrics, currentLineIndex, currentTimeMs, isPreLyrics])

  // Check if we're past the last lyric (hide after 5 seconds past last line)
  const isPastLastLyric = useMemo(() => {
    if (lyrics.length === 0) return false
    const lastLine = lyrics[lyrics.length - 1]
    return currentTimeMs > lastLine.time + 5000
  }, [lyrics, currentTimeMs])

  if (loading) return null
  if (lyrics.length === 0) return null
  if (isPastLastLyric) return null

  return (
    <div className="lyrics-overlay">
      <div className="lyrics-container">
        {visibleLines.map((line, index) => (
          <div
            key={`${line.time}-${index}`}
            className={`lyrics-line ${line.isCurrent ? 'current' : ''}`}
            style={{
              opacity: line.isCurrent ? 1 : 0.4,
              transform: `scale(${line.isCurrent ? 1.1 : 1})`
            }}
          >
            {line.isCurrent ? (
              <span
                className="lyrics-text-progress"
                style={{
                  '--progress': `${lineProgress * 100}%`
                }}
              >
                {line.text}
              </span>
            ) : (
              <span>{line.text}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default LyricsOverlay
