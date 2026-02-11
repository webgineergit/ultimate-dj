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

        float t = time * 0.5;
        float audioBoost = 1.0 + audioLevel * 2.0;

        float v1 = sin(p.x * 3.0 * audioBoost + t);
        float v2 = sin(3.0 * (p.x * sin(t * 0.5) + p.y * cos(t * 0.3)) + t);
        float v3 = sin(length(p * 4.0 * audioBoost) + t);
        float v = v1 + v2 + v3;

        vec3 col1 = vec3(0.4, 0.4, 0.9);
        vec3 col2 = vec3(0.5, 0.3, 0.8);
        vec3 col = mix(col1, col2, sin(v * 3.14159) * 0.5 + 0.5);

        gl_FragColor = vec4(col * (0.7 + audioLevel * 0.5), 1.0);
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

        float wave = sin(uv.x * 20.0 + time * 3.0) * 0.1 * (1.0 + audioLevel * 3.0);
        wave += sin(uv.x * 10.0 - time * 2.0) * 0.05 * (1.0 + audioLevel * 2.0);

        float dist = abs(uv.y - 0.5 - wave);
        float glow = 0.02 / dist;
        glow = clamp(glow, 0.0, 1.0);

        vec3 col = vec3(0.4, 0.4, 1.0) * glow;
        col += vec3(0.6, 0.3, 0.8) * glow * audioLevel;

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
        vec3 col = vec3(0.0);

        for(int i = 0; i < 50; i++) {
          vec2 pos = vec2(
            rand(vec2(float(i), 0.0)),
            mod(rand(vec2(0.0, float(i))) + time * 0.1 * (0.5 + rand(vec2(float(i), float(i)))), 1.0)
          );

          float size = 0.01 + audioLevel * 0.02;
          float d = length(uv - pos);
          float glow = size / d;
          glow = clamp(glow, 0.0, 1.0);

          vec3 particleCol = mix(
            vec3(0.4, 0.4, 1.0),
            vec3(0.8, 0.3, 0.8),
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

        float a = atan(p.y, p.x);
        float r = length(p);

        float t = time * 0.5 + audioLevel;
        float rings = sin(r * 10.0 - t * 3.0) * 0.5 + 0.5;
        float spiral = sin(a * 5.0 + r * 5.0 - t * 2.0) * 0.5 + 0.5;

        float v = rings * spiral;
        v *= 1.0 - r * 0.5;

        vec3 col = mix(
          vec3(0.2, 0.2, 0.6),
          vec3(0.6, 0.2, 0.8),
          v
        );

        col *= 1.0 + audioLevel * 0.5;

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

        float t = time * 0.3;
        float zoom = 2.0 + sin(t * 0.5) * 0.5 + audioLevel;

        vec2 c = vec2(-0.7 + sin(t * 0.2) * 0.1, 0.27 + cos(t * 0.3) * 0.1);
        vec2 z = p * zoom;

        float iter = 0.0;
        for(int i = 0; i < 50; i++) {
          z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
          if(length(z) > 2.0) break;
          iter += 1.0;
        }

        float col = iter / 50.0;
        col = pow(col, 0.5);

        vec3 color = mix(
          vec3(0.1, 0.1, 0.3),
          vec3(0.5, 0.2, 0.8),
          col
        );

        color *= 1.0 + audioLevel * 0.3;

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
  const audioLevelRef = useRef(0)

  const { shader } = useDJStore()

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

      // Simulate audio level (in production, this would come from actual audio analysis)
      audioLevelRef.current = Math.sin(elapsed * 2) * 0.3 + 0.3
      material.uniforms.audioLevel.value = audioLevelRef.current

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
