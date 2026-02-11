import { useCallback, useState, useEffect } from 'react'
import { useDJStore } from '../../store/djStore'
import { useSocket } from '../../hooks/useSocket'
import './DisplayToggles.css'

const SHADER_PRESETS = [
  { id: 'plasma', name: 'Plasma' },
  { id: 'waveform', name: 'Waveform' },
  { id: 'particles', name: 'Particles' },
  { id: 'tunnel', name: 'Tunnel' },
  { id: 'fractal', name: 'Fractal' }
]

function DisplayToggles() {
  const { emit } = useSocket()
  const { display, setDisplayState, shader, setShader, photosFolder, setPhotosFolder, lyricsOffset, setLyricsOffset } = useDJStore()
  const [photoFolders, setPhotoFolders] = useState([])

  // Load photo folders
  useEffect(() => {
    fetch('/api/photos/folders')
      .then(res => res.json())
      .then(setPhotoFolders)
      .catch(console.error)
  }, [])

  const handleToggle = useCallback((layer) => {
    const newValue = !display[layer]
    setDisplayState(layer, newValue)
    emit('display:toggle', { layer, visible: newValue })
  }, [display, emit, setDisplayState])

  const handleShaderChange = useCallback((e) => {
    const preset = e.target.value
    setShader(preset)
    emit('shader:select', { preset })
  }, [emit, setShader])

  const handleFolderChange = useCallback((e) => {
    const folder = e.target.value || null
    setPhotosFolder(folder)
    emit('photos:folder', { folder })
  }, [emit, setPhotosFolder])

  const handleOffsetChange = useCallback((delta) => {
    const newOffset = lyricsOffset + delta
    setLyricsOffset(newOffset)
    emit('lyrics:offset', { offset: newOffset })
  }, [emit, lyricsOffset, setLyricsOffset])

  const openDisplayWindow = () => {
    window.open('/display', 'display', 'width=1280,height=720')
  }

  return (
    <div className="display-toggles">
      <div className="display-header">
        <h3>Display</h3>
        <button className="open-display-btn" onClick={openDisplayWindow}>Open Window</button>
      </div>

      <div className="toggle-grid">
        <ToggleSwitch
          label="Video"
          checked={display.video}
          onChange={() => handleToggle('video')}
        />
        <ToggleSwitch
          label="Backdrop"
          checked={display.backdrop}
          onChange={() => handleToggle('backdrop')}
        />
        <ToggleSwitch
          label="Slideshow"
          checked={display.slideshow}
          onChange={() => handleToggle('slideshow')}
        />
        <ToggleSwitch
          label="Lyrics"
          checked={display.lyrics}
          onChange={() => handleToggle('lyrics')}
        />
      </div>

      <div className="toggle-options">
        <div className="option-group">
          <label>Shader Preset</label>
          <select value={shader} onChange={handleShaderChange}>
            {SHADER_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <div className="option-group">
          <label>Photo Folder</label>
          <select value={photosFolder || ''} onChange={handleFolderChange}>
            <option value="">Select folder...</option>
            {photoFolders.map(folder => (
              <option key={folder.name} value={folder.name}>
                {folder.name} ({folder.imageCount})
              </option>
            ))}
          </select>
        </div>

        <div className="option-group">
          <label>Lyrics Offset</label>
          <div className="offset-controls">
            <button onClick={() => handleOffsetChange(-500)}>-0.5s</button>
            <button onClick={() => handleOffsetChange(-100)}>-0.1s</button>
            <span className="offset-value">{(lyricsOffset / 1000).toFixed(1)}s</span>
            <button onClick={() => handleOffsetChange(100)}>+0.1s</button>
            <button onClick={() => handleOffsetChange(500)}>+0.5s</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleSwitch({ label, checked, onChange }) {
  return (
    <div className="toggle-switch" onClick={onChange}>
      <span className="toggle-label">{label}</span>
      <div className={`toggle-track ${checked ? 'active' : ''}`}>
        <div className="toggle-thumb" />
      </div>
    </div>
  )
}

export default DisplayToggles
