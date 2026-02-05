import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

const MIN_BPM = 30
const MAX_BPM = 220

// Audio synthesis constants (heart sound simulation)
const AUDIO = {
  // S1 (first heart sound - "lub")
  S1_FREQ_START: 55, // Hz - low thump attack
  S1_FREQ_END: 25, // Hz - frequency sweep target
  S1_ATTACK: 0.008, // seconds - fast attack
  S1_DECAY: 0.14, // seconds - decay time
  S1_DURATION: 0.16, // seconds - total duration

  // Sub-bass reinforcement
  SUB_FREQ: 32, // Hz - sub-bass frequency
  SUB_ATTACK: 0.012,
  SUB_DECAY: 0.11,
  SUB_DURATION: 0.13,
  SUB_GAIN: 0.6,

  // Noise transient (thump texture)
  NOISE_DURATION: 0.02, // seconds
  NOISE_DECAY: 0.03,
  NOISE_CUTOFF: 150, // Hz - lowpass filter
  NOISE_GAIN: 0.4,

  // S2 (second heart sound - "dub")
  S2_DELAY: 0.13, // seconds after S1
  S2_FREQ_START: 75,
  S2_FREQ_END: 35,
  S2_ATTACK: 0.008,
  S2_DECAY: 0.1,
  S2_DURATION: 0.12,
  S2_GAIN: 0.55,

  MASTER_GAIN: 0.7,
} as const

// Cached noise buffer to avoid allocation on every heartbeat
let cachedNoiseBuffer: AudioBuffer | null = null
let cachedSampleRate = 0

function getNoiseBuffer(audioCtx: AudioContext): AudioBuffer {
  if (!cachedNoiseBuffer || cachedSampleRate !== audioCtx.sampleRate) {
    cachedSampleRate = audioCtx.sampleRate
    const bufferSize = audioCtx.sampleRate * AUDIO.NOISE_DURATION
    cachedNoiseBuffer = audioCtx.createBuffer(
      1,
      bufferSize,
      audioCtx.sampleRate,
    )
    const data = cachedNoiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3
    }
  }
  return cachedNoiseBuffer
}

// Dan Abramov's useInterval pattern - allows dynamic interval timing without gaps
function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef<() => void>(callback)

  useEffect(() => {
    savedCallback.current = callback
  })

  useEffect(() => {
    if (delay === null) return
    const tick = () => savedCallback.current()
    const id = setInterval(tick, delay)
    return () => clearInterval(id)
  }, [delay])
}

