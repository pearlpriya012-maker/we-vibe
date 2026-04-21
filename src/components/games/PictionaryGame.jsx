'use client'
// src/components/games/PictionaryGame.jsx
// Full Pictionary game: draw, guess, score. Mobile-first.

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createGame, chooseWord, submitGuess, endRound, advanceTurn, maskWord, hintWord,
} from '@/lib/pictionaryGame'
import {
  writePictionaryGame, updatePictionaryGame, subscribePictionaryGame, deletePictionaryGame,
  addStroke, clearCanvas, subscribeCanvas,
  writePictionaryInvite, respondToPictionaryInvite, deletePictionaryInvite,
} from '@/lib/pictionaryFirestore'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PALETTE = [
  '#000000','#ffffff','#ef4444','#f97316','#eab308',
  '#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  '#92400e','#9ca3af','#f43f5e','#0ea5e9','#a3e635',
]

const BRUSH_SIZES = [3, 6, 12, 24]

const PICT_STYLES = `
  @keyframes pFadeUp  { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
  @keyframes pPop     { 0%{transform:scale(.6);opacity:0}65%{transform:scale(1.12)}100%{transform:scale(1);opacity:1} }
  @keyframes pPulse   { 0%,100%{opacity:1}50%{opacity:.55} }
  @keyframes pTick    { 0%,100%{transform:scale(1)}50%{transform:scale(1.08)} }
  @keyframes pSplatPulse { 0%,100%{transform:scale(1);opacity:var(--op,.09)} 50%{transform:scale(1.07);opacity:calc(var(--op,.09)*1.6)} }
  @keyframes pBlobDrift { 0%,100%{transform:translate(0,0) rotate(var(--br,0deg))} 50%{transform:translate(var(--bx,4px),var(--by,-8px)) rotate(calc(var(--br,0deg)+5deg))} }
  .p-fadein { animation: pFadeUp .25s ease both; }
  .p-pop    { animation: pPop .4s cubic-bezier(.34,1.56,.64,1) both; }
  .p-pulse  { animation: pPulse 1s ease-in-out infinite; }
`

// ─── Canvas helpers ────────────────────────────────────────────────────────────

function renderStroke(ctx, stroke, W, H) {
  if (!stroke?.points || stroke.points.length < 2) return
  ctx.beginPath()
  ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : (stroke.color || '#000')
  ctx.lineWidth = Math.max(1, (stroke.size || 4) * W / 800)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.moveTo(stroke.points[0].x * W, stroke.points[0].y * H)
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x * W, stroke.points[i].y * H)
  }
  ctx.stroke()
}

// ─── GameCanvas ────────────────────────────────────────────────────────────────

function GameCanvas({ remoteStrokes, pendingStrokes, isDrawer, tool, brushColor, brushSize, onStrokeComplete }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({
    isDrawing: false, currentPoints: [],
    isDrawer, tool, brushColor, brushSize, onStrokeComplete,
    remoteStrokes, pendingStrokes,
  })

  // Keep stateRef in sync with props
  stateRef.current.isDrawer      = isDrawer
  stateRef.current.tool          = tool
  stateRef.current.brushColor    = brushColor
  stateRef.current.brushSize     = brushSize
  stateRef.current.onStrokeComplete = onStrokeComplete
  stateRef.current.remoteStrokes = remoteStrokes
  stateRef.current.pendingStrokes = pendingStrokes

  const CANVAS_W = 800
  const CANVAS_H = 600

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.width = CANVAS_W; c.height = CANVAS_H
  }, [])

  function redraw() {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#f9f9f9'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    const s = stateRef.current
    const all = [...s.remoteStrokes, ...s.pendingStrokes]
    for (const stroke of all) renderStroke(ctx, stroke, CANVAS_W, CANVAS_H)
    if (s.currentPoints.length >= 2) {
      renderStroke(ctx, { tool: s.tool, color: s.brushColor, size: s.brushSize, points: s.currentPoints }, CANVAS_W, CANVAS_H)
    }
  }

  // Redraw when strokes change
  useEffect(() => { redraw() }, [remoteStrokes, pendingStrokes])

  // Native event listeners (supports passive:false for touch)
  useEffect(() => {
    const c = canvasRef.current; if (!c) return

    function getPoint(e) {
      const rect = c.getBoundingClientRect()
      const src  = e.touches ? e.touches[0] : e
      return { x: (src.clientX - rect.left) / rect.width, y: (src.clientY - rect.top) / rect.height }
    }

    function onStart(e) {
      if (!stateRef.current.isDrawer) return
      e.preventDefault()
      stateRef.current.isDrawing = true
      stateRef.current.currentPoints = [getPoint(e)]
      redraw()
    }

    function onMove(e) {
      if (!stateRef.current.isDrawing) return
      e.preventDefault()
      stateRef.current.currentPoints.push(getPoint(e))
      redraw()
    }

    function onEnd() {
      if (!stateRef.current.isDrawing) return
      stateRef.current.isDrawing = false
      if (stateRef.current.currentPoints.length >= 2) {
        stateRef.current.onStrokeComplete({
          tool: stateRef.current.tool,
          color: stateRef.current.brushColor,
          size: stateRef.current.brushSize,
          points: [...stateRef.current.currentPoints],
          id: Date.now(),
        })
      }
      stateRef.current.currentPoints = []
      redraw()
    }

    c.addEventListener('mousedown', onStart)
    c.addEventListener('mousemove', onMove)
    c.addEventListener('mouseup', onEnd)
    c.addEventListener('mouseleave', onEnd)
    c.addEventListener('touchstart', onStart, { passive: false })
    c.addEventListener('touchmove',  onMove,  { passive: false })
    c.addEventListener('touchend',   onEnd)

    return () => {
      c.removeEventListener('mousedown', onStart)
      c.removeEventListener('mousemove', onMove)
      c.removeEventListener('mouseup', onEnd)
      c.removeEventListener('mouseleave', onEnd)
      c.removeEventListener('touchstart', onStart)
      c.removeEventListener('touchmove',  onMove)
      c.removeEventListener('touchend',   onEnd)
    }
  }, []) // Only once; use stateRef for all dynamic values

  const cursor = isDrawer ? (tool === 'eraser' ? 'cell' : 'crosshair') : 'default'
  return (
    <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block', borderRadius:8, touchAction:'none', cursor }} />
  )
}

