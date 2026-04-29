'use client'
// src/app/dashboard/page.jsx
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { createRoom, joinRoomByCode } from '@/lib/rooms'
import { createScreenSession, sendSignal, listenSignals, endScreenSession } from '@/lib/screenshare'

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
}

function Avatar({ user, size = 40 }) {
  if (user?.photoURL) {
    return <img src={user.photoURL} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
  }
  const initials = (user?.displayName || 'V').charAt(0).toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg, var(--green), var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: size * 0.4, color: '#000', border: '2px solid var(--border)', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState('create')
  const mode = 'music'
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [watchUrl, setWatchUrl] = useState('')
  const [watchUrlError, setWatchUrlError] = useState('')

  // Screen share state
  const [screenStatus, setScreenStatus] = useState('idle') // idle | sharing
  const [screenCode, setScreenCode] = useState('')
  const [viewerCount, setViewerCount] = useState(0)
  const [watchScreenCode, setWatchScreenCode] = useState('')
  const screenVideoRef = useRef(null)
  const screenStreamRef = useRef(null)
  const sessionIdRef = useRef(null)
  const pcsRef = useRef({})
  const viewerCandidatesRef = useRef({})
  const unsubSignalsRef = useRef(null)

  // Extract a clean embed URL from a YouTube, Dailymotion, Vimeo, or arbitrary URL
  function toEmbedUrl(raw) {
    const s = raw.trim()
    // youtube.com/watch?v=ID  or  youtu.be/ID  or  youtube.com/shorts/ID
    const ytMatch = s.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    )
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0&enablejsapi=1`
    // dailymotion.com/video/ID
    const dmMatch = s.match(/dailymotion\.com\/(?:video|embed\/video)\/([A-Za-z0-9]+)/)
    if (dmMatch) return `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`
    // vimeo.com/ID
    const vimeoMatch = s.match(/vimeo\.com\/(\d+)/)
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`
    // Already a direct https URL — pass through
    if (/^https?:\/\//i.test(s)) return s
    return null
  }

  useEffect(() => {
    if (!user) router.replace('/')
  }, [user, router])

  if (!user) return null

  async function handleCreate() {
    setCreating(true)
    try {
      const { id } = await createRoom({
        hostId: user.uid,
        hostName: user.displayName,
        hostPhoto: user.photoURL,
        mode,
      })
      toast.success('Room created! 🎉')
      router.push(`/room/${id}`)
    } catch (err) {
      toast.error(err.message || 'Could not create room')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (joinCode.length !== 6) return toast.error('Room code must be 6 characters')
    setJoining(true)
    try {
      const roomId = await joinRoomByCode({
        code: joinCode.toUpperCase(),
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
      })
      toast.success('Joined the room! 🎵')
      router.push(`/room/${roomId}`)
    } catch (err) {
      toast.error(err.message || 'Could not join room')
    } finally {
      setJoining(false)
    }
  }

  async function handleWatchUrl(e) {
    e.preventDefault()
    setWatchUrlError('')
    const embedUrl = toEmbedUrl(watchUrl)
    if (!embedUrl) {
      setWatchUrlError('Paste a YouTube link or any valid https:// URL')
      return
    }
    setCreating(true)
    try {
      const { id } = await createRoom({
        hostId: user.uid,
        hostName: user.displayName,
        hostPhoto: user.photoURL,
        mode: 'music',
        watchUrl: embedUrl,
      })
      toast.success('Watch room created! 📺')
      router.push(`/room/${id}`)
    } catch (err) {
      toast.error(err.message || 'Could not create room')
    } finally {
      setCreating(false)
    }
  }

  async function startSharing() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true,
      })
      const session = await createScreenSession(user.uid, user.displayName)
      screenStreamRef.current = stream
      sessionIdRef.current = session.id
      setScreenCode(session.code)
      setScreenStatus('sharing')
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream
      stream.getVideoTracks()[0].addEventListener('ended', () => stopSharing())
      unsubSignalsRef.current = listenSignals(session.id, 'host', async (msg) => {
        const vId = msg.from
        if (msg.type === 'join') {
          setViewerCount(c => c + 1)
          const pc = new RTCPeerConnection(ICE_CONFIG)
          pcsRef.current[vId] = pc
          stream.getTracks().forEach(track => pc.addTrack(track, stream))
          pc.onicecandidate = (e) => {
            if (e.candidate) sendSignal(session.id, 'host', vId, 'ice', e.candidate)
          }
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await sendSignal(session.id, 'host', vId, 'offer', offer)
        } else if (msg.type === 'answer') {
          const pc = pcsRef.current[vId]
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data))
            const buffered = viewerCandidatesRef.current[vId] || []
            for (const c of buffered) { try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {} }
            delete viewerCandidatesRef.current[vId]
          }
        } else if (msg.type === 'ice') {
          const pc = pcsRef.current[vId]
          if (pc?.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(msg.data)) } catch {}
          } else {
            if (!viewerCandidatesRef.current[vId]) viewerCandidatesRef.current[vId] = []
            viewerCandidatesRef.current[vId].push(msg.data)
          }
        }
      })
    } catch (err) {
      if (err.name !== 'NotAllowedError') toast.error('Screen share failed: ' + (err.message || err.name))
    }
  }

  async function stopSharing() {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    if (sessionIdRef.current) await endScreenSession(sessionIdRef.current)
    Object.values(pcsRef.current).forEach(pc => pc.close())
    pcsRef.current = {}
    viewerCandidatesRef.current = {}
    unsubSignalsRef.current?.()
    unsubSignalsRef.current = null
    screenStreamRef.current = null
    sessionIdRef.current = null
    setScreenStatus('idle')
    setScreenCode('')
    setViewerCount(0)
  }

  function handleWatchScreenCode(e) {
    e.preventDefault()
    const c = watchScreenCode.trim().toUpperCase()
    if (c.length < 4) return
    router.push(`/screenshare/${c}`)
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="grid-bg" />

      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 40px', backdropFilter: 'blur(20px)', background: 'rgba(13,13,13,0.9)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ fontFamily: 'Oswald', fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', textShadow: '0 0 20px rgba(0,255,136,0.5)', textDecoration: 'none' }}>
          WE🕊️
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/settings" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.875rem', transition: 'color 0.2s' }}
            onMouseEnter={e => e.target.style.color = 'var(--green)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
          >Settings</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar user={user} size={36} />
            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.displayName}</span>
          </div>
          <button onClick={async () => { await logout(); router.push('/') }} className="btn-ghost" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main */}
      <main style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 73px)', padding: '60px 24px' }}>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="section-label">Dashboard</span>
          <h1 style={{ fontFamily: 'Oswald', fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1 }}>
            Let's <span style={{ color: 'var(--green)', textShadow: '0 0 30px rgba(0,255,136,0.4)' }}>Vibe</span>
          </h1>
          <p style={{ color: 'var(--text-dim)', marginTop: 12, fontSize: '1rem', fontWeight: 300 }}>Create a new room or join one with a code</p>
        </div>

        <div className="glass-card" style={{ width: '100%', maxWidth: 520 }}>
          {/* Tabs — CSS grid so all 4 always fit equally, no scrolling needed */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'create', label: '🎵 Create' },
              { key: 'watch',  label: '📺 Watch' },
              { key: 'screen', label: '🖥️ Screen' },
              { key: 'join',   label: '🔗 Join' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding: '13px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === key ? '2px solid var(--green)' : '2px solid transparent',
                  marginBottom: -1,
                  color: tab === key ? 'var(--green)' : 'var(--text-dim)',
                  fontFamily: 'Oswald, sans-serif',
                  fontSize: '0.72rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  transition: 'color 0.2s',
                }}
              >{label}</button>
            ))}
          </div>

          <div style={{ padding: '36px 32px' }}>
            {tab === 'create' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', fontSize: '0.875rem', color: 'var(--text-dim)' }}>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>You'll be the host.</span> Control playback, manage the queue, and invite friends with a 6-digit code.
                </div>

                <button onClick={handleCreate} disabled={creating} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '15px' }}>
                  {creating ? <><span className="spinner" /> Creating Room…</> : 'Create Room 🚀'}
                </button>
              </div>
            ) : tab === 'watch' ? (
              <form onSubmit={handleWatchUrl} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ background: 'rgba(52,152,219,0.06)', border: '1px solid rgba(52,152,219,0.2)', borderRadius: 10, padding: '16px 20px', fontSize: '0.875rem', color: 'var(--text-dim)' }}>
                  <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>Watch together.</span> Paste a YouTube link or any embeddable URL — everyone in the room sees it in sync.
                </div>
                <div>
                  <div style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Video URL</div>
                  <input
                    type="text"
                    placeholder="https://youtube.com/watch?v=... or any URL"
                    className="input-vibe"
                    value={watchUrl}
                    onChange={e => { setWatchUrl(e.target.value); setWatchUrlError('') }}
                    style={{ fontSize: '0.875rem' }}
                  />
                  {watchUrlError && <p style={{ color: 'var(--pink)', fontSize: '0.78rem', marginTop: 8 }}>{watchUrlError}</p>}
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: 8 }}>Supports: YouTube, youtu.be, Shorts, or any direct https:// embed URL</p>
                </div>
                <button type="submit" disabled={creating || !watchUrl.trim()} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '15px', background: 'var(--cyan)', boxShadow: '0 0 20px rgba(0,200,255,0.3)' }}>
                  {creating ? <><span className="spinner" /> Creating…</> : 'Create Watch Room 📺'}
                </button>
              </form>
            ) : tab === 'screen' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {screenStatus === 'idle' ? (
                  <>
                    <div style={{ background: 'rgba(147,51,234,0.06)', border: '1px solid rgba(147,51,234,0.2)', borderRadius: 10, padding: '16px 20px', fontSize: '0.875rem', color: 'var(--text-dim)' }}>
                      <span style={{ color: '#a78bfa', fontWeight: 600 }}>🖥️ Screen Share.</span> Share your screen in high quality with anyone using a 6-char code.
                    </div>
                    <button onClick={startSharing} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '15px', background: '#7c3aed', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}>
                      🖥️ Start Sharing
                    </button>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>Watch Someone's Screen</div>
                      <form onSubmit={handleWatchScreenCode} style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="Share code…"
                          className="input-vibe"
                          value={watchScreenCode}
                          onChange={e => setWatchScreenCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                          style={{ flex: 1, textAlign: 'center', fontFamily: 'Oswald', fontSize: '1.2rem', letterSpacing: '0.3em', padding: '12px 8px' }}
                        />
                        <button type="submit" disabled={watchScreenCode.length < 4} className="btn-primary" style={{ padding: '12px 20px', flexShrink: 0 }}>
                          👁️ Watch
                        </button>
                      </form>
                    </div>
                  </>
                ) : (
                  <>
                    <video ref={screenVideoRef} autoPlay muted playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 200, objectFit: 'contain' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>Share Code</div>
                        <div style={{ fontFamily: 'Oswald', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.3em', color: '#a78bfa' }}>{screenCode}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>{viewerCount} viewer{viewerCount !== 1 ? 's' : ''} connected</div>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/screenshare/${screenCode}`).then(() => toast.success('Link copied!'))}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '10px 16px', fontSize: '0.78rem', cursor: 'pointer' }}
                      >📋 Copy Link</button>
                    </div>
                    <button onClick={stopSharing} style={{ width: '100%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '12px', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.08em' }}>
                      ■ Stop Sharing
                    </button>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <div style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 16 }}>Enter Room Code</div>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="A1B2C3"
                    className="input-vibe"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    style={{ textAlign: 'center', fontFamily: 'Oswald', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.4em', padding: '20px 16px', color: joinCode ? 'var(--green)' : undefined }}
                  />
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 10, textAlign: 'center' }}>Ask the room host for their 6-character code</p>
                </div>
                <button type="submit" disabled={joining || joinCode.length !== 6} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '15px' }}>
                  {joining ? <><span className="spinner" /> Joining…</> : 'Join Room 🎵'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p style={{ marginTop: 40, color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>
          🕊️ Vibe and Play, darling! Made with ❤️ by Team SPY
        </p>
      </main>
    </div>
  )
}