function createHeartbeatSound(
  audioCtx: AudioContext,
  masterGain: GainNode,
  time: number,
): void {
  // S1 - primary "lub" sound
  const osc1 = audioCtx.createOscillator()
  const g1 = audioCtx.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(AUDIO.S1_FREQ_START, time)
  osc1.frequency.exponentialRampToValueAtTime(
    AUDIO.S1_FREQ_END,
    time + AUDIO.S1_DECAY,
  )
  g1.gain.setValueAtTime(0, time)
  g1.gain.linearRampToValueAtTime(1, time + AUDIO.S1_ATTACK)
  g1.gain.exponentialRampToValueAtTime(0.001, time + AUDIO.S1_DECAY)
  osc1.connect(g1)
  g1.connect(masterGain)
  osc1.start(time)
  osc1.stop(time + AUDIO.S1_DURATION)
  osc1.onended = () => {
    osc1.disconnect()
    g1.disconnect()
  }

  // Sub-bass reinforcement
  const oSub = audioCtx.createOscillator()
  const gSub = audioCtx.createGain()
  oSub.type = 'sine'
  oSub.frequency.setValueAtTime(AUDIO.SUB_FREQ, time)
  gSub.gain.setValueAtTime(0, time)
  gSub.gain.linearRampToValueAtTime(AUDIO.SUB_GAIN, time + AUDIO.SUB_ATTACK)
  gSub.gain.exponentialRampToValueAtTime(0.001, time + AUDIO.SUB_DECAY)
  oSub.connect(gSub)
  gSub.connect(masterGain)
  oSub.start(time)
  oSub.stop(time + AUDIO.SUB_DURATION)
  oSub.onended = () => {
    oSub.disconnect()
    gSub.disconnect()
  }

  // Noise transient for thump texture
  const n = audioCtx.createBufferSource()
  n.buffer = getNoiseBuffer(audioCtx)
  const ng = audioCtx.createGain()
  const nf = audioCtx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.value = AUDIO.NOISE_CUTOFF
  ng.gain.setValueAtTime(AUDIO.NOISE_GAIN, time)
  ng.gain.exponentialRampToValueAtTime(0.001, time + AUDIO.NOISE_DECAY)
  n.connect(nf)
  nf.connect(ng)
  ng.connect(masterGain)
  n.start(time)
  n.stop(time + AUDIO.NOISE_DECAY)
  n.onended = () => {
    n.disconnect()
    nf.disconnect()
    ng.disconnect()
  }

  // S2 - secondary "dub" sound
  const o2 = audioCtx.createOscillator()
  const g2 = audioCtx.createGain()
  o2.type = 'sine'
  o2.frequency.setValueAtTime(AUDIO.S2_FREQ_START, time + AUDIO.S2_DELAY)
  o2.frequency.exponentialRampToValueAtTime(
    AUDIO.S2_FREQ_END,
    time + AUDIO.S2_DELAY + AUDIO.S2_DECAY,
  )
  g2.gain.setValueAtTime(0, time + AUDIO.S2_DELAY)
  g2.gain.linearRampToValueAtTime(
    AUDIO.S2_GAIN,
    time + AUDIO.S2_DELAY + AUDIO.S2_ATTACK,
  )
  g2.gain.exponentialRampToValueAtTime(
    0.001,
    time + AUDIO.S2_DELAY + AUDIO.S2_DECAY,
  )
  o2.connect(g2)
  g2.connect(masterGain)
  o2.start(time + AUDIO.S2_DELAY)
  o2.stop(time + AUDIO.S2_DELAY + AUDIO.S2_DURATION)
  o2.onended = () => {
    o2.disconnect()
    g2.disconnect()
  }
}

interface HeartSVGProps {
  scale: number
  glow: number
  isPlaying: boolean
  beat: number
}

const HeartSVG = memo(function HeartSVG({
  scale,
  glow,
  isPlaying,
  beat,
}: HeartSVGProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: 80,
        height: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isPlaying && (
        <div
          key={beat}
          style={{
            position: 'absolute',
            top: -16,
            right: -16,
            bottom: -16,
            left: -16,
            borderRadius: '50%',
            border: '1.5px solid rgba(190,50,50,0.3)',
            animation: 'ripple 0.9s ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
        role="img"
        aria-label="Heart"
        style={{
          width: 64,
          height: 64,
          transform: `scale(${scale})`,
          transition: 'transform 0.1s cubic-bezier(0.22,1,0.36,1)',
          filter: `drop-shadow(0 0 ${glow}px rgba(180,40,40,0.6)) drop-shadow(0 0 ${glow * 2}px rgba(120,20,20,0.3))`,
        }}
      >
        <defs>
          <radialGradient id="hg" cx="45%" cy="38%" r="55%">
            <stop offset="0%" stopColor="#e85d75" />
            <stop offset="45%" stopColor="#c0283c" />
            <stop offset="100%" stopColor="#5c0a14" />
          </radialGradient>
        </defs>
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill="url(#hg)"
        />
      </svg>
    </div>
  )
})

function getEKGY(x: number, offset: number, bw: number, mid: number): number {
  const t = ((x + offset) % bw) / bw
  if (t > 0.1 && t < 0.18)
    return mid - Math.sin(((t - 0.1) / 0.08) * Math.PI) * 6
  if (t > 0.22 && t < 0.24) return mid + ((t - 0.22) / 0.02) * 9
  if (t > 0.24 && t < 0.28) return mid + 9 - ((t - 0.24) / 0.04) * 46
  if (t > 0.28 && t < 0.32) return mid - 37 + ((t - 0.28) / 0.04) * 48
  if (t > 0.32 && t < 0.34) return mid + 11 - ((t - 0.32) / 0.02) * 11
  if (t > 0.4 && t < 0.52)
    return mid - Math.sin(((t - 0.4) / 0.12) * Math.PI) * 10
  return mid
}

interface EKGProps {
  bpm: number
  isPlaying: boolean
}

const EKG = memo(function EKG({ bpm, isPlaying }: EKGProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const anim = useRef<number | null>(null)
  const off = useRef(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Resize observer - watches container for size changes
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry?.contentBoxSize) {
        // Handle both array (Chrome) and object (Firefox <92, Safari <15.4)
        const contentBoxSize = entry.contentBoxSize
        const size = Array.isArray(contentBoxSize)
          ? contentBoxSize[0]
          : contentBoxSize
        if (size) {
          setDimensions({ width: size.inlineSize, height: size.blockSize })
        }
      }
    })

    const parent = canvas.parentElement
    if (parent) observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  // Animation loop - separate effect reacts to dimension changes
  useEffect(() => {
    const c = ref.current
    if (!c || dimensions.width === 0) return

    const dpr = window.devicePixelRatio || 1
    c.width = dimensions.width * dpr
    c.height = dimensions.height * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    const W = dimensions.width
    const H = dimensions.height
    const mid = H / 2

    const draw = () => {
      ctx.fillStyle = 'rgba(8,6,8,0.2)'
      ctx.fillRect(0, 0, W, H)
      if (!isPlaying) {
        ctx.strokeStyle = 'rgba(160,40,50,0.15)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 7])
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(W, mid)
        ctx.stroke()
        ctx.setLineDash([])
        // Draw once and stop - no requestAnimationFrame when paused
        return
      }
      const bw = (60 / bpm) * 120
      off.current = (off.current + 1.5) % bw
      ctx.strokeStyle = '#c0283c'
      ctx.lineWidth = 2
      ctx.shadowColor = '#c0283c'
      ctx.shadowBlur = 8
      ctx.beginPath()
      for (let x = 0; x < W; x++) {
        const y = getEKGY(x, off.current, bw, mid)
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,160,170,0.35)'
      ctx.lineWidth = 0.8
      ctx.shadowBlur = 0
      ctx.beginPath()
      for (let x = 0; x < W; x++) {
        const y = getEKGY(x, off.current, bw, mid)
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      anim.current = requestAnimationFrame(draw)
    }
    ctx.fillStyle = 'rgba(8,6,8,1)'
    ctx.fillRect(0, 0, W, H)
    draw()
    return () => {
      if (anim.current) cancelAnimationFrame(anim.current)
    }
  }, [bpm, isPlaying, dimensions])

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="EKG waveform visualization showing heartbeat rhythm"
      style={{ width: '100%', height: 56, borderRadius: 10, display: 'block' }}
    />
  )
})

