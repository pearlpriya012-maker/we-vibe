'use client'
// src/components/games/WordChainGame.jsx
// Word Chain: each word must start with the last letter of the previous one.

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createGame, startTurn, submitWord, expireTurn, validateWord,
} from '@/lib/wordChainGame'
import {
  writeWordChainGame, subscribeWordChainGame, deleteWordChainGame,
  writeWordChainInvite, respondToWordChainInvite, deleteWordChainInvite,
} from '@/lib/wordChainFirestore'

// ─── Styles ───────────────────────────────────────────────────────────────────

const WC_STYLES = `
  @keyframes wcFadeUp    { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
  @keyframes wcPop       { 0%{opacity:0;transform:scale(.7)}60%{transform:scale(1.1)}100%{opacity:1;transform:scale(1)} }
  @keyframes wcPulse     { 0%,100%{opacity:1}50%{opacity:.45} }
  @keyframes wcShake     { 0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)} }
  @keyframes wcLetterPop { 0%{opacity:0;transform:scale(2)}100%{opacity:1;transform:scale(1)} }
  @keyframes wcLetFloat  { 0%,100%{transform:translateY(0) rotate(var(--lr)) scale(1);opacity:var(--lop,.07)} 50%{transform:translateY(-14px) rotate(calc(var(--lr) + 7deg)) scale(1.03);opacity:calc(var(--lop,.07)*2.2)} }
  @keyframes wcGlimmer   { 0%,100%{opacity:0.18;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.3)} }
  .wc-fadein   { animation: wcFadeUp .22s ease both; }
  .wc-pop      { animation: wcPop .38s cubic-bezier(.34,1.56,.64,1) both; }
  .wc-pulse    { animation: wcPulse 1s ease-in-out infinite; }
  .wc-shake    { animation: wcShake .4s ease both; }
  .wc-letter   { animation: wcLetterPop .4s cubic-bezier(.34,1.56,.64,1) both; }
`

// ─── Timer bar ────────────────────────────────────────────────────────────────

function TimerBar({ turnStartedAt, turnSeconds, isMyTurn, onExpire }) {
  const [secs, setSecs] = useState(turnSeconds)
  const firedRef = useRef(false)

  useEffect(() => {
    firedRef.current = false
    if (!turnStartedAt) return
    const tick = () => {
      const elapsed = (Date.now() - turnStartedAt) / 1000
      const remaining = Math.max(0, turnSeconds - elapsed)
      setSecs(Math.ceil(remaining))
      if (remaining <= 0 && isMyTurn && !firedRef.current) {
        firedRef.current = true
        onExpire()
      }
    }
    tick()
    const iv = setInterval(tick, 300)
    return () => clearInterval(iv)
  }, [turnStartedAt, turnSeconds, isMyTurn])

  const pct = Math.max(0, (secs / turnSeconds) * 100)
  const color = secs <= 5 ? '#ef4444' : secs <= 10 ? '#f97316' : '#22c55e'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2.5, transition: 'width .3s linear', boxShadow: `0 0 8px ${color}` }} />
      </div>
      <span style={{ fontFamily: 'Oswald', fontSize: '0.92rem', color, minWidth: 26, textAlign: 'right' }}>{secs}</span>
    </div>
  )
}

// ─── Player strip ─────────────────────────────────────────────────────────────

