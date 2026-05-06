'use client'
// src/app/dashboard/page.jsx
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { createRoom, joinRoomByCode, createPermanentRoom, getUserPermanentRoom } from '@/lib/rooms'
import { saveRecentRoom, getRecentRooms } from '@/lib/recentRooms'
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
  const [permanentRoom, setPermanentRoom] = useState(undefined) // undefined=loading, null=none
  const [creatingPermanent, setCreatingPermanent] = useState(false)
  const [roomName, setRoomName] = useState('')             // name for new create-tab rooms
  const [permanentRoomName, setPermanentRoomName] = useState('') // name for permanent room
  const [recentRooms, setRecentRooms] = useState([])       // hydrated from localStorage below

  // Screen share state
  const [screenStatus, setScreenStatus] = useState('idle') // idle | sharing
  const [screenCode, setScreenCode] = useState('')
  const [viewerCount, setViewerCount] = useState(0)
  const [watchScreenCode, setWatchScreenCode] = useState('')
  const [allowInteraction, setAllowInteraction] = useState(true)
  const [viewerCursors, setViewerCursors] = useState({})
  const screenVideoRef = useRef(null)
  const screenStreamRef = useRef(null)
  const sessionIdRef = useRef(null)
  const pcsRef = useRef({})
  const viewerCandidatesRef = useRef({})
  const dataChannelsRef = useRef({})
  const viewerNamesRef = useRef({})
  const allowInteractionRef = useRef(true)
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

  // Load recent rooms from localStorage (client-only, zero DB cost)
  useEffect(() => { setRecentRooms(getRecentRooms()) }, [])

  // Load permanent room whenever the My Room tab is opened
  useEffect(() => {
    if (tab !== 'myroom' || !user) return
    setPermanentRoom(undefined)
    getUserPermanentRoom(user.uid)
      .then(r => setPermanentRoom(r || null))
      .catch(() => setPermanentRoom(null))
  }, [tab, user])

  async function handleCreatePermanentRoom() {
    setCreatingPermanent(true)
    try {
      await createPermanentRoom({
        hostId: user.uid,
        hostName: user.displayName,
        hostPhoto: user.photoURL,
        name: permanentRoomName.trim(),
      })
      toast.success('Your permanent room is ready! 🏠')
      const room = await getUserPermanentRoom(user.uid)
      setPermanentRoom(room)
      if (room) {
        saveRecentRoom(room.id, room.roomCode, room.name || permanentRoomName.trim())
        setRecentRooms(getRecentRooms())
      }
    } catch (err) {
      toast.error(err.message || 'Could not create room')
    } finally {
      setCreatingPermanent(false)
    }
  }

  if (!user) return null

  async function handleCreate() {
    setCreating(true)
    try {
      const { id, roomCode } = await createRoom({
        hostId: user.uid,
        hostName: user.displayName,
        hostPhoto: user.photoURL,
        mode,
        name: roomName.trim(),
      })
      saveRecentRoom(id, roomCode, roomName.trim())
      setRecentRooms(getRecentRooms())
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
      const { id: roomId, name: joinedName, roomCode: joinedCode } = await joinRoomByCode({
        code: joinCode.toUpperCase(),
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
      })
      saveRecentRoom(roomId, joinedCode, joinedName)
      setRecentRooms(getRecentRooms())
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

  function dispatchInteraction({ type, x, y, key, deltaX, deltaY }) {
    const docX = x * window.innerWidth
    const docY = y * window.innerHeight
    const target = document.elementFromPoint(docX, docY) || document.body
    if (type === 'click') {
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName)) target.focus?.()
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: docX, clientY: docY, view: window }))
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: docX, clientY: docY, view: window }))
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: docX, clientY: docY, view: window }))
    } else if (type === 'scroll') {
      window.scrollBy({ left: deltaX * window.innerWidth, top: deltaY * window.innerHeight, behavior: 'instant' })
    } else if (type === 'keydown') {
      const active = document.activeElement || document.body
      active.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code: key }))
      active.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key, code: key }))
      active.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code: key }))
      if (key.length === 1 && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        const s = active.selectionStart || 0
        active.value = active.value.slice(0, s) + key + active.value.slice(active.selectionEnd || s)
        active.selectionStart = active.selectionEnd = s + 1
        active.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (key === 'Backspace' && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        const s = active.selectionStart || 0
        if (s > 0) {
          active.value = active.value.slice(0, s - 1) + active.value.slice(active.selectionEnd || s)
          active.selectionStart = active.selectionEnd = s - 1
          active.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
    }
  }

  async function startSharing(mode = 'tab') {
    try {
      const constraints = {
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        // Disable all audio processing so music/original audio is preserved
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2,
          latency: 0,
        },
      }
      // Hint to browser to pre-select the tab picker and suppress self-capture warning
      if (mode === 'tab') {
        constraints.preferCurrentTab = false          // show full picker but default to Tab
        constraints.selfBrowserSurface = 'exclude'   // hide this tab from the list
        constraints.video.displaySurface = 'browser' // pre-select "Browser tab" category
      } else {
        constraints.selfBrowserSurface = 'exclude'
        constraints.video.displaySurface = mode === 'window' ? 'window' : 'monitor'
      }
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints)
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
          viewerNamesRef.current[vId] = msg.data?.name || 'Viewer'
          const pc = new RTCPeerConnection(ICE_CONFIG)
          pcsRef.current[vId] = pc
          stream.getTracks().forEach(track => pc.addTrack(track, stream))
          pc.onicecandidate = (e) => {
            if (e.candidate) sendSignal(session.id, 'host', vId, 'ice', e.candidate)
          }
          // Create DataChannel BEFORE createOffer so it's included in the SDP
          const dc = pc.createDataChannel('interaction', { ordered: false, maxRetransmits: 0 })
          dataChannelsRef.current[vId] = dc
          dc.onmessage = (evt) => {
            try {
              const data = JSON.parse(evt.data)
              if (!allowInteractionRef.current) return
              if (data.type === 'cursor') {
                setViewerCursors(prev => ({ ...prev, [vId]: { x: data.x, y: data.y, name: viewerNamesRef.current[vId] || 'Viewer' } }))
              } else {
                dispatchInteraction(data)
              }
            } catch {}
          }
          const rawOffer = await pc.createOffer()
          // Patch SDP: force Opus into high-bitrate stereo music mode
          const patchedSdp = rawOffer.sdp
            .replace(/a=fmtp:(\d+) useinbandfec=1/g, 'a=fmtp:$1 useinbandfec=1; stereo=1; sprop-stereo=1; maxaveragebitrate=510000; cbr=0')
            .replace(/a=maxptime:\d+\r?\n/g, 'a=maxptime:60\r\n')
          const offer = { type: rawOffer.type, sdp: patchedSdp }
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
    dataChannelsRef.current = {}
    viewerNamesRef.current = {}
    unsubSignalsRef.current?.()
    unsubSignalsRef.current = null
    screenStreamRef.current = null
    sessionIdRef.current = null
    setScreenStatus('idle')
    setScreenCode('')
    setViewerCount(0)
    setViewerCursors({})
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
      <main style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ── Page heading ── */}
        <div style={{ marginBottom: 36 }}>
          <span className="section-label">Dashboard</span>
          <h1 style={{ fontFamily: 'Oswald', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1, marginTop: 4 }}>
            Let's <span style={{ color: 'var(--green)', textShadow: '0 0 30px rgba(0,255,136,0.4)' }}>Vibe</span>
          </h1>
        </div>

        {/* ── My Room banner (shown only when user has a permanent room) ── */}
        {permanentRoom !== undefined && permanentRoom !== null && (
          <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 14, padding: '18px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 3 }}>🏠 My Permanent Room</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  {permanentRoom.name && <span style={{ fontFamily: 'Oswald', fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>{permanentRoom.name}</span>}
                  <span style={{ fontFamily: 'Oswald', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.3em', color: 'var(--green)' }}>{permanentRoom.roomCode}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                  {permanentRoom.participants?.length ?? 0} participant{permanentRoom.participants?.length !== 1 ? 's' : ''} inside
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => router.push(`/room/${permanentRoom.id}`)} className="btn-primary" style={{ padding: '10px 20px', fontSize: '0.82rem' }}>Enter Room 🚀</button>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${permanentRoom.roomCode}`).then(() => toast.success('Invite link copied!'))}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '10px 18px', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.06em' }}>
                📋 Share
              </button>
            </div>
          </div>
        )}

        {/* ── Two-column main cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>

          {/* ── START A ROOM ── */}
          <div className="glass-card" style={{ padding: '28px 28px 32px' }}>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 18 }}>Start a Room</div>

            {/* Mode radio */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[{ k: 'music', label: '🎵 Music', color: 'var(--green)' }, { k: 'watch', label: '📺 Watch', color: 'var(--cyan)' }].map(({ k, label, color }) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: `1px solid ${tab === k ? color : 'var(--border)'}`, background: tab === k ? `rgba(${k === 'music' ? '0,255,136' : '0,200,255'},0.08)` : 'transparent', color: tab === k ? color : 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Room Name */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'Oswald', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Room Name <span style={{ opacity: 0.45 }}>(optional)</span></div>
              <input type="text" maxLength={40} placeholder="e.g. Friday Night Vibes…" className="input-vibe"
                value={roomName} onChange={e => setRoomName(e.target.value)} style={{ fontSize: '0.88rem', padding: '11px 14px' }} />
            </div>

            {/* Watch URL (only when Watch mode) */}
            {tab === 'watch' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Video URL</div>
                <input type="text" placeholder="https://youtube.com/watch?v=…" className="input-vibe"
                  value={watchUrl} onChange={e => { setWatchUrl(e.target.value); setWatchUrlError('') }}
                  style={{ fontSize: '0.85rem', padding: '11px 14px' }} />
                {watchUrlError && <p style={{ color: 'var(--pink)', fontSize: '0.75rem', marginTop: 6 }}>{watchUrlError}</p>}
                <p style={{ color: 'var(--text-dim)', fontSize: '0.73rem', marginTop: 6 }}>YouTube, youtu.be, Shorts, Vimeo, Dailymotion, or any https:// URL</p>
              </div>
            )}

            <button
              onClick={tab === 'watch' ? (e => handleWatchUrl({ preventDefault: () => {}, ...e })) : handleCreate}
              disabled={creating || (tab === 'watch' && !watchUrl.trim())}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px', marginTop: 4, background: tab === 'watch' ? 'var(--cyan)' : undefined, boxShadow: tab === 'watch' ? '0 0 20px rgba(0,200,255,0.25)' : undefined }}>
              {creating ? <><span className="spinner" /> Creating…</> : tab === 'watch' ? 'Create Watch Room 📺' : 'Create Room 🚀'}
            </button>

            {/* My Room creation (shown only when user has no permanent room yet) */}
            {permanentRoom === null && (
              <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>🏠 Permanent Room</div>
                <input type="text" maxLength={40} placeholder="Name your permanent room…" className="input-vibe"
                  value={permanentRoomName} onChange={e => setPermanentRoomName(e.target.value)}
                  style={{ fontSize: '0.85rem', padding: '10px 14px', marginBottom: 10 }} />
                <button onClick={handleCreatePermanentRoom} disabled={creatingPermanent}
                  style={{ width: '100%', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', borderRadius: 8, padding: '11px', fontSize: '0.8rem', cursor: creatingPermanent ? 'not-allowed' : 'pointer', fontFamily: 'Oswald', letterSpacing: '0.08em', opacity: creatingPermanent ? 0.6 : 1 }}>
                  {creatingPermanent ? <><span className="spinner" /> Creating…</> : 'Create Permanent Room 🏠'}
                </button>
              </div>
            )}
          </div>

          {/* ── JOIN A ROOM ── */}
          <div className="glass-card" style={{ padding: '28px 28px 32px' }}>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 18 }}>Join a Room</div>

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Room Code</div>
                <input type="text" maxLength={6} placeholder="A1B2C3" className="input-vibe"
                  value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  style={{ textAlign: 'center', fontFamily: 'Oswald', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.4em', padding: '18px 12px', color: joinCode ? 'var(--green)' : undefined }} />
                <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: 8, textAlign: 'center' }}>Ask the host for their 6-character code</p>
              </div>
              <button type="submit" disabled={joining || joinCode.length !== 6} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
                {joining ? <><span className="spinner" /> Joining…</> : 'Join Room 🎵'}
              </button>
            </form>

            {/* Recent rooms */}
            {recentRooms.length > 0 && (
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>Recent Rooms</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentRooms.map((r) => (
                    <button key={r.id} onClick={() => router.push(`/room/${r.id}`)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: '#fff', cursor: 'pointer', transition: 'border-color 0.2s', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{r.name || 'Unnamed Room'}</span>
                      <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--text-dim)' }}>{r.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Screen Share accordion ── */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <button onClick={() => setTab(tab === 'screen' ? '' : 'screen')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: 'rgba(255,255,255,0.02)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span>🖥️ Screen Share</span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', transition: 'transform 0.2s', display: 'inline-block', transform: tab === 'screen' ? 'rotate(180deg)' : 'none' }}>▼</span>
          </button>

          {tab === 'screen' && (
            <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 20 }}>
                {screenStatus === 'idle' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {[{ mode: 'tab', icon: '🗂️', label: 'Browser Tab' }, { mode: 'window', icon: '🪟', label: 'Window' }, { mode: 'screen', icon: '🖥️', label: 'Full Screen' }].map(({ mode, icon, label }) => (
                        <button key={mode} onClick={() => startSharing(mode)}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 10, color: '#a78bfa', fontSize: '0.72rem', fontFamily: 'Oswald', letterSpacing: '0.06em', cursor: 'pointer', textTransform: 'uppercase' }}>
                          <span style={{ fontSize: '1.6rem' }}>{icon}</span>{label}
                        </button>
                      ))}
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Watch Someone's Screen</div>
                      <form onSubmit={handleWatchScreenCode} style={{ display: 'flex', gap: 8 }}>
                        <input type="text" maxLength={6} placeholder="Share code…" className="input-vibe"
                          value={watchScreenCode} onChange={e => setWatchScreenCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                          style={{ flex: 1, textAlign: 'center', fontFamily: 'Oswald', fontSize: '1.1rem', letterSpacing: '0.3em', padding: '11px 8px' }} />
                        <button type="submit" disabled={watchScreenCode.length < 4} className="btn-primary" style={{ padding: '11px 18px', flexShrink: 0 }}>👁️ Watch</button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                      <video ref={screenVideoRef} autoPlay muted playsInline style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block' }} />
                      {Object.entries(viewerCursors).map(([id, cur]) => (
                        <div key={id} style={{ position: 'absolute', left: `${cur.x * 100}%`, top: `${cur.y * 100}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 5 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,120,120,0.9)', border: '2px solid #fff', boxShadow: '0 0 6px rgba(255,120,120,0.6)' }} />
                          <div style={{ fontSize: '0.5rem', color: '#fff', background: 'rgba(0,0,0,0.75)', borderRadius: 3, padding: '1px 4px', marginTop: 2, whiteSpace: 'nowrap' }}>{cur.name}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>Share Code</div>
                        <div style={{ fontFamily: 'Oswald', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.3em', color: '#a78bfa' }}>{screenCode}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>{viewerCount} viewer{viewerCount !== 1 ? 's' : ''} connected</div>
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/screenshare/${screenCode}`).then(() => toast.success('Link copied!'))}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '10px 16px', fontSize: '0.78rem', cursor: 'pointer' }}>📋 Copy Link</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>🖱️ Allow Interaction</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 2 }}>Viewers can click, scroll & type on your shared tab</div>
                      </div>
                      <button onClick={() => { allowInteractionRef.current = !allowInteractionRef.current; setAllowInteraction(a => !a) }}
                        style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', transition: 'background 0.2s', background: allowInteraction ? 'var(--green)' : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: allowInteraction ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                      </button>
                    </div>
                    <button onClick={stopSharing} style={{ width: '100%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '12px', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.08em' }}>
                      ■ Stop Sharing
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p style={{ marginTop: 40, color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center' }}>
          🕊️ Vibe and Play, darling! Made with ❤️ by Team SPY
        </p>
      </main>
    </div>
  )
}

          {/* Tabs — CSS grid so all 5 always fit equally, no scrolling needed */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'create',  label: '🎵 Create' },
              { key: 'watch',   label: '📺 Watch' },
              { key: 'screen',  label: '🖥️ Screen' },
              { key: 'join',    label: '🔗 Join' },
              { key: 'myroom',  label: '🏠 My Room' },
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

                <div>
                  <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Room Name <span style={{ opacity: 0.5 }}>(optional)</span></div>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder="e.g. Friday Night Vibes…"
                    className="input-vibe"
                    value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    style={{ fontSize: '0.9rem' }}
                  />
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { mode: 'tab',    icon: '🗂️', label: 'Browser Tab' },
                        { mode: 'window', icon: '🪟', label: 'Window' },
                        { mode: 'screen', icon: '🖥️', label: 'Full Screen' },
                      ].map(({ mode, icon, label }) => (
                        <button key={mode} onClick={() => startSharing(mode)}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 10, color: '#a78bfa', fontSize: '0.72rem', fontFamily: 'Oswald', letterSpacing: '0.06em', cursor: 'pointer', textTransform: 'uppercase' }}>
                          <span style={{ fontSize: '1.6rem' }}>{icon}</span>
                          {label}
                        </button>
                      ))}
                    </div>
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
                    {/* Preview with viewer cursor overlays */}
                    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                      <video ref={screenVideoRef} autoPlay muted playsInline style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block' }} />
                      {Object.entries(viewerCursors).map(([id, cur]) => (
                        <div key={id} style={{ position: 'absolute', left: `${cur.x * 100}%`, top: `${cur.y * 100}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 5 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,120,120,0.9)', border: '2px solid #fff', boxShadow: '0 0 6px rgba(255,120,120,0.6)' }} />
                          <div style={{ fontSize: '0.5rem', color: '#fff', background: 'rgba(0,0,0,0.75)', borderRadius: 3, padding: '1px 4px', marginTop: 2, whiteSpace: 'nowrap' }}>{cur.name}</div>
                        </div>
                      ))}
                    </div>
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
                    {/* Allow Interaction toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>🖱️ Allow Interaction</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 2 }}>Viewers can click, scroll & type on your shared tab</div>
                      </div>
                      <button
                        onClick={() => { allowInteractionRef.current = !allowInteractionRef.current; setAllowInteraction(a => !a) }}
                        style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', transition: 'background 0.2s', background: allowInteraction ? 'var(--green)' : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: allowInteraction ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                      </button>
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
            ) : (
              /* ── My Room tab ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {permanentRoom === undefined ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Loading…</div>
                ) : permanentRoom === null ? (
                  <>
                    <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', fontSize: '0.875rem', color: 'var(--text-dim)' }}>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>One room, forever.</span> Create your permanent room once — it never disappears. Share the code with anyone, anytime.
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Room Name <span style={{ opacity: 0.5 }}>(optional)</span></div>
                      <input
                        type="text"
                        maxLength={40}
                        placeholder="e.g. SPY's Vibe Den…"
                        className="input-vibe"
                        value={permanentRoomName}
                        onChange={e => setPermanentRoomName(e.target.value)}
                        style={{ fontSize: '0.9rem' }}
                      />
                    </div>
                    <button onClick={handleCreatePermanentRoom} disabled={creatingPermanent} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '15px' }}>
                      {creatingPermanent ? <><span className="spinner" /> Creating…</> : 'Create My Permanent Room 🏠'}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: 'center' }}>
                      {permanentRoom.name ? (
                        <div style={{ fontFamily: 'Oswald', fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.06em', color: '#fff', marginBottom: 6 }}>{permanentRoom.name}</div>
                      ) : null}
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Your Room Code</div>
                      <div style={{ fontFamily: 'Oswald', fontSize: '3rem', fontWeight: 700, letterSpacing: '0.4em', color: 'var(--green)', textShadow: '0 0 30px rgba(0,255,136,0.4)' }}>{permanentRoom.roomCode}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 6 }}>
                        {permanentRoom.participants?.length ?? 0} participant{permanentRoom.participants?.length !== 1 ? 's' : ''} currently inside
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => router.push(`/room/${permanentRoom.id}`)}
                        className="btn-primary"
                        style={{ flex: 1, justifyContent: 'center', padding: '14px' }}
                      >Enter Room 🚀</button>
                      <button
                        onClick={() => {
                          const link = `${window.location.origin}/join/${permanentRoom.roomCode}`
                          navigator.clipboard.writeText(link).then(() => toast.success('Invite link copied!'))
                        }}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '14px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.06em' }}
                      >📋 Copy Invite Link</button>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-dim)', padding: '4px 0', wordBreak: 'break-all' }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/join/${permanentRoom.roomCode}` : `/join/${permanentRoom.roomCode}`}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent rooms — 100% localStorage, zero database cost */}
        {recentRooms.length > 0 && (
          <div style={{ marginTop: 28, width: '100%', maxWidth: 520 }}>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>Recent Rooms</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {recentRooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/room/${r.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: '#fff', cursor: 'pointer', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--text-dim)' }}>{r.code}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{r.name || 'Room'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p style={{ marginTop: 40, color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>
          🕊️ Vibe and Play, darling! Made with ❤️ by Team SPY
        </p>
      </main>
    </div>
  )
}
