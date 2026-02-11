import { useEffect, useRef } from 'react'
import './VideoPlayer.css'

function VideoPlayer({ track, playing, currentTime }) {
  const videoRef = useRef(null)
  const lastTimeRef = useRef(0)

  // Load video when track changes
  useEffect(() => {
    if (!videoRef.current || !track) return

    const videoUrl = `/media/videos/${track.video_path}`
    if (videoRef.current.src !== videoUrl) {
      videoRef.current.src = videoUrl
      videoRef.current.load()
    }
  }, [track])

  // Handle play/pause
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

  // Sync time with audio (only if significantly different)
  useEffect(() => {
    if (!videoRef.current || !playing) return

    const timeDiff = Math.abs(videoRef.current.currentTime - currentTime)

    // Only sync if difference is more than 0.5 seconds
    if (timeDiff > 0.5) {
      videoRef.current.currentTime = currentTime
    }

    lastTimeRef.current = currentTime
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
