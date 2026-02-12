import { useEffect, useRef, useState } from 'react'
import './VideoPlayer.css'

function VideoPlayer({ track, playing, currentTime, pitch = 1 }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const lastSyncedTimeRef = useRef(0)
  const [position, setPosition] = useState({ x: 30, y: 30 })
  const [rotation, setRotation] = useState((Math.random() - 0.5) * 2)
  const velocityRef = useRef({
    x: (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5),
    y: (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5)
  })
  const angularVelocityRef = useRef(0)

  // Bouncing animation
  useEffect(() => {
    if (!containerRef.current) return

    let animationId
    const speed = 0.35 // pixels per frame

    const animate = () => {
      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      // Video is 90% of container size, with padding for rotation
      const padding = 30 // Fixed padding for rotation safety
      const videoWidth = containerRect.width * 0.9
      const videoHeight = containerRect.height * 0.9
      const availableX = containerRect.width - videoWidth - padding * 2
      const availableY = containerRect.height - videoHeight - padding * 2
      const minX = padding
      const minY = padding
      const maxX = Math.max(minX, minX + availableX)
      const maxY = Math.max(minY, minY + availableY)

      setPosition(prev => {
        let newX = prev.x + velocityRef.current.x * speed
        let newY = prev.y + velocityRef.current.y * speed

        // Bounce off walls with physics-based angular momentum
        // Tilt direction depends on which wall and the velocity perpendicular to it
        if (newX <= minX) {
          // Hit left wall - angular impulse based on vertical velocity
          angularVelocityRef.current += velocityRef.current.y * 0.02
          velocityRef.current.x *= -1
          newX = minX
        } else if (newX >= maxX) {
          // Hit right wall - angular impulse opposite to vertical velocity
          angularVelocityRef.current -= velocityRef.current.y * 0.02
          velocityRef.current.x *= -1
          newX = maxX
        }

        if (newY <= minY) {
          // Hit top wall - angular impulse based on horizontal velocity
          angularVelocityRef.current -= velocityRef.current.x * 0.02
          velocityRef.current.y *= -1
          newY = minY
        } else if (newY >= maxY) {
          // Hit bottom wall - angular impulse opposite to horizontal velocity
          angularVelocityRef.current += velocityRef.current.x * 0.02
          velocityRef.current.y *= -1
          newY = maxY
        }

        return { x: newX, y: newY }
      })

      // Apply angular velocity to rotation with friction decay
      setRotation(prev => {
        const newRotation = prev + angularVelocityRef.current
        // Decay angular velocity (friction)
        angularVelocityRef.current *= 0.98
        // Clamp rotation to ±3 degrees
        return Math.max(-3, Math.min(3, newRotation))
      })

      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationId)
  }, [])

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

  // Sync playback rate with pitch
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.playbackRate = pitch
  }, [pitch])

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
    <div className="video-player" ref={containerRef}>
      <div
        className="video-bouncer"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`
        }}
      >
        <div
          className="video-tilter"
          style={{
            transform: `rotate(${rotation}deg)`
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            loop={false}
          />
        </div>
      </div>
    </div>
  )
}

export default VideoPlayer
