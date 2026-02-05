import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_BPM = 30
const MAX_BPM = 220

function createHeartbeatSound(audioCtx, time) {
  const master = audioCtx.createGain()
  master.gain.setValueAtTime(0.7, time)
  master.connect(audioCtx.destination)
  const osc1 = audioCtx.createOscillator()
  const g1 = audioCtx.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(55, time)
  osc1.frequency.exponentialRampToValueAtTime(25, time + 0.14)
  g1.gain.setValueAtTime(0, time)
  g1.gain.linearRampToValueAtTime(1, time + 0.008)
  g1.gain.exponentialRampToValueAtTime(0.001, time + 0.14)
  osc1.connect(g1)
  g1.connect(master)
  osc1.start(time)
  osc1.stop(time + 0.16)
  const oSub = audioCtx.createOscillator()
  const gSub = audioCtx.createGain()
  oSub.type = 'sine'
  oSub.frequency.setValueAtTime(32, time)
  gSub.gain.setValueAtTime(0, time)
  gSub.gain.linearRampToValueAtTime(0.6, time + 0.012)
  gSub.gain.exponentialRampToValueAtTime(0.001, time + 0.11)
  oSub.connect(gSub)
  gSub.connect(master)
  oSub.start(time)
  oSub.stop(time + 0.13)
  const n = audioCtx.createBufferSource()
  const bs = audioCtx.sampleRate * 0.02
  const b = audioCtx.createBuffer(1, bs, audioCtx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * 0.3
  n.buffer = b
  const ng = audioCtx.createGain()
  const nf = audioCtx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.value = 150
  ng.gain.setValueAtTime(0.4, time)
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.03)
  n.connect(nf)
  nf.connect(ng)
  ng.connect(master)
  n.start(time)
  n.stop(time + 0.03)
  const dl = 0.13
  const o2 = audioCtx.createOscillator()
  const g2 = audioCtx.createGain()
  o2.type = 'sine'
  o2.frequency.setValueAtTime(75, time + dl)
  o2.frequency.exponentialRampToValueAtTime(35, time + dl + 0.1)
  g2.gain.setValueAtTime(0, time + dl)
  g2.gain.linearRampToValueAtTime(0.55, time + dl + 0.008)
  g2.gain.exponentialRampToValueAtTime(0.001, time + dl + 0.1)
  o2.connect(g2)
  g2.connect(master)
  o2.start(time + dl)
  o2.stop(time + dl + 0.12)
}

function HeartSVG({ scale, glow, isPlaying, beat }) {
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
            inset: -16,
            borderRadius: '50%',
            border: '1.5px solid rgba(190,50,50,0.3)',
            animation: 'ripple 0.9s ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
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
}

function getEKGY(x, offset, bw, mid) {
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

function EKG({ bpm, isPlaying }) {
  const ref = useRef(null)
  const anim = useRef(null)
  const off = useRef(0)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = r.width * dpr
    c.height = r.height * dpr
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    const W = r.width,
      H = r.height,
      mid = H / 2
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
        anim.current = requestAnimationFrame(draw)
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
  }, [bpm, isPlaying])
  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: 56, borderRadius: 10, display: 'block' }}
    />
  )
}

function getBpmZone(bpm) {
  if (bpm < 60) return { label: 'Bradycardia', color: '#5b9bd5' }
  if (bpm <= 100) return { label: 'Resting', color: '#6abf69' }
  if (bpm <= 140) return { label: 'Moderate', color: '#d4a843' }
  if (bpm <= 170) return { label: 'Vigorous', color: '#d97a3e' }
  return { label: 'Maximum', color: '#d94040' }
}

const P = [
  { l: 'Sleep', b: 50 },
  { l: 'Rest', b: 72 },
  { l: 'Walk', b: 110 },
  { l: 'Run', b: 155 },
  { l: 'Sprint', b: 190 },
]

