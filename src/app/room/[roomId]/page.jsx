'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import YouTube from 'react-youtube'
import { useAuth } from '@/context/AuthContext'
import {
  subscribeToRoom, subscribeToMessages,
  updatePlayback, addToQueue, addManyToQueue, removeFromQueue, reorderQueue,
  setCurrentTrack, skipToNext, leaveRoom,
  sendMessage, addReaction, toggleParticipantQueueAccess, toggleParticipantFullControl,
  kickParticipant, updateMusicMode, updateWatchPlayback, updateParticipantWatchTime,
} from '@/lib/rooms'

function Avatar({ user, size = 32 }) {
  if (user?.photoURL) return <img src={user.photoURL} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,var(--green),var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: size * 0.38, color: '#000', flexShrink: 0 }}>
      {(user?.displayName || 'V').charAt(0).toUpperCase()}
    </div>
  )
}

// ─── Music Visualizer ───
function MusicVisualizer({ track, isPlaying, compact = false }) {
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 22, flexShrink: 0 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ width: 3, borderRadius: 2, background: i % 2 === 0 ? 'var(--green)' : 'var(--cyan)', animation: isPlaying ? `mobileBar ${0.38 + i * 0.11}s ease-in-out ${i * 0.09}s infinite alternate` : 'none', height: isPlaying ? `${40 + i * 10}%` : '20%', transition: 'height 0.3s', opacity: 0.9 }} />
        ))}
        <style>{`@keyframes mobileBar { from{height:15%} to{height:100%} }`}</style>
      </div>
    )
  }
  return (
    <div style={{ width: '100%', maxWidth: 420, position: 'relative', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.9), 0 0 80px rgba(0,255,136,0.06)', aspectRatio: '1/1', background: '#000', flexShrink: 0 }}>
      {/* Blurred background */}
      <img src={track.thumbnail} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.3) saturate(1.6)', transform: 'scale(1.12)' }} />
      {/* Radial vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 44%, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.65) 65%, rgba(0,0,0,0.93) 100%)' }} />
      {/* Pulsing rings */}
      {isPlaying && [0, 1, 2].map(i => (
        <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-56%)', width: `${56 + i * 13}%`, aspectRatio: '1/1', borderRadius: '50%', border: '1px solid rgba(0,255,136,0.13)', animation: `pulseRing ${1.3 + i * 0.5}s ease-out ${i * 0.45}s infinite` }} />
      ))}
      {/* Spinning album disc */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-56%)', width: '50%', aspectRatio: '1/1', borderRadius: '50%', overflow: 'hidden', boxShadow: '0 0 0 3px rgba(0,255,136,0.4), 0 0 48px rgba(0,255,136,0.12), 0 16px 48px rgba(0,0,0,0.8)', animation: isPlaying ? 'spinAlbum 16s linear infinite' : 'none' }}>
        <img src={track.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      {/* Center spindle */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-56%)', width: 13, height: 13, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 2.5px var(--green), 0 0 16px var(--green)', zIndex: 2 }} />
      {/* Equalizer bars */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, padding: '0 16px 14px', background: 'linear-gradient(0deg, rgba(0,0,0,0.92) 0%, transparent 100%)' }}>
        {Array.from({ length: 22 }).map((_, i) => (
          <div key={i} style={{ flex: 1, borderRadius: '3px 3px 0 0', background: i % 3 === 0 ? 'var(--green)' : i % 3 === 1 ? 'var(--cyan)' : '#a855f7', animation: isPlaying ? `barBeat2 ${0.36 + (i % 7) * 0.09}s ease-in-out ${i * 0.043}s infinite alternate` : 'none', height: isPlaying ? `${18 + (i % 8) * 10}%` : '6%', transition: 'height 0.5s ease', opacity: isPlaying ? 0.88 : 0.25 }} />
        ))}
      </div>
      <style>{`
        @keyframes spinAlbum { from{transform:translate(-50%,-56%) rotate(0deg)} to{transform:translate(-50%,-56%) rotate(360deg)} }
        @keyframes pulseRing { 0%{opacity:0.5;transform:translate(-50%,-56%) scale(1)} 100%{opacity:0;transform:translate(-50%,-56%) scale(1.35)} }
        @keyframes barBeat2 { from{height:6%} to{height:90%} }
      `}</style>
    </div>
  )
}

// ─── Progress Bar — reads time from props, not from player directly ───
function ProgressBar({ currentTime, duration, isHost, canControl, onSeek }) {
  const barRef = useRef(null)
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  function fmt(s) {
    if (!s || isNaN(s) || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  function handleClick(e) {
    if (!canControl || !barRef.current || !duration) return
    const rect = barRef.current.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(p * duration)
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'Oswald', letterSpacing: '0.05em' }}>
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>
      <div ref={barRef} onClick={handleClick} style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, cursor: canControl ? 'pointer' : 'default', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,var(--green),var(--cyan))', borderRadius: 3, boxShadow: '0 0 8px rgba(0,255,136,0.5)' }} />
        {canControl && <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: 'var(--green)', border: '2px solid #000', boxShadow: '0 0 8px var(--green)', cursor: 'pointer' }} />}
      </div>
      {!canControl && <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 6, fontStyle: 'italic' }}>Synced with host</div>}
    </div>
  )
}