// ─── DrawingTools ──────────────────────────────────────────────────────────────

function DrawingTools({ tool, setTool, brushColor, setBrushColor, brushSize, setBrushSize, onClear }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'8px 10px' }}>
      {/* Pen / Eraser + Clear */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => setTool('pen')} title="Pen"
          style={{ flex:1, padding:'7px 0', borderRadius:8, border:'none', fontSize:'1rem',
            background: tool==='pen' ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
            boxShadow: tool==='pen' ? '0 0 0 1.5px #3b82f6' : '0 0 0 1px rgba(255,255,255,0.08)',
            cursor:'pointer', color:'#fff', transition:'all .15s' }}>
          ✏️
        </button>
        <button onClick={() => setTool('eraser')} title="Eraser"
          style={{ flex:1, padding:'7px 0', borderRadius:8, border:'none', fontSize:'1rem',
            background: tool==='eraser' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
            boxShadow: tool==='eraser' ? '0 0 0 1.5px #ef4444' : '0 0 0 1px rgba(255,255,255,0.08)',
            cursor:'pointer', color:'#fff', transition:'all .15s' }}>
          🧹
        </button>
        <button onClick={onClear} title="Clear"
          style={{ flex:1, padding:'7px 0', borderRadius:8, background:'rgba(239,68,68,0.1)',
            border:'1px solid rgba(239,68,68,0.3)', cursor:'pointer', color:'#ef4444', fontSize:'0.85rem',
            fontFamily:'Oswald', letterSpacing:'0.08em' }}>
          CLEAR
        </button>
      </div>

      {/* Brush sizes */}
      <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
        {BRUSH_SIZES.map(s => (
          <button key={s} onClick={() => setBrushSize(s)} title={`${s}px`}
            style={{ width:36, height:36, borderRadius:'50%', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              background: brushSize===s ? 'rgba(255,255,255,0.14)' : 'transparent',
              boxShadow: brushSize===s ? `0 0 0 2px ${brushColor}` : 'none', transition:'all .15s' }}>
            <div style={{ width:s*0.8+2, height:s*0.8+2, borderRadius:'50%', background:tool==='eraser'?'rgba(255,255,255,0.3)':brushColor, flexShrink:0 }} />
          </button>
        ))}
      </div>

      {/* Color palette */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:4, justifyContent:'center' }}>
        {PALETTE.map(c => (
          <button key={c} onClick={() => { setBrushColor(c); setTool('pen') }}
            style={{ width:22, height:22, borderRadius:4, background:c, border:'none', cursor:'pointer', flexShrink:0, outline:'none',
              boxShadow: brushColor===c && tool==='pen' ? `0 0 0 2.5px #fff, 0 0 0 4px ${c}` : '0 0 0 1px rgba(0,0,0,0.3)', transition:'box-shadow .1s' }} />
        ))}
      </div>
    </div>
  )
}

// ─── Timer ─────────────────────────────────────────────────────────────────────

function Timer({ roundStartedAt, turnSeconds, onExpire, isDrawer }) {
  const [secs, setSecs] = useState(turnSeconds)

  useEffect(() => {
    if (!roundStartedAt) return
    const tick = () => {
      const elapsed = (Date.now() - roundStartedAt) / 1000
      const remaining = Math.max(0, turnSeconds - elapsed)
      setSecs(Math.ceil(remaining))
      if (remaining <= 0 && isDrawer) onExpire()
    }
    tick()
    const iv = setInterval(tick, 500)
    return () => clearInterval(iv)
  }, [roundStartedAt, turnSeconds, isDrawer])

  const pct = (secs / turnSeconds) * 100
  const color = secs <= 10 ? '#ef4444' : secs <= 25 ? '#f97316' : '#22c55e'
  const anim = secs <= 10 ? 'p-pulse' : ''

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:80 }}>
      <div style={{ flex:1, height:5, borderRadius:2.5, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2.5, transition:'width .5s linear', boxShadow:`0 0 6px ${color}` }} />
      </div>
      <span className={anim} style={{ fontFamily:'Oswald', fontSize:'0.9rem', color, minWidth:28, textAlign:'right' }}>{secs}</span>
    </div>
  )
}

// ─── WordHint ──────────────────────────────────────────────────────────────────