interface BpmZone {
  label: string
  color: string
}

function getBpmZone(bpm: number): BpmZone {
  if (bpm < 60) return { label: 'Bradycardia', color: '#5b9bd5' }
  if (bpm <= 100) return { label: 'Resting', color: '#6abf69' }
  if (bpm <= 140) return { label: 'Moderate', color: '#d4a843' }
  if (bpm <= 170) return { label: 'Vigorous', color: '#d97a3e' }
  return { label: 'Maximum', color: '#d94040' }
}

const BPM_PRESETS = [
  { label: 'Sleep', bpm: 50 },
  { label: 'Rest', bpm: 72 },
  { label: 'Walk', bpm: 110 },
  { label: 'Run', bpm: 155 },
  { label: 'Sprint', bpm: 190 },
] as const

const SLIDER_TICKS = [30, 60, 100, 140, 170, 220] as const

// Extend Window for Safari's prefixed AudioContext
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

// Hook to detect reduced motion preference
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return prefersReducedMotion
}

// iOS Safari requires audio context to be "unlocked" via user gesture.
// Critical: touchstart does NOT work on iOS 17+ - only touchend/click/mousedown.
// See: https://github.com/mackron/miniaudio/issues/759
function unlockAudioContext(audioCtx: AudioContext): void {
  if (audioCtx.state !== 'suspended') return

  // Play a silent buffer to "warm up" the audio context
  // This primes iOS to allow subsequent Web Audio playback
  const warmUp = () => {
    const buffer = audioCtx.createBuffer(1, 1, 22050)
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(audioCtx.destination)
    source.start(0)
    audioCtx.resume()
  }

  // iOS unlocks audio only when finger lifts (touchend), not on initial touch
  const events = ['touchend', 'mousedown', 'keydown'] as const
  const unlock = () => {
    warmUp()
    for (const e of events) {
      document.body.removeEventListener(e, unlock)
    }
  }

  for (const e of events) {
    document.body.addEventListener(e, unlock, { passive: true })
  }
}

