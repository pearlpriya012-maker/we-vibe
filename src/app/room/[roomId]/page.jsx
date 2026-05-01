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
import dynamic from 'next/dynamic'
import GamesOverlay from '@/components/GamesOverlay'
import GameInviteToast from '@/components/games/GameInviteToast'
import { subscribePictionaryInvite, respondToPictionaryInvite } from '@/lib/pictionaryFirestore'
import { subscribeWordChainInvite, respondToWordChainInvite } from '@/lib/wordChainFirestore'
import { createScreenSession, sendSignal as sendScreenSignal, listenSignals as listenScreenSignals, endScreenSession } from '@/lib/screenshare'

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 24, flexShrink: 0, background: '#000', borderRadius: 4, padding: '0 3px' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ width: 3, borderRadius: 2, background: 'linear-gradient(to bottom, #ff1f6d, #f97316 48%, #0ea5e9)', animation: isPlaying ? `mobileBar2 ${0.28 + i * 0.09}s ease-in-out ${i * 0.07}s infinite alternate` : 'none', height: isPlaying ? `${30 + i * 8}%` : '15%', transition: 'height 0.3s', boxShadow: isPlaying ? '0 0 5px rgba(249,115,22,0.7)' : 'none' }} />
        ))}
        <style>{`@keyframes mobileBar2 { from{height:10%} to{height:100%} }`}</style>
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
      {/* Spectrum bars – symmetric, black bg, pink→orange→cyan + glow */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, padding: '0 8px', background: '#000' }}>
        {Array.from({ length: 55 }).map((_, i) => {
          const t = i / 54
          const env = Math.pow(Math.sin(t * Math.PI), 0.55)
          const baseH = Math.max(4, env * (55 + (i % 9) * 6))
          return (
            <div key={i} style={{
              flex: 1,
              borderRadius: 2,
              background: 'linear-gradient(to bottom, #ff1f6d 0%, #f97316 46%, #0ea5e9 100%)',
              animation: isPlaying ? `specBar2 ${0.22 + (i % 8) * 0.06}s ease-in-out ${i * 0.021}s infinite alternate` : 'none',
              height: isPlaying ? `${baseH}%` : '4%',
              transition: 'height 0.35s ease',
              opacity: isPlaying ? 1 : 0.12,
              boxShadow: isPlaying ? '0 0 4px #f97316, 0 0 10px rgba(255,31,109,0.35)' : 'none',
            }} />
          )
        })}
      </div>
      <style>{`
        @keyframes spinAlbum { from{transform:translate(-50%,-56%) rotate(0deg)} to{transform:translate(-50%,-56%) rotate(360deg)} }
        @keyframes pulseRing { 0%{opacity:0.5;transform:translate(-50%,-56%) scale(1)} 100%{opacity:0;transform:translate(-50%,-56%) scale(1.35)} }
        @keyframes specBar2 { from{height:4%} to{height:100%} }
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
  const [view, setView] = useState('playlists') // 'playlists' | 'tracks' | 'paste'
  const [tokenError, setTokenError] = useState(false)
  const [pasteLink, setPasteLink] = useState('')
  const [pasteLoading, setPasteLoading] = useState(false)

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

  function extractPlaylistId(url) {
    try {
      // Support full URLs and bare IDs
      const u = url.includes('://') ? new URL(url) : new URL('https://music.youtube.com/playlist?list=' + url)
      return u.searchParams.get('list') || null
    } catch {
      // Bare playlist ID like PLxxxxx
      const bare = url.trim()
      if (/^PL[A-Za-z0-9_-]{10,}$/i.test(bare) || /^RDCLAK[A-Za-z0-9_-]+$/i.test(bare) || /^OL[A-Za-z0-9_-]+$/i.test(bare)) return bare
      return null
    }
  }

  async function loadFromPastedLink() {
    const id = extractPlaylistId(pasteLink.trim())
    if (!id) { toast.error('Invalid playlist URL'); return }
    if (!canAdd) { toast('Ask host to allow adding songs'); return }
    setPasteLoading(true)
    try {
      const headers = ytAccessToken ? { Authorization: `Bearer ${ytAccessToken}` } : {}
      const res = await fetch(`/api/youtube/playlistItems?playlistId=${encodeURIComponent(id)}`, { headers })
      const data = await res.json()
      const items = data.results || []
      if (!items.length) { toast.error('No tracks found in that playlist'); return }
      const meta = { id, title: 'Pasted Playlist', thumbnail: items[0]?.thumbnail || '' }
      items.forEach(t => onAddToQueue({ ...t, playlistId: id, playlistName: 'Pasted Playlist', playlistThumb: meta.thumbnail }))
      toast.success(`Added ${items.length} tracks to queue`)
      setPasteLink('')
    } catch {
      toast.error('Could not load playlist')
    } finally {
      setPasteLoading(false)
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Paste-link still available without YT account */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {view === 'paste' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setView('playlists')} style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>←</button>
              <span style={{ fontFamily: 'Oswald', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Paste Playlist Link</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={pasteLink}
                onChange={e => setPasteLink(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadFromPastedLink()}
                placeholder="youtube.com/playlist?list=... or music.youtube.com/..."
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
              />
              <button
                onClick={loadFromPastedLink}
                disabled={pasteLoading || !pasteLink.trim()}
                style={{ background: 'rgba(0,200,255,0.15)', border: '1px solid rgba(0,200,255,0.4)', color: 'var(--cyan)', borderRadius: 8, padding: '8px 14px', fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.08em', cursor: pasteLoading || !pasteLink.trim() ? 'default' : 'pointer', opacity: pasteLoading || !pasteLink.trim() ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {pasteLoading ? '…' : 'ADD ALL'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setView('paste')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--cyan)', borderRadius: 8, padding: '8px 0', fontFamily: 'Oswald', fontSize: '0.72rem', letterSpacing: '0.08em', cursor: 'pointer' }}>
            🔗 PASTE PLAYLIST LINK
          </button>
        )}
      </div>
      {view !== 'paste' && (
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
      )}
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
            <AddButton canAdd={canAdd} onAdd={() => onAddToQueue({ ...track, playlistId: selectedPlaylistMeta?.id, playlistName: selectedPlaylistMeta?.title, playlistThumb: selectedPlaylistMeta?.thumbnail })} />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Paste-link row */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {view === 'paste' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setView('playlists')} style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>←</button>
              <span style={{ fontFamily: 'Oswald', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Paste Playlist Link</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={pasteLink}
                onChange={e => setPasteLink(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadFromPastedLink()}
                placeholder="youtube.com/playlist?list=... or music.youtube.com/..."
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
              />
              <button
                onClick={loadFromPastedLink}
                disabled={pasteLoading || !pasteLink.trim()}
                style={{ background: 'rgba(0,200,255,0.15)', border: '1px solid rgba(0,200,255,0.4)', color: 'var(--cyan)', borderRadius: 8, padding: '8px 14px', fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.08em', cursor: pasteLoading || !pasteLink.trim() ? 'default' : 'pointer', opacity: pasteLoading || !pasteLink.trim() ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {pasteLoading ? '…' : 'ADD ALL'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setView('paste')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--cyan)', borderRadius: 8, padding: '8px 0', fontFamily: 'Oswald', fontSize: '0.72rem', letterSpacing: '0.08em', cursor: 'pointer' }}>
            🔗 PASTE PLAYLIST LINK
          </button>
        )}
      </div>

      {/* Playlists list */}
      {view !== 'paste' && (
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
      )}
    </div>
  )
}

// ─── Add-to-Queue Button with pop animation ───
// Must be a top-level component (same rule as TrackRow) to keep identity stable.
function AddButton({ canAdd, onAdd }) {
  const [added, setAdded] = useState(false)
  const tmRef = useRef(null)
  useEffect(() => () => clearTimeout(tmRef.current), [])
  function handleClick() {
    if (!canAdd) { toast('Ask host to allow adding songs'); return }
    if (added) return
    setAdded(true)
    onAdd()
    tmRef.current = setTimeout(() => setAdded(false), 1600)
  }
  return (
    <button
      onClick={handleClick}
      style={{
        background: added ? 'rgba(0,255,136,0.22)' : (canAdd ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.04)'),
        border: `1px solid ${added ? 'rgba(0,255,136,0.7)' : (canAdd ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)')}`,
        color: added ? '#00ff88' : (canAdd ? 'var(--green)' : 'rgba(255,255,255,0.25)'),
        borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem',
        cursor: canAdd ? 'pointer' : 'default', fontFamily: 'Oswald', flexShrink: 0,
        animation: added ? 'addPop 0.32s ease-out' : 'none',
        boxShadow: added ? '0 0 10px rgba(0,255,136,0.4)' : 'none',
        transition: 'background 0.15s, border-color 0.2s, color 0.15s, box-shadow 0.25s',
        whiteSpace: 'nowrap', minWidth: 58, textAlign: 'center',
      }}
    >{added ? '✓ ADDED' : '+ ADD'}</button>
  )
}

