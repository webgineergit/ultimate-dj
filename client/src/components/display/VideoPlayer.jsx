import { useEffect, useRef } from 'react'
import './VideoPlayer.css'

function VideoPlayer({ track, playing, currentTime }) {
  const videoRef = useRef(null)
  const lastSyncedTimeRef = useRef(0)

  // Load video when track changes
  useEffect(() => {
    if (!videoRef.current || !track) return

    const videoUrl = `/media/videos/${track.video_path}`
    if (videoRef.current.src !== videoUrl) {
      videoRef.current.src = videoUrl
      videoRef.current.load()
    }
  }, [track])

  // Handle play/pause state changes
  useEffect(() => {
    if (!videoRef.current) return

    if (playing) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked, user needs to interact first
      })
    } else {
      videoRef.current.pause()
    }
  }, [playing])

  // Sync time - this handles both playback drift and scrubbing
  useEffect(() => {
    if (!videoRef.current) return

    const video = videoRef.current
    const videoTime = video.currentTime
    const timeDiff = Math.abs(videoTime - currentTime)

    // Always sync if:
    // - Time difference is significant (> 0.2 seconds)
    // - We're paused (need to follow scrubbing exactly)
    // - Time jumped more than 1 second (user seeked)
    const timeJumped = Math.abs(currentTime - lastSyncedTimeRef.current) > 1
    const needsSync = timeDiff > 0.2 || (!playing && timeDiff > 0.01) || timeJumped

    if (needsSync) {
      video.currentTime = currentTime
    }

    lastSyncedTimeRef.current = currentTime
  }, [currentTime, playing])

  if (!track) return null

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        muted
        playsInline
        loop={false}
      />
    </div>
  )
}

export default VideoPlayer
