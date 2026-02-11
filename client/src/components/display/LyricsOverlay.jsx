import { useState, useEffect, useMemo } from 'react'
import { useDJStore } from '../../store/djStore'
import './LyricsOverlay.css'

function LyricsOverlay({ trackId, currentTime }) {
  const { lyricsOffset } = useDJStore()
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

  // Calculate adjusted current time with offset
  const adjustedTime = (currentTime * 1000) + lyricsOffset

  // Find current line index
  const currentLineIndex = useMemo(() => {
    if (lyrics.length === 0) return -1

    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= adjustedTime) {
        return i
      }
    }
    return -1
  }, [lyrics, adjustedTime])

  // Get visible lines (current + context)
  const visibleLines = useMemo(() => {
    if (lyrics.length === 0 || currentLineIndex === -1) return []

    const start = Math.max(0, currentLineIndex - 1)
    const end = Math.min(lyrics.length, currentLineIndex + 3)

    return lyrics.slice(start, end).map((line, i) => ({
      ...line,
      isCurrent: start + i === currentLineIndex,
      relativeIndex: i - (currentLineIndex - start)
    }))
  }, [lyrics, currentLineIndex])

  // Calculate progress within current line
  const lineProgress = useMemo(() => {
    if (currentLineIndex === -1 || currentLineIndex >= lyrics.length - 1) return 0

    const currentLine = lyrics[currentLineIndex]
    const nextLine = lyrics[currentLineIndex + 1]
    const lineDuration = nextLine.time - currentLine.time
    const elapsed = adjustedTime - currentLine.time

    return Math.min(1, Math.max(0, elapsed / lineDuration))
  }, [lyrics, currentLineIndex, adjustedTime])

  if (loading) return null
  if (lyrics.length === 0) return null

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
              <span className="lyrics-text-container">
                <span
                  className="lyrics-text-progress"
                  style={{ width: `${lineProgress * 100}%` }}
                >
                  {line.text}
                </span>
                <span className="lyrics-text-base">{line.text}</span>
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