// ─── YouTube Playlist Panel ───
function PlaylistPanel({ onAddToQueue, canAdd, ytAccessToken, onStartPlaylist, onShufflePlaylist, onTokenExpired, cachedPlaylists, onPlaylistsLoaded }) {
  const [playlists, setPlaylists] = useState(cachedPlaylists || [])
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(!cachedPlaylists && !!ytAccessToken)
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [selectedPlaylistMeta, setSelectedPlaylistMeta] = useState(null)
  const [view, setView] = useState('playlists') // 'playlists' | 'tracks'
  const [tokenError, setTokenError] = useState(false)

  useEffect(() => {
    if (cachedPlaylists) return // already have data — don't refetch
    if (!ytAccessToken) { setPlaylists([]); setLoading(false); return }
    setTokenError(false)
    fetchPlaylists(ytAccessToken)
  }, [ytAccessToken])

  async function fetchPlaylists(token) {
    setLoading(true)
    try {
      const res = await fetch('/api/youtube/playlists', { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401 || res.status === 403) {
        // Token expired — try refresh once
        const newToken = await onTokenExpired?.()
        if (newToken) {
          const res2 = await fetch('/api/youtube/playlists', { headers: { Authorization: `Bearer ${newToken}` } })
          const data2 = await res2.json()
          setPlaylists(data2.playlists || [])
          onPlaylistsLoaded?.(data2.playlists || [])
        } else {
          setTokenError(true)
        }
        return
      }
      const data = await res.json()
      setPlaylists(data.playlists || [])
      onPlaylistsLoaded?.(data.playlists || [])
    } catch {
      setPlaylists([])
    } finally {
      setLoading(false)
    }
  }

  async function loadPlaylistTracks(playlistId, title, thumbnail) {
    setSelectedPlaylist(title)
    setSelectedPlaylistMeta({ id: playlistId, title, thumbnail })
    setView('tracks')
    setLoading(true)
    try {
      let token = ytAccessToken
      const res = await fetch(`/api/youtube/playlistItems?playlistId=${playlistId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401 || res.status === 403) {
        token = await onTokenExpired?.() || token
      }
      const res2 = await fetch(`/api/youtube/playlistItems?playlistId=${playlistId}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res2.json()
      setTracks(data.results || [])
    } catch {
      toast.error('Could not load playlist tracks')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          {view === 'tracks' ? 'Loading tracks…' : 'Loading playlists…'}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        <style>{`@keyframes plSkel{0%,100%{opacity:0.35}50%{opacity:0.75}}`}</style>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8, alignItems: 'center', marginBottom: 2 }}>
            <div style={{ width: 52, height: 38, borderRadius: 4, background: 'rgba(255,255,255,0.12)', flexShrink: 0, animation: `plSkel 1.4s ease-in-out ${i * 0.12}s infinite` }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ height: 11, borderRadius: 4, background: 'rgba(255,255,255,0.12)', width: `${50 + (i * 17) % 38}%`, animation: `plSkel 1.4s ease-in-out ${i * 0.12}s infinite` }} />
              <div style={{ height: 9, borderRadius: 4, background: 'rgba(255,255,255,0.08)', width: '38%', animation: `plSkel 1.4s ease-in-out ${i * 0.18}s infinite` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (!ytAccessToken || tokenError) return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 12 }}>
        {tokenError ? 'YouTube session expired' : 'Connect YouTube in Settings to see your playlists'}
      </div>
      {tokenError
        ? <button onClick={async () => { setTokenError(false); const t = await onTokenExpired?.(); if (t) fetchPlaylists(t) }} className="btn-primary" style={{ fontSize: '0.8rem', padding: '8px 16px' }}>🔄 Reconnect YouTube</button>
        : <Link href="/settings" className="btn-ghost" style={{ fontSize: '0.8rem', padding: '8px 16px' }}>Go to Settings →</Link>
      }
    </div>
  )

  if (view === 'tracks') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setView('playlists')} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: '1rem' }}>←</button>
        <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPlaylist}</span>
      </div>
      {tracks.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => { if (!canAdd) { toast('Ask host to allow adding songs'); return } onStartPlaylist?.(tracks, selectedPlaylistMeta); toast.success(`▶ Playing ${tracks.length} songs`) }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: canAdd ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canAdd ? 'rgba(0,255,136,0.35)' : 'rgba(255,255,255,0.08)'}`, color: canAdd ? 'var(--green)' : 'rgba(255,255,255,0.25)', borderRadius: 8, padding: '9px 0', fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.08em', cursor: canAdd ? 'pointer' : 'default' }}>
            ▶ START
          </button>
          <button
            onClick={() => { if (!canAdd) { toast('Ask host to allow adding songs'); return } onShufflePlaylist?.([...tracks].sort(() => Math.random() - 0.5), selectedPlaylistMeta); toast.success(`🔀 Shuffling ${tracks.length} songs`) }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: canAdd ? 'rgba(0,200,255,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canAdd ? 'rgba(0,200,255,0.3)' : 'rgba(255,255,255,0.08)'}`, color: canAdd ? 'var(--cyan)' : 'rgba(255,255,255,0.25)', borderRadius: 8, padding: '9px 0', fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.08em', cursor: canAdd ? 'pointer' : 'default' }}>
            🔀 SHUFFLE
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {tracks.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>No tracks found</div>
        ) : tracks.map(track => (
          <div key={track.videoId} style={{ display: 'flex', gap: 8, padding: '6px 8px', borderRadius: 8, alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <img src={track.thumbnail} alt="" style={{ width: 52, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{track.channelTitle} · {track.durationFormatted}</div>
            </div>
            <button
              onClick={() => { if (!canAdd) { toast('Ask host to allow adding songs'); return } onAddToQueue({ ...track, playlistId: selectedPlaylistMeta?.id, playlistName: selectedPlaylistMeta?.title, playlistThumb: selectedPlaylistMeta?.thumbnail }); toast.success('Added!') }}
              style={{ background: canAdd ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canAdd ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`, color: canAdd ? 'var(--green)' : 'rgba(255,255,255,0.25)', borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', cursor: canAdd ? 'pointer' : 'default', fontFamily: 'Oswald', flexShrink: 0 }}
            >+ ADD</button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
      {playlists.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 12 }}>No playlists found on your YouTube account</div>
          <button onClick={() => fetchPlaylists(ytAccessToken)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.75rem' }}>🔄 Retry</button>
        </div>
      ) : playlists.map(pl => (
        <div key={pl.id} onClick={() => loadPlaylistTracks(pl.id, pl.title, pl.thumbnail)} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8, alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {pl.thumbnail && <img src={pl.thumbnail} alt="" style={{ width: 48, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.title}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{pl.itemCount} tracks</div>
          </div>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>›</span>
        </div>
      ))}
    </div>
  )
}

// ─── Search & Queue Panel ───
function SearchAndQueue({ room, isHost, canAdd, onAddToQueue, onPlayNow, onRemove, ytAccessToken, initialTab, hideTabs, roomId, playedHistory = [], onStartPlaylist, onShufflePlaylist, onTokenExpired }) {
  const [query, setQuery] = useState('')
  const [globalResults, setGlobalResults] = useState([])
  const [playlistResults, setPlaylistResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [tab, setTab] = useState(initialTab || 'search') // 'search' | 'queue' | 'playlists'
  const [expandedPlaylists, setExpandedPlaylists] = useState(new Set())
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const [showPlayed, setShowPlayed] = useState(false)
  useEffect(() => { if (initialTab && hideTabs) setTab(initialTab) }, [initialTab])
  const debRef = useRef(null)
  const playlistCacheRef = useRef(null) // cached [{videoId, title, channelTitle, thumbnail, durationFormatted, playlistName}]
  const fetchedPlaylistsRef = useRef(null) // cache fetched playlists list so tab switches are instant

  function handleQueueDrop(toIdx) {
    if (dragIdx === null || dragIdx === toIdx || !roomId) { setDragIdx(null); setDropIdx(null); return }
    const q = [...(room?.queue || [])]
    const item = q.splice(dragIdx, 1)[0]
    const insertAt = dragIdx < toIdx ? toIdx - 1 : toIdx
    q.splice(insertAt, 0, item)
    reorderQueue(roomId, q)
    setDragIdx(null)
    setDropIdx(null)
  }

  async function loadPlaylistCache() {
    if (playlistCacheRef.current || !ytAccessToken) return
    try {
      const plRes = await fetch('/api/youtube/playlists', { headers: { Authorization: `Bearer ${ytAccessToken}` } })
      const plData = await plRes.json()
      const playlists = (plData.playlists || []).slice(0, 5)
      const allTracks = []
      await Promise.all(playlists.map(async (pl) => {
        try {
          const res = await fetch(`/api/youtube/playlistItems?playlistId=${pl.id}`, { headers: { Authorization: `Bearer ${ytAccessToken}` } })
          const data = await res.json()
          ;(data.results || []).forEach(t => allTracks.push({ ...t, playlistName: pl.title }))
        } catch {}
      }))
      playlistCacheRef.current = allTracks
    } catch {}
  }

  function handleSearch(q) {
    setQuery(q)
    clearTimeout(debRef.current)
    if (!q.trim()) { setGlobalResults([]); setPlaylistResults([]); return }
    debRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        // Load playlist cache if not yet loaded
        await loadPlaylistCache()
        // Filter playlist cache
        if (playlistCacheRef.current) {
          const filtered = playlistCacheRef.current.filter(t =>
            t.title.toLowerCase().includes(q.toLowerCase()) ||
            (t.channelTitle || '').toLowerCase().includes(q.toLowerCase())
          ).slice(0, 6)
          setPlaylistResults(filtered)
        }
        // Global YouTube search
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&limit=30`)
        const data = await res.json()
        setGlobalResults(data.results || [])
      } catch { toast.error('Search failed') }
      finally { setSearching(false) }
    }, 500)
  }

  const TrackRow = ({ track, showPlaylist }) => (
    <div style={{ display: 'flex', gap: 8, padding: '6px 8px', borderRadius: 8, alignItems: 'center' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <img src={track.thumbnail} alt="" style={{ width: 52, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
          {track.channelTitle}{track.durationFormatted ? ` · ${track.durationFormatted}` : ''}
          {showPlaylist && track.playlistName && <span style={{ color: 'rgba(0,255,136,0.6)', marginLeft: 4 }}>· {track.playlistName}</span>}
        </div>
      </div>
      <button
        onClick={() => { if (!canAdd) { toast('Ask host to allow adding songs'); return } onAddToQueue(track); toast.success('Added!') }}
        style={{ background: canAdd ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canAdd ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`, color: canAdd ? 'var(--green)' : 'rgba(255,255,255,0.25)', borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', cursor: canAdd ? 'pointer' : 'default', fontFamily: 'Oswald', flexShrink: 0 }}
      >+ ADD</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs: Search | Queue | Playlist | AI Bond — hidden on mobile (outer tabs handle this) */}
      {!hideTabs && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {[['search', '🔍 Search'], ['queue', '🎵 Queue'], ['playlists', '📋 Playlist'], ['aibond', '🐻‍❄️ AI Bond']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, minWidth: 'max-content', padding: '10px 10px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === id ? 'var(--green)' : 'transparent'}`, color: tab === id ? 'var(--green)' : 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.62rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s', marginBottom: -1, whiteSpace: 'nowrap' }}>
            {label}
          </button>
        ))}
        </div>
      )}

      {tab === 'playlists' ? (
        <PlaylistPanel onAddToQueue={onAddToQueue} canAdd={canAdd} ytAccessToken={ytAccessToken} onStartPlaylist={onStartPlaylist} onShufflePlaylist={onShufflePlaylist} onTokenExpired={onTokenExpired} cachedPlaylists={fetchedPlaylistsRef.current} onPlaylistsLoaded={data => { fetchedPlaylistsRef.current = data }} />
      ) : tab === 'aibond' ? (
        <AIBondPanel room={room} canAdd={canAdd} onAddToQueue={onAddToQueue} ytAccessToken={ytAccessToken} />
      ) : tab === 'queue' ? (
        /* ── Queue Tab ── */
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          <style>{`@keyframes eqBeat{0%,100%{height:3px}50%{height:13px}} @keyframes nowPlaying{0%,100%{border-color:rgba(0,255,136,0.2)}50%{border-color:rgba(0,255,136,0.6)}}`}</style>

          {/* ── Played section ── */}
          {playedHistory.length > 0 && (
            <>
              <button onClick={() => setShowPlayed(p => !p)} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left', padding: '4px 6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                {showPlayed ? '▾' : '▸'} ✓ PLAYED ({playedHistory.length})
              </button>
              {showPlayed && (
                <>
                  {[...playedHistory].reverse().map((track, i) => (
                    <div key={`ph-${track.videoId}-${i}`} style={{ display: 'flex', gap: 8, padding: '4px 8px', borderRadius: 6, alignItems: 'center', opacity: 0.4 }}>
                      <img src={track.thumbnail} alt="" style={{ width: 38, height: 26, borderRadius: 3, objectFit: 'cover', flexShrink: 0, filter: 'grayscale(70%)' }} />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
                      </div>
                      {canAdd && <button onClick={() => { onAddToQueue(track); toast.success('Re-added!') }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', borderRadius: 4, padding: '2px 6px', fontSize: '0.6rem', cursor: 'pointer', flexShrink: 0 }}>↻</button>}
                    </div>
                  ))}
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px 8px' }} />
                </>
              )}
            </>
          )}

          {/* ── Now Playing ── */}
          {room?.currentTrack && (
            <div style={{ display: 'flex', gap: 8, padding: '8px', borderRadius: 10, alignItems: 'center', background: 'rgba(0,255,136,0.07)', marginBottom: 8, border: '1px solid rgba(0,255,136,0.2)', animation: 'nowPlaying 2s ease-in-out infinite' }}>
              <img src={room.currentTrack.thumbnail} alt="" style={{ width: 52, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.58rem', color: 'var(--green)', fontFamily: 'Oswald', letterSpacing: '0.1em', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
                    {[0,1,2,3].map(i => <span key={i} style={{ width: 3, minWidth: 3, background: 'var(--green)', borderRadius: 2, display: 'inline-block', animation: room.isPlaying ? `eqBeat ${0.5+i*0.15}s ease-in-out ${i*0.1}s infinite` : 'none', height: room.isPlaying ? 8 : 3 }} />)}
                  </span>
                  NOW PLAYING
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{room.currentTrack.channelTitle}</div>
              </div>
            </div>
          )}

          {/* ── Upcoming ── */}
          <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '2px 6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            UPCOMING ({room?.queue?.length || 0}){isHost && room?.queue?.length > 0 && <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' }}>— drag ⦿ to reorder</span>}
          </div>
          {!room?.queue?.length ? (
            <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>Queue is empty. Search and add tracks!</div>
          ) : (() => {
            const groups = []
            const seenPl = new Map()
            ;(room.queue || []).forEach((track, qi) => {
              if (track.playlistId) {
                if (!seenPl.has(track.playlistId)) {
                  seenPl.set(track.playlistId, groups.length)
                  groups.push({ type: 'playlist', id: track.playlistId, name: track.playlistName, thumb: track.playlistThumb, items: [{ ...track, qi }] })
                } else {
                  groups[seenPl.get(track.playlistId)].items.push({ ...track, qi })
                }
              } else {
                groups.push({ type: 'track', ...track, qi })
              }
            })
            return groups.map((g, gi) => g.type === 'playlist' ? (
              <div key={`pl-${g.id}-${gi}`} style={{ marginBottom: 4 }}>
                <div
                  onClick={() => setExpandedPlaylists(prev => { const s = new Set(prev); s.has(g.id) ? s.delete(g.id) : s.add(g.id); return s })}
                  style={{ display: 'flex', gap: 8, padding: '7px 8px', borderRadius: 8, alignItems: 'center', background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.12)', cursor: 'pointer', userSelect: 'none' }}>
                  {g.thumb ? <img src={g.thumb} alt="" style={{ width: 44, height: 30, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>📋</span>}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name || 'Playlist'}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{g.items.length} songs</div>
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', transition: 'transform 0.2s', transform: expandedPlaylists.has(g.id) ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>›</span>
                  {isHost && <button onClick={e => { e.stopPropagation(); reorderQueue(roomId, (room.queue||[]).filter(t => t.playlistId !== g.id)) }} style={{ background: 'none', border: 'none', color: 'var(--pink)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px', flexShrink: 0 }} title="Remove playlist">✕</button>}
                </div>
                {expandedPlaylists.has(g.id) && (
                  <div style={{ paddingLeft: 8, borderLeft: '2px solid rgba(0,200,255,0.15)', marginLeft: 8 }}>
                    {g.items.map((t, ti) => (
                      <div key={`${t.videoId}-${ti}`}
                        draggable={isHost}
                        onDragStart={e => { e.dataTransfer.setData('text/plain', String(t.qi)); setDragIdx(t.qi) }}
                        onDragOver={e => { e.preventDefault(); setDropIdx(t.qi) }}
                        onDrop={e => { e.preventDefault(); handleQueueDrop(t.qi) }}
                        onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
                        style={{ display: 'flex', gap: 8, padding: '4px 6px', borderRadius: 6, alignItems: 'center', opacity: dragIdx === t.qi ? 0.35 : 1, borderTop: dropIdx === t.qi && dragIdx !== null && dragIdx !== t.qi ? '2px solid var(--green)' : '2px solid transparent', transition: 'border-color 0.1s' }}>
                        {isHost && <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.8rem', cursor: 'grab', flexShrink: 0, userSelect: 'none' }}>⣿</span>}
                        <img src={t.thumbnail} alt="" style={{ width: 38, height: 26, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        </div>
                        {isHost && <div style={{ display: 'flex', gap: 3 }}>
                          <button onClick={() => onPlayNow(t, t.qi)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: '0.72rem' }}>▶</button>
                          <button onClick={() => onRemove(t.qi)} style={{ background: 'none', border: 'none', color: 'var(--pink)', cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
                        </div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div key={`${g.videoId}-${gi}`}
                draggable={isHost}
                onDragStart={e => { e.dataTransfer.setData('text/plain', String(g.qi)); setDragIdx(g.qi) }}
                onDragOver={e => { e.preventDefault(); setDropIdx(g.qi) }}
                onDrop={e => { e.preventDefault(); handleQueueDrop(g.qi) }}
                onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
                style={{ display: 'flex', gap: 8, padding: '5px 8px', borderRadius: 8, alignItems: 'center', opacity: dragIdx === g.qi ? 0.35 : 1, borderTop: dropIdx === g.qi && dragIdx !== null && dragIdx !== g.qi ? '2px solid var(--green)' : '2px solid transparent', transition: 'border-color 0.1s' }}
                onMouseEnter={e => { if (dragIdx === null) e.currentTarget.style.background = 'var(--glass-hover)' }}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {isHost && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem', cursor: 'grab', flexShrink: 0, userSelect: 'none' }}>⣿</span>}
                <img src={g.thumbnail} alt="" style={{ width: 44, height: 30, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{g.channelTitle}</div>
                </div>
                {isHost && <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => onPlayNow(g, g.qi)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: '0.75rem' }}>▶</button>
                  <button onClick={() => onRemove(g.qi)} style={{ background: 'none', border: 'none', color: 'var(--pink)', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </div>}
              </div>
            ))
          })()}
        </div>
      ) : (
        <>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <input type="text" value={query} onChange={e => handleSearch(e.target.value)} placeholder="Search songs, artists…" className="input-vibe" style={{ fontSize: '0.85rem', padding: '10px 36px 10px 12px' }} />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}>{searching ? '⏳' : '🔍'}</span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {(globalResults.length > 0 || playlistResults.length > 0) ? (
              <div style={{ padding: '8px' }}>
                {playlistResults.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,255,136,0.7)', padding: '4px 6px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      📋 From Your Playlists
                    </div>
                    {playlistResults.map(track => <TrackRow key={track.videoId + '-pl'} track={track} showPlaylist={true} />)}
                    <div style={{ height: 1, background: 'var(--border)', margin: '8px 6px' }} />
                  </>
                )}
                {globalResults.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '4px 6px 6px' }}>
                      🌍 YouTube Results
                    </div>
                    {globalResults.map(track => <TrackRow key={track.videoId} track={track} showPlaylist={false} />)}
                  </>
                )}
              </div>
            ) : query && !searching ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>No results</div>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: 10 }}>🔍</div>
                <div style={{ fontSize: '0.82rem' }}>Search songs or artists</div>
                <div style={{ fontSize: '0.75rem', marginTop: 6, color: 'var(--text-dim)' }}>Shows results from your playlists + YouTube</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Chat Panel ───
function ChatPanel({ roomId, messages, currentUser }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const REACTIONS = ['👍', '❤️', '😂', '🎵', '🔥']
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try { await sendMessage(roomId, { uid: currentUser.uid, displayName: currentUser.displayName, text: text.trim() }); setText('') }
    catch { toast.error('Failed to send') } finally { setSending(false) }
  }
  const colors = ['var(--green)', 'var(--cyan)', 'var(--pink)', 'var(--purple)', '#f39c12']
  const getColor = uid => colors[uid.charCodeAt(0) % colors.length]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!messages.length && <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 40 }}>No messages yet 👋</div>}
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${getColor(msg.uid)}33`, border: `1px solid ${getColor(msg.uid)}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontSize: '0.7rem', fontWeight: 700, color: getColor(msg.uid), flexShrink: 0 }}>{msg.displayName.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.75rem', fontWeight: 600, color: getColor(msg.uid) }}>{msg.displayName}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.text}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {REACTIONS.map(emoji => {
                  const users = msg.reactions?.[emoji] || []
                  const reacted = users.includes(currentUser.uid)
                  return <button key={emoji} onClick={() => addReaction(roomId, msg.id, emoji, currentUser.uid)} style={{ background: reacted ? 'rgba(0,255,136,0.1)' : 'var(--glass)', border: `1px solid ${reacted ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 12, padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', gap: 4, alignItems: 'center' }}>{emoji}{users.length > 0 && <span style={{ color: 'var(--text-dim)' }}>{users.length}</span>}</button>
                })}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSend} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)} maxLength={500} placeholder="Say something…" className="input-vibe" style={{ flex: 1, fontSize: '0.875rem', padding: '10px 12px' }} />
        <button type="submit" disabled={sending || !text.trim()} className="btn-primary" style={{ padding: '10px 16px', fontSize: '0.8rem', flexShrink: 0 }}>Send</button>
      </form>
    </div>
  )
}

// ─── Participants Panel ───
function ParticipantsPanel({ room, currentUser, isHost, roomId, watchTimes }) {
  const [kickConfirm, setKickConfirm] = useState(null)
  const fmtTime = s => { if (s == null) return null; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }
  async function handleKick(uid) {
    try { await kickParticipant(roomId, uid); toast.success('Removed'); setKickConfirm(null) }
    catch { toast.error('Could not kick') }
  }
  const sorted = [...(room?.participants || [])].sort((a, b) => {
    if (a.uid === room.hostId) return -1
    if (b.uid === room.hostId) return 1
    return (a.displayName || '').localeCompare(b.displayName || '')
  })
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isHost && (
        <div style={{ marginBottom: 8, padding: '12px 14px', background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, color: 'var(--text-dim)' }}>Host Controls</div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ fontSize: '0.82rem' }}>Let guests add songs & control playback</span>
            <div onClick={() => toggleParticipantQueueAccess(roomId, !room.participantsCanAddToQueue)} style={{ width: 42, height: 24, borderRadius: 12, background: room.participantsCanAddToQueue ? 'var(--green)' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.3s' }}>
              <div style={{ position: 'absolute', top: 3, left: room.participantsCanAddToQueue ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: room.participantsCanAddToQueue ? '#000' : 'var(--text-dim)', transition: 'left 0.3s' }} />
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginTop: 10 }}>
            <span style={{ fontSize: '0.82rem' }}>Full access — guests control everything</span>
            <div onClick={() => toggleParticipantFullControl(roomId, !room.participantsFullControl)} style={{ width: 42, height: 24, borderRadius: 12, background: room.participantsFullControl ? '#a855f7' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.3s' }}>
              <div style={{ position: 'absolute', top: 3, left: room.participantsFullControl ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: room.participantsFullControl ? '#fff' : 'var(--text-dim)', transition: 'left 0.3s' }} />
            </div>
          </label>
        </div>
      )}
      <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '4px 0 8px' }}>{sorted.length} Participant{sorted.length !== 1 ? 's' : ''}</div>
      {sorted.map(p => (
        <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: p.uid === currentUser?.uid ? 'rgba(0,255,136,0.04)' : 'transparent' }}>
          <div style={{ position: 'relative' }}>
            <Avatar user={p} size={34} />
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--bg2)', boxShadow: '0 0 6px var(--green)' }} />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.displayName}{p.uid === currentUser?.uid && <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginLeft: 6 }}>(you)</span>}</div>
            {p.uid === room.hostId && <div style={{ fontSize: '0.65rem', color: '#f39c12', fontFamily: 'Oswald' }}>⭐ HOST</div>}
            {watchTimes && fmtTime(watchTimes[p.uid]) && (
              <div style={{ fontSize: '0.65rem', color: 'var(--cyan)', fontFamily: 'Oswald', letterSpacing: '0.05em', marginTop: 1 }}>
                🎬 {fmtTime(watchTimes[p.uid])}
              </div>
            )}
          </div>
          {isHost && p.uid !== currentUser?.uid && (
            kickConfirm === p.uid
              ? <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => handleKick(p.uid)} style={{ background: 'rgba(233,30,99,0.2)', border: '1px solid var(--pink)', color: 'var(--pink)', borderRadius: 6, padding: '3px 10px', fontSize: '0.7rem', cursor: 'pointer' }}>Kick</button>
                  <button onClick={() => setKickConfirm(null)} style={{ background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>✕</button>
                </div>
              : <button onClick={() => setKickConfirm(p.uid)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.85rem' }}>🚫</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── AI Panel ───
function AIBondPanel({ room, canAdd, onAddToQueue, ytAccessToken }) {
  const [provider, setProvider] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [mode, setMode] = useState('auto')
  const [genreQuery, setGenreQuery] = useState('')
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    const p = localStorage.getItem('aibond_provider') || ''
    const gk = localStorage.getItem('aibond_groq_key') || ''
    const mk = localStorage.getItem('aibond_gemini_key') || ''
    setProvider(p); setGroqKey(gk); setGeminiKey(mk)
  }, [])

  const isConfigured = provider === 'server' || (provider === 'groq' && groqKey) || (provider === 'gemini' && geminiKey)

  function saveConfig() {
    if (provider === 'groq' && !groqKey.trim()) { toast.error('Enter your Groq API key'); return }
    if (provider === 'gemini' && !geminiKey.trim()) { toast.error('Enter your Gemini API key'); return }
    if (!provider) { toast.error('Choose a provider'); return }
    localStorage.setItem('aibond_provider', provider)
    if (provider === 'groq') localStorage.setItem('aibond_groq_key', groqKey.trim())
    if (provider === 'gemini') localStorage.setItem('aibond_gemini_key', geminiKey.trim())
    setShowSetup(false); setFetched(false); setRecs([])
    toast.success('AI Bond ready!')
  }

  async function fetchRecs() {
    if (mode === 'genre' && !genreQuery.trim()) { toast.error('Describe the vibe or genre'); return }
    setLoading(true)
    try {
      let playlistContext = []
      if (mode === 'auto' && ytAccessToken) {
        try {
          const plRes = await fetch('/api/youtube/playlists', { headers: { Authorization: `Bearer ${ytAccessToken}` } })
          const plData = await plRes.json()
          playlistContext = (plData.playlists || []).slice(0, 8).map(p => p.title)
        } catch {}
      }
      const endpoint = provider === 'gemini' ? '/api/gemini/recommendations' : '/api/groq/recommendations'
      const body = {
        mode, genre: genreQuery,
        userApiKey: provider === 'groq' ? groqKey : provider === 'gemini' ? geminiKey : undefined,
        currentTrack: room?.currentTrack,
        queueTitles: (room?.queue || []).slice(0, 5).map(t => t.title),
        participantCount: room?.participants?.length || 1,
        playlistContext,
      }
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) { toast.error('AI error: ' + String(data.error).slice(0, 120)); return }
      setRecs(data.recommendations || []); setFetched(true)
    } catch (e) { toast.error('Failed: ' + e.message) } finally { setLoading(false) }
  }

  async function handleAdd(rec) {
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(rec.title + ' ' + rec.artist)}&limit=1`)
      const data = await res.json()
      if (data.results?.[0]) { await onAddToQueue(data.results[0]); toast.success('Added!') }
      else toast.error('Not found on YouTube')
    } catch { toast.error('Failed to add') }
  }

  // ── Setup Screen ──
  if (!isConfigured || showSetup) {
    return (
      <div style={{ padding: '20px 16px', height: '100%', overflowY: 'auto' }}>
        <style>{`@keyframes bearFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`}</style>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 8, display: 'inline-block', animation: 'bearFloat 2.4s ease-in-out infinite' }}>🐻‍❄️</div>
          <div style={{ fontFamily: 'Oswald', fontSize: '1rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>AI Bond</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Smart Music Recommendations</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Choose AI Provider</div>
          {[
            { id: 'server', icon: '⚡', label: 'Quick Start', desc: "App's built-in Groq AI — no setup needed" },
            { id: 'groq', icon: '🤖', label: 'Groq AI (your key)', desc: 'Free key at console.groq.com/keys' },
            { id: 'gemini', icon: '✨', label: 'Gemini AI (your key)', desc: 'Free key at aistudio.google.com/apikey' },
          ].map(opt => (
            <div key={opt.id} onClick={() => setProvider(opt.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${provider === opt.id ? 'var(--green)' : 'var(--border)'}`, background: provider === opt.id ? 'rgba(0,255,136,0.06)' : 'var(--glass)', cursor: 'pointer', marginBottom: 8, transition: 'all 0.2s' }}>
              <span style={{ fontSize: '1.4rem' }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>{opt.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>{opt.desc}</div>
              </div>
              {provider === opt.id && <span style={{ color: 'var(--green)', fontSize: '1rem' }}>✓</span>}
            </div>
          ))}
        </div>
        {(provider === 'groq' || provider === 'gemini') && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 8 }}>
              {provider === 'groq'
                ? <>Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>console.groq.com/keys</a></>
                : <>Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>aistudio.google.com/apikey</a></>}
            </div>
            <input type="password"
              value={provider === 'groq' ? groqKey : geminiKey}
              onChange={e => provider === 'groq' ? setGroqKey(e.target.value) : setGeminiKey(e.target.value)}
              placeholder={`Paste your ${provider === 'groq' ? 'Groq' : 'Gemini'} API key…`}
              className="input-vibe" style={{ fontSize: '0.82rem', width: '100%' }} />
          </div>
        )}
        <button onClick={saveConfig} disabled={!provider} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
          {showSetup ? '💾 Save Changes' : '🚀 Activate AI Bond'}
        </button>
        {showSetup && (
          <button onClick={() => setShowSetup(false)} style={{ width: '100%', marginTop: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 8, padding: '10px', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
        )}
      </div>
    )
  }

  const providerLabel = { server: { label: 'Groq (app)', color: '#f0a500' }, groq: { label: 'Groq', color: '#f0a500' }, gemini: { label: 'Gemini', color: '#4285f4' } }[provider] || { label: '?', color: 'gray' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`@keyframes bearPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}`}</style>

      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.5rem' }}>🐻‍❄️</span>
            <div>
              <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI Bond</div>
              <div style={{ fontSize: '0.62rem', color: providerLabel.color, marginTop: 1 }}>via {providerLabel.label}</div>
            </div>
          </div>
          <button onClick={() => setShowSetup(true)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '4px 10px', fontSize: '0.68rem', cursor: 'pointer' }}>⚙️ Change</button>
        </div>
        {/* Mode pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[['auto', '⚡ Auto'], ['trending', '🌍 Trending'], ['genre', '🎭 By Vibe']].map(([id, label]) => (
            <button key={id} onClick={() => { setMode(id); setFetched(false); setRecs([]) }}
              style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: `1px solid ${mode === id ? 'var(--green)' : 'var(--border)'}`, background: mode === id ? 'rgba(0,255,136,0.1)' : 'transparent', color: mode === id ? 'var(--green)' : 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.58rem', letterSpacing: '0.06em', cursor: 'pointer', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Genre search input */}
      {mode === 'genre' && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input type="text" value={genreQuery} onChange={e => setGenreQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchRecs()}
            placeholder="chill sunday vibes, workout energy, devotional…"
            className="input-vibe" style={{ fontSize: '0.8rem', width: '100%' }} />
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, color: 'var(--text-dim)' }}>
            <span style={{ fontSize: '2.4rem', display: 'inline-block', animation: 'bearPulse 1.2s ease-in-out infinite' }}>🐻‍❄️</span>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Thinking…</div>
          </div>
        ) : !fetched ? (
          <div style={{ padding: '20px 16px' }}>
            <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.6 }}>
              {mode === 'auto' && '⚡ Personalized based on what\'s playing and your playlists'}
              {mode === 'trending' && '🌍 What\'s hot globally right now, across all genres'}
              {mode === 'genre' && '🎭 Describe any mood, vibe, or genre in plain language'}
            </div>
            <button onClick={fetchRecs} disabled={mode === 'genre' && !genreQuery.trim()} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px' }}>
              ✨ Get AI Picks
            </button>
          </div>
        ) : (
          <div style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: 'Oswald', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{recs.length} picks</div>
              <button onClick={fetchRecs} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '4px 10px', fontSize: '0.68rem', cursor: 'pointer' }}>🔄 Refresh</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recs.map((rec, i) => (
                <div key={i} style={{ padding: '12px 14px', background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem', marginBottom: 2 }}>{rec.title}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{rec.artist}</div>
                    </div>
                    <button
                      onClick={() => { if (!canAdd) { toast('Ask host to allow adding songs'); return } handleAdd(rec) }}
                      style={{ background: canAdd ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canAdd ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`, color: canAdd ? 'var(--green)' : 'rgba(255,255,255,0.25)', borderRadius: 6, padding: '4px 10px', fontSize: '0.68rem', cursor: canAdd ? 'pointer' : 'default', fontFamily: 'Oswald', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >+ ADD</button>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>💡 {rec.reasoning}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LYRICS PANEL ───
function LyricsPanel({ lines, plain, synced, loading, currentTime }) {
  const lineRefs = useRef([])
  const activeIdx =
    synced && lines.length
      ? lines.reduce((best, line, i) => (line.time <= currentTime ? i : best), 0)
      : -1

  useEffect(() => {
    if (activeIdx >= 0 && lineRefs.current[activeIdx]) {
      lineRefs.current[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIdx])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
      <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Loading lyrics…
    </div>
  )

  if (synced && lines.length) return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 12px', display: 'flex', flexDirection: 'column', gap: 2, scrollbarWidth: 'none' }}>
      <style>{`#lyr-scroll::-webkit-scrollbar{display:none}`}</style>
      {lines.map((line, i) => (
        <div
          key={i}
          ref={el => { lineRefs.current[i] = el }}
          style={{
            textAlign: 'center',
            padding: '7px 10px',
            borderRadius: 8,
            fontSize: i === activeIdx ? '1.05rem' : '0.875rem',
            fontWeight: i === activeIdx ? 700 : 400,
            color: i === activeIdx ? '#ffffff' : 'rgba(255,255,255,0.28)',
            background: i === activeIdx ? 'rgba(0,255,136,0.07)' : 'transparent',
            transition: 'all 0.35s ease',
            lineHeight: 1.6,
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  )

  if (plain) return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.85, whiteSpace: 'pre-line', textAlign: 'center', scrollbarWidth: 'none' }}>
      <div style={{ marginBottom: 10, fontSize: '0.68rem', fontStyle: 'italic', opacity: 0.5 }}>⚠ Timed sync not available for this track</div>
      {plain}
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-dim)' }}>
      <div style={{ fontSize: '2.5rem' }}>🎵</div>
      <div style={{ fontSize: '0.875rem' }}>No lyrics found for this track</div>
    </div>
  )
}

// ─── MAIN ROOM ───
export default function RoomPage() {
  const { roomId } = useParams()
  const router = useRouter()
  const { user } = useAuth()

  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [rightTab, setRightTab] = useState('chat')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [musicMode, setMusicMode] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [videoFocus, setVideoFocus] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [volume, setVolume] = useState(100)
  const [muted, setMuted] = useState(false)
  const [mobileTapped, setMobileTapped] = useState(false)
  const [mobileTab, setMobileTab] = useState('search')
  const [lastSeenMsgId, setLastSeenMsgId] = useState(null)
  const [floatMsg, setFloatMsg] = useState(null)
  const floatTimerRef = useRef(null)
  const [showVolume, setShowVolume] = useState(false)

  const playerRef = useRef(null)
  const ytPlayerRef = useRef(null)   // actual YT IFrame player — set in handlePlayerReady
  const seekLock = useRef(false)
  const tickRef = useRef(null)
  const volumePopupRef = useRef(null)
  const lastUpdateRef = useRef(0)  // Track recent updates to prevent sync loops
  const prevTrackRef = useRef(null)
  const mobileSkipTimerRef = useRef(null)  // Detects "can't play on mobile browser" stuck state
  const pauseDebounceRef = useRef(null)     // Debounces PAUSED writes to avoid backgrounding false-positives
  const roomRef = useRef(null)              // Always-fresh copy of room — avoids stale closures in event handlers
  const playlistTriedRef = useRef(null)     // videoId of last track we tried loadPlaylist for (prevents infinite loop)
  const keepAliveCtxRef = useRef(null)      // Web Audio context — keeps tab classified as active audio in background
  const keepAliveAudioRef = useRef(null)    // <audio> element driven by the keepalive stream
  const bgWatchdogRef = useRef(null)        // interval that fights YouTube auto-pause while tab is hidden
  const lastSkipAtRef = useRef(0)           // timestamp of last skipToNext call — prevents double-skip when watchdog + handleStateChange both fire
  const pipWindowRef = useRef(null)         // Document Picture-in-Picture floating mini-player window
  const pipSyncRef = useRef(null)           // interval that keeps pip DOM in sync with player state
  const canvasPipRef = useRef(null)         // hidden canvas drawn with track info for mobile PiP
  const videoPipRef = useRef(null)          // hidden <video> fed by canvas stream — requestPictureInPicture target
  const canvasPipIntervalRef = useRef(null) // interval that redraws canvas every 600ms
  const lyricsRef = useRef(null)            // always-fresh lyrics snapshot for canvas PiP drawFrame
  // Watch URL room sync
  const watchIframeRef = useRef(null)       // ref to watch URL <iframe> (non-YT only)
  const watchYtPlayerRef = useRef(null)     // real YT.Player for watch room YouTube videos
  const watchTimeRef = useRef(0)            // latest video time (seconds) — set from real player
  const watchTimerRef = useRef(null)        // interval that increments watchTimeRef when playing
  const prevWatchUpdatedAt = useRef(null)   // tracks last Firestore update to avoid duplicate seeks
  const [watchTime, setWatchTime] = useState(0) // drives the seek bar UI
  const [watchUrlInput, setWatchUrlInput] = useState('')
  const [watchCrop, setWatchCrop] = useState(false)
  const [ytToken, setYtToken] = useState(user?.youtubeAccessToken || null)
  const [lyrics, setLyrics] = useState({ lines: [], plain: null, synced: false, loading: false })
  lyricsRef.current = lyrics // keep ref fresh for canvas drawFrame (avoids stale closure)

  const isHost = room?.hostId === user?.uid
  // canAdd = can add songs to queue
  const canAdd = isHost || room?.participantsCanAddToQueue || room?.participantsFullControl
  // canControl = can play/pause/skip/seek
  const canControl = isHost || room?.participantsCanAddToQueue || room?.participantsFullControl
  // canFullControl = host-level: also gets previous track button
  const canFullControl = isHost || room?.participantsFullControl

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return }
    return subscribeToRoom(roomId, data => { setRoom(data); roomRef.current = data; setLoading(false) })
  }, [roomId, user])

  // ─── Live YouTube token from Firestore (refreshes when user connects in Settings) ───
  useEffect(() => {
    if (!user?.uid) return
    let unsub
    import('firebase/firestore').then(({ onSnapshot, doc: firestoreDoc }) => {
      import('@/lib/firebase').then(({ db: firestoreDb }) => {
        unsub = onSnapshot(firestoreDoc(firestoreDb, 'users', user.uid), snap => {
          if (snap.exists()) setYtToken(snap.data().youtubeAccessToken || null)
        })
      })
    })
    return () => unsub?.()
  }, [user?.uid])

  // ─── Fetch synced lyrics when track changes ───
  useEffect(() => {
    if (!room?.currentTrack?.videoId) {
      setLyrics({ lines: [], plain: null, synced: false, loading: false })
      return
    }
    const track = room.currentTrack
    const title = track.title || ''
    const artist = (track.channelTitle || '').replace(/\s*-\s*Topic$/i, '').trim()
    setLyrics(prev => ({ ...prev, loading: true }))
    fetch(
      `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&duration=${Math.round(duration || 0)}`
    )
      .then(r => r.json())
      .then(data => setLyrics({ lines: data.lines || [], plain: data.plain || null, synced: data.synced || false, loading: false }))
      .catch(() => setLyrics({ lines: [], plain: null, synced: false, loading: false }))
  }, [room?.currentTrack?.videoId])

  // ─── Refresh expired YouTube access token using stored refresh token ───
  async function refreshYtToken() {
    try {
      const { getDoc, doc: firestoreDoc, updateDoc } = await import('firebase/firestore')
      const { db: firestoreDb } = await import('@/lib/firebase')
      const snap = await getDoc(firestoreDoc(firestoreDb, 'users', user.uid))
      const refreshToken = snap.data()?.youtubeRefreshToken
      if (!refreshToken) { toast.error('Please re-link YouTube in Settings'); return null }
      const res = await fetch('/api/youtube/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const data = await res.json()
      if (!data.accessToken) { toast.error('Session expired — please re-link YouTube'); return null }
      await updateDoc(firestoreDoc(firestoreDb, 'users', user.uid), { youtubeAccessToken: data.accessToken })
      setYtToken(data.accessToken)
      return data.accessToken
    } catch {
      toast.error('Could not refresh YouTube session')
      return null
    }
  }

  useEffect(() => {
    if (!roomId) return
    return subscribeToMessages(roomId, setMessages)
  }, [roomId])

  // ─── Sync music mode from Firebase ───
  useEffect(() => {
    if (room?.musicMode !== undefined) {
      setMusicMode(room.musicMode)
    }
  }, [room?.musicMode])

  // ─── Mobile detection ───
  useEffect(() => {
    const check = () => {
      const m = window.innerWidth < 768
      setIsMobile(m)
      if (!m) setMobileTapped(true) // desktop: audio always unlocked, no tap gate needed
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ─── Close volume popup on outside click ───
  useEffect(() => {
    function handleClick(e) {
      if (volumePopupRef.current && !volumePopupRef.current.contains(e.target)) setShowVolume(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('touchstart', handleClick) }
  }, [])

  // ─── Tick: update progress bar every 500ms ───
  useEffect(() => {
    clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      try {
        const p = ytPlayerRef.current
        if (!p) return
        const ct = p.getCurrentTime?.()
        const dur = p.getDuration?.()
        if (typeof ct === 'number' && isFinite(ct) && ct >= 0) setCurrentTime(ct)
        if (typeof dur === 'number' && isFinite(dur) && dur > 0) setDuration(dur)
      } catch {}
    }, 500)
    return () => { clearInterval(tickRef.current); clearTimeout(mobileSkipTimerRef.current); clearTimeout(pauseDebounceRef.current) }
  }, [])

  // ─── Visibility change: keep playing in background, resume on return ───
  useEffect(() => {
    function handleVisibilityChange() {
      const p = ytPlayerRef.current
      const liveRoom = roomRef.current
      if (!p || !liveRoom?.isPlaying) return
      if (document.hidden) {
        // Ensure the silent keepalive audio is playing so Chrome keeps this
        // tab in the "active audio" category — that's what unblocks playVideo()
        // from background JS.
        keepAliveAudioRef.current?.play().catch(() => {})

        // Youtube's iframe fires pauseVideo() ~100–300 ms after visibilitychange.
        // Poll at several checkpoints to cover any timing variation, then keep a
        // sustained watchdog that runs every 1.5 s for as long as the tab stays
        // hidden — Chrome can re-pause silently at any point on low-power devices.
        function tryResume() {
          try {
            if (roomRef.current?.isPlaying && ytPlayerRef.current?.getPlayerState?.() !== 1)
              ytPlayerRef.current?.playVideo?.()
          } catch {}
        }
        setTimeout(tryResume, 300)
        setTimeout(tryResume, 700)
        setTimeout(tryResume, 1400)
        setTimeout(tryResume, 2500)

        // Clear any existing watchdog before starting a new one
        clearInterval(bgWatchdogRef.current)
        bgWatchdogRef.current = setInterval(() => {
          if (!document.hidden) { clearInterval(bgWatchdogRef.current); return }
          tryResume()
        }, 1500)
        return
      }
      // Tab came back to foreground — stop watchdog and re-sync
      clearInterval(bgWatchdogRef.current)
      try {
        const state = p.getPlayerState?.()
        if (state !== 1) {
          if (liveRoom.currentTime) p.seekTo?.(liveRoom.currentTime, true)
          p.unMute?.()
          p.setVolume?.(volume)
          p.playVideo?.()
        }
      } catch {}
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(bgWatchdogRef.current)
    }
  }, [volume])

  // ─── Watch URL room: real player helpers ───
  function watchPlay()         { try { watchYtPlayerRef.current?.playVideo?.()         } catch {} }
  function watchPause()        { try { watchYtPlayerRef.current?.pauseVideo?.()        } catch {} }
  function watchSeek(t)        { try { watchYtPlayerRef.current?.seekTo?.(t, true)     } catch {} }
  function watchGetTime()      { try { return watchYtPlayerRef.current?.getCurrentTime?.() ?? watchTimeRef.current } catch { return watchTimeRef.current } }

  // Called when the watch YouTube player is ready (onReady)
  function handleWatchPlayerReady(e) {
    watchYtPlayerRef.current = e.target
    const r = roomRef.current
    const t = r?.watchCurrentTime || 0
    if (t > 1) e.target.seekTo(t, true)
    if (r?.watchIsPlaying) e.target.playVideo()
    else e.target.pauseVideo()
  }

  // Sync all participants to host's play/pause/seek via Firestore
  useEffect(() => {
    if (!room?.watchUrl) return
    const isNewUpdate = room.watchUpdatedAt && room.watchUpdatedAt !== prevWatchUpdatedAt.current
    prevWatchUpdatedAt.current = room.watchUpdatedAt

    if (room.watchIsPlaying) {
      if (isNewUpdate) {
        const elapsed = (Date.now() - room.watchUpdatedAt) / 1000
        const seekTo = Math.max(0, (room.watchCurrentTime || 0) + elapsed)
        watchSeek(seekTo)
      }
      watchPlay()
    } else {
      watchPause()
      if (isNewUpdate) watchSeek(room.watchCurrentTime || 0)
    }
  }, [room?.watchIsPlaying, room?.watchUpdatedAt, room?.watchUrl])

  // ─── Poll real player time every 500ms → drives UI + watchTimeRef ───
  useEffect(() => {
    if (!room?.watchUrl) return
    const iv = setInterval(() => {
      if (!watchYtPlayerRef.current?.getCurrentTime) return
      const t = watchYtPlayerRef.current.getCurrentTime()
      watchTimeRef.current = t
      setWatchTime(Math.floor(t))
    }, 500)
    return () => clearInterval(iv)
  }, [room?.watchUrl])

  // ─── Host: save current time to Firestore every 5s so guests can resume on reload ───
  useEffect(() => {
    if (!room?.watchUrl || !isHost) return
    const iv = setInterval(() => {
      if (watchYtPlayerRef.current?.getCurrentTime) {
        const t = watchYtPlayerRef.current.getCurrentTime()
        updateWatchPlayback(roomId, { watchCurrentTime: t }).catch(() => {})
      }
    }, 5000)
    return () => clearInterval(iv)
  }, [room?.watchUrl, isHost, roomId])

  // ─── Broadcast this user's watch time for People panel ───
  useEffect(() => {
    if (!room?.watchUrl || !user?.uid) return
    const iv = setInterval(() => {
      updateParticipantWatchTime(roomId, user.uid, watchTimeRef.current).catch(() => {})
    }, 5000)
    return () => clearInterval(iv)
  }, [room?.watchUrl, user?.uid, roomId])

  // ─── MediaSession API: lock-screen / notification controls (iOS 14.5+, Android Chrome) ───
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const track = room?.currentTrack
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title || 'Unknown',
          artist: (track.channelTitle || '').replace(/\s*-\s*Topic$/i, ''),
          artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '320x180', type: 'image/jpeg' }] : [],
        })
      : null
    navigator.mediaSession.playbackState = room?.isPlaying ? 'playing' : 'paused'
    // Report position so the OS scrubber advances while the tab is in background
    try {
      if (track && duration > 0) {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(currentTime, duration),
        })
      }
    } catch {}
  }, [room?.currentTrack?.videoId, room?.isPlaying, currentTime, duration])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !canControl) return
    const seek = (details) => {
      if (typeof details.seekTime !== 'number') return
      ytPlayerRef.current?.seekTo?.(details.seekTime, true)
      updatePlayback(roomId, { currentTime: details.seekTime })
    }
    navigator.mediaSession.setActionHandler('play', () => {
      ytPlayerRef.current?.playVideo?.()
      updatePlayback(roomId, { isPlaying: true, currentTime: ytPlayerRef.current?.getCurrentTime?.() || 0 })
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      ytPlayerRef.current?.pauseVideo?.()
      updatePlayback(roomId, { isPlaying: false, currentTime: ytPlayerRef.current?.getCurrentTime?.() || 0 })
    })
    navigator.mediaSession.setActionHandler('nexttrack', isHost ? () => skipToNext(roomId) : null)
    navigator.mediaSession.setActionHandler('previoustrack', null)
    navigator.mediaSession.setActionHandler('seekto', seek)
    return () => {
      ;['play','pause','nexttrack','previoustrack','seekto'].forEach(a => {
        try { navigator.mediaSession.setActionHandler(a, null) } catch {}
      })
    }
  }, [canControl, isHost, roomId])

  // ─── Wake Lock: prevent screen sleep while playing (Android / desktop) ───
  useEffect(() => {
    if (!room?.isPlaying || !('wakeLock' in navigator)) return
    let lock = null
    navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => {})
    return () => { lock?.release?.().catch(() => {}) }
  }, [room?.isPlaying])

  // ─── Floating new message bubble on mobile ───
  useEffect(() => {
    if (!isMobile || !messages.length) return
    const latest = messages[messages.length - 1]
    if (!latest || latest.id === lastSeenMsgId) return
    if (mobileTab === 'chat') { setLastSeenMsgId(latest.id); return }
    setFloatMsg(latest)
    clearTimeout(floatTimerRef.current)
    floatTimerRef.current = setTimeout(() => setFloatMsg(null), 4000)
  }, [messages, isMobile])

  useEffect(() => {
    if (mobileTab === 'chat' && messages.length) {
      setLastSeenMsgId(messages[messages.length - 1]?.id)
      setFloatMsg(null)
    }
  }, [mobileTab])

  // ─── Track played history (host writes to Firestore; all clients read room.playedHistory) ───
  useEffect(() => {
    if (!room) return
    const curr = room.currentTrack
    const prev = prevTrackRef.current
    if (isHost && prev && curr?.videoId !== prev.videoId) {
      import('firebase/firestore').then(({ updateDoc, doc }) => {
        import('@/lib/firebase').then(({ db: firestoreDb }) => {
          updateDoc(doc(firestoreDb, 'rooms', roomId), {
            playedHistory: [...(room.playedHistory || []).slice(-49), prev]
          })
        })
      })
    }
    prevTrackRef.current = curr || null
    // Clear any previous stuck-video timer
    clearTimeout(mobileSkipTimerRef.current)
    // Start a fresh 7s timer every time the track changes on mobile.
    // handlePlayerReady only fires on initial mount — this covers all subsequent track changes.
    if (curr && room.isPlaying && isMobile) {
      mobileSkipTimerRef.current = setTimeout(async () => {
        const state = ytPlayerRef.current?.getPlayerState?.()
        if (state === -1) {
          if (isHost) {
            if (Date.now() - lastSkipAtRef.current < 4000) return
            lastSkipAtRef.current = Date.now()
            await skipToNext(roomId)
          } else {
            const { updateDoc, doc } = await import('firebase/firestore')
            const { db } = await import('@/lib/firebase')
            await updateDoc(doc(db, 'rooms', roomId), { skipRequested: Date.now() })
          }
        }
      }, 3000)
    }
  }, [room?.currentTrack?.videoId])

  // ─── Non-host sync — audio always unlocked here (past entry gate) ───
  useEffect(() => {
    if (!room || isHost) return
    try {
      const p = ytPlayerRef.current
      if (!p) return
      const vid = p.getVideoData?.()?.video_id
      if (room.currentTrack?.videoId && vid !== room.currentTrack.videoId) {
        // Track changed — always sync, never blocked by the 1-second guard.
        // The guard was causing canControl participants to miss new tracks when
        // ENDED set lastUpdateRef just before the new track arrived in Firestore.
        loadAndPlay(room.currentTrack.videoId, room.currentTime || 0)
        return
      }
      // Play/pause state change — only apply if we didn't trigger it ourselves
      const now = Date.now()
      if (now - lastUpdateRef.current < 1000) return
      const state = p.getPlayerState?.()
      if (room.isPlaying && state !== 1) p.playVideo?.()
      else if (!room.isPlaying && state !== 2) p.pauseVideo?.()
    } catch {}
  }, [room?.isPlaying, room?.currentTrack?.videoId, isHost])

  // ─── Non-host: seek correction when drifting >2s from host ───
  useEffect(() => {
    if (!room || isHost || !room.currentTrack?.videoId) return
    try {
      const p = ytPlayerRef.current
      if (!p) return
      const state = p.getPlayerState?.()
      // Only correct when playing (state 1) or buffering (state 3)
      if (state !== 1 && state !== 3) return
      const guestTime = p.getCurrentTime?.()
      if (typeof guestTime !== 'number') return
      const drift = Math.abs(guestTime - (room.currentTime || 0))
      if (drift > 2.5) {
        p.seekTo(room.currentTime, true)
      }
    } catch {}
  }, [room?.currentTime])

  // ─── Host: push timestamp every 2s ───
  useEffect(() => {
    if (!isHost || !room?.isPlaying) return
    const iv = setInterval(() => {
      try {
        const t = ytPlayerRef.current?.getCurrentTime?.()
        if (typeof t === 'number' && isFinite(t)) updatePlayback(roomId, { currentTime: t })
      } catch {}
    }, 2000)
    return () => clearInterval(iv)
  }, [isHost, room?.isPlaying, roomId])

  // ─── Host: load new track when currentTrack changes in Firestore ─────────
  // Covers: manual skip button, auto-advance after ENDED, participant skipRequest.
  // The "Full Access" useEffect below only runs when participantsFullControl=true,
  // so without this the host's player never loaded the next song after a skip.
  useEffect(() => {
    if (!room || !isHost || !room.currentTrack?.videoId) return
    try {
      const p = ytPlayerRef.current
      if (!p) return
      const vid = p.getVideoData?.()?.video_id
      if (vid !== room.currentTrack.videoId) {
        loadAndPlay(room.currentTrack.videoId, room.currentTime || 0)
      }
    } catch {}
  }, [room?.currentTrack?.videoId])

  // ─── Host: follow Firestore when Full Access is on (guests can command the room) ───
  useEffect(() => {
    if (!room || !isHost || !room.participantsFullControl) return
    try {
      const p = ytPlayerRef.current
      if (!p) return
      const vid = p.getVideoData?.()?.video_id
      if (room.currentTrack?.videoId && vid !== room.currentTrack.videoId) {
        loadAndPlay(room.currentTrack.videoId, room.currentTime || 0)
        return
      }
      const state = p.getPlayerState?.()
      if (room.isPlaying && state !== 1) p.playVideo?.()
      else if (!room.isPlaying && (state === 1 || state === 3)) p.pauseVideo?.()
    } catch {}
  }, [room?.isPlaying, room?.currentTrack?.videoId, room?.participantsFullControl])

  // ─── All players: seek when an explicit seekCommand is issued ───
  useEffect(() => {
    if (!room?.seekCommand) return
    const age = Date.now() - (room.seekCommand.at || 0)
    if (age > 5000) return // stale, ignore
    if (seekLock.current) return // we just seeked ourselves
    try {
      const p = ytPlayerRef.current
      if (!p) return
      p.seekTo(room.seekCommand.time, true)
      setCurrentTime(room.seekCommand.time)
    } catch {}
  }, [room?.seekCommand?.at])

  // ─── Host: act on skipRequested from a mobile participant who can't play the video ───
  useEffect(() => {
    if (!isHost || !room?.skipRequested) return
    const age = Date.now() - room.skipRequested
    if (age > 15000) return // stale, ignore
    // Guard against double-skip: handleStateChange or PiP watchdog may have already
    // called skipToNext for the same song end event that caused the participant to
    // write skipRequested. Without this, every non-host ENDED drains an extra song.
    if (Date.now() - lastSkipAtRef.current < 4000) return
    lastSkipAtRef.current = Date.now()
    skipToNext(roomId)
  }, [room?.skipRequested])

  // Start (or resume) a near-silent oscillator piped into an <audio> element.
  // Chrome classifies tabs with a playing HTMLMediaElement as "active audio" and
  // allows background JS + playVideo() calls to succeed — which is what lets us
  // fight back YouTube's auto-pause when the user switches apps.
  //
  // IMPORTANT: We use a real <audio src=blobURL> here, NOT a MediaStream.
  // AudioContexts are suspended by Chrome when a tab goes to background, making
  // the MediaStream approach silently fail at the worst possible moment.
  // A looping <audio> with a real src stays "active audio" even when hidden.
  function initAudioKeepAlive() {
    if (keepAliveAudioRef.current) {
      keepAliveAudioRef.current.play().catch(() => {})
      return
    }
    try {
      // Build a 0.1-second silent WAV (800 samples @ 8 kHz, 8-bit PCM) in memory.
      const sr = 8000, n = 800
      const buf = new ArrayBuffer(44 + n)
      const dv = new DataView(buf)
      const ws = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)))
      ws(0, 'RIFF'); dv.setUint32(4, 36 + n, true); ws(8, 'WAVE')
      ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true)
      dv.setUint16(22, 1, true); dv.setUint32(24, sr, true)
      dv.setUint32(28, sr, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true)
      ws(36, 'data'); dv.setUint32(40, n, true)
      new Uint8Array(buf, 44).fill(0x80) // 0x80 = silence for 8-bit PCM
      const audio = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })))
      audio.loop = true
      audio.volume = 0.001  // must be > 0 — volume=0 makes Chrome ignore it for "active audio" classification
      audio.play().catch(() => {})
      keepAliveAudioRef.current = audio
    } catch {}
  }

  // ─── Document Picture-in-Picture mini-player ───
  // Opens a floating always-on-top popup with track info + controls.
  // Works even when the main browser window is minimised.
  async function openMiniPlayer() {
    // Close existing pip window if open
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close()
      return
    }
    if (!('documentPictureInPicture' in window)) {
      toast.error('Mini-player not supported in this browser (Chrome 116+ required)')
      return
    }
    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({ width: 340, height: 180, preferInitialWindowPlacement: true })
      pipWindowRef.current = pipWin

      // ── Inject styles ──
      const style = pipWin.document.createElement('style')
      style.textContent = `
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
        body { background: #0d0d0d; color: #fff; height: 100vh; display: flex; flex-direction: column; justify-content: center; user-select: none; overflow: hidden; }
        #pip { display: flex; align-items: center; gap: 12px; padding: 14px; }
        #thumb { width: 54px; height: 54px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        #thumb-placeholder { width: 54px; height: 54px; border-radius: 8px; background: #1a1a1a; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; }
        #info { flex: 1; overflow: hidden; }
        #title { font-size: 0.82rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #artist { font-size: 0.7rem; color: #888; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #controls { display: flex; align-items: center; gap: 8px; margin-top: 0; flex-shrink: 0; }
        button { background: none; border: none; cursor: pointer; color: #fff; font-size: 1.1rem; padding: 4px; border-radius: 50%; transition: color 0.15s; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; }
        #play-btn { background: #00ff88; color: #000; width: 42px; height: 42px; font-size: 1.2rem; }
        button:hover { opacity: 0.75; }
        #progress-wrap { padding: 0 14px 12px; }
        #progress-bar { width: 100%; height: 3px; background: rgba(255,255,255,0.12); border-radius: 2px; position: relative; }
        #progress-fill { height: 100%; background: linear-gradient(90deg,#00ff88,#00e5ff); border-radius: 2px; transition: width 0.5s linear; }
        #times { display: flex; justify-content: space-between; font-size: 0.62rem; color: #555; margin-top: 5px; }
        #status { font-size: 0.6rem; color: #444; text-align: center; padding-bottom: 6px; letter-spacing: 0.06em; text-transform: uppercase; }
      `
      pipWin.document.head.appendChild(style)

      // ── Build HTML ──
      pipWin.document.body.innerHTML = `
        <div id="pip">
          <div id="thumb-placeholder">🎵</div>
          <div id="info"><div id="title">Loading…</div><div id="artist"></div></div>
          <div id="controls">
            <button id="prev-btn" title="Previous">⏮</button>
            <button id="play-btn" title="Play / Pause">▶</button>
            <button id="next-btn" title="Next">⏭</button>
          </div>
        </div>
        <div id="progress-wrap">
          <div id="progress-bar"><div id="progress-fill" style="width:0%"></div></div>
          <div id="times"><span id="t-cur">0:00</span><span id="t-dur">0:00</span></div>
        </div>
        <div id="status">We Vibe • mini player</div>
      `

      // ── Wire up buttons (handlers run in opener's JS context) ──
      pipWin.document.getElementById('play-btn').onclick = () => handlePlayPause()
      pipWin.document.getElementById('next-btn').onclick = () => skipToNext(roomId)
      pipWin.document.getElementById('prev-btn').onclick = () => handlePreviousTrack()

      function fmt(s) {
        if (!s || !isFinite(s)) return '0:00'
        const m = Math.floor(s / 60)
        return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
      }

      // ── Sync loop — updates pip DOM 2× per second ──
      clearInterval(pipSyncRef.current)
      pipSyncRef.current = setInterval(() => {
        if (!pipWindowRef.current || pipWindowRef.current.closed) { clearInterval(pipSyncRef.current); return }
        const liveRoom = roomRef.current
        const track = liveRoom?.currentTrack
        const d = pipWin.document
        try {
          // Thumbnail
          const existing = d.getElementById('thumb')
          if (track?.thumbnail) {
            if (!existing) {
              const img = pipWin.document.createElement('img')
              img.id = 'thumb'
              img.alt = ''
              img.src = track.thumbnail
              d.getElementById('thumb-placeholder')?.replaceWith(img)
            } else if (existing.src !== track.thumbnail) {
              existing.src = track.thumbnail
            }
          }
          // Title / artist
          d.getElementById('title').textContent = track?.title || 'Nothing playing'
          d.getElementById('artist').textContent = track?.channelTitle || ''
          // Play/pause icon
          d.getElementById('play-btn').textContent = liveRoom?.isPlaying ? '⏸' : '▶'
          // Previous button visibility
          d.getElementById('prev-btn').style.opacity = canFullControl ? '1' : '0.2'
          d.getElementById('prev-btn').style.pointerEvents = canFullControl ? 'auto' : 'none'
          // Progress bar
          const p = ytPlayerRef.current
          const ct = (typeof p?.getCurrentTime === 'function' ? p.getCurrentTime() : null) ?? 0
          const dur = (typeof p?.getDuration === 'function' ? p.getDuration() : null) ?? 0
          const pct = dur > 0 ? Math.min(100, (ct / dur) * 100) : 0
          d.getElementById('progress-fill').style.width = `${pct}%`
          d.getElementById('t-cur').textContent = fmt(ct)
          d.getElementById('t-dur').textContent = fmt(dur)
        } catch {}
      }, 500)

      // Clean up when pip window is closed
      pipWin.addEventListener('pagehide', () => {
        clearInterval(pipSyncRef.current)
        pipWindowRef.current = null
      })

      toast.success('Mini player opened — you can minimise this tab now')
    } catch (err) {
      toast.error('Could not open mini player')
    }
  }

  // ─── Mobile Video Picture-in-Picture ─────────────────────────────────────
  // Works on mobile Chrome (Android 8+). We draw track info onto a canvas,
  // pipe it into a hidden <video> element, then call requestPictureInPicture()
  // on that video. Chrome pops it out as a floating overlay — exactly like
  // YouTube Premium — and keeps the tab alive even after you switch apps.
  async function openMobilePip() {
    if (!('pictureInPictureEnabled' in document) || !document.pictureInPictureEnabled) {
      toast.error('Picture-in-Picture not supported in this browser')
      return
    }

    // If already in PiP, exit it
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {})
      canvasPipIntervalRef.current?.cancel?.()
      clearInterval(canvasPipIntervalRef.current) // legacy fallback
      return
    }

    try {
      // ── Canvas setup: 360×110 — canvas px = PiP window size, no DPR scaling ──
      if (!canvasPipRef.current) {
        const c = document.createElement('canvas')
        canvasPipRef.current = c
      }
      const canvas = canvasPipRef.current
      const W = 360, H = 110
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')

      // ── Animation state ──
      const anim = {
        frame: 0,
        thumbImg: null,
        lastTrackId: null,
        skipFired: false,
      }

      function loadThumb(url) {
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => { anim.thumbImg = img }
        img.onerror = () => { anim.thumbImg = null }
        img.src = url
      }

      function fmt(s) {
        if (!s || !isFinite(s)) return '0:00'
        return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
      }

      function drawFrame() {
        anim.frame++
        const liveRoom = roomRef.current
        const track = liveRoom?.currentTrack
        const playing = liveRoom?.isPlaying

        if (track?.videoId !== anim.lastTrackId) {
          anim.lastTrackId = track?.videoId || null
          anim.thumbImg = null
          anim.skipFired = false
          if (track?.thumbnail) loadThumb(track.thumbnail)
          // Sync MediaSession metadata
          if ('mediaSession' in navigator && track) {
            try {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || 'We Vibe',
                artist: (track.channelTitle || '').replace(/\s*-\s*Topic$/i, '').trim(),
              })
            } catch {}
          }
        }

        // Keep MediaSession playback state in sync
        if ('mediaSession' in navigator) {
          try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused' } catch {}
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0)

        // ── Current time / duration ──
        let ct = 0, dur = 0
        try {
          const p = ytPlayerRef.current
          ct = (typeof p?.getCurrentTime === 'function' ? p.getCurrentTime() : null) ?? 0
          dur = (typeof p?.getDuration === 'function' ? p.getDuration() : null) ?? 0
        } catch {}
        const pct = dur > 0 ? Math.min(1, ct / dur) : 0

        // ── Background: dark gradient ──
        const bg = ctx.createLinearGradient(0, 0, 0, H)
        bg.addColorStop(0, '#0e0e16')
        bg.addColorStop(1, '#1a1020')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, W, H)

        // Orange top accent strip
        ctx.fillStyle = '#f97316'
        ctx.fillRect(0, 0, W, 2)

        // ── Play/Pause indicator circle (left) ──
        const btnX = 30, btnY = Math.floor(H / 2) - 4
        ctx.strokeStyle = playing ? '#f97316' : 'rgba(255,255,255,0.3)'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(btnX, btnY, 18, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = playing ? '#f97316' : 'rgba(255,255,255,0.65)'
        ctx.font = '14px system-ui'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(playing ? '⏸' : '▶', btnX + (playing ? 0 : 1), btnY)

        // ── Right content area ──
        const cX = 58, cR = W - 12, cW = cR - cX
        ctx.textBaseline = 'alphabetic'

        // Title
        const title = track?.title || 'Nothing playing'
        const shortTitle = title.length > 36 ? title.slice(0, 35) + '…' : title
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 12px system-ui'
        ctx.textAlign = 'left'
        ctx.fillText(shortTitle, cX, 22)

        // Artist
        const artist = (track?.channelTitle || '').replace(/\s*-\s*Topic$/i, '').trim()
        const shortArtist = artist.length > 50 ? artist.slice(0, 49) + '…' : artist
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = '9px system-ui'
        ctx.fillText(shortArtist, cX, 34)

        // Active lyric (single line, orange)
        const lyrSnap = lyricsRef.current
        const hasSync = lyrSnap?.synced && lyrSnap?.lines?.length > 0
        if (hasSync) {
          const lines = lyrSnap.lines
          const activeIdx = lines.reduce((best, line, i) => line.time <= ct ? i : best, 0)
          const lyric = lines[activeIdx]?.text || ''
          const shortLyric = lyric.length > 52 ? lyric.slice(0, 51) + '…' : lyric
          ctx.fillStyle = '#f97316'
          ctx.font = 'bold 9px system-ui'
          ctx.fillText(shortLyric, cX, 49)
        }

        // ── Wavy animated progress bar ──
        const waveY = 68, amp = 4, wfreq = 0.10
        const wphase = (anim.frame * 0.08) % (Math.PI * 2)

        // Dim background wave
        ctx.beginPath()
        for (let x = 0; x <= cW; x++) {
          const wy = waveY + Math.sin(x * wfreq + wphase) * amp
          if (x === 0) ctx.moveTo(cX + x, wy)
          else ctx.lineTo(cX + x, wy)
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1.5
        ctx.lineJoin = 'round'
        ctx.stroke()

        // Orange filled wave clipped to progress
        if (pct > 0) {
          const fillW = cW * pct
          ctx.save()
          ctx.beginPath()
          ctx.rect(cX, waveY - amp - 3, fillW, (amp + 3) * 2)
          ctx.clip()
          ctx.beginPath()
          for (let x = 0; x <= cW; x++) {
            const wy = waveY + Math.sin(x * wfreq + wphase) * amp
            if (x === 0) ctx.moveTo(cX + x, wy)
            else ctx.lineTo(cX + x, wy)
          }
          ctx.strokeStyle = '#f97316'
          ctx.lineWidth = 2.5
          ctx.lineJoin = 'round'
          ctx.stroke()
          ctx.restore()

          // Playhead dot riding the wave
          const dotX = cX + cW * pct
          const dotY = waveY + Math.sin(cW * pct * wfreq + wphase) * amp
          ctx.beginPath(); ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2)
          ctx.fillStyle = '#fb923c'; ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke()
        }

        // Timestamps
        ctx.fillStyle = 'rgba(255,255,255,0.32)'
        ctx.font = '8px system-ui'
        ctx.textAlign = 'left';  ctx.fillText(fmt(ct),  cX, 88)
        ctx.textAlign = 'right'; ctx.fillText(fmt(dur), cR, 88)

        // Pulsing live dot top-right
        if (playing) {
          const pulse = 0.5 + 0.5 * Math.sin(anim.frame * 0.15)
          ctx.beginPath(); ctx.arc(W - 9, 9, 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(249,115,22,${(0.5 + pulse * 0.5).toFixed(2)})`
          ctx.fill()
        }
      }

      // ── Animation loop ──
      // rAF handles canvas drawing but is SUSPENDED when document.hidden = true
      // (i.e. whenever the user switches away from the tab while PiP is open).
      // The ENDED watchdog therefore lives in a separate setInterval that keeps
      // running even while the tab is hidden, so songs auto-advance in PiP.
      let rafId = null
      function loop() {
        drawFrame()
        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)

      // Dedicated ENDED-watchdog interval — runs at 1 s even when tab is hidden
      const watchdogInterval = setInterval(() => {
        // Reset skipFired when track changes (drawFrame handles this when visible,
        // but rAF is throttled when hidden so we mirror it here)
        const liveTrackId = roomRef.current?.currentTrack?.videoId || null
        if (liveTrackId !== anim.lastTrackId) {
          anim.lastTrackId = liveTrackId
          anim.skipFired = false
          if (roomRef.current?.currentTrack?.thumbnail) loadThumb(roomRef.current.currentTrack.thumbnail)
          // Return immediately — don't check ENDED this tick. The YT player
          // hasn't loaded the new track yet so its state is still ENDED from the
          // previous song, which would fire skipToNext again (double-skip bug).
          return
        }
        if (!anim.skipFired) {
          try {
            const ytStates = window.YT?.PlayerState
            const pState = ytPlayerRef.current?.getPlayerState?.()
            if (ytStates && pState === ytStates.ENDED) {
              anim.skipFired = true
              if (Date.now() - lastSkipAtRef.current < 4000) return // handleStateChange already fired
              lastSkipAtRef.current = Date.now()
              const liveIsHost = roomRef.current?.hostId === user?.uid
              if (liveIsHost) {
                skipToNext(roomId).catch(() => {})
              } else {
                import('firebase/firestore').then(({ updateDoc, doc }) =>
                  import('@/lib/firebase').then(({ db }) =>
                    updateDoc(doc(db, 'rooms', roomId), { skipRequested: Date.now() }).catch(() => {})
                  )
                )
              }
            }
          } catch {}
        }
      }, 1000)

      // ── Wire canvas → video ──
      if (!videoPipRef.current) {
        const video = document.createElement('video')
        video.muted = true
        video.loop = true
        video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;'
        document.body.appendChild(video)
        videoPipRef.current = video
      }
      const video = videoPipRef.current
      const stream = canvas.captureStream(30)
      video.srcObject = stream
      await video.play()

      // ── Enter PiP ──
      await video.requestPictureInPicture()

      // ── Media Session: wire play/pause/next to YT player ──
      // Chrome shows these as overlay buttons in the PiP window
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', () => {
            try { ytPlayerRef.current?.unMute?.(); ytPlayerRef.current?.playVideo?.() } catch {}
          })
          navigator.mediaSession.setActionHandler('pause', () => {
            try { ytPlayerRef.current?.pauseVideo?.() } catch {}
          })
          navigator.mediaSession.setActionHandler('nexttrack', () => {
            try {
              if (roomRef.current?.hostId === user?.uid) skipToNext(roomId).catch?.(() => {})
            } catch {}
          })
        } catch {}
      }

      // Cancel static interval from before — animation now runs via rAF
      clearInterval(canvasPipIntervalRef.current)
      // Store cancel fn in the ref so leavepictureinpicture can clean up
      canvasPipIntervalRef.current = {
        cancel: () => {
          if (rafId) cancelAnimationFrame(rafId)
          clearInterval(watchdogInterval)
          clearInterval(audioKeepalive)
          document.removeEventListener('visibilitychange', onVisibilityChange)
          try {
            if ('mediaSession' in navigator) {
              navigator.mediaSession.setActionHandler('play', null)
              navigator.mediaSession.setActionHandler('pause', null)
              navigator.mediaSession.setActionHandler('nexttrack', null)
            }
          } catch {}
        }
      }

      // ── Keep YT audio alive while tab is hidden (PiP active) ──
      // Chrome may suspend the YT iframe's audio when the tab goes to background.
      // Every time the tab becomes hidden, forcibly unMute + playVideo so audio continues.
      function onVisibilityChange() {
        if (document.hidden) {
          try {
            const p = ytPlayerRef.current
            if (!p) return
            p.unMute?.()
            p.setVolume?.(100)
            p.playVideo?.()
            // Also send postMessage directly to the iframe — bypasses JS timer throttling
            const iframe = document.querySelector('iframe[src*="youtube"]')
            if (iframe?.contentWindow)
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
          } catch {}
        }
      }
      document.addEventListener('visibilitychange', onVisibilityChange)

      // Also boost audio in the watchdog every second while hidden
      const origWatchdog = watchdogInterval
      const audioKeepalive = setInterval(() => {
        if (!document.hidden) return
        try {
          const p = ytPlayerRef.current
          if (!p) return
          const state = p.getPlayerState?.()
          // State 1 = playing — if not playing, kick it
          if (state !== 1 && roomRef.current?.isPlaying) {
            p.unMute?.()
            p.setVolume?.(100)
            p.playVideo?.()
          } else if (state === 1) {
            // Already playing — just ensure unmuted
            p.unMute?.()
            p.setVolume?.(100)
          }
        } catch {}
      }, 2000)

      // Stop animation when PiP is closed
      video.addEventListener('leavepictureinpicture', () => {
        canvasPipIntervalRef.current?.cancel?.()
      }, { once: true })

      toast.success('Mini player active — switch apps freely!')
    } catch (err) {
      toast.error('Could not open mini player')
    }
  }

  // ─── loadAndPlay: load a video and ensure it plays even when tab is hidden ──
  // When the tab is hidden (PiP active), Chrome blocks the first playVideo() call.
  // We fire retries at 400ms / 900ms / 1800ms / 3000ms from the time of the load
  // so the new track auto-plays regardless of when the iframe is ready.
  function loadAndPlay(videoId, startSeconds = 0) {
    try {
      const p = ytPlayerRef.current
      if (!p) return
      p.loadVideoById({ videoId, startSeconds })
      p.unMute?.(); p.setVolume?.(volume)
    } catch {}
    if (!document.hidden) return
    // Keep a reference so they all use the same videoId
    const targetId = videoId
    ;[400, 900, 1800, 3000].forEach(delay => {
      setTimeout(() => {
        try {
          const p = ytPlayerRef.current
          if (!p || !roomRef.current?.isPlaying) return
          // Guard: stop retrying only if Firestore has moved on to a DIFFERENT track.
          // Do NOT use p.getVideoData().video_id here — when the tab is hidden the
          // YouTube iframe is throttled and getVideoData still returns the OLD id for
          // several seconds after loadVideoById, causing every retry to bail early.
          if (roomRef.current?.currentTrack?.videoId !== targetId) return
          const state = p.getPlayerState?.()
          if (state !== 1) {
            p.unMute?.(); p.setVolume?.(volume)
            p.playVideo?.()
            // Also postMessage directly to iframe — bypasses IFrame API throttling
            // when the tab is hidden (Chrome throttles JS timers but not postMessage)
            try {
              const iframe = document.querySelector('iframe[src*="youtube"]')
              if (iframe?.contentWindow)
                iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
            } catch {}
          }
        } catch {}
      }, delay)
    })
  }

  function handlePlayerReady(e) {
    initAudioKeepAlive()
    try {
      ytPlayerRef.current = e.target
      // Always use roomRef.current — the closure captures a stale `room` at mount time
      const liveRoom = roomRef.current
      if (!liveRoom?.currentTrack?.videoId) return
      e.target.unMute()
      e.target.setVolume(volume)
      if (liveRoom.isPlaying) loadAndPlay(liveRoom.currentTrack.videoId, liveRoom.currentTime || 0)
      else e.target.cueVideoById({ videoId: liveRoom.currentTrack.videoId, startSeconds: liveRoom.currentTime || 0 })
      if (liveRoom.isPlaying && isMobile) {
        clearTimeout(mobileSkipTimerRef.current)
        mobileSkipTimerRef.current = setTimeout(async () => {
          const state = ytPlayerRef.current?.getPlayerState?.()
          if (state === -1) {
            const liveIsHost = roomRef.current?.hostId === user?.uid
            if (liveIsHost) {
              if (Date.now() - lastSkipAtRef.current < 4000) return
              lastSkipAtRef.current = Date.now()
              await skipToNext(roomId)
            } else {
              const { updateDoc, doc } = await import('firebase/firestore')
              const { db } = await import('@/lib/firebase')
              await updateDoc(doc(db, 'rooms', roomId), { skipRequested: Date.now() })
            }
          }
        }, 3000)
      }
    } catch {}
  }

  async function handleStateChange(e) {
    const YT = window.YT?.PlayerState

    if (YT && (e.data === YT.PLAYING || e.data === YT.BUFFERING)) {
      clearTimeout(mobileSkipTimerRef.current)
      // Ensure the keepalive audio is running whenever music starts — it must be
      // active before the user switches tabs, not after.
      initAudioKeepAlive()
      // Always unmute when playback starts — iOS remutes on every new video load
      try { e.target.unMute?.(); e.target.setVolume?.(volume) } catch {}
    }
    // Use roomRef for a live isHost check — the closed-over `isHost` can be stale
    // if the YouTube event handler hasn't been re-registered since the last render.
    const liveIsHost = roomRef.current?.hostId === user?.uid
    if (!YT) return
    if (liveIsHost && !seekLock.current) {
      lastUpdateRef.current = Date.now()
      if (e.data === YT.PLAYING) {
        clearTimeout(pauseDebounceRef.current)
        await updatePlayback(roomId, { isPlaying: true, currentTime: e.target.getCurrentTime() })
      } else if (e.data === YT.PAUSED) {
        const pauseTime = e.target.getCurrentTime()
        clearTimeout(pauseDebounceRef.current)
        // If the page is hidden (user switched app), YouTube auto-paused us.
        // Fight back: re-play immediately AND retry after 300 ms because
        // YouTube sometimes fires a second pause event if it detects hidden again.
        if (document.hidden && roomRef.current?.isPlaying) {
          try { e.target.playVideo?.() } catch {}
          setTimeout(() => {
            try {
              if (document.hidden && roomRef.current?.isPlaying && ytPlayerRef.current?.getPlayerState?.() !== 1)
                ytPlayerRef.current?.playVideo?.()
            } catch {}
          }, 300)
          return
        }
        pauseDebounceRef.current = setTimeout(async () => {
          if (document.hidden) return
          await updatePlayback(roomId, { isPlaying: false, currentTime: pauseTime })
        }, 400)
      } else if (e.data === YT.ENDED) {
        if (Date.now() - lastSkipAtRef.current < 4000) return // watchdog already fired
        lastSkipAtRef.current = Date.now()
        await skipToNext(roomId)
      }
    } else if (!liveIsHost && e.data === YT.ENDED) {
      // Fallback: participant's player fired ENDED — signal host to skip in case
      // host's player missed the event (background, network, mobile throttle)
      try {
        const { updateDoc, doc } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')
        await updateDoc(doc(db, 'rooms', roomId), { skipRequested: Date.now() })
      } catch {}
    }
  }

  async function handlePlayerError(e) {
    clearTimeout(mobileSkipTimerRef.current)
    const liveIsHost = roomRef.current?.hostId === user?.uid

    // Error 101/150 = embedding blocked (common with "- Topic" auto-generated channels).
    // If the track came from a user playlist, reload in playlist context — YouTube allows
    // playlist-owner's videos to play even when standalone embedding is restricted.
    // Guard: only try once per videoId to prevent an infinite error loop.
    if (e.data === 101 || e.data === 150) {
      const failedTrack = roomRef.current?.currentTrack
      if (
        failedTrack?.playlistId &&
        typeof failedTrack?.playlistPosition === 'number' &&
        playlistTriedRef.current !== failedTrack.videoId
      ) {
        playlistTriedRef.current = failedTrack.videoId
        try {
          const p = ytPlayerRef.current
          p?.setLoop?.(false)
          p?.loadPlaylist?.({ list: failedTrack.playlistId, listType: 'playlist', index: failedTrack.playlistPosition })
          return
        } catch {}
      }
    }

    if (liveIsHost) {
      if (Date.now() - lastSkipAtRef.current < 4000) return // another skip already in flight
      lastSkipAtRef.current = Date.now()
      await skipToNext(roomId)
    } else {
      // Non-host: signal host to skip the unplayable video
      try {
        const { updateDoc, doc } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')
        await updateDoc(doc(db, 'rooms', roomId), { skipRequested: Date.now() })
      } catch {}
    }
  }

  async function handlePlayPause() {
    if (!canControl) return
    lastUpdateRef.current = Date.now()
    const p = ytPlayerRef.current
    if (!p) return
    // Cancel any pending debounced pause write before issuing a real one
    clearTimeout(pauseDebounceRef.current)
    if (room.isPlaying) {
      p.pauseVideo()
      await updatePlayback(roomId, { isPlaying: false, currentTime: p.getCurrentTime() })
    } else {
      p.playVideo()
      await updatePlayback(roomId, { isPlaying: true, currentTime: p.getCurrentTime() })
    }
  }

  async function handleSeek(seekTo) {
    if (!canControl) return
    lastUpdateRef.current = Date.now()  // Mark that we're making a change
    seekLock.current = true
    try {
      const p = ytPlayerRef.current
      p?.seekTo?.(seekTo, true)
      setCurrentTime(seekTo)
      const { updateDoc, doc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      await updateDoc(doc(db, 'rooms', roomId), {
        currentTime: seekTo,
        seekCommand: { time: seekTo, at: Date.now() },
      })
    } catch {}
    setTimeout(() => { seekLock.current = false }, 1500)
  }

  async function handleAddToQueue(track) {
    try { await addToQueue(roomId, track) } catch (err) { toast.error(err.message) }
  }

  async function handleStartPlaylist(tracks, playlistMeta) {
    try {
      const tagged = tracks.map(t => ({ ...t, playlistId: playlistMeta?.id, playlistName: playlistMeta?.title, playlistThumb: playlistMeta?.thumbnail }))
      await addManyToQueue(roomId, tagged)
      toast.success(`▶ Playing ${tracks.length} songs`)
    } catch (err) { toast.error(err.message) }
  }

  async function handleShufflePlaylist(tracks, playlistMeta) {
    try {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5)
      const tagged = shuffled.map(t => ({ ...t, playlistId: playlistMeta?.id, playlistName: playlistMeta?.title, playlistThumb: playlistMeta?.thumbnail }))
      await addManyToQueue(roomId, tagged)
      toast.success(`🔀 Shuffling ${tracks.length} songs`)
    } catch (err) { toast.error(err.message) }
  }

  async function handlePlayNow(track, index) {
    if (!canFullControl) return
    const newQueue = room.queue.filter((_, i) => i !== index)
    await setCurrentTrack(roomId, track)
    const { updateDoc, doc } = await import('firebase/firestore')
    const { db } = await import('@/lib/firebase')
    await updateDoc(doc(db, 'rooms', roomId), { queue: newQueue })
  }

  async function handlePreviousTrack() {
    if (!canFullControl) return
    const hist = room.playedHistory || []
    if (hist.length === 0) {
      // Restart current track from beginning
      try { ytPlayerRef.current?.seekTo?.(0, true) } catch {}
      await updatePlayback(roomId, { currentTime: 0, isPlaying: true })
      return
    }
    const prev = hist[hist.length - 1]
    const newQueue = room.currentTrack ? [room.currentTrack, ...(room.queue || [])] : (room.queue || [])
    const { updateDoc, doc } = await import('firebase/firestore')
    const { db } = await import('@/lib/firebase')
    await updateDoc(doc(db, 'rooms', roomId), {
      currentTrack: prev,
      queue: newQueue,
      playedHistory: hist.slice(0, -1),
      currentTime: 0,
      isPlaying: true,
    })
  }

  async function handleLeave() {
    await leaveRoom(roomId, user.uid)
    toast.success('Left the room')
    router.push('/dashboard')
  }

  function copyCode() {
    navigator.clipboard.writeText(room.roomCode)
    setCopied(true)
    toast.success('Copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  function handleVolumeChange(val) {
    const v = parseInt(val, 10)
    setVolume(v)
    setMuted(v === 0)
    try { ytPlayerRef.current?.setVolume?.(v) } catch {}
  }

  function handleToggleMute() {
    if (muted) {
      const restore = volume === 0 ? 80 : volume
      setMuted(false)
      setVolume(restore)
      try { ytPlayerRef.current?.setVolume?.(restore); ytPlayerRef.current?.unMute?.() } catch {}
    } else {
      setMuted(true)
      try { ytPlayerRef.current?.setVolume?.(0); ytPlayerRef.current?.mute?.() } catch {}
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div className="grid-bg" />
      <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      <p style={{ color: 'var(--text-dim)', fontFamily: 'Oswald', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.875rem' }}>Loading Room…</p>
    </div>
  )

  if (!room) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div className="grid-bg" />
      <div style={{ fontFamily: 'Oswald', fontSize: '1.5rem', color: 'var(--pink)' }}>Room Not Found</div>
      <Link href="/dashboard" className="btn-primary">Back to Dashboard</Link>
    </div>
  )

  // ─── Mobile: one-time entry gate — this tap unlocks audio for the ENTIRE session ───
  if (isMobile && !mobileTapped) {
    return (
      <div
        onClick={() => {
          initAudioKeepAlive()
          setMobileTapped(true)
        }}
        style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
      >
        <div className="grid-bg" />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ fontSize: '3.5rem' }}>🕊️</div>
          <div style={{ fontFamily: 'Oswald', fontSize: '2rem', fontWeight: 700, color: 'var(--green)', letterSpacing: '0.12em', textShadow: '0 0 30px rgba(0,255,136,0.5)' }}>WE VIBE</div>
          <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{room.name || 'ROOM'}</div>
          {room.currentTrack && (
            <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 12, maxWidth: 260 }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--green)', fontFamily: 'Oswald', letterSpacing: '0.12em', marginBottom: 6 }}>NOW PLAYING</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
            </div>
          )}
          <button style={{ marginTop: 8, background: 'var(--green)', color: '#000', border: 'none', borderRadius: 50, padding: '16px 52px', fontFamily: 'Oswald', fontSize: '1.1rem', letterSpacing: '0.14em', fontWeight: 700, boxShadow: '0 0 40px rgba(0,255,136,0.45)', cursor: 'pointer' }}>
            ▶ ENTER ROOM
          </button>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontFamily: 'Oswald', letterSpacing: '0.08em' }}>TAP ANYWHERE TO CONTINUE</div>
        </div>
      </div>
    )
  }

  // ─── Shared: hidden YT player (always in DOM) ───
  const hiddenPlayer = room.currentTrack ? (
    <div style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: -1, top: 0, left: 0 }}
      hidden={!musicMode}>
    </div>
  ) : null

  // ─── Shared: Watch URL iframe (shown instead of queue player when set) ───
  const watchUrlEl = room.watchUrl ? (
    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', overflow: 'hidden', flexShrink: 0, borderRadius: 8 }}>
      <iframe
        src={room.watchUrl}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        title="Watch together"
      />
    </div>
  ) : null

  // ─── Shared: YouTube player element (kept in DOM always) ───
  const ytPlayerEl = room.currentTrack ? (
    <div style={musicMode
      // Music mode: hide visually but keep in viewport (iOS Safari blocks off-screen -2000px)
      ? (isMobile
          ? { position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0.001, pointerEvents: 'none', zIndex: -1 }
          : { position: 'fixed', left: '-2000px', top: '-2000px', width: 320, height: 180, pointerEvents: 'none', zIndex: -1 })
      : (!isMobile && videoFocus)
        ? { position: 'relative', width: 'min(100%, calc((100vh - 270px) * 1.778))', aspectRatio: '16/9', overflow: 'hidden', flexShrink: 0 }
        : { position: 'relative', width: '100%', paddingTop: '56.25%', overflow: 'hidden', flexShrink: 0 }
    }>
      <YouTube
        ref={playerRef}
        videoId={room.currentTrack.videoId}
        opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, mute: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0 } }}
        onReady={handlePlayerReady}
        onStateChange={handleStateChange}
        onError={handlePlayerError}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
    </div>
  ) : null

  // ─── Shared: Volume control widget ───
  const volumeIcon = muted || volume === 0 ? '🔇' : volume < 40 ? '🔈' : volume < 75 ? '🔉' : '🔊'
  const volumeWidget = (
    <div ref={volumePopupRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setShowVolume(v => !v)}
        title="Volume"
        style={{ width: 36, height: 36, borderRadius: 8, background: showVolume ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showVolume ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}
      >{volumeIcon}</button>
      {showVolume && (
        <div style={{ position: 'absolute', bottom: isMobile ? 'auto' : '110%', top: isMobile ? '110%' : 'auto', left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,13,13,0.97)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 12, padding: '12px 16px', zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 44 }}>
          <span style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{muted ? 'MUTED' : `${volume}%`}</span>
          <input
            type="range" min="0" max="100" value={muted ? 0 : volume}
            onChange={e => handleVolumeChange(e.target.value)}
            style={{ writingMode: 'vertical-lr', direction: 'rtl', appearance: 'slider-vertical', WebkitAppearance: 'slider-vertical', width: 28, height: 100, cursor: 'pointer', accentColor: 'var(--green)' }}
          />
          <button onClick={handleToggleMute} style={{ background: muted ? 'rgba(233,30,99,0.12)' : 'rgba(0,255,136,0.08)', border: `1px solid ${muted ? 'rgba(233,30,99,0.3)' : 'rgba(0,255,136,0.2)'}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.08em', color: muted ? 'var(--pink)' : 'var(--green)' }}>
            {muted ? 'UNMUTE' : 'MUTE'}
          </button>
        </div>
      )}
    </div>
  )

  // ─── Shared: Player center content ───
  function PlayerContent({ compact = false }) {
    // ── Watch URL mode: fullscreen iframe, no queue controls ──
    if (room.watchUrl) return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, padding: compact ? 8 : 0 }}>
        {watchUrlEl}
        {isHost && (
          <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
            📺 Watching together · only you can see controls inside the video
          </div>
        )}
      </div>
    )

    return room.currentTrack ? (
      <>
        {musicMode && !compact && <MusicVisualizer track={room.currentTrack} isPlaying={room.isPlaying} />}
        {/* Music mode compact: thumbnail + title inline above controls */}
        {musicMode && compact && (
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 0' }}>
            <img src={room.currentTrack.thumbnail} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.6)' }} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.channelTitle}</div>
            </div>
            <MusicVisualizer track={room.currentTrack} isPlaying={room.isPlaying} compact={true} />
          </div>
        )}
        {ytPlayerEl}
        <div style={{ width: '100%', maxWidth: compact ? '100%' : videoFocus ? '100%' : 500, padding: compact ? '6px 14px 10px' : undefined }}>
          {!compact && (
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: 4 }}>{room.currentTrack.channelTitle}</div>
            </div>
          )}
          {compact && !musicMode && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{room.currentTrack.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: 2, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.channelTitle}</div>
            </div>
          )}
          <div style={{ marginBottom: compact ? 12 : 16 }}>
            <ProgressBar currentTime={currentTime} duration={duration} isHost={isHost} canControl={canControl} onSeek={handleSeek} />
          </div>
          {canControl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 12 : 16, justifyContent: 'center' }}>
              {canFullControl && (
                <button onClick={handlePreviousTrack} style={{ width: compact ? 36 : 40, height: compact ? 36 : 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>⏮</button>
              )}
              <button onClick={handlePlayPause} style={{ width: compact ? 46 : 52, height: compact ? 46 : 52, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: compact ? '1rem' : '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.4)', transition: 'transform 0.15s' }}>{room.isPlaying ? '⏸' : '▶'}</button>
              <button onClick={() => skipToNext(roomId)} style={{ width: compact ? 36 : 40, height: compact ? 36 : 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>⏭</button>
              {volumeWidget}
              {!compact && <button onClick={openMobilePip} title="Pop out mini player" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>⧉</button>}
              {compact && <button onClick={openMobilePip} title="Mini player" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⧉</button>}
              {compact && <button onClick={() => setMobileTab('lyrics')} title="Lyrics" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--glass)', border: '1px solid rgba(249,115,22,0.4)', cursor: 'pointer', fontSize: '0.85rem', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📝</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>{room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}</div>
              {volumeWidget}
              {!compact && <button onClick={openMobilePip} title="Pop out mini player" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⧉</button>}
              {compact && <button onClick={openMobilePip} title="Mini player" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⧉</button>}
              {compact && <button onClick={() => setMobileTab('lyrics')} title="Lyrics" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--glass)', border: '1px solid rgba(249,115,22,0.4)', cursor: 'pointer', fontSize: '0.85rem', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📝</button>}
            </div>
          )}
        </div>
      </>
    ) : (
      <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎵</div>
        <div style={{ fontFamily: 'Oswald', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Queue is Empty</div>
        <div style={{ fontSize: '0.9rem' }}>Search and add tracks to start vibing!</div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  //  WATCH URL ROOM — MOBILE
  // ══════════════════════════════════════════
  if (room.watchUrl && isMobile) {
    const isYt = /youtube\.com\/embed/.test(room.watchUrl)
    const fmtTime = s => { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}` }
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000', position: 'relative' }}>
        {/* Header */}
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(13,13,13,0.97)', borderBottom: '1px solid var(--border)', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/dashboard" style={{ fontFamily: 'Oswald', fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)', textDecoration: 'none' }}>WE🕊️</Link>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.68rem', color: 'var(--cyan)', letterSpacing: '0.08em' }}>📺 WATCH ROOM</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={copyCode} style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Oswald', color: 'var(--cyan)', fontSize: '0.7rem' }}>
              {copied ? '✅' : '📋'} {room.roomCode}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '4px 8px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--cyan)' }}>{room.participants?.length || 0}</span>
            </div>
            <button onClick={handleLeave} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(233,30,99,0.1)', border: '1px solid rgba(233,30,99,0.3)', color: 'var(--pink)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            {!isYt && (
              <button onClick={() => setWatchCrop(c => !c)} title="Crop to video" style={{ width: 32, height: 32, borderRadius: 8, background: watchCrop ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${watchCrop ? 'rgba(0,200,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: watchCrop ? 'var(--cyan)' : 'var(--text-dim)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✂️</button>
            )}
          </div>
        </header>

        {/* URL Bar — host only */}
        {isHost && (
          <form onSubmit={e => {
            e.preventDefault()
            const s = watchUrlInput.trim()
            if (!s) return
            const ytMatch = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
            const dmMatch = s.match(/dailymotion\.com\/(?:video|embed\/video)\/([A-Za-z0-9]+)/)
            const vimeoMatch = s.match(/vimeo\.com\/(\d+)/)
            const url = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0&enablejsapi=1`
              : dmMatch ? `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`
              : vimeoMatch ? `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`
              : (/^https?:\/\//i.test(s) ? s : null)
            if (!url) { toast.error('Invalid URL'); return }
            updateWatchPlayback(roomId, { watchUrl: url, watchIsPlaying: false, watchCurrentTime: 0, watchUpdatedAt: Date.now() })
            setWatchUrlInput('')
          }} style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '7px 12px', background: 'rgba(13,13,13,0.97)', borderBottom: '1px solid rgba(0,200,255,0.12)' }}>
            <span style={{ fontSize: '0.85rem', alignSelf: 'center', flexShrink: 0 }}>🔗</span>
            <input
              value={watchUrlInput}
              onChange={e => setWatchUrlInput(e.target.value)}
              placeholder={room.watchUrl || 'Paste new video URL…'}
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', minWidth: 0 }}
            />
            <button type="submit" style={{ flexShrink: 0, background: 'var(--cyan)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#000', fontFamily: 'Oswald', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.06em' }}>GO</button>
          </form>
        )}

        {/* Video */}
        <div style={{ flexShrink: 0, width: '100%', paddingTop: '56.25%', position: 'relative', background: '#000', overflow: 'hidden' }}>
          {isYt ? (
            <YouTube
              key={room.watchUrl}
              videoId={room.watchUrl.match(/embed\/([A-Za-z0-9_-]{11})/)?.[1]}
              opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 } }}
              onReady={handleWatchPlayerReady}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            />
          ) : (
            <iframe
              key={room.watchUrl}
              src={`/api/proxy?url=${encodeURIComponent(room.watchUrl)}`}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', top: watchCrop ? -65 : 0, left: 0, width: '100%', height: watchCrop ? 'calc(100% + 65px)' : '100%', border: 'none' }}
              title="Watch together"
            />
          )}
        </div>

        {/* Sync Controls */}
        {isYt && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid rgba(0,200,255,0.15)' }}>
            {canControl ? (
              <>
                <button
                  onClick={() => {
                    const nowPlaying = !room.watchIsPlaying
                    const t = watchGetTime()
                    if (nowPlaying) watchPlay(); else watchPause()
                    updateWatchPlayback(roomId, { watchIsPlaying: nowPlaying, watchCurrentTime: t, watchUpdatedAt: Date.now() })
                  }}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--cyan)', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 14px rgba(0,200,255,0.4)' }}
                >{room.watchIsPlaying ? '⏸' : '▶'}</button>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--cyan)', flexShrink: 0, minWidth: 36 }}>{fmtTime(watchTime)}</span>
                <input type="range" min="0" max="7200" value={watchTime}
                  onChange={e => { setWatchTime(+e.target.value) }}
                  onMouseUp={e => { watchSeek(+e.target.value); updateWatchPlayback(roomId, { watchCurrentTime: +e.target.value, watchUpdatedAt: Date.now() }) }}
                  onTouchEnd={e => { watchSeek(+e.target.value); updateWatchPlayback(roomId, { watchCurrentTime: +e.target.value, watchUpdatedAt: Date.now() }) }}
                  style={{ flex: 1, accentColor: 'var(--cyan)', cursor: 'pointer' }}
                />
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: '0.9rem' }}>{room.watchIsPlaying ? '▶' : '⏸'}</span>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.68rem', color: 'var(--text-dim)' }}>{room.watchIsPlaying ? 'Playing' : 'Paused by host'} · {fmtTime(watchTime)}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'Oswald', fontSize: '0.6rem', color: 'var(--cyan)', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', borderRadius: 6, padding: '2px 6px' }}>SYNCED</span>
              </div>
            )}
          </div>
        )}

        {/* Tabs: Chat | People */}
        <div style={{ flexShrink: 0, display: 'flex', background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid var(--border)' }}>
          {[['chat','💬','Chat'],['people','👥','People']].map(([id, icon, label]) => (
            <button key={id} onClick={() => setMobileTab(id)}
              style={{ flex: 1, padding: '9px 4px 7px', background: 'transparent', border: 'none', borderBottom: `2px solid ${mobileTab === id ? 'var(--cyan)' : 'transparent'}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: '1rem' }}>{icon}</span>
              <span style={{ fontFamily: 'Oswald', fontSize: '0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: mobileTab === id ? 'var(--cyan)' : 'var(--text-dim)' }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ display: mobileTab === 'people' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <ParticipantsPanel room={room} currentUser={user} isHost={isHost} roomId={roomId} watchTimes={room.watchTimes} />
          </div>
          <div style={{ display: mobileTab !== 'people' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <ChatPanel roomId={roomId} messages={messages} currentUser={user} />
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  //  MOBILE LAYOUT
  // ══════════════════════════════════════════
  if (isMobile) {
    const MOBILE_TABS = [
      { id: 'player', icon: musicMode ? '🎵' : '📺', label: 'Player' },
      { id: 'queue',  icon: '🎶', label: 'Queue' },
      { id: 'chat',   icon: '💬', label: 'Chat' },
      { id: 'people', icon: '👥', label: 'People' },
      { id: 'ai',     icon: '🤖', label: 'AI' },
    ]
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: 'var(--bg)' }}>
        <div className="grid-bg" />

        {/* Mobile Header */}
        <header style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backdropFilter: 'blur(20px)', background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/dashboard" style={{ fontFamily: 'Oswald', fontSize: '1.1rem', fontWeight: 700, color: 'var(--green)', textDecoration: 'none', textShadow: '0 0 12px rgba(0,255,136,0.4)' }}>WE🕊️</Link>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-dim)' }}>{room.mode === 'music' ? '🎵' : '📺'} {room.name || 'ROOM'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={async () => { 
              const newMode = !musicMode
              setMusicMode(newMode)
              await updateMusicMode(roomId, newMode)
            }} style={{ width: 32, height: 32, borderRadius: 8, background: musicMode ? 'rgba(0,255,136,0.08)' : 'rgba(52,152,219,0.08)', border: `1px solid ${musicMode ? 'rgba(0,255,136,0.3)' : 'rgba(52,152,219,0.3)'}`, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {musicMode ? '🎵' : '📺'}
            </button>
            <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.1em', color: 'var(--green)', fontSize: '0.75rem' }}>
              {copied ? '✅' : '📋'} {room.roomCode}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, padding: '4px 8px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--green)' }}>{room.participants?.length || 0}</span>
            </div>
            <button onClick={handleLeave} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(233,30,99,0.1)', border: '1px solid rgba(233,30,99,0.3)', color: 'var(--pink)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </header>

        {/* Mobile Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

          {/* ── Participants strip (top) ── */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '7px 12px', background: 'rgba(13,13,13,0.7)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              <style>{'.hide-scrollbar::-webkit-scrollbar{display:none}'}</style>
              {isHost && (
                <>
                  <div onClick={() => toggleParticipantQueueAccess(roomId, !room.participantsCanAddToQueue)}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 8, border: `1px solid ${room.participantsCanAddToQueue ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`, background: room.participantsCanAddToQueue ? 'rgba(0,255,136,0.08)' : 'transparent', cursor: 'pointer' }}>
                    <div style={{ width: 26, height: 14, borderRadius: 7, background: room.participantsCanAddToQueue ? 'var(--green)' : 'rgba(255,255,255,0.12)', position: 'relative', flexShrink: 0, transition: 'background 0.3s' }}>
                      <div style={{ position: 'absolute', top: 2, left: room.participantsCanAddToQueue ? 13 : 2, width: 10, height: 10, borderRadius: '50%', background: room.participantsCanAddToQueue ? '#000' : 'var(--text-dim)', transition: 'left 0.3s' }} />
                    </div>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.56rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: room.participantsCanAddToQueue ? 'var(--green)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>Guests {room.participantsCanAddToQueue ? 'Can Add' : 'View Only'}</span>
                  </div>
                  <div onClick={() => toggleParticipantFullControl(roomId, !room.participantsFullControl)}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 8, border: `1px solid ${room.participantsFullControl ? 'rgba(168,85,247,0.5)' : 'var(--border)'}`, background: room.participantsFullControl ? 'rgba(168,85,247,0.1)' : 'transparent', cursor: 'pointer' }}>
                    <div style={{ width: 26, height: 14, borderRadius: 7, background: room.participantsFullControl ? '#a855f7' : 'rgba(255,255,255,0.12)', position: 'relative', flexShrink: 0, transition: 'background 0.3s' }}>
                      <div style={{ position: 'absolute', top: 2, left: room.participantsFullControl ? 13 : 2, width: 10, height: 10, borderRadius: '50%', background: room.participantsFullControl ? '#fff' : 'var(--text-dim)', transition: 'left 0.3s' }} />
                    </div>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.56rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: room.participantsFullControl ? '#a855f7' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>Full Access {room.participantsFullControl ? 'ON' : 'OFF'}</span>
                  </div>
                </>
              )}
              {[...(room.participants || [])].sort((a, b) => a.uid === room.hostId ? -1 : b.uid === room.hostId ? 1 : 0).map(p => (
                <div key={p.uid} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ position: 'relative' }}>
                    <Avatar user={p} size={26} />
                    <span style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', border: '1px solid var(--bg)', boxShadow: '0 0 4px var(--green)' }} />
                  </div>
                  <span style={{ fontSize: '0.5rem', color: p.uid === user?.uid ? 'var(--green)' : 'var(--text-dim)', maxWidth: 36, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.uid === room.hostId ? '⭐' : ''}{p.displayName?.split(' ')[0] || 'User'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Compact Player ── */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {PlayerContent({ compact: true })}
          </div>

          {/* ── Tab Bar ── */}
          <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(13,13,13,0.8)', overflowX: 'auto', scrollbarWidth: 'none' }}>
            <style>{`#mob-tabs::-webkit-scrollbar{display:none}`}</style>
            <div id="mob-tabs" style={{ display: 'flex', width: '100%' }}>
              {[['search','🔍','Search'],['queue','🎵','Queue'],['playlists','📋','Playlist'],['aibond','🐻‍❄️','AI Bond'],['chat','💬','Chat'],['lyrics','📝','Lyrics']].map(([id, icon, label]) => {
                const unread = id === 'chat' && floatMsg
                return (
                  <button key={id} onClick={() => setMobileTab(id)}
                    style={{ flex: 1, minWidth: 56, padding: '9px 4px 7px', background: 'transparent', border: 'none', borderBottom: `2px solid ${mobileTab === id ? 'var(--green)' : 'transparent'}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative', transition: 'border-color 0.2s' }}>
                    <span style={{ fontSize: '1rem', filter: mobileTab === id ? 'drop-shadow(0 0 5px rgba(0,255,136,0.7))' : 'none' }}>{icon}</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: mobileTab === id ? 'var(--green)' : 'var(--text-dim)' }}>{label}</span>
                    {unread && <span style={{ position: 'absolute', top: 5, right: '18%', width: 7, height: 7, borderRadius: '50%', background: 'var(--pink)', boxShadow: '0 0 6px var(--pink)' }} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Tab Content ── */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
            <div style={{ display: mobileTab === 'search' || mobileTab === 'queue' || mobileTab === 'playlists' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <SearchAndQueue room={room} isHost={canFullControl} canAdd={canAdd} onAddToQueue={handleAddToQueue} onPlayNow={handlePlayNow} onRemove={i => canFullControl && removeFromQueue(roomId, i)} ytAccessToken={ytToken} initialTab={mobileTab === 'playlists' ? 'playlists' : mobileTab === 'queue' ? 'queue' : 'search'} hideTabs={true} roomId={roomId} playedHistory={room.playedHistory || []} onStartPlaylist={handleStartPlaylist} onShufflePlaylist={handleShufflePlaylist} onTokenExpired={refreshYtToken} />
            </div>
            <div style={{ display: mobileTab === 'aibond' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <AIBondPanel room={room} canAdd={canAdd} onAddToQueue={handleAddToQueue} ytAccessToken={ytToken} />
            </div>
            <div style={{ display: mobileTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <ChatPanel roomId={roomId} messages={messages} currentUser={user} />
            </div>
            <div style={{ display: mobileTab === 'lyrics' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <LyricsPanel lines={lyrics.lines} plain={lyrics.plain} synced={lyrics.synced} loading={lyrics.loading} currentTime={currentTime} />
            </div>
          </div>

          {/* ── Floating new message bubble ── */}
          {floatMsg && mobileTab !== 'chat' && (
            <div onClick={() => setMobileTab('chat')}
              style={{ position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 30, background: 'rgba(13,13,13,0.97)', border: '1px solid rgba(233,30,99,0.35)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', boxShadow: '0 4px 24px rgba(0,0,0,0.7)', animation: 'slideUpFade 0.3s ease' }}>
              <style>{`@keyframes slideUpFade{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(233,30,99,0.2)', border: '1px solid rgba(233,30,99,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.7rem', color: 'var(--pink)', flexShrink: 0 }}>{floatMsg.displayName?.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.68rem', color: 'var(--pink)', marginRight: 6 }}>{floatMsg.displayName}</span>
                <span style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '70%', verticalAlign: 'bottom' }}>{floatMsg.text}</span>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', flexShrink: 0 }}>💬</span>
            </div>
          )}

        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  //  WATCH URL ROOM — DESKTOP
  // ══════════════════════════════════════════
  if (room.watchUrl) {
    const isYt = /youtube\.com\/embed/.test(room.watchUrl)
    const fmtTime = s => { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}` }
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000', position: 'relative' }}>
        <div className="grid-bg" style={{ opacity: 0.3 }} />

        {/* Header */}
        <header style={{ position: 'relative', zIndex: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid rgba(0,200,255,0.15)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/dashboard" style={{ fontFamily: 'Oswald', fontSize: '1.2rem', fontWeight: 700, color: 'var(--cyan)', textDecoration: 'none', textShadow: '0 0 15px rgba(0,200,255,0.5)' }}>WE🕊️</Link>
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <div>
              <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Watch Room</div>
              <div style={{ fontFamily: 'Oswald', fontSize: '1rem', fontWeight: 600, color: 'var(--cyan)' }}>📺 {room.name || room.roomCode}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="badge" style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--cyan)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 4px var(--cyan)', display: 'inline-block', marginRight: 5 }} />
              {room.participants?.length || 0} watching
            </div>
            {isHost && <div className="badge" style={{ background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.3)', color: '#f39c12' }}>⭐ HOST</div>}
            <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Oswald', color: 'var(--cyan)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
              {copied ? '✅' : '📋'} {room.roomCode}
            </button>
            <button onClick={handleLeave} className="btn-danger" style={{ padding: '7px 14px', fontSize: '0.8rem' }}>Leave</button>
          </div>
        </header>

        {/* URL Bar — host only */}
        {isHost && (
          <form onSubmit={e => {
            e.preventDefault()
            const s = watchUrlInput.trim()
            if (!s) return
            const ytMatch = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
            const dmMatch = s.match(/dailymotion\.com\/(?:video|embed\/video)\/([A-Za-z0-9]+)/)
            const vimeoMatch = s.match(/vimeo\.com\/(\d+)/)
            const url = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0&enablejsapi=1`
              : dmMatch ? `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`
              : vimeoMatch ? `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`
              : (/^https?:\/\//i.test(s) ? s : null)
            if (!url) { toast.error('Invalid URL'); return }
            updateWatchPlayback(roomId, { watchUrl: url, watchIsPlaying: false, watchCurrentTime: 0, watchUpdatedAt: Date.now() })
            setWatchUrlInput('')
          }} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', background: 'rgba(13,13,13,0.97)', borderBottom: '1px solid rgba(0,200,255,0.12)', position: 'relative', zIndex: 10 }}>
            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>🔗</span>
            <input
              value={watchUrlInput}
              onChange={e => setWatchUrlInput(e.target.value)}
              placeholder={room.watchUrl || 'Paste new video URL…'}
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '7px 14px', color: '#fff', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none' }}
            />
            <button type="submit" style={{ flexShrink: 0, background: 'var(--cyan)', border: 'none', borderRadius: 8, padding: '8px 18px', color: '#000', fontFamily: 'Oswald', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.08em', boxShadow: '0 0 12px rgba(0,200,255,0.3)' }}>GO</button>
            {!isYt && (
              <button type="button" onClick={() => setWatchCrop(c => !c)} title="Crop to video only" style={{ flexShrink: 0, background: watchCrop ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${watchCrop ? 'rgba(0,200,255,0.4)' : 'rgba(255,255,255,0.15)'}`, borderRadius: 8, padding: '8px 12px', color: watchCrop ? 'var(--cyan)' : 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem' }}>✂️ {watchCrop ? 'Cropped' : 'Crop'}</button>
            )}
          </form>
        )}

        {/* Body: video+controls column + chat sidebar */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Video + Controls */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              {isYt ? (
                <YouTube
                  key={room.watchUrl}
                  videoId={room.watchUrl.match(/embed\/([A-Za-z0-9_-]{11})/)?.[1]}
                  opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 } }}
                  onReady={handleWatchPlayerReady}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <iframe
                  key={room.watchUrl}
                  src={`/api/proxy?url=${encodeURIComponent(room.watchUrl)}`}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', top: watchCrop ? -65 : 0, left: 0, width: '100%', height: watchCrop ? 'calc(100% + 65px)' : '100%', border: 'none', display: 'block' }}
                  title="Watch together"
                />
              )}
            </div>
            {/* Sync controls */}
            {isYt && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', background: 'rgba(13,13,13,0.97)', borderTop: '1px solid rgba(0,200,255,0.15)' }}>
                {canControl ? (
                  <>
                    <button
                      onClick={() => {
                        const nowPlaying = !room.watchIsPlaying
                        const t = watchGetTime()
                        if (nowPlaying) watchPlay(); else watchPause()
                        updateWatchPlayback(roomId, { watchIsPlaying: nowPlaying, watchCurrentTime: t, watchUpdatedAt: Date.now() })
                      }}
                      style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--cyan)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 16px rgba(0,200,255,0.4)', transition: 'transform 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >{room.watchIsPlaying ? '⏸' : '▶'}</button>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', color: 'var(--cyan)', flexShrink: 0, minWidth: 42 }}>{fmtTime(watchTime)}</span>
                    <input type="range" min="0" max="7200" value={watchTime}
                      onChange={e => { setWatchTime(+e.target.value) }}
                      onMouseUp={e => { watchSeek(+e.target.value); updateWatchPlayback(roomId, { watchCurrentTime: +e.target.value, watchUpdatedAt: Date.now() }) }}
                      style={{ flex: 1, accentColor: 'var(--cyan)', cursor: 'pointer' }}
                    />
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'var(--text-dim)', flexShrink: 0 }}>{isHost ? '⭐ HOST CONTROLS' : '🛡️ IN SYNC'}</span>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                    <span style={{ fontSize: '1.1rem' }}>{room.watchIsPlaying ? '▶️' : '⏸️'}</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.75rem', color: 'var(--text-dim)' }}>{room.watchIsPlaying ? 'Playing' : 'Paused by host'} · {fmtTime(watchTime)}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'Oswald', fontSize: '0.65rem', color: 'var(--cyan)', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', borderRadius: 6, padding: '3px 8px' }}>🛡️ SYNCED WITH HOST</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat + People sidebar */}
          <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid rgba(0,200,255,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(13,13,13,0.8)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              {[['chat','💬 Chat'],['people','👥 People']].map(([id, label]) => (
                <button key={id} onClick={() => setRightTab(id)}
                  style={{ padding: '11px 8px', background: 'transparent', border: 'none', borderBottom: `2px solid ${rightTab === id ? 'var(--cyan)' : 'transparent'}`, marginBottom: -1, color: rightTab === id ? 'var(--cyan)' : 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'color 0.2s' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {rightTab === 'chat'
                ? <ChatPanel roomId={roomId} messages={messages} currentUser={user} />
                : <ParticipantsPanel room={room} currentUser={user} isHost={isHost} roomId={roomId} watchTimes={room.watchTimes} />
              }
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  //  DESKTOP LAYOUT
  // ══════════════════════════════════════════
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div className="grid-bg" />

      {/* Header */}
      <header style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', backdropFilter: 'blur(20px)', background: 'rgba(13,13,13,0.9)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ fontFamily: 'Oswald', fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)', textDecoration: 'none', textShadow: '0 0 15px rgba(0,255,136,0.4)' }}>WE🕊️</Link>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Room</div>
            <div style={{ fontFamily: 'Oswald', fontSize: '1rem', fontWeight: 600 }}>{room.mode === 'music' ? '🎵' : '📺'} {room.mode.toUpperCase()} ROOM</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={async () => { 
            const newMode = !musicMode
            setMusicMode(newMode)
            setVideoFocus(false)
            await updateMusicMode(roomId, newMode)
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: musicMode ? 'rgba(0,255,136,0.08)' : 'rgba(52,152,219,0.08)', border: `1px solid ${musicMode ? 'rgba(0,255,136,0.3)' : 'rgba(52,152,219,0.3)'}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Oswald', color: musicMode ? 'var(--green)' : 'var(--cyan)', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
            {musicMode ? '🎵 MUSIC' : '📺 VIDEO'}
          </button>
          {volumeWidget}
          <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.12em', color: 'var(--green)', fontSize: '0.85rem' }}>
            {copied ? '✅' : '📋'} {room.roomCode}
          </button>
          <div className="badge badge-green"><span className="pulse-dot" style={{ width: 6, height: 6 }} />{room.participants?.length || 0} vibing</div>
          {isHost && <div className="badge" style={{ background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.3)', color: '#f39c12' }}>⭐ HOST</div>}
          <button onClick={handleLeave} className="btn-danger" style={{ padding: '7px 14px', fontSize: '0.8rem' }}>Leave</button>
        </div>
      </header>

      {/* 3-Column Layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `${videoFocus ? '0px' : leftCollapsed ? '48px' : '280px'} 1fr ${videoFocus ? '0px' : '300px'}`, overflow: 'hidden', position: 'relative', zIndex: 1, transition: 'grid-template-columns 0.3s ease' }}>

        {/* Left */}
        <div style={{ borderRight: videoFocus ? 'none' : '1px solid var(--border)', background: 'rgba(13,13,13,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, transition: 'all 0.3s ease', position: 'relative' }}>
          {leftCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 16 }}>
              <button onClick={() => setLeftCollapsed(false)} title="Expand sidebar" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', color: 'var(--green)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>▶</button>
              <div style={{ width: 1, height: 60, background: 'var(--border)' }} />
              <span style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Queue</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0', flexShrink: 0 }}>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Queue & Search</span>
                <button onClick={() => setLeftCollapsed(true)} title="Collapse sidebar" style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}>◀</button>
              </div>
              <SearchAndQueue room={room} isHost={canFullControl} canAdd={canAdd} onAddToQueue={handleAddToQueue} onPlayNow={handlePlayNow} onRemove={i => canFullControl && removeFromQueue(roomId, i)} ytAccessToken={ytToken} roomId={roomId} playedHistory={room.playedHistory || []} onStartPlaylist={handleStartPlaylist} onShufflePlaylist={handleShufflePlaylist} onTokenExpired={refreshYtToken} />
            </>
          )}
        </div>

        {/* Center */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: musicMode && room?.currentTrack ? 'flex-start' : 'center', padding: musicMode && room?.currentTrack ? 0 : videoFocus ? '12px 20px' : '20px 24px', gap: videoFocus ? 10 : 16, background: 'rgba(10,10,10,0.4)', overflow: 'hidden', minWidth: 0 }}>
          {room.watchUrl ? (
            <div style={{ width: '100%', maxWidth: 800, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {watchUrlEl}
              <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                📺 Watch together · everyone sees the same video
              </div>
            </div>
          ) : room.currentTrack ? (
            <>
              {/* Video mode: player + focus button */}
              {!musicMode && (
                <div style={{ position: 'relative', width: videoFocus ? 'min(100%, calc((100vh - 270px) * 1.778))' : '100%', maxWidth: videoFocus ? undefined : 700, flexShrink: 0, borderRadius: videoFocus ? 4 : 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
                  {ytPlayerEl}
                  <button onClick={() => setVideoFocus(f => !f)} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.65)', border: `1px solid ${videoFocus ? 'rgba(52,152,219,0.7)' : 'rgba(255,255,255,0.25)'}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Oswald', color: videoFocus ? 'var(--cyan)' : '#fff', fontSize: '0.72rem', letterSpacing: '0.1em', transition: 'all 0.2s', backdropFilter: 'blur(4px)' }}>
                    {videoFocus ? '✕ EXIT FOCUS' : '⛶ FOCUS'}
                  </button>
                </div>
              )}

              {musicMode ? (
                // ── Portrait music player (reference design) + scrolling lyrics ──
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', overflow: 'hidden', padding: '12px 24px 0' }}>
                  {/* Hidden audio source */}
                  <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, overflow: 'hidden' }}>{ytPlayerEl}</div>
                  {/* Album art */}
                  <img src={room.currentTrack.thumbnail} alt="" style={{ width: 110, height: 110, borderRadius: 14, objectFit: 'cover', flexShrink: 0, boxShadow: '0 10px 30px rgba(0,0,0,0.7)', marginBottom: 10 }} />
                  {/* Title */}
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', width: '100%', maxWidth: 340, marginBottom: 2 }}>{room.currentTrack.title}</div>
                  {/* Artist */}
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: 10 }}>{(room.currentTrack.channelTitle || '').replace(/\s*-\s*Topic$/i, '')}</div>
                  {/* Progress */}
                  <div style={{ width: '100%', maxWidth: 340, marginBottom: 10, flexShrink: 0 }}>
                    <ProgressBar currentTime={currentTime} duration={duration} isHost={isHost} canControl={canControl} onSeek={handleSeek} />
                  </div>
                  {/* Controls */}
                  {canControl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 12, flexShrink: 0 }}>
                      <button style={{ background: 'none', border: 'none', cursor: 'default', fontSize: '1rem', color: 'rgba(255,255,255,0.25)', padding: 2, lineHeight: 1 }}>♥</button>
                      {canFullControl && (
                        <button onClick={handlePreviousTrack} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#f97316' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                        >⏮</button>
                      )}
                      <button onClick={handlePlayPause} style={{ width: 46, height: 46, borderRadius: '50%', background: '#f97316', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(249,115,22,0.5)', transition: 'transform 0.15s', flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >{room.isPlaying ? '⏸' : '▶'}</button>
                      <button onClick={() => skipToNext(roomId)} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#f97316' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >⏭</button>
                      <button style={{ background: 'none', border: 'none', cursor: 'default', fontSize: '0.95rem', color: 'rgba(255,255,255,0.25)', padding: 2, lineHeight: 1 }}>⇄</button>
                      {volumeWidget}
                      <button onClick={openMobilePip} title="Pop out mini player" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#f97316' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >⧉</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, flexShrink: 0 }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontStyle: 'italic' }}>{room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}</span>
                      {volumeWidget}
                      <button onClick={openMobilePip} title="Pop out mini player" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⧉</button>
                    </div>
                  )}
                  {/* Lyrics — fills remaining height */}
                  <div style={{ flex: 1, width: '100%', maxWidth: 400, overflow: 'hidden' }}>
                    <LyricsPanel lines={lyrics.lines} plain={lyrics.plain} synced={lyrics.synced} loading={lyrics.loading} currentTime={currentTime} />
                  </div>
                </div>
              ) : (
                // Video mode controls
                <div style={{ width: '100%', maxWidth: videoFocus ? 'min(100%, calc((100vh - 270px) * 1.778))' : 500 }}>
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: 4 }}>{room.currentTrack.channelTitle}</div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <ProgressBar currentTime={currentTime} duration={duration} isHost={isHost} canControl={canControl} onSeek={handleSeek} />
                  </div>
                  {canControl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
                      {canFullControl && (
                        <button onClick={handlePreviousTrack} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                        >⏮</button>
                      )}
                      <button onClick={handlePlayPause} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.4)', transition: 'transform 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >{room.isPlaying ? '⏸' : '▶'}</button>
                      <button onClick={() => skipToNext(roomId)} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >⏭</button>
                      {volumeWidget}
                      <button onClick={openMobilePip} title="Pop out mini player" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >⧉</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>{room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}</span>
                      {volumeWidget}
                      <button onClick={openMobilePip} title="Pop out mini player" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >⧉</button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎵</div>
              <div style={{ fontFamily: 'Oswald', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Queue is Empty</div>
              <div style={{ fontSize: '0.9rem' }}>Search and add tracks to start vibing!</div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ borderLeft: videoFocus ? 'none' : '1px solid var(--border)', background: 'rgba(13,13,13,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div className="tab-bar">
            {[['chat', '💬 Chat'], ['participants', '👥 People'], ['ai', '🐻‍❄️ AI Bond'], ['lyrics', '📝 Lyrics']].map(([id, label]) => (
              <button key={id} className={`tab-btn ${rightTab === id ? 'active' : ''}`} onClick={() => setRightTab(id)} style={{ fontSize: '0.7rem' }}>{label}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {rightTab === 'chat' && <ChatPanel roomId={roomId} messages={messages} currentUser={user} />}
            {rightTab === 'participants' && <ParticipantsPanel room={room} currentUser={user} isHost={isHost} roomId={roomId} />}
            {rightTab === 'ai' && <AIBondPanel room={room} canAdd={canAdd} onAddToQueue={handleAddToQueue} ytAccessToken={ytToken} />}
            {rightTab === 'lyrics' && <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}><LyricsPanel lines={lyrics.lines} plain={lyrics.plain} synced={lyrics.synced} loading={lyrics.loading} currentTime={currentTime} /></div>}
          </div>
        </div>
      </div>
    </div>
  )
}