// iOS 17+: Set audio session to "playback" so Web Audio ignores the mute switch.
// Without this, Web Audio plays on the "ringer" channel and is silenced by the
// hardware mute toggle, while HTML5 <audio> plays on "media" channel unaffected.
// See: https://bugs.webkit.org/show_bug.cgi?id=237322
function setPlaybackAudioSession(): void {
  if ('audioSession' in navigator) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigator as any).audioSession.type = 'playback'
  }
}

// WCAG 2.3.1: Max flashes per second threshold
const MAX_VISUAL_FLASHES_PER_SEC = 3

export default function App() {
  const [bpm, setBpm] = useState(162)
  const [bpmInput, setBpmInput] = useState('162')
  const [isPlaying, setIsPlaying] = useState(false)
  const [beat, setBeat] = useState(0)
  const [showInfo, setShowInfo] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const audioCtx = useRef<AudioContext | null>(null)
  const masterGain = useRef<GainNode | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  // Interval timing: null when stopped, ms delay when playing
  const delay = isPlaying ? (60 / bpm) * 1000 : null

  useInterval(() => {
    if (audioCtx.current && masterGain.current) {
      createHeartbeatSound(
        audioCtx.current,
        masterGain.current,
        audioCtx.current.currentTime,
      )
      setBeat((p) => p + 1)
    }
  }, delay)

  // Initialize AudioContext and master gain early, set up iOS unlock listeners
  // biome-ignore lint/correctness/useExhaustiveDependencies: volume used only for initial value; separate effect handles updates
  useEffect(() => {
    // iOS 17+: route Web Audio to media channel (ignores mute switch)
    setPlaybackAudioSession()

    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtx.current = ctx

    // Create persistent master gain node for volume control
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.connect(ctx.destination)
    masterGain.current = gain

    unlockAudioContext(ctx)
    return () => {
      ctx.close()
      // Clear noise buffer cache when context closes
      cachedNoiseBuffer = null
    }
  }, [])

  const start = useCallback(async () => {
    if (!audioCtx.current || !masterGain.current) return
    // Ensure context is running before playing (iOS may have it suspended)
    if (audioCtx.current.state === 'suspended') {
      await audioCtx.current.resume()
    }
    // Play first beat immediately
    createHeartbeatSound(
      audioCtx.current,
      masterGain.current,
      audioCtx.current.currentTime,
    )
    setBeat((p) => p + 1)
    setIsPlaying(true)
  }, [])

  const stop = useCallback(() => {
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    if (showInfo && overlayRef.current) {
      overlayRef.current.focus()
    }
  }, [showInfo])

  const zone = getBpmZone(bpm)

  // WCAG 2.3.1: Cap visual animations at 3/sec to avoid epilepsy triggers
  // At high BPM (>180), throttle visual beat updates while audio continues normally
  const beatsPerSec = bpm / 60
  const visualBeat =
    beatsPerSec > MAX_VISUAL_FLASHES_PER_SEC
      ? Math.floor(beat / Math.ceil(beatsPerSec / MAX_VISUAL_FLASHES_PER_SEC))
      : beat

  // Disable pulsing animations when user prefers reduced motion
  const scale =
    isPlaying && !prefersReducedMotion
      ? 1 + Math.sin(visualBeat * Math.PI) * 0.12
      : 1
  const glow =
    isPlaying && !prefersReducedMotion
      ? 14 + Math.sin(visualBeat * Math.PI) * 10
      : 4
  const pct = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setBpmInput(e.target.value)
    const n = parseInt(e.target.value, 10)
    if (!Number.isNaN(n) && n >= MIN_BPM && n <= MAX_BPM) setBpm(n)
  }

  const handleInputBlur = () => {
    const n = parseInt(bpmInput, 10)
    if (Number.isNaN(n) || n < MIN_BPM) {
      setBpm(MIN_BPM)
      setBpmInput(String(MIN_BPM))
    } else if (n > MAX_BPM) {
      setBpm(MAX_BPM)
      setBpmInput(String(MAX_BPM))
    }
  }

  const handleSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value
    setBpm(v)
    setBpmInput(String(v))
  }

  const handleOverlayClick = (_e: MouseEvent<HTMLDivElement>) => {
    setShowInfo(false)
  }

  const handleOverlayKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') setShowInfo(false)
    // Focus trap: prevent Tab from leaving the dialog
    if (e.key === 'Tab') {
      e.preventDefault()
    }
  }

  // Return focus to info button when dialog closes
  useEffect(() => {
    if (!showInfo && infoButtonRef.current) {
      infoButtonRef.current.focus()
    }
  }, [showInfo])

  // Update master gain when volume changes
  useEffect(() => {
    if (masterGain.current && audioCtx.current) {
      masterGain.current.gain.setTargetAtTime(
        volume,
        audioCtx.current.currentTime,
        0.02,
      )
    }
  }, [volume])

  return (
    <div
      style={{
        height: '100dvh',
        minHeight: '100vh',
        width: '100vw',
        background: '#0a0608',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 24px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        html{color-scheme:dark;}
        :root{--cr:#b82e3c;--cl:#e85d75;--tp:#e8dede;--tm:#6a5558;--td:#3d2e30;--sf:rgba(255,255,255,0.03);}
        *{box-sizing:border-box;margin:0;}html,body{overflow:hidden;height:100%;width:100%;}
        button,input[type=range]{touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
        .grain::before{content:'';position:fixed;top:0;right:0;bottom:0;left:0;z-index:100;pointer-events:none;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          background-repeat:repeat;background-size:256px;opacity:0.45;}
        @media (prefers-reduced-motion: no-preference) {
          @keyframes ripple{0%{transform:scale(0.85);opacity:0.3;}100%{transform:scale(1.8);opacity:0;}}
          @keyframes breathe{0%,100%{transform:scale(1);}50%{transform:scale(1.06) translate(4px,-6px);}}
          @keyframes fadeIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
          .fi{opacity:0;animation:fadeIn 0.6s ease-out forwards;}
        }
        @media (prefers-reduced-motion: reduce) {
          .fi{opacity:1;}
        }
        input[type=range].sl{-webkit-appearance:none;appearance:none;width:100%;height:3px;background:transparent;outline:none;cursor:pointer;}
        input[type=range].sl::-webkit-slider-runnable-track{height:3px;border-radius:2px;
          background:linear-gradient(90deg,var(--cr) 0%,var(--cr) ${pct}%,rgba(255,255,255,0.06) ${pct}%);}
        input[type=range].sl::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,0.06);}
        input[type=range].sl::-moz-range-progress{height:3px;border-radius:2px;background:var(--cr);}
        input[type=range].sl::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;
          background:var(--tp);border:2px solid var(--cr);margin-top:-7px;
          box-shadow:0 0 12px rgba(184,46,60,0.5);transition:transform 0.2s;}
        input[type=range].sl::-webkit-slider-thumb:hover{transform:scale(1.3);}
        input[type=range].sl::-moz-range-thumb{width:16px;height:16px;border-radius:50%;
          background:var(--tp);border:2px solid var(--cr);box-shadow:0 0 12px rgba(184,46,60,0.5);cursor:pointer;}
        input[type=range].sl:focus-visible{outline:2px solid var(--cr);outline-offset:4px;}
        .inp{background:transparent;border:none;border-bottom:1.5px solid rgba(184,46,60,0.25);
          color:var(--tp);font-size:36px;font-family:'Cormorant Garamond',serif;font-weight:700;
          width:80px;text-align:center;padding:2px 4px;outline:none;letter-spacing:-1px;
          transition:border-color 0.3s;}
        .inp:focus{border-color:var(--cr);}
        .inp:focus-visible{outline:2px solid var(--cr);outline-offset:2px;}
        .btn{padding:12px 52px;font-size:11px;font-family:'IBM Plex Mono',monospace;font-weight:500;
          letter-spacing:3px;text-transform:uppercase;border:1.5px solid;border-radius:50px;
          cursor:pointer;transition:all 0.35s cubic-bezier(0.22,1,0.36,1);}
        .btn:hover{transform:translateY(-1px);}
        .btn:active{transform:scale(0.98);}
        .btn:focus-visible{outline:2px solid var(--cl);outline-offset:2px;}
        .btn.go{background:linear-gradient(135deg,rgba(184,46,60,0.85),rgba(92,10,20,0.9));
          border-color:rgba(232,93,117,0.35);color:#fde8ec;box-shadow:0 4px 24px rgba(184,46,60,0.2);}
        .btn.go:hover{box-shadow:0 6px 32px rgba(184,46,60,0.35);}
        .btn.st{background:var(--sf);border-color:rgba(255,255,255,0.08);color:var(--tm);}
        .btn.st:hover{border-color:rgba(255,255,255,0.15);color:var(--tp);}
        .pr{padding:5px 12px;font-size:9px;font-family:'IBM Plex Mono',monospace;font-weight:500;
          letter-spacing:1px;text-transform:uppercase;background:var(--sf);color:var(--tm);
          border:1px solid rgba(255,255,255,0.04);border-radius:6px;cursor:pointer;
          transition:all 0.25s;}
        .pr:hover{background:rgba(255,255,255,0.05);color:var(--tp);}
        .pr:focus-visible{outline:2px solid var(--cl);outline-offset:2px;}
        .pr.on{background:rgba(184,46,60,0.12);color:var(--cl);border-color:rgba(184,46,60,0.25);}
        .info-btn{background:none;border:1px solid rgba(255,255,255,0.06);border-radius:50%;
          width:28px;height:28px;color:var(--td);font-size:12px;cursor:pointer;
          font-family:'IBM Plex Mono',monospace;display:flex;align-items:center;justify-content:center;
          transition:all 0.25s;}
        .info-btn:hover{border-color:rgba(255,255,255,0.15);color:var(--tm);}
        .info-btn:focus-visible{outline:2px solid var(--cl);outline-offset:2px;}
        .info-btn.open{background:rgba(184,46,60,0.1);border-color:rgba(184,46,60,0.2);color:var(--cl);}
        .overlay{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(6,4,6,0.92);z-index:50;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:20px;padding:40px;backdrop-filter:blur(12px);animation:fadeIn 0.25s ease-out;}
        .stat{display:flex;flex-direction:column;align-items:center;gap:1px;}
        .sv{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:700;color:var(--tp);font-variant-numeric:tabular-nums;}
        .sl2{font-size:8px;font-family:'IBM Plex Mono',monospace;color:var(--td);letter-spacing:1.5px;text-transform:uppercase;}
      `}</style>

      {/* BG */}
      <div
        className="grain"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 400,
            height: 400,
            top: '-12%',
            left: '-10%',
            borderRadius: '50%',
            filter: 'blur(80px)',
            background:
              'radial-gradient(circle,rgba(120,20,30,0.12) 0%,transparent 70%)',
            animation: 'breathe 14s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Stats overlay */}
      {showInfo && (
        <div
          ref={overlayRef}
          className="overlay"
          onClick={handleOverlayClick}
          onKeyDown={handleOverlayKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label="Statistics"
          tabIndex={-1}
        >
          <p
            style={{
              fontSize: 9,
              fontFamily: "'IBM Plex Mono',monospace",
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: 'var(--td)',
            }}
          >
            Statistics
          </p>
          <div style={{ display: 'flex', gap: 28 }}>
            <div className="stat">
              <span className="sv">
                {(60 / bpm).toFixed(2)}
                <span style={{ fontSize: 14, color: 'var(--tm)' }}>s</span>
              </span>
              <span className="sl2">Interval</span>
            </div>
            <div className="stat">
              <span className="sv">{(bpm * 60).toLocaleString()}</span>
              <span className="sl2">Beats/hr</span>
            </div>
            <div className="stat">
              <span className="sv">{(bpm * 1440).toLocaleString()}</span>
              <span className="sl2">Beats/day</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <div className="stat">
              <span className="sv">
                {((60 / bpm) * 1000).toFixed(0)}
                <span style={{ fontSize: 14, color: 'var(--tm)' }}>ms</span>
              </span>
              <span className="sl2">R-R Interval</span>
            </div>
            <div className="stat">
              <span className="sv">
                {(bpm / 60).toFixed(2)}
                <span style={{ fontSize: 14, color: 'var(--tm)' }}>Hz</span>
              </span>
              <span className="sl2">Frequency</span>
            </div>
          </div>
          <p
            style={{
              fontSize: 8,
              color: 'var(--td)',
              fontFamily: "'IBM Plex Mono',monospace",
              marginTop: 16,
              maxWidth: 280,
              textAlign: 'center',
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            Educational simulation only. Not a medical device. Consult a
            healthcare provider for cardiac concerns.
          </p>
          <p
            style={{
              fontSize: 10,
              color: 'var(--td)',
              fontFamily: "'IBM Plex Mono',monospace",
              marginTop: 8,
            }}
          >
            Tap anywhere to close
          </p>
        </div>
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: 400,
          gap: 0,
          height: '100%',
          justifyContent: 'space-evenly',
        }}
      >
        {/* Title row */}
        <div
          className="fi"
          style={{ animationDelay: '0.05s', textAlign: 'center' }}
        >
          <p
            style={{
              fontSize: 8,
              fontFamily: "'IBM Plex Mono',monospace",
              fontWeight: 400,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: 'var(--td)',
              marginBottom: 4,
            }}
          >
            Audio Visualizer
          </p>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: 32,
              fontWeight: 700,
              fontStyle: 'italic',
              lineHeight: 1,
              color: 'var(--tp)',
            }}
          >
            Heartbeat
          </h1>
        </div>

        {/* Heart + BPM — centered composition */}
        <div
          className="fi"
          style={{
            animationDelay: '0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <HeartSVG
            scale={scale}
            glow={glow}
            isPlaying={isPlaying}
            beat={beat}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <input
                className="inp"
                aria-label="Beats per minute"
                inputMode="numeric"
                name="bpm"
                value={bpmInput}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontWeight: 300,
                  color: 'var(--td)',
                  letterSpacing: 1.5,
                }}
              >
                BPM
              </span>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 8,
                fontFamily: "'IBM Plex Mono',monospace",
                fontWeight: 500,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: zone.color,
                background: `${zone.color}12`,
                border: `1px solid ${zone.color}25`,
                alignSelf: 'flex-start',
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: zone.color,
                }}
              />
              {zone.label}
            </div>
          </div>
        </div>

        {/* Slider */}
        <div className="fi" style={{ animationDelay: '0.25s', width: '100%' }}>
          <input
            type="range"
            className="sl"
            aria-label="BPM slider"
            name="bpm-slider"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={handleSliderChange}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 5,
              padding: '0 1px',
            }}
          >
            {SLIDER_TICKS.map((v) => (
              <span
                key={v}
                style={{
                  fontSize: 7,
                  fontFamily: "'IBM Plex Mono',monospace",
                  color: 'var(--td)',
                }}
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Presets — single row */}
        <div
          className="fi"
          style={{
            animationDelay: '0.35s',
            display: 'flex',
            gap: 5,
            justifyContent: 'center',
          }}
        >
          {BPM_PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className={`pr ${bpm === p.bpm ? 'on' : ''}`}
              onClick={() => {
                setBpm(p.bpm)
                setBpmInput(String(p.bpm))
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Play + info */}
        <div
          className="fi"
          style={{
            animationDelay: '0.45s',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <button
            type="button"
            className={`btn ${isPlaying ? 'st' : 'go'}`}
            onClick={isPlaying ? stop : start}
            aria-label={isPlaying ? 'Stop heartbeat' : 'Start heartbeat'}
          >
            {isPlaying ? '■  Stop' : '▶  Run'}
          </button>
          <button
            ref={infoButtonRef}
            type="button"
            className={`info-btn ${showInfo ? 'open' : ''}`}
            onClick={() => setShowInfo(!showInfo)}
            aria-label={showInfo ? 'Close statistics' : 'Show statistics'}
            aria-expanded={showInfo}
          >
            i
          </button>
        </div>

        {/* Volume control */}
        <div
          className="fi"
          style={{
            animationDelay: '0.5s',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '60%',
          }}
        >
          <span
            style={{
              fontSize: 8,
              fontFamily: "'IBM Plex Mono',monospace",
              color: 'var(--td)',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Vol
          </span>
          <input
            type="range"
            className="sl"
            aria-label="Volume"
            name="volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(+e.target.value)}
            style={{ flex: 1 }}
          />
          <span
            style={{
              fontSize: 9,
              fontFamily: "'IBM Plex Mono',monospace",
              color: 'var(--td)',
              width: 28,
              textAlign: 'right',
            }}
          >
            {Math.round(volume * 100)}%
          </span>
        </div>

        {/* EKG — compact */}
        <div className="fi" style={{ animationDelay: '0.55s', width: '100%' }}>
          <EKG bpm={bpm} isPlaying={isPlaying} />
        </div>
      </div>
    </div>
  )
}
