import { useState, useEffect, useCallback } from 'react'
import { useDJStore } from '../../store/djStore'
import './PolaroidSlideshow.css'

function PolaroidSlideshow() {
  const { photosFolder } = useDJStore()
  const [photos, setPhotos] = useState([])
  const [visiblePhotos, setVisiblePhotos] = useState([])

  // Load photos when folder changes
  useEffect(() => {
    if (!photosFolder) {
      setPhotos([])
      setVisiblePhotos([])
      return
    }

    fetch(`/api/photos/folders/${photosFolder}`)
      .then(res => res.json())
      .then(setPhotos)
      .catch(console.error)
  }, [photosFolder])

  // Add new photos periodically
  useEffect(() => {
    if (photos.length === 0) return

    let photoIndex = 0
    let photoId = 0

    const addPhoto = () => {
      const photo = photos[photoIndex % photos.length]
      const newPhoto = {
        id: photoId++,
        ...photo,
        x: Math.random() * 60 + 20, // 20-80% from left
        y: Math.random() * 60 + 20, // 20-80% from top
        rotation: (Math.random() - 0.5) * 30 // -15 to +15 degrees
      }

      setVisiblePhotos(prev => {
        // Keep max 12 photos on screen
        const updated = [...prev, newPhoto]
        if (updated.length > 12) {
          return updated.slice(-12)
        }
        return updated
      })

      photoIndex++
    }

    // Add first photo immediately
    addPhoto()

    // Add new photo every 3-5 seconds
    const interval = setInterval(() => {
      addPhoto()
    }, 3000 + Math.random() * 2000)

    return () => clearInterval(interval)
  }, [photos])

  if (!photosFolder || photos.length === 0) return null

  return (
    <div className="polaroid-slideshow">
      {visiblePhotos.map((photo, index) => (
        <div
          key={photo.id}
          className="polaroid"
          style={{
            left: `${photo.x}%`,
            top: `${photo.y}%`,
            transform: `translate(-50%, -50%) rotate(${photo.rotation}deg)`,
            zIndex: index,
            animationDelay: `${index * 0.1}s`
          }}
        >
          <div className="polaroid-image">
            <img src={photo.url} alt="" loading="lazy" />
          </div>
          <div className="polaroid-caption" />
        </div>
      ))}
    </div>
  )
}

export default PolaroidSlideshow
