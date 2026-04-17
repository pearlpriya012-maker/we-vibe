'use client'
// src/app/join/[code]/page.jsx
// Shareable room join link — /join/ABC123
// Looks up the room by code, joins the user, and redirects to the room.
// If not logged in, bounces to login with a redirect param.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { joinRoomByCode } from '@/lib/rooms'

export default function JoinPage() {
  const { code } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (user === undefined) return // AuthContext still loading

    if (!user) {
      router.replace(`/auth/login?redirect=/join/${code}`)
      return
    }

    joinRoomByCode({
      code: code.toUpperCase(),
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL || '',
    })
      .then(roomId => router.replace(`/room/${roomId}`))
      .catch(err => setError(err.message || 'Room not found'))
  }, [user, code])

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