// TrackRow MUST live outside SearchAndQueue — defining it inside causes React to
// unmount+remount every row on each re-render (new function ref = new component
// type), which resets the scroll position whenever room state updates.
function TrackRow({ track, showPlaylist, canAdd, onAddToQueue }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 8px', borderRadius: 8, alignItems: 'center' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <img src={track.thumbnail} alt="" style={{ width: 52, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div title={track.title} style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.channelTitle}{track.durationFormatted ? ` · ${track.durationFormatted}` : ''}
          {showPlaylist && track.playlistName && <span style={{ color: 'rgba(0,255,136,0.6)', marginLeft: 4 }}>· {track.playlistName}</span>}
        </div>
      </div>
      <AddButton canAdd={canAdd} onAdd={() => onAddToQueue(track)} />
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
      await loadPlaylistCache()
      if (playlistCacheRef.current) {
        const filtered = playlistCacheRef.current.filter(t =>
          t.title.toLowerCase().includes(q.toLowerCase()) ||
          (t.channelTitle || '').toLowerCase().includes(q.toLowerCase())
        ).slice(0, 6)
        setPlaylistResults(filtered)
      }
      runYouTubeSearch(q)
    }, 600)
  }

  async function runYouTubeSearch(q) {
    if (!q?.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q.trim())}&limit=10`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setGlobalResults(data.results || [])
    } catch (err) { toast.error('Search failed') }
    finally { setSearching(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs: Search | Queue | Playlist | AI Bond — hidden on mobile (outer tabs handle this) */}
      {!hideTabs && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {[['search', '🔍 Search'], ['queue', '🎵 Queue'], ['playlists', '📋 Playlist']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, minWidth: 'max-content', padding: '10px 10px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === id ? 'var(--green)' : 'transparent'}`, color: tab === id ? 'var(--green)' : 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.62rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s', marginBottom: -1, whiteSpace: 'nowrap' }}>
            {label}
          </button>
        ))}
        </div>
      )}

      {tab === 'playlists' ? (
        <PlaylistPanel onAddToQueue={onAddToQueue} canAdd={canAdd} ytAccessToken={ytAccessToken} onStartPlaylist={onStartPlaylist} onShufflePlaylist={onShufflePlaylist} onTokenExpired={onTokenExpired} cachedPlaylists={fetchedPlaylistsRef.current} onPlaylistsLoaded={data => { fetchedPlaylistsRef.current = data }} />
      ) : tab === 'aibond' ? (
        <AIBondPanel room={room} canAdd={canAdd} onAddToQueue={handleAddToQueue} ytAccessToken={ytAccessToken} />
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
                      {canAdd && <button onClick={() => { onAddToQueue(track) }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', borderRadius: 4, padding: '2px 6px', fontSize: '0.6rem', cursor: 'pointer', flexShrink: 0 }}>↻</button>}
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
            <form onSubmit={e => { e.preventDefault(); runYouTubeSearch(query) }} style={{ position: 'relative' }}>
              <input type="search" value={query} onChange={e => handleSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && runYouTubeSearch(query)} onSearch={e => runYouTubeSearch(e.target.value)} placeholder="Search songs or artists…" className="input-vibe" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} style={{ fontSize: '0.85rem', padding: '10px 36px 10px 12px' }} />
              <button type="submit" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: searching ? 'var(--green)' : 'var(--text-dim)', fontSize: '1rem', padding: 2 }}>{searching ? '⏳' : '🔍'}</button>
            </form>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {(globalResults.length > 0 || playlistResults.length > 0) ? (
              <div style={{ padding: '8px' }}>
                {playlistResults.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,255,136,0.7)', padding: '4px 6px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      📋 From Your Playlists
                    </div>
                    {playlistResults.map(track => <TrackRow key={track.videoId + '-pl'} track={track} showPlaylist={true} canAdd={canAdd} onAddToQueue={onAddToQueue} />)}
                    <div style={{ height: 1, background: 'var(--border)', margin: '8px 6px' }} />
                  </>
                )}
                {globalResults.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '4px 6px 6px' }}>
                      🌍 YouTube Results
                    </div>
                    {globalResults.map(track => <TrackRow key={track.videoId} track={track} showPlaylist={false} canAdd={canAdd} onAddToQueue={onAddToQueue} />)}
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
              <div style={{ fontSize: '0.85rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)', textDecoration: 'underline' }}>{part}</a> : part)}</div>
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
  const [refreshCount, setRefreshCount] = useState(0)
  const seenTitlesRef = useRef(new Set())

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
        seenTitles: [...seenTitlesRef.current].slice(-40),
        refreshSeed: refreshCount,
      }
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) { toast.error('AI error: ' + String(data.error).slice(0, 120)); return }
      const freshRecs = data.recommendations || []
      freshRecs.forEach(r => seenTitlesRef.current.add(r.title))
      setRecs(freshRecs); setFetched(true); setRefreshCount(c => c + 1)
      enrichWithThumbnails(freshRecs)
    } catch (e) { toast.error('Failed: ' + e.message) } finally { setLoading(false) }
  }

  async function enrichWithThumbnails(rawRecs) {
    const results = await Promise.allSettled(
      rawRecs.slice(0, 6).map(async (rec) => {
        try {
          const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(rec.title + ' ' + rec.artist)}&limit=1`)
          const data = await res.json()
          return data.results?.[0] || null
        } catch { return null }
      })
    )
    setRecs(prev => {
      const updated = [...prev]
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          updated[i] = { ...updated[i], thumbnail: r.value.thumbnail, videoId: r.value.videoId, channelTitle: r.value.channelTitle }
        }
      })
      return updated
    })
  }

  async function handleAdd(rec) {
    if (rec.videoId) {
      await onAddToQueue({ videoId: rec.videoId, title: rec.title, channelTitle: rec.channelTitle || rec.artist, thumbnail: rec.thumbnail })
      return
    }
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(rec.title + ' ' + rec.artist)}&limit=1`)
      const data = await res.json()
      if (data.results?.[0]) { await onAddToQueue(data.results[0]) }
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
                    {rec.thumbnail && <img src={rec.thumbnail} alt="" style={{ width: 56, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0, alignSelf: 'center' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rec.title}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rec.channelTitle || rec.artist}</div>
                    </div>
                    <AddButton canAdd={canAdd} onAdd={() => handleAdd(rec)} />
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
  const [copiedLink, setCopiedLink] = useState(false)
  const [showGames, setShowGames] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [pictionaryInvite, setPictionaryInvite] = useState(null)
  const [wordchainInvite, setWordchainInvite] = useState(null)
  const [directGame, setDirectGame] = useState(null)
  const [musicMode, setMusicMode] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [videoFocus, setVideoFocus] = useState(false)
  const [focusLandscape, setFocusLandscape] = useState(true)
  const focusContainerRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)
  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('we-vibe-volume')
      return saved !== null ? Number(saved) : 100
    }
    return 100
  })
  const volumeRef = useRef(volume)
  const [muted, setMuted] = useState(false)
  const [mobileTapped, setMobileTapped] = useState(false)
  const [mobileTab, setMobileTab] = useState('search')
  const [lastSeenMsgId, setLastSeenMsgId] = useState(null)
  const [floatMsg, setFloatMsg] = useState(null)
  const floatTimerRef = useRef(null)
  const [showVolume, setShowVolume] = useState(false)

  const playerRef = useRef(null)
  const ytPlayerRef = useRef(null)   // actual YT IFrame player — set in handlePlayerReady
  // Stable videoId passed to <YouTube> so react-youtube never destroy/recreates the
  // iframe on track changes. We manage all video loads ourselves via loadAndPlay.
  const ytStableVideoIdRef = useRef(null)
  const seekLock = useRef(false)
  const tickRef = useRef(null)
  const volumePopupRef = useRef(null)
  // Keep volumeRef in sync whenever volume state changes
  useEffect(() => {
    volumeRef.current = volume
    localStorage.setItem('we-vibe-volume', String(volume))
  }, [volume])
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
  const canvasPipRef = useRef(null)         // hidden canvas fed into video PiP
  const videoPipRef = useRef(null)          // hidden <video> — requestPictureInPicture target
  const canvasPipIntervalRef = useRef(null) // holds { cancel() } to stop rAF + watchdog
  // Watch URL room sync
  const watchIframeRef = useRef(null)       // ref to watch URL <iframe> (non-YT only)
  const watchYtPlayerRef = useRef(null)     // real YT.Player for watch room YouTube videos
  const watchTimeRef = useRef(0)            // latest video time (seconds) — set from real player
  const watchTimerRef = useRef(null)        // interval that increments watchTimeRef when playing
  const prevWatchUpdatedAt = useRef(null)   // tracks last Firestore update to avoid duplicate seeks
  const [watchTime, setWatchTime] = useState(0) // drives the seek bar UI
  const [watchUrlInput, setWatchUrlInput] = useState('')
  const [watchCrop, setWatchCrop] = useState(false)
  const [watchQuality, setWatchQuality] = useState('auto') // YouTube playback quality
  const [ytToken, setYtToken] = useState(user?.youtubeAccessToken || null)
  const [screenStatus, setScreenStatus] = useState('idle') // 'idle' | 'sharing'
  const [screenCode, setScreenCode] = useState('')
  const screenStreamRef = useRef(null)
  const screenSessionIdRef = useRef(null)
  const screenPcsRef = useRef({})
  const screenDCsRef = useRef({})
  const screenViewerCandidatesRef = useRef({})
  const screenViewerNamesRef = useRef({})
  const unsubScreenSignalsRef = useRef(null)
  const isHost = room?.hostId === user?.uid
  // canAdd = can add songs to queue
  const canAdd = isHost || room?.participantsCanAddToQueue || room?.participantsFullControl
  // canControl = can play/pause/skip/seek
  const canControl = isHost || room?.participantsCanAddToQueue || room?.participantsFullControl
  // canFullControl = host-level: also gets previous track button
  const canFullControl = isHost || room?.participantsFullControl

  useEffect(() => {
    if (!user) { router.replace('/'); return }
    return subscribeToRoom(roomId, data => { setRoom(data); roomRef.current = data; setLoading(false) })
  }, [roomId, user])

  // ─── Pictionary invite subscription
  useEffect(() => {
    if (!roomId) return
    return subscribePictionaryInvite(roomId, setPictionaryInvite)
  }, [roomId])

  // ─── Word Chain invite subscription
  useEffect(() => {
    if (!roomId) return
    return subscribeWordChainInvite(roomId, setWordchainInvite)
  }, [roomId])

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
      setMusicMode(room.musicMode ?? true)
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

  // ─── Close volume popup / header menu on outside click ───
  const headerMenuRef = useRef(null)
  useEffect(() => {
    function handleClick(e) {
      if (volumePopupRef.current && !volumePopupRef.current.contains(e.target)) setShowVolume(false)
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) setShowHeaderMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('touchstart', handleClick) }
  }, [])

  // ─── Sync focus state when user exits fullscreen via Escape ───
  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement) {
        setVideoFocus(false)
        setFocusLandscape(true)
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
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

  // ─── Screenshare cleanup on unmount ───
  useEffect(() => {
    return () => {
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      unsubScreenSignalsRef.current?.()
      Object.values(screenPcsRef.current).forEach(pc => { try { pc.close() } catch {} })
    }
  }, [])

  // ─── Visibility change: keep playing in background, resume on return ───
  useEffect(() => {
    function handleVisibilityChange() {
      const p = ytPlayerRef.current
      const liveRoom = roomRef.current
      if (!p || !liveRoom?.isPlaying) return
      if (document.hidden) {
        // Resume AudioContext + audio element IMMEDIATELY before Chrome can
        // throttle the tab. Both must be non-silent/running to hold audio focus
        // when the screen turns off (18 Hz tone ensures Chrome sees real audio).
        try { keepAliveCtxRef.current?.resume() } catch {}
        keepAliveAudioRef.current?.play().catch(() => {})

        // Youtube's iframe fires pauseVideo() ~100–300 ms after visibilitychange.
        // Poll at several checkpoints to cover any timing variation, then keep a
        // sustained watchdog that runs every 1.5 s for as long as the tab stays
        // hidden — Chrome can re-pause silently at any point on low-power devices.
        function tryResume() {
          try {
            const state = ytPlayerRef.current?.getPlayerState?.()
            const YT_ENDED = window.YT?.PlayerState?.ENDED ?? 0
            // Do NOT call playVideo on an ended track — it would replay the same song
            // instead of letting the ENDED→skipToNext flow load the next one
            if (roomRef.current?.isPlaying && state !== 1 && state !== YT_ENDED)
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
          // Keep Web Audio + HTML Audio alive (no PiP open, but tab is hidden)
          try { keepAliveCtxRef.current?.resume() } catch {}
          try { keepAliveAudioRef.current?.play().catch(() => {}) } catch {}
          // Unmute via API + postMessage — Chrome can silently mute after tab switch
          try {
            const p = ytPlayerRef.current
            if (p) { p.unMute?.(); p.setVolume?.(volumeRef.current) }
            const iframe = document.querySelector('iframe[src*="youtube"]')
            if (iframe?.contentWindow) {
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute',     args: [] }), '*')
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volumeRef.current] }), '*')
            }
          } catch {}
          tryResume()
          // Auto-advance when tab is hidden without PiP (handleStateChange may be throttled)
          try {
            const ytStates = window.YT?.PlayerState
            const pState = ytPlayerRef.current?.getPlayerState?.()
            if (ytStates && pState === ytStates.ENDED) {
              if (Date.now() - lastSkipAtRef.current < 4000) return
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
        }, 1500)
        return
      }
      // Tab came back to foreground — stop watchdog and re-sync
      clearInterval(bgWatchdogRef.current)
      try {
        const state = p.getPlayerState?.()
        const YT_ENDED = window.YT?.PlayerState?.ENDED ?? 0
        // If the song ended while the tab was hidden, advance the queue instead
        // of replaying the same song.
        if (state === YT_ENDED) {
          if (Date.now() - lastSkipAtRef.current < 4000) return // already handled
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
          return
        }
        if (state !== 1) {
          if (liveRoom.currentTime) {
            const elapsed = (Date.now() - (liveRoom.currentTimeAt || Date.now())) / 1000
            p.seekTo?.(Math.max(0, liveRoom.currentTime + elapsed), true)
          }
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
    // Latency-compensate so late joiners start at the right position
    const elapsed = (Date.now() - (r?.watchUpdatedAt || Date.now())) / 1000
    const t = Math.max(0, (r?.watchCurrentTime || 0) + (r?.watchIsPlaying ? elapsed : 0))
    if (t > 0.5) e.target.seekTo(t, true)
    if (r?.watchIsPlaying) e.target.playVideo()
    else e.target.pauseVideo()
    // Apply saved quality preference via setPlaybackQualityRange (setPlaybackQuality deprecated)
    try {
      const q = watchQualityRef.current
      if (q && q !== 'auto') applyWatchQuality(e.target, q)
    } catch {}
  }

  const watchQualityRef = useRef('auto')

  function applyWatchQuality(player, q) {
    if (!player) return
    try {
      if (q === 'auto') {
        // Reset to adaptive bitrate — use the lowest possible floor
        player.setPlaybackQualityRange?.('tiny', 'highres')
      } else {
        // Lock both min and max to the chosen level — forces YouTube to use it
        player.setPlaybackQualityRange?.(q, q)
        // Also call the old API as a fallback for older player builds
        player.setPlaybackQuality?.(q)
      }
    } catch {}
  }

  function handleWatchQualityChange(q) {
    watchQualityRef.current = q
    setWatchQuality(q)
    applyWatchQuality(watchYtPlayerRef.current, q)
  }

  // Sync all participants to host's play/pause/seek via Firestore
  useEffect(() => {
    if (!room?.watchUrl) return
    const isNewUpdate = room.watchUpdatedAt && room.watchUpdatedAt !== prevWatchUpdatedAt.current
    prevWatchUpdatedAt.current = room.watchUpdatedAt

    if (room.watchIsPlaying) {
      if (isNewUpdate) {
        const elapsed = (Date.now() - room.watchUpdatedAt) / 1000
        const targetTime = Math.max(0, (room.watchCurrentTime || 0) + elapsed)
        const guestTime = watchGetTime()
        // Only seek if drifting >1s — prevents jitter on every heartbeat
        if (Math.abs(guestTime - targetTime) > 1.0) watchSeek(targetTime)
      }
      watchPlay()
    } else {
      watchPause()
      if (isNewUpdate) watchSeek(room.watchCurrentTime || 0)
    }
  }, [room?.watchIsPlaying, room?.watchUpdatedAt, room?.watchUrl])

  // ─── Watch URL: continuous guest drift correction every 3s ───
  useEffect(() => {
    if (!room?.watchUrl || isHost || !room.watchIsPlaying) return
    const iv = setInterval(() => {
      try {
        const r = roomRef.current
        if (!r?.watchUpdatedAt || !r.watchIsPlaying) return
        const elapsed = (Date.now() - r.watchUpdatedAt) / 1000
        const targetTime = Math.max(0, (r.watchCurrentTime || 0) + elapsed)
        const guestTime = watchGetTime()
        if (Math.abs(guestTime - targetTime) > 1.0) watchSeek(targetTime)
      } catch {}
    }, 3000)
    return () => clearInterval(iv)
  }, [isHost, room?.watchUrl, room?.watchIsPlaying])

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

  // ─── Host: push current time every 2s so guests can continuously re-sync ───
  useEffect(() => {
    if (!room?.watchUrl || !isHost || !room.watchIsPlaying) return
    const iv = setInterval(() => {
      if (watchYtPlayerRef.current?.getCurrentTime) {
        const t = watchYtPlayerRef.current.getCurrentTime()
        // Include watchUpdatedAt so guests' isNewUpdate fires and they can drift-correct
        updateWatchPlayback(roomId, { watchCurrentTime: t, watchUpdatedAt: Date.now() }).catch(() => {})
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [room?.watchUrl, isHost, room?.watchIsPlaying, roomId])

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
      // Robust resume: unmute + play + iframe postMessage + retries
      // The tab may be hidden (PiP active) so a single playVideo() call is often blocked
      const doPlay = () => {
        try { ytPlayerRef.current?.unMute?.(); ytPlayerRef.current?.setVolume?.(volumeRef.current); ytPlayerRef.current?.playVideo?.() } catch {}
        try {
          const iframe = document.querySelector('iframe[src*="youtube"]')
          if (iframe?.contentWindow)
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
        } catch {}
      }
      doPlay()
      ;[300, 700, 1400, 2500].forEach(d => setTimeout(doPlay, d))
      updatePlayback(roomId, { isPlaying: true, currentTime: ytPlayerRef.current?.getCurrentTime?.() || 0 })
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      try { ytPlayerRef.current?.pauseVideo?.() } catch {}
      updatePlayback(roomId, { isPlaying: false, currentTime: ytPlayerRef.current?.getCurrentTime?.() || 0 })
    })
    navigator.mediaSession.setActionHandler('nexttrack', isHost ? () => skipToNext(roomId) : null)
    navigator.mediaSession.setActionHandler('previoustrack', canControl ? () => handlePreviousTrack() : null)
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
    // Start a fresh 8s timer every time the track changes on mobile.
    // handlePlayerReady only fires on initial mount — this covers all subsequent track changes.
    // Non-hosts get a longer grace period — they may be joining mid-song and still buffering.
    if (curr && room.isPlaying && isMobile) {
      const timerDelay = isHost ? 8000 : 12000
      mobileSkipTimerRef.current = setTimeout(async () => {
        const state = ytPlayerRef.current?.getPlayerState?.()
        if (state === -1) {
          if (isHost) {
            if (Date.now() - lastSkipAtRef.current < 4000) return
            lastSkipAtRef.current = Date.now()
            await skipToNext(roomId)
          } else {
            // Non-host: don't skip — just retry playing. The host's track may be
            // playing fine; only the guest is slow to buffer.
            try { ytPlayerRef.current?.playVideo?.() } catch {}
            setTimeout(() => { try { ytPlayerRef.current?.playVideo?.() } catch {} }, 1500)
          }
        }
      }, timerDelay)
    }
  }, [room?.currentTrack?.videoId])

  // ─── Keep stable player videoId: set once on first track, reset when queue empties ───
  // This prevents react-youtube from calling resetPlayer() (destroy+recreate) on every
  // track change — which was causing the 8s mobile watchdog to fire on a brand-new
  // UNSTARTED player and skip perfectly good songs prematurely.
  useEffect(() => {
    if (room?.currentTrack?.videoId) {
      if (!ytStableVideoIdRef.current) ytStableVideoIdRef.current = room.currentTrack.videoId
    } else {
      ytStableVideoIdRef.current = null  // reset so next queue mount gets a fresh stable id
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
        const elapsed = (Date.now() - (room.currentTimeAt || Date.now())) / 1000
        loadAndPlay(room.currentTrack.videoId, Math.max(0, (room.currentTime || 0) + elapsed))
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

  // ─── Non-host: seek correction when drifting >1s from host (latency-compensated) ───
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
      // Add elapsed-since-write to compensate for Firestore + network latency
      const elapsed = (Date.now() - (room.currentTimeAt || Date.now())) / 1000
      const targetTime = Math.max(0, (room.currentTime || 0) + elapsed)
      const drift = Math.abs(guestTime - targetTime)
      if (drift > 1.0) {
        p.seekTo(targetTime, true)
      }
    } catch {}
  }, [room?.currentTime])

  // ─── Non-host: continuous drift correction every 3s (catches slow drift between Firestore updates) ───
  useEffect(() => {
    if (!room || isHost || !room.currentTrack?.videoId || !room.isPlaying) return
    const iv = setInterval(() => {
      try {
        const p = ytPlayerRef.current
        if (!p) return
        const state = p.getPlayerState?.()
        if (state !== 1 && state !== 3) return
        const guestTime = p.getCurrentTime?.()
        if (typeof guestTime !== 'number') return
        const r = roomRef.current
        if (!r?.currentTime) return
        const elapsed = (Date.now() - (r.currentTimeAt || Date.now())) / 1000
        const targetTime = Math.max(0, r.currentTime + elapsed)
        const drift = Math.abs(guestTime - targetTime)
        if (drift > 1.0) p.seekTo(targetTime, true)
      } catch {}
    }, 3000)
    return () => clearInterval(iv)
  }, [isHost, room?.currentTrack?.videoId, room?.isPlaying])

  // ─── Host: push timestamp every 1s (tighter heartbeat for better sync) ───
  useEffect(() => {
    if (!isHost || !room?.isPlaying) return
    const iv = setInterval(() => {
      try {
        const t = ytPlayerRef.current?.getCurrentTime?.()
        if (typeof t === 'number' && isFinite(t)) updatePlayback(roomId, { currentTime: t })
      } catch {}
    }, 1000)
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
    // Resume existing Web Audio context if already set up
    if (keepAliveCtxRef.current) {
      try { keepAliveCtxRef.current.resume() } catch {}
      if (keepAliveAudioRef.current) keepAliveAudioRef.current.play().catch(() => {})
      return
    }
    try {
      // Web Audio API approach — more reliable than HTML Audio for keeping
      // Chrome's audio context unlocked in background/hidden tabs.
      // Must be called from a user-gesture context the first time.
      const ac = new (window.AudioContext || window.webkitAudioContext)()
      keepAliveCtxRef.current = ac
      // ConstantSourceNode — outputs a DC offset (0 Hz, no oscillation).
      // Zero frequency = zero speaker movement = zero audible sound.
      // Chrome's audio pipeline still sees the AudioContext producing output
      // and keeps the tab in "active audio" state even when the screen is off.
      const src = ac.createConstantSource ? ac.createConstantSource() : null
      if (src) {
        src.offset.value = 0.001  // tiny DC offset — Chrome detects it, ears cannot
        src.connect(ac.destination)
        src.start()
      }
      // No HTML Audio needed — the running AudioContext above is sufficient
      // to hold Chrome's audio focus when the screen turns off.
    } catch {}
  }

  // ─── Picture-in-Picture mini player ─────────────────────────────────────
  // Primary: Document PiP API (Chrome 116+) — exact 260×110 popup with HTML controls.
  //   • Real ⏪ ▶/⏸ ⏩ buttons rendered in the popup window.
  // Fallback: canvas → video.requestPictureInPicture().
  async function openMobilePip() {
    const W = 260 // fixed width; height = 66 canvas + 44 controls bar

    // ── Toggle off ──
    try {
      if (window.documentPictureInPicture?.window && !window.documentPictureInPicture.window.closed) {
        window.documentPictureInPicture.window.close()
        canvasPipIntervalRef.current?.cancel?.()
        return
      }
    } catch {}
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {})
      canvasPipIntervalRef.current?.cancel?.()
      return
    }

    initAudioKeepAlive()
    const anim = { frame: 0, thumbImg: null, lastTrackId: null, skipFired: false, accent: [249, 115, 22] }

    function loadThumb(url) {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        anim.thumbImg = img
        try {
          const sc = document.createElement('canvas'); sc.width = 16; sc.height = 16
          const sx = sc.getContext('2d'); sx.drawImage(img, 0, 0, 16, 16)
          const d = sx.getImageData(0, 0, 16, 16).data
          let r = 0, g = 0, b = 0, cnt = 0
          for (let j = 0; j < d.length; j += 4) {
            const br = (d[j]+d[j+1]+d[j+2])/3
            if (br < 20 || br > 235) continue
            r += d[j]; g += d[j+1]; b += d[j+2]; cnt++
          }
          if (cnt > 0) {
            r = Math.round(r/cnt); g = Math.round(g/cnt); b = Math.round(b/cnt)
            const avg = (r+g+b)/3, boost = 1.8
            r = Math.min(255,Math.max(0,Math.round(avg+(r-avg)*boost)))
            g = Math.min(255,Math.max(0,Math.round(avg+(g-avg)*boost)))
            b = Math.min(255,Math.max(0,Math.round(avg+(b-avg)*boost)))
            anim.accent = [r,g,b]
          }
        } catch { anim.accent = [249,115,22] }
      }
      img.onerror = () => { anim.thumbImg = null }
      img.src = url
    }

    // ── Canvas draw: fixed 260×H canvas ──
    function makeDrawFrame(ctx, H) {
      return function drawFrame() {
        anim.frame++
        const liveRoom = roomRef.current
        const track = liveRoom?.currentTrack
        const playing = liveRoom?.isPlaying
        if (track?.videoId !== anim.lastTrackId) {
          anim.lastTrackId = track?.videoId || null
          anim.thumbImg = null; anim.skipFired = false
          if (track?.thumbnail) loadThumb(track.thumbnail)
          try {
            if ('mediaSession' in navigator && track) {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || 'We Vibe',
                artist: (track.channelTitle||'').replace(/\s*-\s*Topic$/i,'').trim(),
                artwork: track.thumbnail ? [{src:track.thumbnail}] : [],
              })
            }
          } catch {}
        }
        try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused' } catch {}
        let ct = 0, dur = 0
        try { const p = ytPlayerRef.current; ct = p?.getCurrentTime?.()??0; dur = p?.getDuration?.()??0 } catch {}
        const pct = dur > 0 ? Math.min(1, ct/dur) : 0
        const [ar,ag,ab] = anim.accent, accentRGB = `rgb(${ar},${ag},${ab})`
        // Background: blurred album art
        if (anim.thumbImg) {
          ctx.filter = 'blur(14px) brightness(0.28) saturate(2)'
          ctx.drawImage(anim.thumbImg, -8, -8, W+16, H+16)
          ctx.filter = 'none'
        } else { ctx.fillStyle = '#0a0a12'; ctx.fillRect(0,0,W,H) }
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,H)
        const trunc = (s, maxW) => {
          if (ctx.measureText(s).width <= maxW) return s
          let t = s; while (t.length>1 && ctx.measureText(t+'…').width>maxW) t=t.slice(0,-1); return t+'…'
        }
        // Album art 52×52, vertically centered
        const sz=52, sqX=7, sqY=Math.floor((H-sz)/2)
        ctx.save(); ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(sqX,sqY,sz,sz,6); else ctx.rect(sqX,sqY,sz,sz)
        ctx.clip()
        if (anim.thumbImg) {
          const iw=anim.thumbImg.naturalWidth||anim.thumbImg.width
          const ih=anim.thumbImg.naturalHeight||anim.thumbImg.height
          let sx2=0,sy2=0,sw=iw,sh=ih
          if (iw/ih>1){sw=ih;sx2=(iw-sw)/2}else{sh=iw;sy2=(ih-sh)/2}
          ctx.drawImage(anim.thumbImg,sx2,sy2,sw,sh,sqX,sqY,sz,sz)
        } else {
          ctx.fillStyle='#1a1a2e'; ctx.fillRect(sqX,sqY,sz,sz)
          ctx.fillStyle=accentRGB; ctx.font=`${Math.round(sz*0.38)}px system-ui`
          ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('♫',sqX+sz/2,sqY+sz/2)
        }
        ctx.restore()
        ctx.strokeStyle=`rgba(${ar},${ag},${ab},0.4)`; ctx.lineWidth=1
        if (ctx.roundRect){ctx.beginPath();ctx.roundRect(sqX,sqY,sz,sz,6);ctx.stroke()}
        // Right info panel
        const txX=sqX+sz+8, txW=W-txX-6
        const title = track?.title||'Nothing playing'
        const artist = (track?.channelTitle||'').replace(/\s*-\s*Topic$/i,'').trim()
        ctx.textBaseline='alphabetic'; ctx.textAlign='left'
        ctx.font='bold 11px system-ui'; ctx.fillStyle='#fff'
        ctx.fillText(trunc(title,txW),txX,22)
        ctx.font='9px system-ui'; ctx.fillStyle='rgba(255,255,255,0.5)'
        ctx.fillText(trunc(artist,txW),txX,35)
        // Progress sliver at bottom
        ctx.fillStyle='rgba(255,255,255,0.1)'; ctx.fillRect(0,H-2,W,2)
        ctx.fillStyle=accentRGB; ctx.fillRect(0,H-2,W*pct,2)
        // Pulse dot (playing indicator)
        if (playing) {
          const p2=0.5+0.5*Math.sin(anim.frame*0.15)
          ctx.shadowColor=accentRGB; ctx.shadowBlur=4
          ctx.beginPath(); ctx.arc(W-7,7,3,0,Math.PI*2)
          ctx.fillStyle=`rgba(${ar},${ag},${ab},${p2.toFixed(2)})`; ctx.fill()
          ctx.shadowBlur=0; ctx.shadowColor='transparent'
        }
      }
    }

    // ── Watchdog: auto-advance tracks when tab is hidden ──
    let watchdogInterval = null
    let watchdogMsgCleanup = null

    function doSkip() {
      if (anim.skipFired) return
      anim.skipFired = true
      if (Date.now() - lastSkipAtRef.current < 4000) return
      lastSkipAtRef.current = Date.now()
      if (roomRef.current?.hostId === user?.uid) skipToNext(roomId).catch(()=>{})
      else import('firebase/firestore').then(({updateDoc,doc})=>import('@/lib/firebase').then(({db})=>updateDoc(doc(db,'rooms',roomId),{skipRequested:Date.now()}).catch(()=>{})))
    }

    function startWatchdog() {
      // ── Primary: YouTube postMessage events ──────────────────────────────
      // YouTube iframes communicate via window.postMessage. These events fire
      // immediately even when the tab is throttled/backgrounded, making them
      // far more reliable than setInterval for detecting ENDED state in PiP.
      function onYtMsg(ev) {
        try {
          const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : null
          if (!data) return
          // Track change: reset skipFired so next ENDED triggers a fresh skip
          if (data.event === 'onStateChange' && data.info === 1 /* PLAYING */) {
            anim.skipFired = false
          }
          // Video ended (info: 0)
          if (data.event === 'onStateChange' && data.info === 0) doSkip()
        } catch {}
      }
      window.addEventListener('message', onYtMsg)
      watchdogMsgCleanup = () => window.removeEventListener('message', onYtMsg)

      // ── Secondary: polling fallback for browsers where postMessage may be ──
      // delayed or for the video-PiP fallback path.
      watchdogInterval = setInterval(() => {
        const liveId = roomRef.current?.currentTrack?.videoId || null
        if (liveId !== anim.lastTrackId) {
          anim.lastTrackId = liveId; anim.skipFired = false
          if (roomRef.current?.currentTrack?.thumbnail) loadThumb(roomRef.current.currentTrack.thumbnail)
          return
        }
        try {
          const ytS = window.YT?.PlayerState, st = ytPlayerRef.current?.getPlayerState?.()
          if (ytS && st === ytS.ENDED) doSkip()
        } catch {}
      }, 1000)
    }

    // ── Media Session (notification shade controls) ──
    function setupMediaSession() {
      if (!('mediaSession' in navigator)) return
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (roomRef.current) roomRef.current = {...roomRef.current, isPlaying: true}
          navigator.mediaSession.playbackState = 'playing'
          const tryPlay = () => { try { ytPlayerRef.current?.unMute?.(); ytPlayerRef.current?.setVolume?.(volumeRef.current); ytPlayerRef.current?.playVideo?.() } catch {} }
          tryPlay(); [300,700,1400].forEach(d => setTimeout(tryPlay, d))
          import('firebase/firestore').then(({updateDoc,doc})=>import('@/lib/firebase').then(({db})=>updateDoc(doc(db,'rooms',roomId),{isPlaying:true}).catch(()=>{})))
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          if (roomRef.current) roomRef.current = {...roomRef.current, isPlaying: false}
          navigator.mediaSession.playbackState = 'paused'
          try { ytPlayerRef.current?.pauseVideo?.() } catch {}
          import('firebase/firestore').then(({updateDoc,doc})=>import('@/lib/firebase').then(({db})=>updateDoc(doc(db,'rooms',roomId),{isPlaying:false}).catch(()=>{})))
        })
        navigator.mediaSession.setActionHandler('nexttrack', () => { try { if (roomRef.current?.hostId===user?.uid) skipToNext(roomId).catch(()=>{}) } catch {} })
      } catch {}
    }
    function teardownMediaSession() {
      try { if ('mediaSession' in navigator) { navigator.mediaSession.setActionHandler('play',null); navigator.mediaSession.setActionHandler('pause',null); navigator.mediaSession.setActionHandler('nexttrack',null) } } catch {}
    }

    // ════════════════════════════════════════════════════════
    //  PRIMARY: Document Picture-in-Picture (Chrome 116+)
    //  HTML overlay layout: art | title/artist/controls + progress bar
    // ════════════════════════════════════════════════════════
    if ('documentPictureInPicture' in window) {
      try {
        const H_INIT = 78
        const pipWin = await window.documentPictureInPicture.requestWindow({ width: W, height: H_INIT })
        const d = pipWin.document
        d.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:#0a0a12;height:100%;'

        // ── Styles ──
        const sty = d.createElement('style')
        sty.textContent = `
          *{box-sizing:border-box}
          html,body{height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif}
          #root{height:100%;display:flex;flex-direction:column}
          #top{display:flex;align-items:flex-start;gap:8px;padding:8px;flex-shrink:0}
          #part{width:52px;height:52px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#1a1a2e;border:1px solid rgba(255,255,255,0.12)}
          #info{flex:1;min-width:0;display:flex;flex-direction:column;padding-top:2px}
          #ttl{font-size:11px;font-weight:700;color:#fff;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          #arti{font-size:9px;color:rgba(255,255,255,0.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:2px 0 5px}
          #ctrl{display:flex;align-items:center;gap:4px}
          .cb{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:11px;padding:0;cursor:pointer;border-radius:5px;display:flex;align-items:center;justify-content:center;line-height:1}
          #pw{flex-shrink:0;height:3px;background:rgba(255,255,255,0.1);cursor:pointer;position:relative}
          #pf{height:100%;width:0;background:var(--ac,#f97316);transition:width 0.25s linear}
        `
        d.head.appendChild(sty)

        // ── DOM ──
        d.body.innerHTML = `
          <div id="root">
            <div id="top">
              <img id="part" />
              <div id="info">
                <div id="ttl">Loading\u2026</div>
                <div id="arti"></div>
                <div id="ctrl">
                  <button class="cb" id="b-pv" style="width:26px;height:20px" title="Previous song">\u23ee</button>
                  <button class="cb" id="b-pl" style="width:32px;height:20px;background:rgba(0,255,136,0.18)" title="Play/Pause">\u25b6</button>
                  <button class="cb" id="b-sk" style="width:26px;height:20px" title="Next song">\u23ed</button>
                </div>
              </div>
            </div>
            <div id="pw"><div id="pf"></div></div>
          </div>
        `

        const artEl  = d.getElementById('part')
        const ttlEl  = d.getElementById('ttl')
        const artEl2 = d.getElementById('arti')
        const pfEl   = d.getElementById('pf')
        const bPv    = d.getElementById('b-pv')
        const bPl    = d.getElementById('b-pl')
        const bSk    = d.getElementById('b-sk')

        const setAccent = () => {
          const css = `rgb(${anim.accent[0]},${anim.accent[1]},${anim.accent[2]})`
          d.body.style.setProperty('--ac', css)
          artEl.style.borderColor = `rgba(${anim.accent[0]},${anim.accent[1]},${anim.accent[2]},0.45)`
        }
        setAccent()

        // ── Button handlers ──
        bPv.onclick = () => handlePreviousTrack()
        bPl.onclick = () => {
          const pl = roomRef.current?.isPlaying
          try { if (pl) ytPlayerRef.current?.pauseVideo?.(); else { ytPlayerRef.current?.unMute?.(); ytPlayerRef.current?.playVideo?.() } } catch {}
          import('firebase/firestore').then(({updateDoc,doc})=>import('@/lib/firebase').then(({db})=>updateDoc(doc(db,'rooms',roomId),{isPlaying:!pl}).catch(()=>{})))
        }
        bSk.onclick = () => {
          if (roomRef.current?.hostId === user?.uid) skipToNext(roomId).catch(()=>{})
          else import('firebase/firestore').then(({updateDoc,doc})=>import('@/lib/firebase').then(({db})=>updateDoc(doc(db,'rooms',roomId),{skipRequested:Date.now()}).catch(()=>{}) ))
        }

        // Seekable progress bar
        d.getElementById('pw').onclick = ev => {
          const r = ev.currentTarget.getBoundingClientRect()
          const pct = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))
          try { const p=ytPlayerRef.current; const dr=p?.getDuration?.()||0; if (dr>0) p?.seekTo?.(dr*pct,true) } catch {}
        }

        // ── Per-frame update ──
        let prevAcStr = ''
        const updateUI = () => {
          const liveRoom = roomRef.current
          const track    = liveRoom?.currentTrack
          const playing  = liveRoom?.isPlaying

          // Accent color
          const acStr = `${anim.accent[0]},${anim.accent[1]},${anim.accent[2]}`
          if (acStr !== prevAcStr) { prevAcStr = acStr; setAccent() }

          // Track change
          if (track?.videoId !== anim.lastTrackId) {
            anim.lastTrackId = track?.videoId || null; anim.skipFired = false
            ttlEl.textContent  = track?.title || 'Nothing playing'
            artEl2.textContent = (track?.channelTitle||'').replace(/\s*-\s*Topic$/i,'').trim()
            if (track?.thumbnail) { artEl.src = track.thumbnail; artEl.style.display = 'block'; loadThumb(track.thumbnail) }
            else { artEl.src = ''; artEl.style.display = 'none' }
            try {
              if ('mediaSession' in navigator && track) {
                navigator.mediaSession.metadata = new MediaMetadata({ title: track.title||'We Vibe', artist: artEl2.textContent, artwork: track.thumbnail?[{src:track.thumbnail}]:[] })
              }
            } catch {}
            // ── Force-play new track from PiP window context ──────────────
            // The main page is hidden — its setTimeout is throttled to fire
            // at most once per minute by Chrome. Retries must use pipWin.setTimeout
            // which always runs at full speed because the PiP window is visible.
            if (track?.videoId) {
              const newId = track.videoId
              const forcePlay = () => {
                if (roomRef.current?.currentTrack?.videoId !== newId) return // already changed again
                try {
                  const p = ytPlayerRef.current; if (!p) return
                  const loaded = p.getVideoData?.()?.video_id
                  if (loaded !== newId) {
                    p.loadVideoById({ videoId: newId, startSeconds: 0 })
                    p.unMute?.(); p.setVolume?.(volumeRef.current)
                  } else {
                    const state = p.getPlayerState?.()
                    p.unMute?.(); p.setVolume?.(volumeRef.current)
                    if (state !== 1) p.playVideo?.() // 1 = PLAYING
                  }
                  // Belt-and-suspenders: postMessage to iframe directly (never throttled)
                  try {
                    const iframe = document.querySelector('iframe[src*="youtube"]')
                    if (iframe?.contentWindow) {
                      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute',    args: [] }), '*')
                      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volumeRef.current] }), '*')
                      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
                    }
                  } catch {}
                } catch {}
              }
              forcePlay()
              ;[300, 800, 1600, 3000].forEach(ms => pipWin.setTimeout(forcePlay, ms))
            }
          }
          try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused' } catch {}

          // Play/pause button
          bPl.innerHTML = playing ? '\u23f8' : '\u25b6'

          // Progress bar
          let ct = 0, dr = 0
          try { const p=ytPlayerRef.current; ct=p?.getCurrentTime?.()||0; dr=p?.getDuration?.()||0 } catch {}
          pfEl.style.width = (dr > 0 ? Math.min(100, (ct/dr)*100) : 0) + '%'
        }

        let rafId = null
        const loop = () => {
          try { updateUI() } catch(e) { console.warn('[PiP]',e) }
          rafId = pipWin.requestAnimationFrame(loop)
        }
        rafId = pipWin.requestAnimationFrame(loop)
        startWatchdog(); setupMediaSession()
        canvasPipIntervalRef.current = {
          cancel: () => {
            try { if (rafId) pipWin.cancelAnimationFrame?.(rafId) } catch {}
            clearInterval(watchdogInterval); watchdogMsgCleanup?.(); teardownMediaSession()
          }
        }
        pipWin.addEventListener('pagehide', () => { canvasPipIntervalRef.current?.cancel?.() }, { once: true })
        toast.success('PiP opened — floats over other apps')
        return
      } catch(e) { console.warn('[PiP] Document PiP failed, falling back', e) }
    }

    // ════════════════════════════════════════════════════════
    //  FALLBACK: canvas captureStream → hidden video → requestPictureInPicture
    // ════════════════════════════════════════════════════════
    if (!document.pictureInPictureEnabled) { toast.error('Picture-in-Picture not supported in this browser'); return }
    try {
      const H = 72
      if (canvasPipRef.current) { try { canvasPipRef.current.remove?.() } catch {} }
      const canvas = document.createElement('canvas')
      canvasPipRef.current = canvas
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      const drawFrame = makeDrawFrame(ctx, H)
      let rafId = null
      const loop = () => { try{drawFrame()}catch(e){console.warn('[PiP]',e)}; rafId=requestAnimationFrame(loop) }
      rafId = requestAnimationFrame(loop)
      startWatchdog(); setupMediaSession()
      if (!videoPipRef.current) {
        const v = document.createElement('video')
        v.muted = true; v.loop = true; v.playsInline = true
        v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;'
        document.body.appendChild(v)
        videoPipRef.current = v
      }
      const video = videoPipRef.current
      const stream = canvas.captureStream(30)
      video.srcObject = stream; video.width = W; video.height = H
      video.style.width = `${W}px`; video.style.height = `${H}px`
      await video.play()
      await video.requestPictureInPicture()
      canvasPipIntervalRef.current = { cancel: () => { if(rafId)cancelAnimationFrame(rafId); clearInterval(watchdogInterval); watchdogMsgCleanup?.(); teardownMediaSession() } }
      video.addEventListener('leavepictureinpicture', () => { canvasPipIntervalRef.current?.cancel?.() }, { once: true })
      toast.success('PiP opened — floats over other apps')
    } catch { toast.error('Could not open Picture-in-Picture') }
  }

  function loadAndPlay(videoId, startSeconds = 0) {
    // If tab is hidden, update mediaSession immediately so Chrome knows
    // audio is active — rAF (drawFrame) is suspended and won't do it.
    if (document.hidden) {
      try {
        const liveTrack = roomRef.current?.currentTrack
        if ('mediaSession' in navigator) {
          if (liveTrack) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: liveTrack.title || 'We Vibe',
              artist: (liveTrack.channelTitle || '').replace(/\s*-\s*Topic$/i, '').trim(),
              artwork: liveTrack.thumbnail ? [{ src: liveTrack.thumbnail }] : [],
            })
          }
          navigator.mediaSession.playbackState = 'playing'
        }
      } catch {}
      // Resume audio keepalive context
      try { keepAliveCtxRef.current?.resume() } catch {}
      try { keepAliveAudioRef.current?.play().catch(() => {}) } catch {}
    }
    try {
      const p = ytPlayerRef.current
      if (!p) return
      p.loadVideoById({ videoId, startSeconds })
      p.unMute?.(); p.setVolume?.(volumeRef.current)
    } catch {}
    // Always retry playVideo — loadVideoById can fail silently due to buffering
    // or browser autoplay policy even on visible tabs
    const targetId = videoId
    ;[300, 800, 1600, 3000].forEach(delay => {
      setTimeout(() => {
        try {
          const p = ytPlayerRef.current
          if (!p || !roomRef.current?.isPlaying) return
          if (roomRef.current?.currentTrack?.videoId !== targetId) return
          const state = p.getPlayerState?.()
          p.unMute?.(); p.setVolume?.(volumeRef.current)
          try {
            const iframe = document.querySelector('iframe[src*="youtube"]')
            if (iframe?.contentWindow) {
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volumeRef.current] }), '*')
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
            }
          } catch {}
          if (state !== 1) p.playVideo?.()
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
      e.target.setVolume(volumeRef.current)
      if (liveRoom.isPlaying) loadAndPlay(liveRoom.currentTrack.videoId, liveRoom.currentTime || 0)
      else e.target.cueVideoById({ videoId: liveRoom.currentTrack.videoId, startSeconds: liveRoom.currentTime || 0 })
      if (liveRoom.isPlaying && isMobile) {
        clearTimeout(mobileSkipTimerRef.current)
        const liveIsHost = roomRef.current?.hostId === user?.uid
        const timerDelay = liveIsHost ? 8000 : 12000
        mobileSkipTimerRef.current = setTimeout(async () => {
          const state = ytPlayerRef.current?.getPlayerState?.()
          if (state === -1) {
            if (liveIsHost) {
              if (Date.now() - lastSkipAtRef.current < 4000) return
              lastSkipAtRef.current = Date.now()
              await skipToNext(roomId)
            } else {
              // Non-host: retry playing rather than triggering a host skip.
              // The guest may just be slow to buffer; the host's track is likely fine.
              try { ytPlayerRef.current?.playVideo?.() } catch {}
              setTimeout(() => { try { ytPlayerRef.current?.playVideo?.() } catch {} }, 1500)
            }
          }
        }, timerDelay)
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
      // Always unmute — iOS/Chrome remutes on every new video load, also via postMessage
      try { e.target.unMute?.(); e.target.setVolume?.(volume) } catch {}
      try {
        const iframe = document.querySelector('iframe[src*="youtube"]')
        if (iframe?.contentWindow)
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute',     args: [] }), '*')
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*')
      } catch {}
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
    } else if (!liveIsHost) {
      if (e.data === YT.PAUSED) {
        // Non-host: YouTube auto-paused us (tab hidden / mobile throttle). Fight back
        // immediately — only the host writes to Firestore; guests must play locally.
        if (document.hidden && roomRef.current?.isPlaying) {
          try { e.target.playVideo?.() } catch {}
          setTimeout(() => {
            try {
              if (document.hidden && roomRef.current?.isPlaying && ytPlayerRef.current?.getPlayerState?.() !== 1)
                ytPlayerRef.current?.playVideo?.()
            } catch {}
          }, 300)
        }
      } else if (e.data === YT.ENDED) {
        // Fallback: participant's player fired ENDED — signal host to skip in case
        // host's player missed the event (background, network, mobile throttle)
        try {
          const { updateDoc, doc } = await import('firebase/firestore')
          const { db } = await import('@/lib/firebase')
          await updateDoc(doc(db, 'rooms', roomId), { skipRequested: Date.now() })
        } catch {}
      }
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
    try {
      const q = room?.queue || []
      if (q.length >= 100) { toast.error('Queue is full (100 tracks max)'); return }
      if (!room?.currentTrack) {
        // Nothing playing — auto-play immediately (no queue append needed)
        await setCurrentTrack(roomId, track)
      } else {
        await addToQueue(roomId, track)
      }
      toast.success('Added!')
    } catch (err) { toast.error(err.message) }
  }

  async function handleStartPlaylist(tracks, playlistMeta) {
    try {
      const tagged = tracks.map(t => ({ ...t, playlistId: playlistMeta?.id, playlistName: playlistMeta?.title, playlistThumb: playlistMeta?.thumbnail }))
      await addManyToQueue(roomId, tagged, room)
      toast.success(`▶ Playing ${tracks.length} songs`)
    } catch (err) { toast.error(err.message) }
  }

  async function handleShufflePlaylist(tracks, playlistMeta) {
    try {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5)
      const tagged = shuffled.map(t => ({ ...t, playlistId: playlistMeta?.id, playlistName: playlistMeta?.title, playlistThumb: playlistMeta?.thumbnail }))
      await addManyToQueue(roomId, tagged, room)
      toast.success(`🔀 Shuffling ${tracks.length} songs`)
    } catch (err) { toast.error(err.message) }
  }

  async function handlePlayNow(track, index) {
    if (!canFullControl) return
    const newQueue = room.queue.filter((_, i) => i !== index)
    await setCurrentTrack(roomId, track)
    const { updateDoc, doc } = await import('firebase/firestore')
    const { db } = await import('@/lib/firebase')
    await updateDoc(doc(db, 'rooms', roomId), {
      currentTrack: track,
      queue: newQueue,
      playedHistory: room.playedHistory || [],
      currentTime: 0,
      isPlaying: true,
    })
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
    toast.success('Room code copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  function copyLink() {
    const link = `${window.location.origin}/join/${room.roomCode}`
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    toast.success('Invite link copied!')
    setTimeout(() => setCopiedLink(false), 2000)
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
    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', overflow: 'hidden', flexShrink: 0, borderRadius: 14 }}>
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
        ? focusLandscape
          ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', flexShrink: 0 }
          : { position: 'relative', height: '100%', aspectRatio: '9/16', flexShrink: 0, margin: '0 auto' }
        : { position: 'relative', width: '100%', paddingTop: '56.25%', overflow: 'hidden', flexShrink: 0, borderRadius: 14 }
    }>
      <YouTube
        ref={playerRef}
        videoId={ytStableVideoIdRef.current || room.currentTrack.videoId}
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
              {canControl && (
                <button onClick={handlePreviousTrack} style={{ width: compact ? 36 : 40, height: compact ? 36 : 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>⏮</button>
              )}
              <button onClick={handlePlayPause} style={{ width: compact ? 46 : 52, height: compact ? 46 : 52, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: compact ? '1rem' : '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.4)', transition: 'transform 0.15s' }}>{room.isPlaying ? '⏸' : '▶'}</button>
              <button onClick={() => skipToNext(roomId)} style={{ width: compact ? 36 : 40, height: compact ? 36 : 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>⏭</button>
              {volumeWidget}
              {compact && <button onClick={openMobilePip} title="Open in PiP" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⛶</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>{room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}</div>
              {volumeWidget}
              {compact && <button onClick={openMobilePip} title="Open in PiP" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⛶</button>}
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

  // ─── Mobile Screenshare ───
  const SCREEN_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }

  async function startRoomSharing() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error('Screen share not supported on this browser. Use Chrome on Android.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'window', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 2 },
      })
      const session = await createScreenSession(user.uid, user.displayName)
      screenStreamRef.current = stream
      screenSessionIdRef.current = session.id
      setScreenCode(session.code)
      setScreenStatus('sharing')
      stream.getVideoTracks()[0].addEventListener('ended', () => stopRoomSharing())
      // Auto-post share link to room chat
      const shareUrl = `${window.location.origin}/screenshare/${session.code}`
      await sendMessage(roomId, { uid: user.uid, displayName: user.displayName, text: `📲 Screen share started! Join: ${shareUrl}` })
      // WebRTC signaling
      unsubScreenSignalsRef.current = listenScreenSignals(session.id, 'host', async (msg) => {
        const vId = msg.from
        if (msg.type === 'join') {
          const pc = new RTCPeerConnection(SCREEN_ICE)
          screenPcsRef.current[vId] = pc
          screenViewerNamesRef.current[vId] = msg.data?.name || 'Viewer'
          stream.getTracks().forEach(track => pc.addTrack(track, stream))
          pc.onicecandidate = (e) => { if (e.candidate) sendScreenSignal(session.id, 'host', vId, 'ice', e.candidate) }
          pc.createDataChannel('interaction', { ordered: false, maxRetransmits: 0 })
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await sendScreenSignal(session.id, 'host', vId, 'offer', offer)
        } else if (msg.type === 'answer') {
          const pc = screenPcsRef.current[vId]
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data))
            for (const c of (screenViewerCandidatesRef.current[vId] || [])) { try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {} }
            delete screenViewerCandidatesRef.current[vId]
          }
        } else if (msg.type === 'ice') {
          const pc = screenPcsRef.current[vId]
          if (pc?.remoteDescription) { try { await pc.addIceCandidate(new RTCIceCandidate(msg.data)) } catch {} }
          else { (screenViewerCandidatesRef.current[vId] = screenViewerCandidatesRef.current[vId] || []).push(msg.data) }
        }
      })
      toast.success('Sharing started! Code: ' + session.code)
    } catch (err) {
      if (err.name !== 'NotAllowedError') toast.error('Screen share failed: ' + (err.message || err.name))
    }
  }

  async function stopRoomSharing() {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    if (screenSessionIdRef.current) { try { await endScreenSession(screenSessionIdRef.current) } catch {} }
    Object.values(screenPcsRef.current).forEach(pc => { try { pc.close() } catch {} })
    screenPcsRef.current = {}; screenDCsRef.current = {}; screenViewerCandidatesRef.current = {}; screenViewerNamesRef.current = {}
    unsubScreenSignalsRef.current?.(); unsubScreenSignalsRef.current = null
    screenStreamRef.current = null; screenSessionIdRef.current = null
    setScreenStatus('idle'); setScreenCode('')
  }

  if (isMobile && !room.watchUrl) {
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
        <header style={{ position: 'relative', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backdropFilter: 'blur(20px)', background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/dashboard" style={{ fontFamily: 'Oswald', fontSize: '1.1rem', fontWeight: 700, color: 'var(--green)', textDecoration: 'none', textShadow: '0 0 12px rgba(0,255,136,0.4)' }}>WE🕊️</Link>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-dim)' }}>{room.mode === 'music' ? '🎵' : '📺'} {room.name || 'ROOM'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* LIVE screenshare badge */}
            {screenStatus === 'sharing' && (
              <div onClick={stopRoomSharing} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(233,30,99,0.15)', border: '1px solid rgba(233,30,99,0.5)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pink)', boxShadow: '0 0 6px var(--pink)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'var(--pink)', letterSpacing: '0.08em' }}>LIVE · {screenCode}</span>
              </div>
            )}
            {/* Participants badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, padding: '4px 8px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--green)' }}>{room.participants?.length || 0}</span>
            </div>
            {/* 3-dots menu */}
            <div ref={headerMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowHeaderMenu(v => !v)}
                style={{ width: 32, height: 32, borderRadius: 8, background: showHeaderMenu ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.1rem', color: 'var(--text-dim)', letterSpacing: '0.05em' }}
                aria-label="More options"
              >🤍</button>
              {showHeaderMenu && (
                <div
                  style={{ position: 'absolute', top: '110%', right: 0, background: 'rgba(18,18,18,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '6px 0', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', minWidth: 200, backdropFilter: 'blur(16px)' }}
                  onClick={() => setShowHeaderMenu(false)}
                >
                  {/* Mode toggle */}
                  <button
                    onClick={async e => { e.stopPropagation(); const m = !musicMode; setMusicMode(m); await updateMusicMode(roomId, m); setShowHeaderMenu(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{musicMode ? '📺' : '🎵'}</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.07em' }}>Switch to {musicMode ? 'Watch Mode' : 'Music Mode'}</span>
                  </button>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />
                  {/* Copy room code */}
                  <button
                    onClick={e => { e.stopPropagation(); copyCode(); setShowHeaderMenu(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--green)', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{copied ? '✅' : '📋'}</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.07em' }}>Copy Code · {room.roomCode}</span>
                  </button>
                  {/* Copy invite link */}
                  <button
                    onClick={e => { e.stopPropagation(); copyLink(); setShowHeaderMenu(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{copiedLink ? '✅' : '🔗'}</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.07em' }}>Copy Invite Link</span>
                  </button>
                  {/* Games */}
                  <button
                    onClick={e => { e.stopPropagation(); setShowGames(true); setShowHeaderMenu(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>🎮</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.07em' }}>Games</span>
                  </button>
                  {/* Screen share */}
                  <button
                    onClick={e => { e.stopPropagation(); setShowHeaderMenu(false); screenStatus === 'sharing' ? stopRoomSharing() : startRoomSharing() }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: screenStatus === 'sharing' ? 'rgba(233,30,99,0.08)' : 'transparent', border: 'none', cursor: 'pointer', color: screenStatus === 'sharing' ? 'var(--pink)' : 'var(--text)', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{screenStatus === 'sharing' ? '⏹' : '📲'}</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.07em' }}>{screenStatus === 'sharing' ? `Stop Sharing · ${screenCode}` : 'Share Screen'}</span>
                  </button>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />
                  {/* Leave room */}
                  <button
                    onClick={e => { e.stopPropagation(); handleLeave(); setShowHeaderMenu(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--pink)', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>✕</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', letterSpacing: '0.07em' }}>Leave Room</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {showGames && <GamesOverlay roomId={roomId} roomParticipants={room.participants || []} currentUser={user} onClose={() => { setShowGames(false); setDirectGame(null) }} pictionaryInvite={pictionaryInvite} wordchainInvite={wordchainInvite} initialGame={directGame} />}
        <GameInviteToast invite={pictionaryInvite} game="pictionary" respondFn={respondToPictionaryInvite} currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('pictionary'); setShowGames(true) }} onDecline={() => {}} />
        <GameInviteToast invite={wordchainInvite}  game="wordchain"  respondFn={respondToWordChainInvite}  currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('wordchain');  setShowGames(true) }} onDecline={() => {}} />

        {/* Mobile Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'hidden', overflowY: musicMode ? 'hidden' : 'auto', WebkitOverflowScrolling: 'touch', position: 'relative', zIndex: 1 }}>

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
          <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(13,13,13,0.97)', overflowX: 'auto', scrollbarWidth: 'none', position: musicMode ? 'static' : 'sticky', top: 0, zIndex: musicMode ? 'auto' : 5, backdropFilter: 'blur(12px)' }}>
            <style>{`#mob-tabs::-webkit-scrollbar{display:none}`}</style>
            <div id="mob-tabs" style={{ display: 'flex', width: '100%' }}>
              {[['search','🔍','Search'],['queue','🎵','Queue'],['playlists','📋','Playlist'],['chat','💬','Chat'],['ai','🐻‍❄️','AI Bond']].map(([id, icon, label]) => {
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
          <div style={{ flex: musicMode ? 1 : 'none', height: musicMode ? undefined : '68vh', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
            <div style={{ display: mobileTab === 'search' || mobileTab === 'queue' || mobileTab === 'playlists' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <SearchAndQueue room={room} isHost={canFullControl} canAdd={canAdd} onAddToQueue={handleAddToQueue} onPlayNow={handlePlayNow} onRemove={i => canFullControl && removeFromQueue(roomId, i)} ytAccessToken={ytToken} initialTab={mobileTab === 'playlists' ? 'playlists' : mobileTab === 'queue' ? 'queue' : 'search'} hideTabs={true} roomId={roomId} playedHistory={room.playedHistory || []} onStartPlaylist={handleStartPlaylist} onShufflePlaylist={handleShufflePlaylist} onTokenExpired={refreshYtToken} />
            </div>
            <div style={{ display: mobileTab === 'ai' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <AIBondPanel room={room} canAdd={canAdd} onAddToQueue={handleAddToQueue} ytAccessToken={ytToken} />
            </div>
            <div style={{ display: mobileTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <ChatPanel roomId={roomId} messages={messages} currentUser={user} />
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
            <button onClick={copyCode} style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Oswald', color: 'var(--cyan)', fontSize: '0.7rem' }}>
              {copied ? '✅' : '📋'} {room.roomCode}
            </button>
            <button onClick={copyLink} title="Copy invite link" style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.15)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{copiedLink ? '✅' : '🔗'}</button>
            <button onClick={() => setShowGames(true)} title="Games" style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🎮</button>
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
        {showGames && <GamesOverlay roomId={roomId} roomParticipants={room.participants || []} currentUser={user} onClose={() => { setShowGames(false); setDirectGame(null) }} pictionaryInvite={pictionaryInvite} wordchainInvite={wordchainInvite} initialGame={directGame} />}
        <GameInviteToast invite={pictionaryInvite} game="pictionary" respondFn={respondToPictionaryInvite} currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('pictionary'); setShowGames(true) }} onDecline={() => {}} />
        <GameInviteToast invite={wordchainInvite}  game="wordchain"  respondFn={respondToWordChainInvite}  currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('wordchain');  setShowGames(true) }} onDecline={() => {}} />

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
            {!isYt && (
              <button type="button" onClick={() => setWatchCrop(c => !c)} title="Crop to video only" style={{ flexShrink: 0, background: watchCrop ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${watchCrop ? 'rgba(0,200,255,0.4)' : 'rgba(255,255,255,0.15)'}`, borderRadius: 8, padding: '8px 12px', color: watchCrop ? 'var(--cyan)' : 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem' }}>✂️ {watchCrop ? 'Cropped' : 'Crop'}</button>
            )}
          </form>
        )}

        {/* Video */}
        <div style={{ flexShrink: 0, width: '100%', paddingTop: '56.25%', position: 'relative', background: '#000', overflow: 'hidden', borderRadius: 14 }}>
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
              style={{ position: 'absolute', top: watchCrop ? -65 : 0, left: 0, width: '100%', height: watchCrop ? 'calc(100% + 65px)' : '100%', border: 'none', display: 'block' }}
              title="Watch together"
            />
          )}
        </div>

        {/* Sync Controls */}
        {isYt && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'rgba(13,13,13,0.95)', borderTop: '1px solid rgba(0,200,255,0.15)' }}>
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
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >{room.watchIsPlaying ? '⏸' : '▶'}</button>
                {/* ◀10 */}
                <button onClick={() => { const t = Math.max(0, watchGetTime() - 10); watchSeek(t); updateWatchPlayback(roomId, { watchCurrentTime: t, watchUpdatedAt: Date.now() }) }}
                  style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', cursor: 'pointer', color: 'var(--cyan)', fontSize: '0.7rem', fontFamily: 'Oswald', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '-0.02em' }}
                  title="Back 10s">◀10</button>
                {/* 10▶ */}
                <button onClick={() => { const t = watchGetTime() + 10; watchSeek(t); updateWatchPlayback(roomId, { watchCurrentTime: t, watchUpdatedAt: Date.now() }) }}
                  style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', cursor: 'pointer', color: 'var(--cyan)', fontSize: '0.7rem', fontFamily: 'Oswald', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '-0.02em' }}
                  title="Forward 10s">10▶</button>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--cyan)', flexShrink: 0, minWidth: 36 }}>{fmtTime(watchTime)}</span>
                <input type="range" min="0" max="7200" value={watchTime}
                  onChange={e => { setWatchTime(+e.target.value) }}
                  onMouseUp={e => { watchSeek(+e.target.value); updateWatchPlayback(roomId, { watchCurrentTime: +e.target.value, watchUpdatedAt: Date.now() }) }}
                  onTouchEnd={e => { watchSeek(+e.target.value); updateWatchPlayback(roomId, { watchCurrentTime: +e.target.value, watchUpdatedAt: Date.now() }) }}
                  style={{ flex: 1, accentColor: 'var(--cyan)', cursor: 'pointer' }}
                />
                <select value={watchQuality} onChange={e => handleWatchQualityChange(e.target.value)}
                  style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, padding: '4px 6px', color: 'var(--cyan)', fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0 }}>
                  {[['auto','AUTO'],['hd1080','1080p'],['hd720','720p'],['large','480p'],['medium','360p'],['small','240p'],['tiny','144p']].map(([v,l]) => <option key={v} value={v} style={{ background: '#111' }}>{l}</option>)}
                </select>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.65rem', color: 'var(--text-dim)', flexShrink: 0 }}>{isHost ? '⭐ HOST' : '🛡️ SYNC'}</span>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <span style={{ fontSize: '1.1rem' }}>{room.watchIsPlaying ? '▶' : '⏸'}</span>
                <span style={{ fontFamily: 'Oswald', fontSize: '0.75rem', color: 'var(--text-dim)' }}>{room.watchIsPlaying ? 'Playing' : 'Paused by host'} · {fmtTime(watchTime)}</span>
                <select value={watchQuality} onChange={e => handleWatchQualityChange(e.target.value)}
                  style={{ marginLeft: 'auto', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, padding: '4px 6px', color: 'var(--cyan)', fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0 }}>
                  {[['auto','AUTO'],['hd1080','1080p'],['hd720','720p'],['large','480p'],['medium','360p'],['small','240p'],['tiny','144p']].map(([v,l]) => <option key={v} value={v} style={{ background: '#111' }}>{l}</option>)}
                </select>
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
  //  WATCH URL ROOM — DESKTOP
  // ══════════════════════════════════════════
  if (room.watchUrl && !isMobile) {
    const isYt = /youtube\.com\/embed/.test(room.watchUrl)
    const fmtTime = s => { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0a', position: 'relative' }}>
        <div className="grid-bg" />

        {/* Header */}
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px', background: 'rgba(13,13,13,0.97)', borderBottom: '1px solid var(--border)', zIndex: 10, position: 'relative' }}>
          <Link href="/dashboard" style={{ fontFamily: 'Oswald', fontSize: '1.15rem', fontWeight: 700, color: 'var(--cyan)', textDecoration: 'none', textShadow: '0 0 12px rgba(0,200,255,0.4)', flexShrink: 0 }}>WE🕊️</Link>
          <div style={{ fontFamily: 'Oswald', fontSize: '0.68rem', color: 'var(--cyan)', letterSpacing: '0.1em', flexShrink: 0 }}>📺 WATCH ROOM</div>
          {/* URL bar (host) */}
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
            }} style={{ flex: 1, display: 'flex', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: '0.85rem', alignSelf: 'center', flexShrink: 0 }}>🔗</span>
              <input value={watchUrlInput} onChange={e => setWatchUrlInput(e.target.value)}
                placeholder={room.watchUrl || 'Paste new video URL…'}
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', minWidth: 0 }}
              />
              <button type="submit" style={{ flexShrink: 0, background: 'var(--cyan)', border: 'none', borderRadius: 8, padding: '5px 12px', color: '#000', fontFamily: 'Oswald', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>GO</button>
              {!isYt && (
                <button type="button" onClick={() => setWatchCrop(c => !c)} style={{ flexShrink: 0, background: watchCrop ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${watchCrop ? 'rgba(0,200,255,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '5px 10px', color: watchCrop ? 'var(--cyan)' : 'var(--text-dim)', cursor: 'pointer', fontSize: '0.78rem' }}>✂️ {watchCrop ? 'Cropped' : 'Crop'}</button>
              )}
            </form>
          )}
          {!isHost && <div style={{ flex: 1 }} />}
          {/* Right badge cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={copyCode} style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Oswald', color: 'var(--cyan)', fontSize: '0.7rem' }}>{copied ? '✅' : '📋'} {room.roomCode}</button>
            <button onClick={copyLink} title="Copy invite link" style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.15)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{copiedLink ? '✅' : '🔗'}</button>
            <button onClick={() => setShowGames(true)} title="Games" style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🎮</button>
            <div className="badge badge-green" style={{ fontSize: '0.7rem' }}><span className="pulse-dot" style={{ width: 6, height: 6 }} />{room.participants?.length || 0} vibing</div>
            {isHost && <div className="badge" style={{ background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.3)', color: '#f39c12', fontSize: '0.7rem' }}>⭐ HOST</div>}
            <button onClick={handleLeave} className="btn-danger" style={{ padding: '5px 12px', fontSize: '0.78rem' }}>Leave</button>
          </div>
        </header>

        {showGames && <GamesOverlay roomId={roomId} roomParticipants={room.participants || []} currentUser={user} onClose={() => { setShowGames(false); setDirectGame(null) }} pictionaryInvite={pictionaryInvite} wordchainInvite={wordchainInvite} initialGame={directGame} />}
        <GameInviteToast invite={pictionaryInvite} game="pictionary" respondFn={respondToPictionaryInvite} currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('pictionary'); setShowGames(true) }} onDecline={() => {}} />
        <GameInviteToast invite={wordchainInvite}  game="wordchain"  respondFn={respondToWordChainInvite}  currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('wordchain');  setShowGames(true) }} onDecline={() => {}} />

        {/* Body — video + chat sidebar */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* Video area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {/* Video fills remaining height */}
            <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden', minHeight: 0, borderRadius: '0 0 14px 14px' }}>
              {isYt ? (
                <YouTube
                  key={room.watchUrl}
                  videoId={room.watchUrl.match(/embed\/([A-Za-z0-9_-]{11})/)?.[1]}
                  opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, controls: 1, rel: 0 } }}
                  onReady={handleWatchPlayerReady}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
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

            {/* Sync Controls bar */}
            {isYt && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', background: 'rgba(13,13,13,0.97)', borderTop: '1px solid rgba(0,200,255,0.15)' }}>
                {canControl ? (
                  <>
                    <button onClick={() => {
                      const nowPlaying = !room.watchIsPlaying
                      const t = watchGetTime()
                      if (nowPlaying) watchPlay(); else watchPause()
                      updateWatchPlayback(roomId, { watchIsPlaying: nowPlaying, watchCurrentTime: t, watchUpdatedAt: Date.now() })
                    }} style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--cyan)', border: 'none', cursor: 'pointer', fontSize: '1.05rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 14px rgba(0,200,255,0.4)', transition: 'transform 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >{room.watchIsPlaying ? '⏸' : '▶'}</button>
                    {/* ◀10 */}
                    <button onClick={() => { const t = Math.max(0, watchGetTime() - 10); watchSeek(t); updateWatchPlayback(roomId, { watchCurrentTime: t, watchUpdatedAt: Date.now() }) }}
                      style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', cursor: 'pointer', color: 'var(--cyan)', fontSize: '0.72rem', fontFamily: 'Oswald', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '-0.02em' }}
                      title="Back 10s">◀10</button>
                    {/* 10▶ */}
                    <button onClick={() => { const t = watchGetTime() + 10; watchSeek(t); updateWatchPlayback(roomId, { watchCurrentTime: t, watchUpdatedAt: Date.now() }) }}
                      style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', cursor: 'pointer', color: 'var(--cyan)', fontSize: '0.72rem', fontFamily: 'Oswald', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '-0.02em' }}
                      title="Forward 10s">10▶</button>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.8rem', color: 'var(--cyan)', flexShrink: 0, minWidth: 42 }}>{fmtTime(watchTime)}</span>
                    <input type="range" min="0" max="7200" value={watchTime}
                      onChange={e => setWatchTime(+e.target.value)}
                      onMouseUp={e => { watchSeek(+e.target.value); updateWatchPlayback(roomId, { watchCurrentTime: +e.target.value, watchUpdatedAt: Date.now() }) }}
                      onTouchEnd={e => { watchSeek(+e.target.value); updateWatchPlayback(roomId, { watchCurrentTime: +e.target.value, watchUpdatedAt: Date.now() }) }}
                      style={{ flex: 1, accentColor: 'var(--cyan)', cursor: 'pointer', height: 4 }}
                    />
                    <select value={watchQuality} onChange={e => handleWatchQualityChange(e.target.value)}
                      style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, padding: '5px 8px', color: 'var(--cyan)', fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0 }}>
                      {[['auto','AUTO'],['hd1080','1080p'],['hd720','720p'],['large','480p'],['medium','360p'],['small','240p'],['tiny','144p']].map(([v,l]) => <option key={v} value={v} style={{ background: '#111' }}>{l}</option>)}
                    </select>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.68rem', color: 'var(--text-dim)', flexShrink: 0 }}>{isHost ? '⭐ HOST CONTROLS' : '🛡️ IN SYNC'}</span>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
                    <span style={{ fontSize: '1.1rem' }}>{room.watchIsPlaying ? '▶' : '⏸'}</span>
                    <span style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: 'var(--text-dim)' }}>{room.watchIsPlaying ? 'Playing' : 'Paused by host'} · {fmtTime(watchTime)}</span>
                    <select value={watchQuality} onChange={e => handleWatchQualityChange(e.target.value)}
                      style={{ marginLeft: 'auto', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, padding: '5px 8px', color: 'var(--cyan)', fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0 }}>
                      {[['auto','AUTO'],['hd1080','1080p'],['hd720','720p'],['large','480p'],['medium','360p'],['small','240p'],['tiny','144p']].map(([v,l]) => <option key={v} value={v} style={{ background: '#111' }}>{l}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right sidebar — Chat + People (320px) */}
          <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(13,13,13,0.7)' }}>
            {/* Tabs */}
            <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {[['chat', '💬 CHAT'], ['people', '👥 PEOPLE']].map(([id, label]) => (
                <button key={id} onClick={() => setMobileTab(id)}
                  style={{ flex: 1, padding: '10px 4px', background: 'transparent', border: 'none', borderBottom: `2px solid ${mobileTab === id ? 'var(--cyan)' : 'transparent'}`, cursor: 'pointer', fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.1em', color: mobileTab === id ? 'var(--cyan)' : 'var(--text-dim)' }}>
                  {label}
                </button>
              ))}
            </div>
            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <div style={{ display: mobileTab === 'people' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <ParticipantsPanel room={room} currentUser={user} isHost={isHost} roomId={roomId} watchTimes={room.watchTimes} />
              </div>
              <div style={{ display: mobileTab !== 'people' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <ChatPanel roomId={roomId} messages={messages} currentUser={user} />
              </div>
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
          <Link href="/dashboard" style={{ fontFamily: 'Oswald', fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)', textDecoration: 'none', textShadow: '0 0 15px rgba(0,200,255,0.5)' }}>WE🕊️</Link>
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
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
            setVideoFocus(false)
            setFocusLandscape(true)
            await updateMusicMode(roomId, newMode)
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: musicMode ? 'rgba(0,255,136,0.08)' : 'rgba(52,152,219,0.08)', border: `1px solid ${musicMode ? 'rgba(0,255,136,0.3)' : 'rgba(52,152,219,0.3)'}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Oswald', color: musicMode ? 'var(--green)' : 'var(--cyan)', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
            {musicMode ? '🎵 MUSIC' : '📺 VIDEO'}
          </button>
          <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.12em', color: 'var(--green)', fontSize: '0.85rem' }}>
            {copied ? '✅' : '📋'} {room.roomCode}
          </button>
          <button onClick={copyLink} title="Copy invite link" style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{copiedLink ? '✅' : '🔗'}</button>
          <button onClick={() => setShowGames(true)} title="Games" style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🎮</button>
          <div className="badge badge-green"><span className="pulse-dot" style={{ width: 6, height: 6 }} />{room.participants?.length || 0} vibing</div>
          {isHost && <div className="badge" style={{ background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.3)', color: '#f39c12' }}>⭐ HOST</div>}
          <button onClick={handleLeave} className="btn-danger" style={{ padding: '7px 14px', fontSize: '0.8rem' }}>Leave</button>
        </div>
      </header>

      {showGames && <GamesOverlay roomId={roomId} roomParticipants={room.participants || []} currentUser={user} onClose={() => { setShowGames(false); setDirectGame(null) }} pictionaryInvite={pictionaryInvite} wordchainInvite={wordchainInvite} initialGame={directGame} />}
      <GameInviteToast invite={pictionaryInvite} game="pictionary" respondFn={respondToPictionaryInvite} currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('pictionary'); setShowGames(true) }} onDecline={() => {}} />
      <GameInviteToast invite={wordchainInvite}  game="wordchain"  respondFn={respondToWordChainInvite}  currentUser={user} roomId={roomId} onAccept={() => { setDirectGame('wordchain');  setShowGames(true) }} onDecline={() => {}} />

      {/* 3-Column Layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `${videoFocus ? '0px' : leftCollapsed ? '48px' : '340px'} 1fr ${videoFocus ? '0px' : '300px'}`, overflow: 'hidden', position: 'relative', zIndex: 1, transition: 'grid-template-columns 0.3s ease' }}>

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
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                >◀</button>
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
                <div
                  ref={focusContainerRef}
                  style={videoFocus
                    ? { position: 'relative', width: '100%', height: '100%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0, overflow: 'hidden' }
                    : { position: 'relative', width: '100%', maxWidth: 700, flexShrink: 0, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }
                  }>
                  {ytPlayerEl}
                  {/* Focus toggle */}
                  <button
                    onClick={() => {
                      if (!videoFocus) {
                        focusContainerRef.current?.requestFullscreen?.().catch(() => {})
                        setVideoFocus(true)
                        setFocusLandscape(true)
                      } else {
                        document.exitFullscreen?.().catch(() => {})
                        setVideoFocus(false)
                        setFocusLandscape(true)
                      }
                    }}
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.65)', border: `1px solid ${videoFocus ? 'rgba(52,152,219,0.7)' : 'rgba(255,255,255,0.25)'}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Oswald', color: videoFocus ? 'var(--cyan)' : '#fff', fontSize: '0.72rem', letterSpacing: '0.1em', transition: 'all 0.2s', backdropFilter: 'blur(4px)' }}>
                    {videoFocus ? '✕ EXIT FOCUS' : '⛶ FOCUS'}
                  </button>
                  {/* Orientation toggle — only visible in focus mode */}
                  {videoFocus && (
                    <button
                      onClick={() => setFocusLandscape(l => !l)}
                      title={focusLandscape ? 'Switch to portrait' : 'Switch to landscape'}
                      style={{ position: 'absolute', top: 10, right: 136, zIndex: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.65)', border: `1px solid ${focusLandscape ? 'rgba(255,255,255,0.3)' : 'rgba(249,115,22,0.7)'}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Oswald', color: focusLandscape ? '#fff' : '#f97316', fontSize: '0.68rem', letterSpacing: '0.08em', backdropFilter: 'blur(4px)', transition: 'all 0.2s' }}>
                      {focusLandscape ? '↕ PORTRAIT' : '↔ LANDSCAPE'}
                    </button>
                  )}
                  {/* Playback controls overlay — only inside fullscreen so ⏭ works in focus mode */}
                  {videoFocus && canControl && (
                    <div style={{ position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 40, padding: '8px 20px' }}>
                      {canControl && (
                        <button onClick={handlePreviousTrack} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⏮</button>
                      )}
                      <button onClick={handlePlayPause} style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(0,255,136,0.5)' }}>{room.isPlaying ? '⏸' : '▶'}</button>
                      <button onClick={() => skipToNext(roomId)} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⏭</button>
                    </div>
                  )}
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
                      {canControl && (
                        <button onClick={handlePreviousTrack} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#f97316' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                        >⏮</button>
                      )}
                      <button onClick={handlePlayPause} style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.4)', transition: 'transform 0.15s', flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >{room.isPlaying ? '⏸' : '▶'}</button>
                      <button onClick={() => skipToNext(roomId)} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >⏭</button>
                      {volumeWidget}
                      <button onClick={openMobilePip} title="Open in PiP" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⛶</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>{room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}</span>
                      {volumeWidget}
                      <button onClick={openMobilePip} title="Open in PiP" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⛶</button>
                    </div>
                  )}
                </div>
              ) : (
                // Video mode controls
                <div style={{ width: '100%', maxWidth: videoFocus ? (focusLandscape ? '100%' : 'calc(100vh * 9 / 16)') : 500 }}>
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: 4 }}>{room.currentTrack.channelTitle}</div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <ProgressBar currentTime={currentTime} duration={duration} isHost={isHost} canControl={canControl} onSeek={handleSeek} />
                  </div>
                  {canControl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
                      {canControl && (
                        <button onClick={handlePreviousTrack} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                        >⏮</button>
                      )}
                      <button onClick={handlePlayPause} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.4)', transition: 'transform 0.15s', flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >{room.isPlaying ? '⏸' : '▶'}</button>
                      <button onClick={() => skipToNext(roomId)} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >⏭</button>
                      {volumeWidget}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>{room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}</span>
                      {volumeWidget}
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
            {[['chat', '💬 Chat'], ['participants', '👥 People'], ['ai', '🐻‍❄️ AI Bond']].map(([id, label]) => (
              <button key={id} className={`tab-btn ${rightTab === id ? 'active' : ''}`} onClick={() => setRightTab(id)} style={{ fontSize: '0.7rem' }}>{label}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {rightTab === 'chat' && <ChatPanel roomId={roomId} messages={messages} currentUser={user} />}
            {rightTab === 'participants' && <ParticipantsPanel room={room} currentUser={user} isHost={isHost} roomId={roomId} />}
            {rightTab === 'ai' && <AIBondPanel room={room} canAdd={canAdd} onAddToQueue={handleAddToQueue} ytAccessToken={ytToken} />}
          </div>
        </div>
      </div>
    </div>
  )
}