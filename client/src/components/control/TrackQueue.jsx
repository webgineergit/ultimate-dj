import { useDJStore } from '../../store/djStore'
import { useSocket } from '../../hooks/useSocket'
import './TrackQueue.css'

function TrackQueue() {
  const { emit } = useSocket()
  const { queue, removeFromQueue, setDeckTrack, decks } = useDJStore()

  const loadNextToInactiveDeck = (track, index) => {
    // Load to the deck that's not currently the main one
    const inactiveDeck = decks.A.playing ? 'B' : 'A'
    setDeckTrack(inactiveDeck, track)
    emit('deck:load', { deck: inactiveDeck, trackId: track.id })
    removeFromQueue(index)
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="track-queue">
      <div className="queue-header">
        <h3>Queue</h3>
        <span className="queue-count">{queue.length} tracks</span>
      </div>

      <div className="queue-list">
        {queue.map((track, index) => (
          <div key={`${track.id}-${index}`} className="queue-item">
            <span className="queue-position">{index + 1}</span>
            <div className="queue-track-info">
              <div className="queue-title">{track.title}</div>
              <div className="queue-artist">
                {track.artist || 'Unknown'} • {formatDuration(track.duration)}
              </div>
            </div>
            <div className="queue-actions">
              <button
                onClick={() => loadNextToInactiveDeck(track, index)}
                title="Load to inactive deck"
              >
                ▶
              </button>
              <button
                onClick={() => removeFromQueue(index)}
                title="Remove from queue"
                className="remove-btn"
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {queue.length === 0 && (
          <div className="empty-queue">
            Queue is empty
            <span>Add tracks from the library</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default TrackQueue
