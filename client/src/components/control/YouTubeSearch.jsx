import { useState, useCallback } from 'react'
import { useSocket } from '../../hooks/useSocket'
import { useDJStore } from '../../store/djStore'
import './YouTubeSearch.css'

function YouTubeSearch() {
  const { emit } = useSocket()
  const { addTrack } = useDJStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState({})

  const handleSearch = useCallback(async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setResults([])

    try {
      const res = await fetch(`/api/download/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setResults(data)
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }, [query])

  const handleDownload = useCallback(async (video) => {
    setDownloading(prev => ({ ...prev, [video.id]: true }))

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: video.url })
      })

      const data = await res.json()
      if (data.trackId) {
        // Poll for download progress
        const pollProgress = async () => {
          const progressRes = await fetch(`/api/download/progress/${data.trackId}`)
          const progress = await progressRes.json()

          if (progress.status === 'complete') {
            // Fetch the completed track and add to library
            const trackRes = await fetch(`/api/tracks/${data.trackId}`)
            const track = await trackRes.json()
            addTrack(track)
            // Remove from search results
            setResults(prev => prev.filter(v => v.id !== video.id))
            setDownloading(prev => ({ ...prev, [video.id]: false }))
          } else if (progress.status === 'error') {
            console.error('Download failed:', progress.error)
            setDownloading(prev => ({ ...prev, [video.id]: false }))
          } else {
            // Continue polling
            setTimeout(pollProgress, 1000)
          }
        }
        pollProgress()
      }
    } catch (err) {
      console.error('Download failed:', err)
      setDownloading(prev => ({ ...prev, [video.id]: false }))
    }
  }, [addTrack])

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="youtube-search">
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!e.target.value.trim()) {
              setResults([])
            }
          }}
          placeholder="Search YouTube..."
          className="search-input"
        />
        <button type="submit" disabled={loading} className="search-button">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="search-results">
          {results.map((video) => (
            <div key={video.id} className="search-result">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="result-thumbnail"
              />
              <div className="result-info">
                <div className="result-title">{video.title}</div>
                <div className="result-meta">
                  <span className="result-channel">{video.channel}</span>
                  <span className="result-duration">{formatDuration(video.duration)}</span>
                  {video.hasSyncedLyrics && (
                    <span className="result-lyrics-badge" title="Synced lyrics available">
                      LYRICS
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDownload(video)}
                disabled={downloading[video.id]}
                className="download-button"
              >
                {downloading[video.id] ? 'Downloading...' : 'Download'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default YouTubeSearch
