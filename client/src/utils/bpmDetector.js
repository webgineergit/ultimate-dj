// BPM Detection using Web Audio API
// Analyzes audio peaks to detect tempo

export async function detectBPM(audioElement) {
  return new Promise((resolve) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioContext()

      // Create a temporary audio element to analyze
      const tempAudio = audioElement.cloneNode()
      tempAudio.currentTime = 30 // Start 30 seconds in to skip intros
      tempAudio.volume = 0

      const source = audioContext.createMediaElementSource(tempAudio)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048

      source.connect(analyser)
      // Don't connect to destination - silent analysis

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const peaks = []
      let lastPeakTime = 0
      const minPeakInterval = 0.2 // Minimum 200ms between peaks (300 BPM max)

      const startTime = Date.now()
      const analysisTime = 10000 // Analyze for 10 seconds

      tempAudio.play()

      const analyze = () => {
        if (Date.now() - startTime > analysisTime) {
          tempAudio.pause()
          audioContext.close()

          // Calculate BPM from peak intervals
          if (peaks.length > 1) {
            const intervals = []
            for (let i = 1; i < peaks.length; i++) {
              intervals.push(peaks[i] - peaks[i - 1])
            }

            // Get median interval
            intervals.sort((a, b) => a - b)
            const medianInterval = intervals[Math.floor(intervals.length / 2)]

            // Convert to BPM
            let bpm = 60 / medianInterval

            // Normalize to reasonable range (60-180 BPM)
            while (bpm < 60) bpm *= 2
            while (bpm > 180) bpm /= 2

            resolve(Math.round(bpm))
          } else {
            resolve(null)
          }
          return
        }

        analyser.getByteFrequencyData(dataArray)

        // Focus on bass frequencies (first ~10 bins, roughly 0-500Hz)
        let bassEnergy = 0
        for (let i = 0; i < 10; i++) {
          bassEnergy += dataArray[i]
        }
        bassEnergy /= 10

        const currentTime = (Date.now() - startTime) / 1000

        // Detect peak
        if (bassEnergy > 200 && currentTime - lastPeakTime > minPeakInterval) {
          peaks.push(currentTime)
          lastPeakTime = currentTime
        }

        requestAnimationFrame(analyze)
      }

      analyze()
    } catch (err) {
      console.log('BPM detection failed:', err.message)
      resolve(null)
    }
  })
}

// Simpler approach: detect BPM by analyzing peaks in time domain
export function detectBPMFromPeaks(audioBuffer, sampleRate = 44100) {
  const data = audioBuffer.getChannelData(0)
  const peaks = []
  const threshold = 0.8
  const minPeakDistance = sampleRate * 0.2 // 200ms minimum between peaks

  let lastPeakIndex = 0

  // Find peaks
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold && i - lastPeakIndex > minPeakDistance) {
      peaks.push(i)
      lastPeakIndex = i
    }
  }

  if (peaks.length < 2) return null

  // Calculate intervals
  const intervals = []
  for (let i = 1; i < peaks.length; i++) {
    intervals.push((peaks[i] - peaks[i - 1]) / sampleRate)
  }

  // Get median interval
  intervals.sort((a, b) => a - b)
  const medianInterval = intervals[Math.floor(intervals.length / 2)]

  // Convert to BPM and normalize
  let bpm = 60 / medianInterval
  while (bpm < 60) bpm *= 2
  while (bpm > 180) bpm /= 2

  return Math.round(bpm)
}

// Quick BPM estimation using onset detection
export function estimateBPM(analyser, duration = 5) {
  return new Promise((resolve) => {
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const energyHistory = []
    const peaks = []

    const startTime = Date.now()
    const sampleInterval = 50 // Sample every 50ms
    let lastEnergy = 0

    const sample = () => {
      const elapsed = (Date.now() - startTime) / 1000

      if (elapsed > duration) {
        // Calculate BPM from peaks
        if (peaks.length > 2) {
          const intervals = []
          for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1])
          }
          intervals.sort((a, b) => a - b)
          const medianInterval = intervals[Math.floor(intervals.length / 2)]

          let bpm = 60 / medianInterval
          while (bpm < 70) bpm *= 2
          while (bpm > 170) bpm /= 2

          resolve(Math.round(bpm))
        } else {
          resolve(null)
        }
        return
      }

      analyser.getByteFrequencyData(dataArray)

      // Calculate energy in bass range
      let energy = 0
      for (let i = 0; i < 20; i++) {
        energy += dataArray[i]
      }

      // Detect onset (significant energy increase)
      if (energy > lastEnergy * 1.5 && energy > 2000) {
        peaks.push(elapsed)
      }

      lastEnergy = energy
      energyHistory.push(energy)

      setTimeout(sample, sampleInterval)
    }

    sample()
  })
}