function PlayerStrip({ game, currentUser }) {
  const sorted = Object.entries(game.players).sort((a, b) => b[1].score - a[1].score)
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '6px 10px', alignItems: 'center' }}>
      {sorted.map(([uid, p]) => {
        const isMe = uid === currentUser.uid
        const isCurrent = uid === game.currentUid
        const strikes = p.strikes
        return (
          <div key={uid} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '5px 10px', borderRadius: 10, flexShrink: 0, minWidth: 62,
            background: p.eliminated ? 'rgba(0,0,0,0.3)' : isCurrent ? 'rgba(34,197,94,0.08)' : isMe ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.025)',
            border: `1.5px solid ${p.eliminated ? 'rgba(255,255,255,0.04)' : isCurrent ? 'rgba(34,197,94,0.35)' : isMe ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.07)'}`,
            opacity: p.eliminated ? 0.38 : 1, transition: 'all .3s',
          }}>
            <div style={{ position: 'relative' }}>
              {p.photoURL
                ? <img src={p.photoURL} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', filter: p.eliminated ? 'grayscale(1)' : 'none' }} />
                : <div style={{ width: 26, height: 26, borderRadius: '50%', background: p.eliminated ? '#333' : 'linear-gradient(135deg,#10b981,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.65rem', color: '#fff' }}>{(p.displayName || '?')[0].toUpperCase()}</div>
              }
              {isCurrent && !p.eliminated && <span style={{ position: 'absolute', top: -7, right: -7, fontSize: '0.6rem' }}>✏️</span>}
              {p.eliminated && <span style={{ position: 'absolute', top: -6, right: -6, fontSize: '0.65rem' }}>💀</span>}
            </div>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.58rem', color: isMe ? '#a5b4fc' : p.eliminated ? 'rgba(255,255,255,0.25)' : '#fff', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isMe ? 'You' : p.displayName}
            </div>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'gold' }}>{p.score}</div>
            <div style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < strikes ? '#ef4444' : 'rgba(255,255,255,0.12)', boxShadow: i < strikes ? '0 0 5px #ef4444' : 'none' }} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Word chain display ───────────────────────────────────────────────────────

function WordChainDisplay({ game }) {
  const recent = [...game.usedWords].reverse().slice(0, 8)
  const lastLetter = game.lastLetter

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 18, padding: '12px 16px', position: 'relative' }}>

      {/* Required letter badge */}
      {lastLetter && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontFamily: 'Oswald', fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em' }}>NEXT WORD STARTS WITH</div>
          <div key={lastLetter} className="wc-letter" style={{
            fontFamily: 'Oswald', fontWeight: 900, fontSize: '5rem', lineHeight: 1,
            color: '#fff',
            textShadow: '0 0 40px rgba(16,185,129,0.7), 0 0 80px rgba(16,185,129,0.3)',
            letterSpacing: '0.04em',
          }}>
            {lastLetter}
          </div>
        </div>
      )}

      {/* Last word */}
      {game.lastWord && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em' }}>LAST WORD</div>
          <div key={game.lastWord} className="wc-pop" style={{
            fontFamily: 'Oswald', fontWeight: 700, fontSize: '2rem', letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.88)',
          }}>
            {game.lastWord.toUpperCase().slice(0, -1)}
            <span style={{ color: '#10b981', textShadow: '0 0 16px rgba(16,185,129,0.8)' }}>
              {game.lastWord.slice(-1).toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Chain trail */}
      {recent.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 340 }}>
          {recent.slice(1).map((w, i) => (
            <span key={i} style={{ fontFamily: 'Oswald', fontSize: '0.6rem', color: 'rgba(255,255,255,0.22)', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
              {w.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {/* No words yet */}
      {!game.lastWord && (
        <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textAlign: 'center' }}>
          Type any word to begin the chain!
        </div>
      )}
    </div>
  )
}

// ─── Word input ───────────────────────────────────────────────────────────────

function WordInput({ game, currentUser, onSubmit }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(null)
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)
  const isMyTurn = game.currentUid === currentUser.uid

  useEffect(() => {
    if (isMyTurn) { setVal(''); inputRef.current?.focus() }
  }, [game.currentUid])

  function handleSubmit(e) {
    e.preventDefault()
    const w = val.trim().toLowerCase()
    const error = validateWord(game, w)
    if (error) {
      setErr(error)
      setShake(true)
      setTimeout(() => setShake(false), 450)
      return
    }
    setErr(null)
    onSubmit(w)
    setVal('')
  }

  if (!isMyTurn) return null

  return (
    <form onSubmit={handleSubmit} style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {err && (
        <div className="wc-fadein" style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: '#ef4444', textAlign: 'center', letterSpacing: '0.06em' }}>{err}</div>
      )}
      <div className={shake ? 'wc-shake' : ''} style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={val}
          onChange={e => { setVal(e.target.value.replace(/[^a-zA-Z]/g, '')); setErr(null) }}
          placeholder={game.lastLetter ? `Word starting with "${game.lastLetter}"…` : 'Type any word…'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 10, padding: '11px 14px', fontFamily: 'Oswald', fontSize: '1rem',
            color: '#fff', outline: 'none', letterSpacing: '0.06em', textTransform: 'lowercase',
          }}
        />
        <button type="submit" style={{
          padding: '11px 20px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg,#10b981,#3b82f6)',
          color: '#fff', fontFamily: 'Oswald', fontSize: '0.9rem', fontWeight: 700,
          letterSpacing: '0.1em', cursor: 'pointer', boxShadow: '0 0 18px rgba(16,185,129,0.35)',
        }}>
          GO
        </button>
      </div>
    </form>
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
    else deleteWordChainInvite(roomId)
  }

  const responses = invite.responses || {}
  const acceptedUids = Object.entries(responses).filter(([,r])=>r==='accepted').map(([uid])=>uid)
  const canStart = acceptedUids.length >= 2
  const pct = Math.max(0, (secs / 45) * 100)
  const barColor = secs <= 10 ? '#e74c3c' : secs <= 20 ? '#f39c12' : '#00ff88'

  return (
    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 20px', gap:20 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'3rem', marginBottom:6 }}>🔤</div>
        <div style={{ fontFamily:'Oswald', fontSize:'2.2rem', fontWeight:800, letterSpacing:'0.2em', color:'#fff', textShadow:'0 0 30px rgba(16,185,129,0.5)' }}>WORD CHAIN</div>
      </div>

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
              {p.photoURL ? <img src={p.photoURL} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} /> : <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#10b981,#3b82f6)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Oswald', fontWeight:700, fontSize:'0.75rem', color:'#fff' }}>{(p.displayName||'?')[0].toUpperCase()}</div>}
              <span style={{ fontFamily:'Oswald', fontSize:'0.82rem', color: p.uid===currentUser.uid?'#6ee7b7':'#fff', flex:1 }}>{p.displayName}</span>
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
                background: canStart?'linear-gradient(135deg,#10b981,#3b82f6)':'rgba(255,255,255,0.05)',
                color: canStart?'#fff':'rgba(255,255,255,0.3)', opacity:canStart?1:0.5 }}>
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