export default function App() {
  const [bpm, setBpm] = useState(72)
  const [inp, setInp] = useState('72')
  const [on, setOn] = useState(false)
  const [beat, setBeat] = useState(0)
  const [showInfo, setShowInfo] = useState(false)
  const ctx = useRef(null)
  const iv = useRef(null)

  const start = useCallback(() => {
    if (!ctx.current)
      ctx.current = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.current.state === 'suspended') ctx.current.resume()
    if (iv.current) clearInterval(iv.current)
    const ms = (60 / bpm) * 1000
    const b = () => {
      createHeartbeatSound(ctx.current, ctx.current.currentTime)
      setBeat((p) => p + 1)
    }
    b()
    iv.current = setInterval(b, ms)
    setOn(true)
  }, [bpm])

  const stop = useCallback(() => {
    if (iv.current) {
      clearInterval(iv.current)
      iv.current = null
    }
    setOn(false)
  }, [])

  useEffect(() => {
    if (on) {
      if (iv.current) clearInterval(iv.current)
      iv.current = setInterval(
        () => {
          if (ctx.current) {
            createHeartbeatSound(ctx.current, ctx.current.currentTime)
            setBeat((p) => p + 1)
          }
        },
        (60 / bpm) * 1000,
      )
    }
  }, [bpm, on])

  useEffect(
    () => () => {
      if (iv.current) clearInterval(iv.current)
      if (ctx.current) ctx.current.close()
    },
    [],
  )

  const zone = getBpmZone(bpm)
  const scale = on ? 1 + Math.sin(beat * Math.PI) * 0.12 : 1
  const glow = on ? 14 + Math.sin(beat * Math.PI) * 10 : 4
  const pct = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100

  return (
    <div
      style={{
        height: '100vh',
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
        :root{--cr:#b82e3c;--cl:#e85d75;--tp:#e8dede;--tm:#6a5558;--td:#3d2e30;--sf:rgba(255,255,255,0.03);}
        *{box-sizing:border-box;margin:0;}html,body{overflow:hidden;height:100%;width:100%;}
        .grain::before{content:'';position:fixed;inset:0;z-index:100;pointer-events:none;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          background-repeat:repeat;background-size:256px;opacity:0.45;}
        @keyframes ripple{0%{transform:scale(0.85);opacity:0.3;}100%{transform:scale(1.8);opacity:0;}}
        @keyframes breathe{0%,100%{transform:scale(1);}50%{transform:scale(1.06) translate(4px,-6px);}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
        .fi{opacity:0;animation:fadeIn 0.6s ease-out forwards;}
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
        .inp{background:transparent;border:none;border-bottom:1.5px solid rgba(184,46,60,0.25);
          color:var(--tp);font-size:36px;font-family:'Cormorant Garamond',serif;font-weight:700;
          width:80px;text-align:center;padding:2px 4px;outline:none;letter-spacing:-1px;
          transition:border-color 0.3s;}
        .inp:focus{border-color:var(--cr);}
        .btn{padding:12px 52px;font-size:11px;font-family:'IBM Plex Mono',monospace;font-weight:500;
          letter-spacing:3px;text-transform:uppercase;border:1.5px solid;border-radius:50px;
          cursor:pointer;transition:all 0.35s cubic-bezier(0.22,1,0.36,1);}
        .btn:hover{transform:translateY(-1px);}
        .btn:active{transform:scale(0.98);}
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
        .pr.on{background:rgba(184,46,60,0.12);color:var(--cl);border-color:rgba(184,46,60,0.25);}
        .info-btn{background:none;border:1px solid rgba(255,255,255,0.06);border-radius:50%;
          width:28px;height:28px;color:var(--td);font-size:12px;cursor:pointer;
          font-family:'IBM Plex Mono',monospace;display:flex;align-items:center;justify-content:center;
          transition:all 0.25s;}
        .info-btn:hover{border-color:rgba(255,255,255,0.15);color:var(--tm);}
        .info-btn.open{background:rgba(184,46,60,0.1);border-color:rgba(184,46,60,0.2);color:var(--cl);}
        .overlay{position:absolute;inset:0;background:rgba(6,4,6,0.92);z-index:50;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:20px;padding:40px;backdrop-filter:blur(12px);animation:fadeIn 0.25s ease-out;}
        .stat{display:flex;flex-direction:column;align-items:center;gap:1px;}
        .sv{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:700;color:var(--tp);}
        .sl2{font-size:8px;font-family:'IBM Plex Mono',monospace;color:var(--td);letter-spacing:1.5px;text-transform:uppercase;}
      `}</style>

      {/* BG */}
      <div className="grain" style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
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
        <div className="overlay" onClick={() => setShowInfo(false)}>
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
          <HeartSVG scale={scale} glow={glow} isPlaying={on} beat={beat} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <input
                className="inp"
                value={inp}
                onChange={(e) => {
                  setInp(e.target.value)
                  const n = parseInt(e.target.value, 10)
                  if (!isNaN(n) && n >= MIN_BPM && n <= MAX_BPM) setBpm(n)
                }}
                onBlur={() => {
                  const n = parseInt(inp, 10)
                  if (isNaN(n) || n < MIN_BPM) {
                    setBpm(MIN_BPM)
                    setInp(String(MIN_BPM))
                  } else if (n > MAX_BPM) {
                    setBpm(MAX_BPM)
                    setInp(String(MAX_BPM))
                  }
                }}
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
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => {
              const v = +e.target.value
              setBpm(v)
              setInp(String(v))
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 5,
              padding: '0 1px',
            }}
          >
            {[30, 60, 100, 140, 170, 220].map((v) => (
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
          {P.map((p) => (
            <button
              key={p.l}
              className={`pr ${bpm === p.b ? 'on' : ''}`}
              onClick={() => {
                setBpm(p.b)
                setInp(String(p.b))
              }}
            >
              {p.l}
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
            className={`btn ${on ? 'st' : 'go'}`}
            onClick={on ? stop : start}
          >
            {on ? '■  Stop' : '▶  Run'}
          </button>
          <button
            className={`info-btn ${showInfo ? 'open' : ''}`}
            onClick={() => setShowInfo(!showInfo)}
          >
            i
          </button>
        </div>

        {/* EKG — compact */}
        <div className="fi" style={{ animationDelay: '0.55s', width: '100%' }}>
          <EKG bpm={bpm} isPlaying={on} />
        </div>
      </div>
    </div>
  )
}
