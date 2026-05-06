'use client'
// src/app/join/[code]/page.jsx
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { joinRoomByCode, getRoomByCode } from '@/lib/rooms'
import { saveRecentRoom } from '@/lib/recentRooms'

export default function JoinPage() {
  const { code } = useParams()
  const router = useRouter()
  const { user, loginWithName } = useAuth()
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [roomInfo, setRoomInfo] = useState(null) // { name, roomCode, mode }

  // Fetch room name for display (no auth needed)
  useEffect(() => {
    if (!code) return
    getRoomByCode(code).then(r => setRoomInfo(r)).catch(() => {})
  }, [code])

  // Once authenticated, auto-join the room
  useEffect(() => {
    if (!user) return
    joinRoomByCode({
      code: code.toUpperCase(),
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL || '',
    })
      .then(({ id, name, roomCode }) => {
        saveRecentRoom(id, roomCode, name)
        router.replace(`/room/${id}`)
      })
      .catch(err => setError(err.message || 'Room not found'))
  }, [user, code])

  async function handleJoin(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setJoining(true)
    setError(null)
    try {
      await loginWithName(trimmed)
      // The useEffect above will fire once `user` updates
    } catch (err) {
      setError(err.message || 'Could not sign in')
      setJoining(false)
    }
  }

  // Still loading auth state
  if (user === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d', position: 'relative' }}>
        <div className="grid-bg" />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🕊️</div>
          <div style={{ fontFamily: 'Oswald', fontSize: '1.1rem', color: 'var(--green)', letterSpacing: '0.15em' }}>LOADING…</div>
        </div>
      </div>
    )
  }

  // Already auth'd — joining in progress (useEffect handles it)
  if (user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d', position: 'relative' }}>
        <div className="grid-bg" />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: 24 }}>
          {error ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>😕</div>
              <div style={{ fontFamily: 'Oswald', fontSize: '1.1rem', color: 'var(--pink)', letterSpacing: '0.1em', marginBottom: 20 }}>{error}</div>
              <button onClick={() => router.push('/dashboard')}
                style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 10, padding: '10px 24px', color: 'var(--green)', fontFamily: 'Oswald', fontSize: '0.9rem', cursor: 'pointer', letterSpacing: '0.12em' }}>
                Back to Dashboard
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🕊️</div>
              <div style={{ fontFamily: 'Oswald', fontSize: '1.1rem', color: 'var(--green)', letterSpacing: '0.15em' }}>JOINING ROOM {code?.toUpperCase()}…</div>
              <div style={{ marginTop: 14, color: 'var(--text-dim)', fontSize: '0.82rem' }}>Hang tight, setting up your vibe</div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Not authenticated — show name entry form
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d', position: 'relative' }}>
      <div className="grid-bg" />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🕊️</div>
          <div style={{ fontFamily: 'Oswald', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--green)' }}>
            You're Invited
          </div>

          {/* Room name — highlighted if available */}
          {roomInfo?.name ? (
            <div style={{ marginTop: 10, padding: '10px 20px', background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 10, display: 'inline-block' }}>
              <div style={{ fontFamily: 'Oswald', fontSize: '1.5rem', fontWeight: 700, color: 'var(--green)', textShadow: '0 0 24px rgba(0,255,136,0.6)', letterSpacing: '0.06em' }}>{roomInfo.name}</div>
              <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.25em', color: 'var(--text-dim)', marginTop: 2 }}>{code?.toUpperCase()}</div>
            </div>
          ) : (
            <div style={{ fontFamily: 'Oswald', fontSize: '1.1rem', letterSpacing: '0.3em', color: 'var(--text-dim)', marginTop: 4 }}>
              {code?.toUpperCase()}
            </div>
          )}
        </div>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 24px' }}>
          <div>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>What should we call you?</div>
            <input
              type="text"
              autoFocus
              maxLength={30}
              placeholder="Your name…"
              className="input-vibe"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ textAlign: 'center', fontFamily: 'Oswald', fontSize: '1.4rem', letterSpacing: '0.1em', padding: '16px 12px' }}
            />
          </div>
          {error && <p style={{ color: 'var(--pink)', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={joining || !name.trim()}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
          >
            {joining ? <><span className="spinner" /> Joining…</> : 'Enter the Vibe 🎵'}
          </button>
          <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-dim)', margin: 0 }}>
            No account needed — just your name.
          </p>
        </form>
      </div>
    </div>
  )
}