// ─── Lobby ──────────────────────────────────────────────────────────────────────
function Lobby({ roomParticipants, currentUser, roomId, onClose }) {
  const [turnSeconds, setTurnSeconds] = useState(15)
  const canStart = roomParticipants.length >= 2

  async function handleStart() {
    const responses = {}
    for (const p of roomParticipants) responses[p.uid] = p.uid === currentUser.uid ? 'accepted' : 'pending'
    await writeWordChainInvite(roomId, {
      initiatorUid: currentUser.uid,
      initiatorName: currentUser.displayName || 'Someone',
      initiatorPhoto: currentUser.photoURL || '',
      gameName: 'Word Chain',
      settings: { turnSeconds },
      sentAt: Date.now(),
      expiresAt: Date.now() + 45000,
      responses,
    })
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '28px 20px' }}>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 8 }}>🔤</div>
        <div style={{ fontFamily: 'Oswald', fontSize: '2.5rem', fontWeight: 800, letterSpacing: '0.2em', color: '#fff', textShadow: '0 0 30px rgba(16,185,129,0.5)' }}>WORD CHAIN</div>
        <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginTop: 6 }}>Continue from the last letter · Don't repeat · Don't hesitate!</div>
      </div>

      {/* Players */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.14em', marginBottom: 10 }}>PLAYERS ({roomParticipants.length})</div>
        {roomParticipants.map(p => (
          <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 6 }}>
            {p.photoURL
              ? <img src={p.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.75rem', color: '#fff' }}>{(p.displayName || '?')[0].toUpperCase()}</div>
            }
            <span style={{ fontFamily: 'Oswald', fontSize: '0.82rem', color: '#fff', flex: 1 }}>{p.displayName}</span>
            {p.uid === currentUser.uid && <span style={{ fontSize: '0.6rem', color: '#10b981', letterSpacing: '0.06em' }}>YOU</span>}
          </div>
        ))}
      </div>

      {/* Settings */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.14em', marginBottom: 10 }}>SETTINGS</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontFamily: 'Oswald', fontSize: '0.82rem', color: '#fff' }}>Time per turn</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[10, 15, 20, 30].map(s => (
              <button key={s} onClick={() => setTurnSeconds(s)} style={{
                width: 36, height: 28, borderRadius: 6, border: 'none', fontFamily: 'Oswald', fontSize: '0.72rem', cursor: 'pointer',
                background: turnSeconds === s ? '#10b981' : 'rgba(255,255,255,0.07)',
                color: turnSeconds === s ? '#fff' : 'rgba(255,255,255,0.5)',
              }}>{s}s</button>
            ))}
          </div>
        </div>
      </div>

      {/* Rules reminder */}
      <div style={{ width: '100%', maxWidth: 400, padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
        <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'rgba(16,185,129,0.7)', letterSpacing: '0.12em', marginBottom: 8 }}>RULES</div>
        {[
          '🔤 Each word must start with the last letter of the previous word',
          '✅ Words must be 3+ letters, letters only',
          '🚫 No repeating words',
          '⚡ 3 strikes and you\'re eliminated',
          '🏆 Last player standing wins',
        ].map((r, i) => (
          <div key={i} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginBottom: 5, lineHeight: 1.5 }}>{r}</div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onClose} style={{ padding: '11px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontFamily: 'Oswald', fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleStart} disabled={!canStart} style={{
          padding: '11px 42px', borderRadius: 10, border: 'none',
          background: canStart ? 'linear-gradient(135deg,#10b981,#3b82f6)' : 'rgba(255,255,255,0.05)',
          color: canStart ? '#fff' : 'rgba(255,255,255,0.25)',
          fontFamily: 'Oswald', fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.12em',
          cursor: canStart ? 'pointer' : 'not-allowed',
          boxShadow: canStart ? '0 0 24px rgba(16,185,129,0.4)' : 'none',
        }}>
          🎮 INVITE PLAYERS
        </button>
      </div>
      {!canStart && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>Need at least 2 players</div>}
    </div>
  )
}

