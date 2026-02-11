import { useCallback } from 'react'
import { useDJStore } from '../../store/djStore'
import { useSocket } from '../../hooks/useSocket'
import './Crossfader.css'

function Crossfader() {
  const { emit } = useSocket()
  const { crossfader, setCrossfader, getEffectiveVolumes } = useDJStore()

  const handleChange = useCallback((e) => {
    const position = parseInt(e.target.value)
    setCrossfader(position)
    emit('crossfader', { position })
  }, [emit, setCrossfader])

  const effectiveVolumes = getEffectiveVolumes()

  return (
    <div className="crossfader">
      <div className="crossfader-header">
        <span>B</span>
        <span>CROSSFADER</span>
        <span>A</span>
      </div>

      <div className="crossfader-track">
        <input
          type="range"
          min="0"
          max="100"
          value={crossfader}
          onChange={handleChange}
          className="crossfader-slider"
        />
      </div>

      <div className="volume-meters">
        <div className="meter">
          <div
            className="meter-fill meter-b"
            style={{ height: `${effectiveVolumes.B * 100}%` }}
          />
        </div>
        <div className="meter">
          <div
            className="meter-fill meter-a"
            style={{ height: `${effectiveVolumes.A * 100}%` }}
          />
        </div>
      </div>

      <div className="volume-labels">
        <span>{Math.round(effectiveVolumes.B * 100)}%</span>
        <span>{Math.round(effectiveVolumes.A * 100)}%</span>
      </div>
    </div>
  )
}

export default Crossfader