function WordHint({ game, currentUser }) {
  const isDrawer = game.drawerUid === currentUser.uid
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!game.roundStartedAt) return
    const iv = setInterval(() => setElapsed((Date.now() - game.roundStartedAt) / 1000), 1000)
    return () => clearInterval(iv)
  }, [game.roundStartedAt])

  if (!game.currentWord) return null

  if (isDrawer) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
        <div style={{ fontFamily:'Oswald', fontSize:'0.6rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.12em' }}>DRAW THIS</div>
        <div style={{ fontFamily:'Oswald', fontSize:'1.5rem', fontWeight:800, color:'#fff', letterSpacing:'0.12em',
          background:'rgba(0,0,0,0.55)', borderRadius:10, padding:'4px 18px',
          boxShadow:'0 0 24px rgba(59,130,246,0.4)', border:'1px solid rgba(59,130,246,0.3)' }}>
          {game.currentWord.toUpperCase()}
        </div>
      </div>
    )
  }

  const alreadyGuessed = game.guessedUids?.includes(currentUser.uid)
  const hint = alreadyGuessed ? game.currentWord.toUpperCase() : hintWord(game.currentWord, elapsed, game.turnSeconds).toUpperCase()

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <div style={{ fontFamily:'Oswald', fontSize:'0.6rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.12em' }}>
        {alreadyGuessed ? 'YOU GOT IT!' : `${game.currentWord.length} LETTERS`}
      </div>
      <div style={{ fontFamily:'Oswald', fontSize:'1.4rem', fontWeight:800, letterSpacing:'0.22em',
        color: alreadyGuessed ? '#22c55e' : '#fff', lineHeight:1.2 }}>
        {hint}
      </div>
    </div>
  )
}

// ─── GuessInput ────────────────────────────────────────────────────────────────

function GuessInput({ game, currentUser, onGuess }) {
  const [val, setVal] = useState('')
  const alreadyGuessed = game.guessedUids?.includes(currentUser.uid)
  const isDrawer = game.drawerUid === currentUser.uid

  function submit(e) {
    e.preventDefault()
    if (!val.trim()) return
    onGuess(val.trim())
    setVal('')
  }

  if (isDrawer || alreadyGuessed) return null

  return (
    <form onSubmit={submit} style={{ display:'flex', gap:6, padding:'4px 0' }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Type your guess…"
        autoComplete="off"
        style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:8,
          padding:'9px 12px', fontFamily:'Oswald', fontSize:'0.82rem', color:'#fff', outline:'none',
          '::placeholder': { color:'rgba(255,255,255,0.3)' } }}
      />
      <button type="submit" style={{ padding:'9px 16px', borderRadius:8, background:'rgba(34,197,94,0.18)',
        border:'1px solid rgba(34,197,94,0.38)', color:'#22c55e', fontFamily:'Oswald', fontSize:'0.82rem',
        fontWeight:700, cursor:'pointer', letterSpacing:'0.08em' }}>
        GO
      </button>
    </form>
  )
}

// ─── ScoreStrip ────────────────────────────────────────────────────────────────

