'use client'
// src/components/games/GameInviteToast.jsx
// Floating game invite notification — generic for UNO, Pictionary, Word Chain.

import { useState, useEffect } from 'react'

const TOAST_STYLES = `
  @keyframes inviteSlideIn {
    from { transform: translateY(120%) scale(.92); opacity: 0; }
    to   { transform: translateY(0)      scale(1);   opacity: 1; }
  }
  @keyframes invitePulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(192,57,43,0); }
    50%     { box-shadow: 0 0 0 8px rgba(192,57,43,0.25); }
  }
  .invite-toast  { animation: inviteSlideIn .38s cubic-bezier(.34,1.56,.64,1) both; }
  .invite-pulse  { animation: invitePulse 1.8s ease-in-out infinite; }
`

const GAME_META = {
  uno:       { name: 'UNO',        icon: '🃏', gradient: 'linear-gradient(135deg,#C0392B,#D4AC0D)', border: 'rgba(192,57,43,0.55)' },
  pictionary:{ name: 'Pictionary', icon: '🎨', gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'rgba(99,102,241,0.55)' },
  wordchain: { name: 'Word Chain', icon: '🔤', gradient: 'linear-gradient(135deg,#10b981,#3b82f6)', border: 'rgba(16,185,129,0.55)' },
}

function Countdown({ expiresAt }) {
  const [secs, setSecs] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
  useEffect(() => {
    const iv = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setSecs(remaining)
      if (remaining <= 0) clearInterval(iv)
    }, 500)
    return () => clearInterval(iv)
  }, [expiresAt])
  const pct = Math.max(0, (secs / 45) * 100)
  const color = secs <= 10 ? '#e74c3c' : secs <= 20 ? '#f39c12' : '#00ff88'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .5s linear, background .5s' }} />
      </div>
      <span style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color, minWidth: 28, textAlign: 'right' }}>{secs}s</span>
    </div>
  )
}

export default function GameInviteToast({ invite, game, currentUser, roomId, respondFn, onAccept, onDecline }) {
  if (!invite || !currentUser) return null
  const myResponse = invite.responses?.[currentUser.uid]
  if (!myResponse || myResponse !== 'pending') return null
  if (invite.initiatorUid === currentUser.uid) return null

  const meta = GAME_META[game] || GAME_META.uno

  async function handleAccept() {
    await respondFn(roomId, currentUser.uid, 'accepted')
    onAccept()
  }

  async function handleDecline() {
    await respondFn(roomId, currentUser.uid, 'declined')
    onDecline()
  }

  return (
    <>
      <style>{TOAST_STYLES}</style>
      <div
        className="invite-toast invite-pulse"
        style={{
          position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, width: 'min(360px, 92vw)',
          background: 'linear-gradient(145deg, #120820 0%, #0c0414 100%)',
          border: `1.5px solid ${meta.border}`,
          borderRadius: 20, padding: '18px 20px',
          boxShadow: '0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {invite.initiatorPhoto
            ? <img src={invite.initiatorPhoto} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${meta.border}` }} />
            : <div style={{ width: 40, height: 40, borderRadius: '50%', background: meta.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                {(invite.initiatorName || '?')[0].toUpperCase()}
              </div>
          }
          <div>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em' }}>GAME INVITE</div>
            <div style={{ fontFamily: 'Oswald', fontSize: '1rem', color: '#fff', fontWeight: 700 }}>
              <span style={{ color: '#f39c12' }}>{invite.initiatorName}</span> wants to play{' '}
              <span style={{ background: meta.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{meta.icon} {meta.name}</span>
            </div>
          </div>
        </div>
        <Countdown expiresAt={invite.expiresAt} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={handleDecline} style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)', fontFamily: 'Oswald', fontSize: '0.82rem', letterSpacing: '0.1em', cursor: 'pointer' }}>
            DECLINE
          </button>
          <button onClick={handleAccept} style={{ flex: 2, padding: '10px 0', borderRadius: 12, background: meta.gradient, border: 'none', color: '#fff', fontFamily: 'Oswald', fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', boxShadow: `0 4px 18px ${meta.border}` }}>
            🎮 ACCEPT
          </button>
        </div>
      </div>
    </>
  )
}
