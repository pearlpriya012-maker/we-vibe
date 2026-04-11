'use client'
// src/app/dashboard/page.jsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { createRoom, joinRoomByCode } from '@/lib/rooms'

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

  // Extract a clean embed URL from a YouTube or arbitrary URL
  function toEmbedUrl(raw) {
    const s = raw.trim()
    // youtube.com/watch?v=ID  or  youtu.be/ID  or  youtube.com/shorts/ID
    const ytMatch = s.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    )
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`
    // Already a direct https URL — pass through (e.g. Twitch, Vimeo embed links)
    if (/^https?:\/\//i.test(s)) return s
    return null
  }

  useEffect(() => {
    if (!user) router.replace('/auth/login')
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
          {/* Tabs — CSS grid so all 3 always fit equally, no scrolling needed */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'create', label: '🎵 Create' },
              { key: 'watch',  label: '📺 Watch URL' },
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
