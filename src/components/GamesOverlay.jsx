'use client'
// src/components/GamesOverlay.jsx
// Games hub — shown as a full-screen overlay over the room.
// Click a game to launch it; music keeps playing underneath.

import { useState } from 'react'
import UnoGame from './games/UnoGame'
import PictionaryGame from './games/PictionaryGame'

const GAMES = [
  {
    id: 'uno',
    name: 'UNO',
    icon: '🃏',
    desc: 'The classic card game. Match colors & numbers, play action cards, be the first to empty your hand.',
    players: '2–10',
    available: true,
    gradient: 'linear-gradient(135deg, #e74c3c 0%, #2980b9 100%)',
    glow: 'rgba(231,76,60,0.35)',
  },
  {
    id: 'pictionary',
    name: 'Pictionary',
    icon: '🎨',
    desc: 'One player draws, others guess. Pick a word, sketch it live — first to guess wins the round!',
    players: '2–10',
    available: true,
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    glow: 'rgba(99,102,241,0.35)',
  },
]

function GameCard({ game, onSelect }) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={() => onSelect(game.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        borderRadius: 16,
        padding: '20px 18px',
        background: hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: hover ? `0 0 24px ${game.glow}` : 'none',
        transform: hover ? 'translateY(-3px)' : 'none',
      }}
    >
      {/* Gradient accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '16px 16px 0 0', background: game.gradient }} />

      <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>{game.icon}</div>
      <div style={{ fontFamily: 'Oswald', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.1em', color: '#fff', marginBottom: 6 }}>{game.name}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 12 }}>{game.desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Oswald', fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>👥 {game.players} players</span>
        <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', background: game.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>PLAY →</span>
      </div>
    </div>
  )
}

export default function GamesOverlay({ roomId, roomParticipants, currentUser, onClose, invite, initialGame }) {
  const [activeGame, setActiveGame] = useState(initialGame || null)

  if (activeGame === 'uno' || activeGame === 'pictionary') {
    const gameLabel = activeGame === 'uno' ? 'UNO' : 'PICTIONARY'
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: '#0a0a12',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Back header */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(10,10,18,0.97)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setActiveGame(null)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 12px', color: 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '0.1em' }}>
            ← GAMES
          </button>
          <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>{gameLabel}</span>
        </div>
        {activeGame === 'uno' && (
          <UnoGame
            roomId={roomId}
            roomParticipants={roomParticipants}
            currentUser={currentUser}
            invite={invite}
            onClose={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'pictionary' && (
          <PictionaryGame
            roomId={roomId}
            roomParticipants={roomParticipants}
            currentUser={currentUser}
            onClose={() => setActiveGame(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(8,8,15,0.97)',
      backdropFilter: 'blur(16px)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <div style={{ fontFamily: 'Oswald', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.15em', color: '#fff' }}>🎮 GAMES</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>Play together — music keeps going</div>
        </div>
        <button onClick={onClose}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(233,30,99,0.1)', border: '1px solid rgba(233,30,99,0.3)', color: 'var(--pink)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ✕
        </button>
      </div>

      {/* Players online strip */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <span style={{ fontFamily: 'Oswald', fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.12em', flexShrink: 0 }}>IN ROOM:</span>
        {roomParticipants.map(p => (
          <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 6, background: p.uid === currentUser.uid ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${p.uid === currentUser.uid ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 20, padding: '4px 10px', flexShrink: 0 }}>
            {p.photoURL
              ? <img src={p.photoURL} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#e74c3c,#2980b9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#fff', fontWeight: 700 }}>{p.displayName?.[0]?.toUpperCase() || '?'}</div>
            }
            <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: p.uid === currentUser.uid ? 'var(--green)' : '#fff' }}>{p.uid === currentUser.uid ? 'You' : p.displayName}</span>
          </div>
        ))}
      </div>

      {/* Game cards grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px', scrollbarWidth: 'none' }}>
        <style>{`.games-grid::-webkit-scrollbar{display:none}`}</style>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, maxWidth: 900, margin: '0 auto' }}>
          {GAMES.map(g => (
            <GameCard key={g.id} game={g} onSelect={setActiveGame} />
          ))}
        </div>


      </div>
    </div>
  )
}