// ─── Game Over ─────────────────────────────────────────────────────────────────

function GameOverScreen({ game, currentUser, onPlayAgain, onClose }) {
  const sorted = Object.entries(game.players).sort((a, b) => b[1].score - a[1].score)
  const isWinner = game.winner === currentUser.uid
  const winnerName = game.players[game.winner]?.displayName || 'Player'

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: 24 }}>
      <div className="wc-pop" style={{ fontSize: '4.5rem', lineHeight: 1 }}>{isWinner ? '🏆' : '🔤'}</div>
      <div style={{
        fontFamily: 'Oswald', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.2em',
        background: isWinner ? 'linear-gradient(135deg,gold,#f97316)' : 'none',
        color: isWinner ? 'transparent' : 'rgba(255,255,255,0.65)',
        WebkitBackgroundClip: isWinner ? 'text' : undefined, WebkitTextFillColor: isWinner ? 'transparent' : undefined,
      }}>
        {isWinner ? 'YOU WIN! 🎉' : `${winnerName} WINS!`}
      </div>

      {/* Chain length stat */}
      <div style={{ padding: '8px 20px', borderRadius: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <span style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: '#10b981' }}>
          Chain of {game.usedWords.length} words built!
        </span>
      </div>

      {/* Scores */}
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em', marginBottom: 10 }}>FINAL SCORES</div>
        {sorted.map(([uid, p], i) => (
          <div key={uid} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 6,
            background: i === 0 ? 'rgba(234,179,8,0.07)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${i === 0 ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.07)'}`,
          }}>
            <span style={{ fontFamily: 'Oswald', fontSize: '0.9rem', color: i === 0 ? 'gold' : 'rgba(255,255,255,0.3)', minWidth: 22 }}>#{i + 1}</span>
            {p.photoURL
              ? <img src={p.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.72rem', color: '#fff' }}>{(p.displayName || '?')[0].toUpperCase()}</div>
            }
            <span style={{ fontFamily: 'Oswald', fontSize: '0.85rem', color: uid === currentUser.uid ? '#a5b4fc' : '#fff', flex: 1 }}>
              {uid === currentUser.uid ? 'You' : p.displayName}
              {p.eliminated && <span style={{ marginLeft: 6, fontSize: '0.6rem', color: '#ef4444' }}>eliminated</span>}
            </span>
            <span style={{ fontFamily: 'Oswald', fontSize: '0.92rem', color: i === 0 ? 'gold' : 'rgba(255,255,255,0.55)', fontWeight: 700 }}>{p.score} pts</span>
          </div>
        ))}
      </div>

      {/* Last 5 words of the chain */}
      {game.usedWords.length > 0 && (
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', marginBottom: 8 }}>FINAL CHAIN</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {game.usedWords.slice(-12).map((w, i) => (
              <span key={i} style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {w.slice(0, -1)}<span style={{ color: '#10b981' }}>{w.slice(-1)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onClose} style={{ padding: '11px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontFamily: 'Oswald', fontSize: '0.82rem', cursor: 'pointer' }}>Close</button>
        <button onClick={onPlayAgain} style={{ padding: '11px 38px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#10b981,#3b82f6)', color: '#fff', fontFamily: 'Oswald', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', boxShadow: '0 0 24px rgba(16,185,129,0.35)' }}>
          Play Again
        </button>
      </div>
    </div>
  )
}

// ─── Event log ─────────────────────────────────────────────────────────────────

function EventLog({ log }) {
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])
  return (
    <div style={{ overflowY: 'auto', maxHeight: 90, padding: '4px 10px', scrollbarWidth: 'none' }}>
      {log.slice(-10).map((entry, i) => (
        <div key={i} style={{
          fontSize: '0.68rem', fontFamily: 'Oswald', lineHeight: 1.5,
          color: entry.includes('timed out') || entry.includes('eliminated') ? '#ef4444'
            : entry.includes('wins') ? 'gold' : 'rgba(255,255,255,0.4)',
        }}>{entry}</div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
// ─── Ancient Lexicon Background ──────────────────────────────────────────────────────

function WcBg() {
  const letters = [
    { ch:'A', top:'7%',  left:'6%',  size:38, op:0.07, rot:'-18deg', d:'5.8s', delay:'0s'   },
    { ch:'Z', top:'12%', right:'7%', size:44, op:0.06, rot:'22deg',  d:'6.5s', delay:'0.7s' },
    { ch:'M', top:'30%', left:'2%',  size:30, op:0.08, rot:'-8deg',  d:'7.2s', delay:'1.4s' },
    { ch:'X', top:'35%', right:'4%', size:50, op:0.05, rot:'15deg',  d:'5.3s', delay:'0.3s' },
    { ch:'Q', top:'55%', left:'5%',  size:34, op:0.07, rot:'-25deg', d:'6.8s', delay:'2.0s' },
    { ch:'K', top:'60%', right:'6%', size:28, op:0.08, rot:'10deg',  d:'4.9s', delay:'1.1s' },
    { ch:'W', top:'78%', left:'3%',  size:42, op:0.06, rot:'-5deg',  d:'7.5s', delay:'0.5s' },
    { ch:'R', top:'80%', right:'5%', size:36, op:0.07, rot:'20deg',  d:'6.0s', delay:'1.8s' },
    { ch:'L', top:'20%', left:'44%', size:22, op:0.05, rot:'-12deg', d:'8.0s', delay:'3.0s' },
    { ch:'S', top:'70%', left:'42%', size:26, op:0.06, rot:'8deg',   d:'6.2s', delay:'2.5s' },
    { ch:'T', top:'45%', left:'44%', size:20, op:0.05, rot:'-20deg', d:'9.0s', delay:'4.0s' },
    { ch:'E', top:'88%', left:'25%', size:32, op:0.06, rot:'14deg',  d:'7.8s', delay:'1.3s' },
    { ch:'N', top:'5%',  left:'32%', size:24, op:0.05, rot:'-6deg',  d:'8.5s', delay:'2.8s' },
    { ch:'B', top:'90%', right:'20%',size:38, op:0.06, rot:'-18deg', d:'6.7s', delay:'0.6s' },
  ]
  const glimmers = [
    { top:'18%', left:'82%' }, { top:'42%', left:'14%' },
    { top:'65%', left:'78%' }, { top:'28%', left:'52%' },
    { top:'82%', left:'38%' }, { top:'10%', left:'60%' },
  ]
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:0 }}>
      {/* Deep cosmic indigo base */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 100% 60% at 50% 110%, #190e00 0%, #0c0818 42%, #04030b 100%)' }} />
      {/* Purple nebula from top */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 110% 60% at 50% -10%, rgba(75,15,140,0.5) 0%, rgba(45,10,90,0.15) 45%, transparent 65%)' }} />
      {/* Amber book-light glow from bottom */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 85% 35% at 50% 115%, rgba(200,130,0,0.25) 0%, rgba(160,90,0,0.08) 40%, transparent 55%)' }} />
      {/* Warm mid-shelf glow */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 60% 25% at 50% 75%, rgba(120,70,0,0.1) 0%, transparent 55%)' }} />
      {/* Edge vignette */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, transparent 22%, rgba(0,0,0,0.85) 100%)' }} />
      {/* Ruled lines (book pages) */}
      <div style={{ position:'absolute', inset:0,
        backgroundImage:'repeating-linear-gradient(0deg, rgba(180,140,60,0.022) 0px, rgba(180,140,60,0.022) 1px, transparent 1px, transparent 22px)' }} />
      {/* Vertical column guides */}
      <div style={{ position:'absolute', inset:0,
        backgroundImage:'repeating-linear-gradient(90deg, rgba(120,80,20,0.015) 0px, rgba(120,80,20,0.015) 1px, transparent 1px, transparent 40px)' }} />
      {/* Gold letter glyphs */}
      {letters.map((l,i) => (
        <div key={i} style={{
          position:'absolute', top:l.top, left:l.left, right:l.right,
          fontSize:l.size, fontFamily:'Oswald,serif', fontWeight:700,
          color:`rgba(220,175,60,1)`, opacity:l.op,
          letterSpacing:'0.05em', userSelect:'none',
          '--lr': l.rot, '--lop': l.op,
          animation:`wcLetFloat ${l.d} ease-in-out ${l.delay} infinite`,
          transform:`rotate(${l.rot})`,
        }}>{l.ch}</div>
      ))}
      {/* Gold glimmer points */}
      {glimmers.map((g,i) => (
        <div key={i} style={{
          position:'absolute', top:g.top, left:g.left,
          width:3, height:3, borderRadius:'50%',
          background:'rgba(220,175,60,0.6)',
          boxShadow:'0 0 6px 2px rgba(220,175,60,0.3)',
          animation:`wcGlimmer ${2.2+i*0.5}s ease-in-out ${i*0.6}s infinite`,
        }} />
      ))}
      {/* Thin gold border */}
      <div style={{ position:'absolute', inset:10, borderRadius:12, border:'1px solid rgba(180,130,20,0.08)' }} />
    </div>
  )
}
// ─── Main ──────────────────────────────────────────────────────────────────────

export default function WordChainGame({ roomId, roomParticipants, currentUser, invite, onClose }) {
  const [game, setGame]     = useState(null)
  const [loading, setLoading] = useState(true)
  const gameRef             = useRef(null)

  useEffect(() => {
    return subscribeWordChainGame(roomId, s => {
      setGame(s); gameRef.current = s; setLoading(false)
    })
  }, [roomId])

  // ── Invite actions ──

  async function handleStartGame(acceptedUids) {
    const players = roomParticipants
      .filter(p => acceptedUids.includes(p.uid))
      .map(p => ({ uid: p.uid, displayName: p.displayName, photoURL: p.photoURL || '' }))
    if (players.length < 2) return
    const inv = invite
    const settings = inv?.settings || {}
    const state = createGame(players, { turnSeconds: settings.turnSeconds || 15 })
    await writeWordChainGame(roomId, startTurn(state))
    await deleteWordChainInvite(roomId)
  }

  async function handleCancelInvite() {
    await deleteWordChainInvite(roomId)
  }

  // ── Word submission ──

  async function handleSubmit(word) {
    const g = gameRef.current; if (!g) return
    const next = submitWord(g, currentUser.uid, word)
    if (next !== g) await writeWordChainGame(roomId, next)
  }

  // ── Timer expire (current player only) ──

  const expiredRef = useRef(false)
  useEffect(() => { expiredRef.current = false }, [game?.turnStartedAt])

  async function handleExpire() {
    const g = gameRef.current; if (!g) return
    if (g.currentUid !== currentUser.uid) return
    if (expiredRef.current) return
    expiredRef.current = true
    const next = expireTurn(g, currentUser.uid)
    await writeWordChainGame(roomId, next)
  }

  // ── Play again ──

  async function handlePlayAgain() {
    const g = gameRef.current; if (!g) return
    const players = Object.entries(g.players).map(([uid, p]) => ({ uid, displayName: p.displayName, photoURL: p.photoURL }))
    const next = createGame(players, { turnSeconds: g.turnSeconds })
    await writeWordChainGame(roomId, startTurn(next))
  }

  async function handleClose() {
    await deleteWordChainGame(roomId)
    onClose()
  }

  // ── Render ──

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>LOADING…</div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#04030b', position: 'relative', isolation: 'isolate' }}>
      <style>{WC_STYLES}</style>
      <WcBg />
      {/* Content layer sits above the atmospheric background */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {!game && invite && (
        <InviteWaitingRoom invite={invite} roomParticipants={roomParticipants} currentUser={currentUser} roomId={roomId} onStartGame={handleStartGame} onCancel={handleCancelInvite} />
      )}
      {!game && !invite && (
        <Lobby roomParticipants={roomParticipants} currentUser={currentUser} roomId={roomId} onClose={onClose} />
      )}

      {game?.status === 'finished' && (
        <GameOverScreen game={game} currentUser={currentUser} onPlayAgain={handlePlayAgain} onClose={handleClose} />
      )}

      {game?.status === 'playing' && (() => {
        const isMyTurn = game.currentUid === currentUser.uid
        const curPlayer = game.players[game.currentUid]

        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'rgba(5,10,8,0.97)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1rem' }}>🔤</span>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>WORD CHAIN</span>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.62rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em' }}>·</span>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>{game.usedWords.length} words</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.68rem', color: isMyTurn ? '#10b981' : 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
                  {isMyTurn ? '⚡ YOUR TURN' : `${curPlayer?.displayName}'s turn`}
                </span>
                <button onClick={handleClose} style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>

            {/* Timer */}
            <div style={{ flexShrink: 0, padding: '6px 14px', background: 'rgba(5,10,8,0.88)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <TimerBar
                key={game.turnStartedAt}
                turnStartedAt={game.turnStartedAt}
                turnSeconds={game.turnSeconds}
                isMyTurn={isMyTurn}
                onExpire={handleExpire}
              />
            </div>

            {/* Center — letter + last word */}
            <WordChainDisplay game={game} />

            {/* Bottom panel */}
            <div style={{ flexShrink: 0, background: 'rgba(5,10,8,0.97)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <WordInput game={game} currentUser={currentUser} onSubmit={handleSubmit} />
              {!isMyTurn && (
                <div style={{ padding: '8px 14px 4px', fontFamily: 'Oswald', fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', letterSpacing: '0.06em' }}>
                  Waiting for {curPlayer?.displayName}…
                </div>
              )}
              <EventLog log={game.log} />
              <PlayerStrip game={game} currentUser={currentUser} />
            </div>

          </div>
        )
      })()}
      </div>
    </div>
  )
}