function ScoreStrip({ game, currentUser }) {
  const sorted = Object.entries(game.players).sort((a,b) => b[1].score - a[1].score)
  return (
    <div style={{ display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none', padding:'6px 8px', alignItems:'center' }}>
      {sorted.map(([uid, p], i) => {
        const isMe = uid === currentUser.uid
        const isDrawer = uid === game.drawerUid
        const guessed = game.guessedUids?.includes(uid)
        return (
          <div key={uid} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'4px 8px', borderRadius:8, flexShrink:0,
            background: isMe ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${isMe ? 'rgba(34,197,94,0.22)' : 'rgba(255,255,255,0.06)'}` }}>
            <div style={{ position:'relative' }}>
              {p.photoURL
                ? <img src={p.photoURL} alt="" style={{ width:24, height:24, borderRadius:'50%', objectFit:'cover' }} />
                : <div style={{ width:24, height:24, borderRadius:'50%', background:'linear-gradient(135deg,#C0392B,#1A5276)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Oswald', fontWeight:700, fontSize:'0.62rem', color:'#fff' }}>{(p.displayName||'?')[0].toUpperCase()}</div>
              }
              {isDrawer && <span style={{ position:'absolute', top:-6, right:-6, fontSize:'0.65rem' }}>✏️</span>}
              {guessed && !isDrawer && <span style={{ position:'absolute', top:-6, right:-6, fontSize:'0.6rem' }}>✅</span>}
            </div>
            <div style={{ fontFamily:'Oswald', fontSize:'0.6rem', color: isMe ? '#22c55e' : '#fff', maxWidth:52, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{isMe ? 'You' : p.displayName}</div>
            <div style={{ fontFamily:'Oswald', fontSize:'0.7rem', color:'gold' }}>{p.score}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── EventLog ──────────────────────────────────────────────────────────────────

function EventLog({ log }) {
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [log])
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'4px 8px', display:'flex', flexDirection:'column', gap:3, scrollbarWidth:'none' }}>
      {log.slice(-15).map((entry, i) => (
        <div key={i} className="p-fadein" style={{ fontSize:'0.68rem', fontFamily:'Oswald', color: entry.includes('✅') ? '#22c55e' : entry.includes('✗') ? 'rgba(255,107,107,0.8)' : 'rgba(255,255,255,0.45)', lineHeight:1.4 }}>
          {entry}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

// ─── Lobby ─────────────────────────────────────────────────────────────────────

function InviteWaitingRoom({ invite, roomParticipants, currentUser, roomId, onStartGame, onCancel }) {
  const isHost = invite.initiatorUid === currentUser.uid
  const [secs, setSecs] = useState(Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 1000)))

  useEffect(() => {
    const iv = setInterval(() => {
      const r = Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 1000))
      setSecs(r); if (r <= 0) clearInterval(iv)
    }, 500)
    return () => clearInterval(iv)
  }, [invite.expiresAt])

  useEffect(() => {
    if (!isHost) return
    const remaining = invite.expiresAt - Date.now()
    if (remaining <= 0) { handleExpired(); return }
    const t = setTimeout(handleExpired, remaining)
    return () => clearTimeout(t)
  }, [invite.expiresAt])

  function handleExpired() {
    const accepted = Object.entries(invite.responses || {}).filter(([,r])=>r==='accepted').map(([uid])=>uid)
    if (accepted.length >= 2) onStartGame(accepted)
    else deletePictionaryInvite(roomId)
  }

  const responses = invite.responses || {}
  const acceptedUids = Object.entries(responses).filter(([,r])=>r==='accepted').map(([uid])=>uid)
  const canStart = acceptedUids.length >= 2
  const pct = Math.max(0, (secs / 45) * 100)
  const barColor = secs <= 10 ? '#e74c3c' : secs <= 20 ? '#f39c12' : '#00ff88'

  return (
    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 20px', gap:20 }}>
      <div style={{ fontFamily:'Oswald', fontSize:'2.4rem', fontWeight:800, letterSpacing:'0.22em', color:'#fff', textShadow:'0 0 30px rgba(99,102,241,0.6)' }}>🎨 PICTIONARY</div>

      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ fontFamily:'Oswald', fontSize:'0.72rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.1em', marginBottom:6 }}>
          {isHost ? 'Waiting for players to respond…' : `${invite.initiatorName} invited you to play`}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, height:6, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, background:barColor, borderRadius:3, transition:'width .5s linear, background .5s' }} />
          </div>
          <span style={{ fontFamily:'Oswald', fontSize:'0.8rem', color:barColor, minWidth:30, textAlign:'right' }}>{secs}s</span>
        </div>
      </div>

      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ fontFamily:'Oswald', fontSize:'0.65rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.14em', marginBottom:10 }}>RESPONSES ({acceptedUids.length} accepted)</div>
        {roomParticipants.map(p => {
          const resp = responses[p.uid] || 'pending'
          const color = resp==='accepted'?'#00ff88':resp==='declined'?'#ff6b6b':'rgba(255,255,255,0.35)'
          const icon  = resp==='accepted'?'✅':resp==='declined'?'❌':'⏳'
          return (
            <div key={p.uid} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderRadius:10, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', marginBottom:6 }}>
              {p.photoURL ? <img src={p.photoURL} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} /> : <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Oswald', fontWeight:700, fontSize:'0.75rem', color:'#fff' }}>{(p.displayName||'?')[0].toUpperCase()}</div>}
              <span style={{ fontFamily:'Oswald', fontSize:'0.82rem', color: p.uid===currentUser.uid?'#a5b4fc':'#fff', flex:1 }}>{p.displayName}</span>
              {p.uid===invite.initiatorUid && <span style={{ fontFamily:'Oswald', fontSize:'0.58rem', color:'gold', marginRight:4 }}>HOST</span>}
              <span style={{ color }}>{icon}</span>
            </div>
          )
        })}
      </div>

      <div style={{ display:'flex', gap:12, paddingBottom:16 }}>
        {isHost ? (
          <>
            <button onClick={onCancel} style={{ padding:'11px 22px', borderRadius:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.4)', fontFamily:'Oswald', fontSize:'0.82rem', cursor:'pointer' }}>Cancel</button>
            <button onClick={() => onStartGame(acceptedUids)} disabled={!canStart}
              style={{ padding:'11px 32px', borderRadius:10, border:'none', fontFamily:'Oswald', fontSize:'0.9rem', fontWeight:700, letterSpacing:'0.12em', cursor:canStart?'pointer':'not-allowed',
                background: canStart?'linear-gradient(135deg,#6366f1,#8b5cf6)':'rgba(255,255,255,0.05)',
                color: canStart?'#fff':'rgba(255,255,255,0.3)', opacity: canStart?1:0.5 }}>
              Start ({acceptedUids.length})
            </button>
          </>
        ) : (
          <div style={{ fontFamily:'Oswald', fontSize:'0.78rem', color:'rgba(255,255,255,0.4)', textAlign:'center' }}>
            {responses[currentUser.uid]==='accepted' ? '✅ You accepted — waiting for host' : '❌ You declined'}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Lobby ─────────────────────────────────────────────────────────────────────

function Lobby({ roomParticipants, currentUser, roomId, onClose }) {
  const [totalRounds, setTotalRounds] = useState(3)
  const [turnSeconds, setTurnSeconds] = useState(80)
  const canStart = roomParticipants.length >= 2

  async function handleStart() {
    const players = roomParticipants.map(p => ({ uid: p.uid, displayName: p.displayName, photoURL: p.photoURL || '' }))
    const responses = {}
    for (const p of roomParticipants) responses[p.uid] = p.uid === currentUser.uid ? 'accepted' : 'pending'
    await writePictionaryInvite(roomId, {
      initiatorUid: currentUser.uid,
      initiatorName: currentUser.displayName || 'Someone',
      initiatorPhoto: currentUser.photoURL || '',
      gameName: 'Pictionary',
      settings: { totalRounds, turnSeconds },
      sentAt: Date.now(),
      expiresAt: Date.now() + 45000,
      responses,
    })
  }

  return (
    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', alignItems:'center', gap:22, padding:'28px 20px' }}>
      <div style={{ fontFamily:'Oswald', fontSize:'2.8rem', fontWeight:800, letterSpacing:'0.24em', color:'#fff', textShadow:'0 0 30px rgba(99,102,241,0.6)' }}>🎨 PICTIONARY</div>

      {/* Players */}
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ fontFamily:'Oswald', fontSize:'0.68rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.14em', marginBottom:10 }}>PLAYERS ({roomParticipants.length})</div>
        {roomParticipants.map(p => (
          <div key={p.uid} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', marginBottom:6 }}>
            {p.photoURL ? <img src={p.photoURL} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} /> : <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Oswald', fontWeight:700, fontSize:'0.75rem', color:'#fff' }}>{(p.displayName||'?')[0].toUpperCase()}</div>}
            <span style={{ fontFamily:'Oswald', fontSize:'0.82rem', color:'#fff', flex:1 }}>{p.displayName}</span>
            {p.uid === currentUser.uid && <span style={{ fontSize:'0.6rem', color:'#22c55e', letterSpacing:'0.06em' }}>YOU</span>}
          </div>
        ))}
      </div>

      {/* Settings */}
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ fontFamily:'Oswald', fontSize:'0.68rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.14em', marginBottom:10 }}>SETTINGS</div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', marginBottom:8 }}>
          <span style={{ fontFamily:'Oswald', fontSize:'0.82rem', color:'#fff' }}>Rounds</span>
          <div style={{ display:'flex', gap:6 }}>
            {[2,3,5].map(n => (
              <button key={n} onClick={() => setTotalRounds(n)} style={{ width:32, height:28, borderRadius:6, border:'none', fontFamily:'Oswald', fontSize:'0.78rem', cursor:'pointer',
                background: totalRounds===n ? '#6366f1' : 'rgba(255,255,255,0.07)', color: totalRounds===n ? '#fff' : 'rgba(255,255,255,0.5)' }}>{n}</button>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontFamily:'Oswald', fontSize:'0.82rem', color:'#fff' }}>Time per turn</span>
          <div style={{ display:'flex', gap:6 }}>
            {[60,80,120].map(s => (
              <button key={s} onClick={() => setTurnSeconds(s)} style={{ width:36, height:28, borderRadius:6, border:'none', fontFamily:'Oswald', fontSize:'0.72rem', cursor:'pointer',
                background: turnSeconds===s ? '#6366f1' : 'rgba(255,255,255,0.07)', color: turnSeconds===s ? '#fff' : 'rgba(255,255,255,0.5)' }}>{s}s</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:12 }}>
        <button onClick={onClose} style={{ padding:'11px 24px', borderRadius:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.5)', fontFamily:'Oswald', fontSize:'0.85rem', cursor:'pointer' }}>Cancel</button>
        <button onClick={handleStart} disabled={!canStart} style={{ padding:'11px 42px', borderRadius:10, border:'none',
          background: canStart ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.05)',
          color: canStart ? '#fff' : 'rgba(255,255,255,0.25)',
          fontFamily:'Oswald', fontSize:'0.92rem', fontWeight:700, letterSpacing:'0.12em',
          cursor: canStart ? 'pointer' : 'not-allowed', boxShadow: canStart ? '0 0 24px rgba(99,102,241,0.4)' : 'none' }}>
          � INVITE PLAYERS
        </button>
      </div>
      {!canStart && <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.35)' }}>Need at least 2 players</div>}
    </div>
  )
}

// ─── WordChoiceScreen ──────────────────────────────────────────────────────────

function WordChoiceScreen({ game, currentUser, roomId }) {
  const isDrawer = game.drawerUid === currentUser.uid
  const [choosing, setChoosing] = useState(false)

  async function pickWord(word) {
    setChoosing(true)
    await writePictionaryGame(roomId, chooseWord(game, currentUser.uid, word))
  }

  if (!isDrawer) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, padding:24 }}>
        <div style={{ fontSize:'3rem', animation:'pPulse 1.5s ease-in-out infinite' }}>🎨</div>
        <div style={{ fontFamily:'Oswald', fontSize:'1.2rem', color:'#fff', letterSpacing:'0.1em', textAlign:'center' }}>
          {game.players[game.drawerUid]?.displayName} is choosing a word…
        </div>
        <div style={{ fontFamily:'Oswald', fontSize:'0.72rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.1em' }}>
          ROUND {game.round} / {game.totalRounds}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:22, padding:24 }}>
      <div style={{ fontFamily:'Oswald', fontSize:'1rem', color:'rgba(255,255,255,0.5)', letterSpacing:'0.14em' }}>ROUND {game.round} / {game.totalRounds} — PICK YOUR WORD</div>
      <div style={{ display:'flex', flexDirection:'column', gap:12, width:'100%', maxWidth:340 }}>
        {(game.wordOptions || []).map(w => (
          <button key={w} onClick={() => !choosing && pickWord(w)} disabled={choosing}
            style={{ padding:'18px 24px', borderRadius:14, border:'none', cursor: choosing ? 'not-allowed' : 'pointer',
              background:'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(139,92,246,0.12))',
              boxShadow:'0 0 0 1.5px rgba(99,102,241,0.3)', color:'#fff', fontFamily:'Oswald',
              fontSize:'1.1rem', fontWeight:700, letterSpacing:'0.14em', transition:'all .18s',
              textTransform:'uppercase' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(99,102,241,0.38),rgba(139,92,246,0.28))'; e.currentTarget.style.transform='scale(1.03)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(139,92,246,0.12))'; e.currentTarget.style.transform='scale(1)' }}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── RoundEndScreen ────────────────────────────────────────────────────────────

function RoundEndScreen({ game, currentUser }) {
  const [count, setCount] = useState(5)
  useEffect(() => {
    const iv = setInterval(() => setCount(c => Math.max(0, c-1)), 1000)
    return () => clearInterval(iv)
  }, [])

  const myPoints = game.guessedUids?.includes(currentUser.uid) ? 'You guessed it!' : currentUser.uid === game.drawerUid ? null : "You didn't get it"
  const drawerBonus = game.guessedUids.length * 10

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, padding:24 }}>
      <div className="p-pop" style={{ fontSize:'0.72rem', fontFamily:'Oswald', color:'rgba(255,255,255,0.4)', letterSpacing:'0.15em' }}>THE WORD WAS</div>
      <div className="p-pop" style={{ fontFamily:'Oswald', fontSize:'2.6rem', fontWeight:800, color:'#fff', letterSpacing:'0.2em',
        textShadow:'0 0 40px rgba(99,102,241,0.6)', animation:'pPop .5s cubic-bezier(.34,1.56,.64,1) both' }}>
        {game.currentWord?.toUpperCase()}
      </div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
        <div style={{ padding:'5px 14px', borderRadius:8, background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', fontFamily:'Oswald', fontSize:'0.75rem', color:'rgba(255,255,255,0.7)' }}>
          {game.guessedUids.length} / {Object.keys(game.players).length - 1} guessed
        </div>
        {drawerBonus > 0 && <div style={{ padding:'5px 14px', borderRadius:8, background:'rgba(234,179,8,0.1)', border:'1px solid rgba(234,179,8,0.28)', fontFamily:'Oswald', fontSize:'0.75rem', color:'#eab308' }}>
          Drawer +{drawerBonus} pts
        </div>}
        {myPoints && <div style={{ padding:'5px 14px', borderRadius:8, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.22)', fontFamily:'Oswald', fontSize:'0.75rem', color:'#22c55e' }}>{myPoints}</div>}
      </div>
      <div style={{ fontFamily:'Oswald', fontSize:'0.72rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.1em' }}>
        Next round in {count}…
      </div>
      <ScoreStrip game={game} currentUser={currentUser} />
    </div>
  )
}

// ─── GameOverScreen ────────────────────────────────────────────────────────────

function GameOverScreen({ game, currentUser, onPlayAgain, onClose }) {
  const sorted = Object.entries(game.players).sort((a,b) => b[1].score - a[1].score)
  const winner = sorted[0]
  const isWinner = winner[0] === currentUser.uid

  return (
    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', alignItems:'center', gap:18, padding:24 }}>
      <div className="p-pop" style={{ fontSize:'4.5rem', lineHeight:1 }}>{isWinner ? '🏆' : '🎨'}</div>
      <div style={{ fontFamily:'Oswald', fontSize:'1.8rem', fontWeight:800, letterSpacing:'0.2em',
        background: isWinner ? 'linear-gradient(135deg,gold,#f97316)' : 'none',
        color: isWinner ? 'transparent' : 'rgba(255,255,255,0.7)',
        WebkitBackgroundClip: isWinner ? 'text' : undefined, WebkitTextFillColor: isWinner ? 'transparent' : undefined }}>
        {isWinner ? 'YOU WIN! 🎉' : `${winner[1].displayName} WINS!`}
      </div>

      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ fontFamily:'Oswald', fontSize:'0.65rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.14em', marginBottom:10 }}>FINAL SCORES</div>
        {sorted.map(([uid, p], i) => (
          <div key={uid} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, marginBottom:6,
            background: i===0 ? 'rgba(234,179,8,0.07)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${i===0 ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
            <span style={{ fontFamily:'Oswald', fontSize:'0.9rem', color: i===0 ? 'gold' : 'rgba(255,255,255,0.4)', minWidth:20 }}>#{i+1}</span>
            {p.photoURL ? <img src={p.photoURL} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} /> : <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Oswald', fontWeight:700, fontSize:'0.72rem', color:'#fff' }}>{(p.displayName||'?')[0].toUpperCase()}</div>}
            <span style={{ fontFamily:'Oswald', fontSize:'0.85rem', color: uid===currentUser.uid ? '#22c55e' : '#fff', flex:1 }}>{uid===currentUser.uid ? 'You' : p.displayName}</span>
            <span style={{ fontFamily:'Oswald', fontSize:'0.92rem', color: i===0 ? 'gold' : 'rgba(255,255,255,0.6)', fontWeight:700 }}>{p.score} pts</span>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:12 }}>
        <button onClick={onClose} style={{ padding:'11px 24px', borderRadius:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.5)', fontFamily:'Oswald', fontSize:'0.82rem', cursor:'pointer' }}>Close</button>
        <button onClick={onPlayAgain} style={{ padding:'11px 38px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontFamily:'Oswald', fontSize:'0.9rem', fontWeight:700, letterSpacing:'0.12em', cursor:'pointer', boxShadow:'0 0 24px rgba(99,102,241,0.4)' }}>
          Play Again
        </button>
      </div>
    </div>
  )
}

// ─── Artist Studio Background ─────────────────────────────────────────────────

function PictBg() {
  const splatters = [
    { top:'8%',   left:'6%',   size:48, color:'rgba(239,68,68,',   op:0.10, br:'-12deg', bx:'3px',  by:'-7px',  d:'5.2s', delay:'0s'   },
    { top:'14%',  right:'7%',  size:36, color:'rgba(59,130,246,',  op:0.09, br:'18deg',  bx:'-4px', by:'-9px',  d:'6.1s', delay:'0.8s' },
    { top:'60%',  left:'4%',   size:60, color:'rgba(234,179,8,',   op:0.08, br:'5deg',   bx:'6px',  by:'-6px',  d:'4.8s', delay:'1.3s' },
    { top:'72%',  right:'5%',  size:44, color:'rgba(34,197,94,',   op:0.09, br:'-20deg', bx:'-5px', by:'-10px', d:'5.5s', delay:'0.4s' },
    { top:'38%',  left:'3%',   size:30, color:'rgba(139,92,246,',  op:0.11, br:'30deg',  bx:'4px',  by:'-5px',  d:'7.0s', delay:'2.1s' },
    { top:'45%',  right:'4%',  size:52, color:'rgba(236,72,153,',  op:0.08, br:'-8deg',  bx:'-3px', by:'-8px',  d:'6.3s', delay:'1.6s' },
    { top:'85%',  left:'12%',  size:38, color:'rgba(6,182,212,',   op:0.09, br:'15deg',  bx:'5px',  by:'-7px',  d:'5.8s', delay:'0.9s' },
    { top:'25%',  left:'45%',  size:22, color:'rgba(239,68,68,',   op:0.07, br:'-25deg', bx:'2px',  by:'-4px',  d:'4.5s', delay:'3.0s' },
  ]
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:0 }}>
      {/* Warm dark studio base */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 130% 80% at 38% 28%, #2c1409 0%, #160906 40%, #070408 100%)' }} />
      {/* Warm amber overhead spotlight */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(255,145,40,0.18) 0%, rgba(200,90,20,0.06) 40%, transparent 65%)' }} />
      {/* Cool blue-violet rim from right */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 45% 80% at 105% 50%, rgba(60,60,200,0.07) 0%, transparent 55%)' }} />
      {/* Warm floor bounce from bottom */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 80% 30% at 50% 110%, rgba(180,90,20,0.1) 0%, transparent 55%)' }} />
      {/* Edge vignette */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,0,0.78) 100%)' }} />
      {/* Canvas linen weave */}
      <div style={{ position:'absolute', inset:0,
        backgroundImage:'repeating-linear-gradient(45deg, rgba(255,255,255,0.007) 0px, rgba(255,255,255,0.007) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.005) 0px, rgba(255,255,255,0.005) 1px, transparent 1px, transparent 6px)' }} />
      {/* Paint splatters */}
      {splatters.map((s,i) => (
        <div key={i} style={{
          position:'absolute', top:s.top, left:s.left, right:s.right,
          width:s.size, height:s.size * 0.75,
          borderRadius:'50% 40% 55% 45% / 50% 50% 45% 55%',
          background:`${s.color}${s.op})`,
          filter:'blur(5px)',
          '--op': s.op, '--br': s.br, '--bx': s.bx, '--by': s.by,
          animation:`pBlobDrift ${s.d} ease-in-out ${s.delay} infinite, pSplatPulse ${s.d} ease-in-out ${s.delay} infinite`,
        }} />
      ))}
      {/* Paint streak – horizontal brush strokes */}
      {[
        { top:'18%', left:'2%',  w:'18%', h:2,  rot:'-6deg',  color:'rgba(239,68,68,0.08)' },
        { top:'55%', right:'3%', w:'14%', h:2,  rot:'12deg',  color:'rgba(59,130,246,0.07)' },
        { top:'78%', left:'8%',  w:'20%', h:2,  rot:'-3deg',  color:'rgba(234,179,8,0.07)' },
      ].map((streak,i) => (
        <div key={i} style={{
          position:'absolute', top:streak.top, left:streak.left, right:streak.right,
          width:streak.w, height:streak.h,
          transform:`rotate(${streak.rot})`,
          background:streak.color,
          filter:'blur(2px)',
          borderRadius:2,
        }} />
      ))}
      {/* Easel vertical */}
      <div style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', width:1, height:'35%', background:'linear-gradient(to top, rgba(150,100,50,0.15), transparent)' }} />
    </div>
  )
}

// ─── Main PictionaryGame ───────────────────────────────────────────────────────

export default function PictionaryGame({ roomId, roomParticipants, currentUser, invite, onClose }) {
  const [game, setGame]               = useState(null)
  const [canvasData, setCanvasData]   = useState({ strokes: {}, clearedAt: 0 })
  const [pendingStrokes, setPending]  = useState([])
  const [tool, setTool]               = useState('pen')
  const [brushColor, setBrushColor]   = useState('#000000')
  const [brushSize, setBrushSize]     = useState(6)
  const gameRef = useRef(null)

  useEffect(() => {
    const u1 = subscribePictionaryGame(roomId, s => { setGame(s); gameRef.current = s })
    const u2 = subscribeCanvas(roomId, setCanvasData)
    return () => { u1(); u2() }
  }, [roomId])

  // Clear pending strokes when remote canvas confirms them
  useEffect(() => {
    const ids = new Set(Object.keys(canvasData.strokes || {}).map(Number))
    setPending(p => p.filter(s => !ids.has(s.id)))
  }, [canvasData])

  // ── Drawing actions ──

  async function handleStrokeComplete(stroke) {
    setPending(p => [...p, stroke])
    await addStroke(roomId, stroke)
  }

  async function handleClearCanvas() {
    setPending([])
    await clearCanvas(roomId)
  }

  // ── Timer expiry (drawer only) ──

  const [expiredOnce, setExpiredOnce] = useState(false)
  useEffect(() => { setExpiredOnce(false) }, [game?.roundStartedAt])

  async function handleTimerExpire() {
    if (expiredOnce) return
    const g = gameRef.current
    if (!g || g.status !== 'drawing' || g.drawerUid !== currentUser.uid) return
    setExpiredOnce(true)
    await writePictionaryGame(roomId, endRound(g))
  }

  // ── Round end → advance (drawer) ──

  useEffect(() => {
    const g = game
    if (!g || g.status !== 'roundEnd' || g.drawerUid !== currentUser.uid) return
    const t = setTimeout(async () => {
      const next = advanceTurn(g)
      if (next.status !== 'finished') await clearCanvas(roomId)
      await writePictionaryGame(roomId, next)
    }, 5000)
    return () => clearTimeout(t)
  }, [game?.status, game?.drawerUid, game?.roundId])

  // ── Guess submission ──

  async function handleGuess(guess) {
    const g = gameRef.current; if (!g) return
    const next = submitGuess(g, currentUser.uid, guess)
    if (next !== g) await writePictionaryGame(roomId, next)
  }

  // ── Play again / close ──

  // ── Invite actions ──

  async function handleStartGame(acceptedUids) {
    const players = roomParticipants
      .filter(p => acceptedUids.includes(p.uid))
      .map(p => ({ uid: p.uid, displayName: p.displayName, photoURL: p.photoURL || '' }))
    if (players.length < 2) return
    const inv = invite
    const settings = inv?.settings || {}
    await writePictionaryGame(roomId, createGame(players, { totalRounds: settings.totalRounds || 3, turnSeconds: settings.turnSeconds || 80 }))
    await deletePictionaryInvite(roomId)
  }

  async function handleCancelInvite() {
    await deletePictionaryInvite(roomId)
  }

  async function handlePlayAgain() {
    const players = Object.entries(game.players).map(([uid, p]) => ({ uid, ...p }))
    await clearCanvas(roomId)
    await writePictionaryGame(roomId, createGame(players, { totalRounds: game.totalRounds, turnSeconds: game.turnSeconds }))
  }

  async function handleClose() {
    await deletePictionaryGame(roomId)
    onClose()
  }

  // ── Derived values ──

  const remoteStrokes = Object.values(canvasData.strokes || {}).sort((a,b) => a.id - b.id)
  const isDrawer      = game?.drawerUid === currentUser.uid

  // ── Render ──

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#070408', position:'relative', isolation:'isolate' }}>
      <style>{PICT_STYLES}</style>
      <PictBg />
      {/* Content layer sits above the atmospheric background */}
      <div style={{ position:'relative', zIndex:1, flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* No game → invite waiting room or lobby */}
      {!game && invite && (
        <InviteWaitingRoom invite={invite} roomParticipants={roomParticipants} currentUser={currentUser} roomId={roomId} onStartGame={handleStartGame} onCancel={handleCancelInvite} />
      )}
      {!game && !invite && (
        <Lobby roomParticipants={roomParticipants} currentUser={currentUser} roomId={roomId} onClose={onClose} />
      )}

      {/* Choosing word */}
      {game?.status === 'choosingWord' && (
        <WordChoiceScreen game={game} currentUser={currentUser} roomId={roomId} />
      )}

      {/* Game over */}
      {game?.status === 'finished' && (
        <GameOverScreen game={game} currentUser={currentUser} onPlayAgain={handlePlayAgain} onClose={handleClose} />
      )}

      {/* Round end */}
      {game?.status === 'roundEnd' && (
        <RoundEndScreen game={game} currentUser={currentUser} />
      )}

      {/* Drawing round */}
      {game?.status === 'drawing' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'rgba(8,8,20,0.98)', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontFamily:'Oswald', fontSize:'0.62rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.12em' }}>
              Round {game.round}/{game.totalRounds}
            </div>
            <WordHint game={game} currentUser={currentUser} />
            <Timer roundStartedAt={game.roundStartedAt} turnSeconds={game.turnSeconds} onExpire={handleTimerExpire} isDrawer={isDrawer} />
          </div>

          {/* Canvas */}
          <div style={{ flex:1, position:'relative', margin:'8px', minHeight:0, overflow:'hidden', borderRadius:10, boxShadow:'0 4px 32px rgba(0,0,0,0.55)' }}>
            <GameCanvas
              remoteStrokes={remoteStrokes}
              pendingStrokes={pendingStrokes}
              isDrawer={isDrawer}
              tool={tool}
              brushColor={brushColor}
              brushSize={brushSize}
              onStrokeComplete={handleStrokeComplete}
            />
            {!isDrawer && (
              <div style={{ position:'absolute', bottom:8, right:8, fontFamily:'Oswald', fontSize:'0.6rem', color:'rgba(0,0,0,0.38)', background:'rgba(255,255,255,0.6)', padding:'2px 8px', borderRadius:4 }}>
                Guessing mode
              </div>
            )}
          </div>

          {/* Bottom panel */}
          <div style={{ flexShrink:0, background:'rgba(8,8,20,0.98)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {isDrawer
              ? <DrawingTools tool={tool} setTool={setTool} brushColor={brushColor} setBrushColor={setBrushColor} brushSize={brushSize} setBrushSize={setBrushSize} onClear={handleClearCanvas} />
              : (
                <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
                  <GuessInput game={game} currentUser={currentUser} onGuess={handleGuess} />
                  <EventLog log={game.log} />
                </div>
              )
            }
            <ScoreStrip game={game} currentUser={currentUser} />
          </div>

        </div>
      )}
      </div>
    </div>
  )
}
