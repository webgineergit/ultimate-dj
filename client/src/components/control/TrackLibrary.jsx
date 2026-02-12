import { useState, useRef, useEffect } from 'react'
import { useDJStore } from '../../store/djStore'
import { useSocket } from '../../hooks/useSocket'
import './TrackLibrary.css'

function TrackLibrary() {
  const { emit } = useSocket()
  const { tracks, setDeckTrack, addToQueue, addTrack, removeTrack } = useDJStore()
  const [search, setSearch] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [menuOpen, setMenuOpen] = useState(null)
  const inputRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = () => setMenuOpen(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuOpen])

  const filteredTracks = tracks.filter(track =>
    track.title.toLowerCase().includes(search.toLowerCase()) ||
    (track.artist && track.artist.toLowerCase().includes(search.toLowerCase()))
  )

  const loadToDeck = (track, deck) => {
    setDeckTrack(deck, track)
    emit('deck:load', { deck, trackId: track.id, autoplay: true })
  }

  const handleDelete = async (track) => {
    if (!confirm(`Delete "${track.title}"?`)) return

    try {
      const res = await fetch(`/api/tracks/${track.id}`, { method: 'DELETE' })
      if (res.ok) {
        removeTrack(track.id)
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return

    setImporting(true)
    setImportProgress({ status: 'starting', progress: 0 })

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      })

      const { trackId } = await response.json()

      // Poll for progress
      const pollProgress = async () => {
        const progressRes = await fetch(`/api/download/progress/${trackId}`)
        const progressData = await progressRes.json()
        setImportProgress(progressData)

        if (progressData.status === 'complete') {
          // Fetch the complete track data
          const trackRes = await fetch(`/api/tracks/${trackId}`)
          const track = await trackRes.json()
          addTrack(track)
          setImporting(false)
          setImportUrl('')
          setImportProgress(null)
        } else if (progressData.status === 'error') {
          setImportProgress({ ...progressData, status: 'error' })
          setTimeout(() => {
            setImporting(false)
            setImportProgress(null)
          }, 3000)
        } else {
          setTimeout(pollProgress, 500)
        }
      }

      pollProgress()
    } catch (err) {
      setImportProgress({ status: 'error', error: err.message })
      setTimeout(() => {
        setImporting(false)
        setImportProgress(null)
      }, 3000)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleImport()
    }
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    if (!importProgress) return ''
    switch (importProgress.status) {
      case 'starting': return 'Starting...'
      case 'downloading': return `Downloading ${Math.round(importProgress.progress)}%`
      case 'fetching_lyrics': return 'Fetching lyrics...'
      case 'complete': return 'Complete!'
      case 'error': return importProgress.error || 'Error'
      default: return importProgress.status
    }
  }

  return (
    <div className="track-library">
      <div className="library-header">
        <h3>Library</h3>
        <span className="track-count">{tracks.length} tracks</span>
      </div>

      {/* Inline Import Section */}
      <div className="import-section">
        <div className="import-input-row">
          <input
            ref={inputRef}
            type="text"
            placeholder="Paste YouTube URL to import..."
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={importing}
            className="import-input"
          />
          <button
            onClick={handleImport}
            disabled={importing || !importUrl.trim()}
            className="import-btn"
          >
            {importing ? '...' : '+'}
          </button>
        </div>
        {importProgress && (
          <div className={`import-status ${importProgress.status}`}>
            {importProgress.status === 'downloading' && (
              <div className="import-progress-bar">
                <div
                  className="import-progress-fill"
                  style={{ width: `${importProgress.progress}%` }}
                />
              </div>
            )}
            <span className="import-status-text">{getStatusText()}</span>
          </div>
        )}
      </div>

      <input
        type="text"
        placeholder="Search tracks..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="library-search"
      />

      <div className="tracks-list">
        {filteredTracks.map(track => (
          <div key={track.id} className="track-item">
            <div className="track-thumb-container">
              {track.thumbnail_path && (
                <img
                  src={`/media/videos/${track.thumbnail_path}`}
                  alt=""
                  className="track-thumb"
                />
              )}
              <button
                className="track-menu-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(menuOpen === track.id ? null : track.id)
                }}
                title="More options"
              >
                ⋮
              </button>
              {menuOpen === track.id && (
                <div className="track-menu-popout">
                  <button
                    onClick={() => {
                      setMenuOpen(null)
                      handleDelete(track)
                    }}
                    className="delete-btn"
                    title="Delete track"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            <div className="track-info">
              <div className="track-title">
                {track.title}
                {track.has_synced_lyrics === 1 && (
                  <span className="lyrics-badge" title="Synced lyrics available">LYRICS</span>
                )}
              </div>
              <div className="track-meta">
                <span>{track.artist || 'Unknown'}</span>
                <span>{formatDuration(track.duration)}</span>
                {track.bpm && <span>{track.bpm.toFixed(0)} BPM</span>}
              </div>
            </div>
            <div className="track-actions">
              <button
                onClick={() => loadToDeck(track, 'B')}
                title="Load to Next Up"
              >
                B
              </button>
              <button
                onClick={() => loadToDeck(track, 'A')}
                title="Load to Live"
              >
                A
              </button>
              <button
                onClick={() => addToQueue(track)}
                title="Add to Queue"
              >
                +
              </button>
            </div>
          </div>
        ))}

        {filteredTracks.length === 0 && (
          <div className="no-tracks">
            {search ? 'No matching tracks' : 'No tracks imported yet'}
          </div>
        )}
      </div>
    </div>
  )
}

export default TrackLibrary
