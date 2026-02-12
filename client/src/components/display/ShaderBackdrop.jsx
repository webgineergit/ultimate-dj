import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useDJStore } from '../../store/djStore'
import './ShaderBackdrop.css'

// Shader presets
const SHADERS = {
  plasma: {
    fragment: `
      uniform float time;
      uniform vec2 resolution;
      uniform float audioLevel;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= resolution.x / resolution.y;

        float beat = audioLevel;
        float t = time * 0.5;

        // Plasma pattern - strong movement increase with beat
        float speed = 1.0 + beat * 2.5;
        float scale = 3.0 + beat * 3.0;

        float v1 = sin(p.x * scale + t * speed);
        float v2 = sin(scale * (p.x * sin(t * 0.5 * speed) + p.y * cos(t * 0.3 * speed)) + t * speed);
        float v3 = sin(length(p * (4.0 + beat * 4.0)) + t * speed);
        float v = v1 + v2 + v3;

        // Minimal color change on beat
        vec3 baseCol = vec3(0.15, 0.06, 0.25) * (sin(v * 3.14159) * 0.3 + 0.7);
        vec3 col = baseCol + vec3(0.02, 0.01, 0.03) * beat;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },
  waveform: {
    fragment: `
      uniform float time;
      uniform vec2 resolution;
      uniform float audioLevel;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        float beat = audioLevel;

        // Wave animation - strong amplitude increase with beat
        float waveAmp = 0.04 + beat * 0.18;
        float wave = sin(uv.x * 20.0 + time * 3.0) * waveAmp;
        float dist = abs(uv.y - 0.5 - wave);

        // Glow size increases with beat
        float glowSize = 0.015 + beat * 0.02;
        float glow = glowSize / dist;
        glow = clamp(glow, 0.0, 1.0);

        // Background: very subtle pulse on beat
        vec3 bgCol = vec3(0.03, 0.03, 0.1) + vec3(0.03, 0.01, 0.04) * beat;

        // Wave line color stays mostly consistent
        vec3 waveCol = vec3(0.45, 0.45, 0.95) + vec3(0.05, 0.05, 0.05) * beat;
        vec3 col = bgCol + waveCol * glow;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },
  particles: {
    fragment: `
      uniform float time;
      uniform vec2 resolution;
      uniform float audioLevel;

      float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        float beat = audioLevel;

        // Background - minimal change
        vec3 col = vec3(0.02, 0.015, 0.06);

        // Particle speed increases significantly with beat
        float speedMult = 1.0 + beat * 3.0;

        for(int i = 0; i < 50; i++) {
          vec2 pos = vec2(
            rand(vec2(float(i), 0.0)),
            mod(rand(vec2(0.0, float(i))) + time * 0.1 * speedMult * (0.5 + rand(vec2(float(i), float(i)))), 1.0)
          );

          // Particles grow significantly on beat
          float baseSize = 0.008;
          float beatSize = 0.025;
          float size = baseSize + beat * beatSize;
          float d = length(uv - pos);
          float glow = size / d;
          glow = clamp(glow, 0.0, 1.0);

          // Consistent particle color
          vec3 particleCol = mix(
            vec3(0.4, 0.4, 0.9),
            vec3(0.6, 0.3, 0.75),
            rand(vec2(float(i), float(i) * 2.0))
          );

          col += particleCol * glow * 0.3;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },
  tunnel: {
    fragment: `
      uniform float time;
      uniform vec2 resolution;
      uniform float audioLevel;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= resolution.x / resolution.y;

        float beat = audioLevel;
        float a = atan(p.y, p.x);
        float r = length(p);

        // Tunnel speed increases dramatically on beat
        float speed = 1.0 + beat * 4.0;
        float t = time * 0.5 * speed;

        // Ring density increases significantly on beat
        float ringScale = 8.0 + beat * 10.0;
        float rings = sin(r * ringScale - t * 3.0) * 0.5 + 0.5;

        // Spiral complexity increases on beat
        float spiralScale = 4.0 + beat * 4.0;
        float spiral = sin(a * spiralScale + r * 5.0 - t * 2.0) * 0.5 + 0.5;

        float v = rings * spiral;
        v *= 1.0 - r * 0.4;

        // Consistent colors - minimal brightness change
        vec3 darkCol = vec3(0.1, 0.1, 0.35);
        vec3 lightCol = vec3(0.45, 0.2, 0.6);

        vec3 col = mix(darkCol, lightCol, v);

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },
  fractal: {
    fragment: `
      uniform float time;
      uniform vec2 resolution;
      uniform float audioLevel;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= resolution.x / resolution.y;

        float beat = audioLevel;
        float t = time * 0.3;

        // Strong zoom pulse on beat
        float baseZoom = 2.0 + sin(t * 0.5) * 0.5;
        float zoom = baseZoom + beat * 1.8;

        // Julia set parameters shift significantly on beat
        float shift = 0.1 + beat * 0.2;
        vec2 c = vec2(-0.7 + sin(t * 0.2) * shift, 0.27 + cos(t * 0.3) * shift);
        vec2 z = p * zoom;

        float iter = 0.0;
        for(int i = 0; i < 50; i++) {
          z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
          if(length(z) > 2.0) break;
          iter += 1.0;
        }

        float col = iter / 50.0;
        col = pow(col, 0.5);

        // Consistent colors - no brightness change
        vec3 darkCol = vec3(0.08, 0.08, 0.25);
        vec3 lightCol = vec3(0.45, 0.2, 0.65);

        vec3 color = mix(darkCol, lightCol, col);

        gl_FragColor = vec4(color, 1.0);
      }
    `
  }
}

const VERTEX_SHADER = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

function ShaderBackdrop() {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const materialRef = useRef(null)
  const animationRef = useRef(null)

  const { shader } = useDJStore()

  // Track beats with local decay
  const lastBeatTimeRef = useRef(0)

  // Listen for beat events from store
  useEffect(() => {
    const MIN_BEAT_INTERVAL = 100 // Minimum ms between beats to avoid duplicates

    const unsubscribe = useDJStore.subscribe((state) => {
      const level = state.audioLevel
      const now = Date.now()

      // Accept any beat (level > 0.5) if enough time has passed since last one
      if (level > 0.5 && (now - lastBeatTimeRef.current) > MIN_BEAT_INTERVAL) {
        lastBeatTimeRef.current = now
      }
    })
    return unsubscribe
  }, [])


  // Initialize Three.js
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene setup
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera (orthographic for fullscreen quad)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(width, height) },
        audioLevel: { value: 0 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: SHADERS[shader]?.fragment || SHADERS.plasma.fragment
    })
    materialRef.current = material

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Animation loop
    const startTime = Date.now()
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate)

      const elapsed = (Date.now() - startTime) / 1000
      material.uniforms.time.value = elapsed

      // Calculate decay based on time since last beat
      const timeSinceBeat = Date.now() - lastBeatTimeRef.current
      const decayTime = 500 // ms for full decay (smoother)
      const audioLevel = Math.max(0, 1 - (timeSinceBeat / decayTime))
      material.uniforms.audioLevel.value = audioLevel

      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height)
      material.uniforms.resolution.value.set(width, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationRef.current)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Update shader when preset changes
  useEffect(() => {
    if (!materialRef.current) return

    const shaderCode = SHADERS[shader]?.fragment || SHADERS.plasma.fragment
    materialRef.current.fragmentShader = shaderCode
    materialRef.current.needsUpdate = true
  }, [shader])

  return <div ref={containerRef} className="shader-backdrop" />
}

export default ShaderBackdrop
