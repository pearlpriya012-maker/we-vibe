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
  sendMessage, addReaction, toggleParticipantQueueAccess,
  kickParticipant, updateMusicMode,
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
function MusicVisualizer({ track, isPlaying }) {
  const bars = Array.from({ length: 28 })
  return (
    <div style={{ width: '100%', maxWidth: 460, position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 80px rgba(0,0,0,0.9),0 0 60px rgba(0,255,136,0.1)', aspectRatio: '1/1', background: '#000' }}>
      <img src={track.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, filter: 'blur(8px) brightness(0.5)', position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.3) 0%,rgba(0,0,0,0.8) 100%)' }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-58%)', width: '52%', aspectRatio: '1/1', borderRadius: '50%', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.8),0 0 30px rgba(0,255,136,0.2)', border: '3px solid rgba(0,255,136,0.3)', animation: isPlaying ? 'spinAlbum 12s linear infinite' : 'none' }}>
        <img src={track.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-58%)', width: 16, height: 16, borderRadius: '50%', background: '#000', border: '3px solid var(--green)', boxShadow: '0 0 10px var(--green)', zIndex: 2 }} />
      {isPlaying && Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', bottom: '28%', left: `${8 + i * 8.5}%`, width: 5, height: 5, borderRadius: '50%', background: i % 3 === 0 ? 'var(--green)' : i % 3 === 1 ? 'var(--cyan)' : 'var(--pink)', boxShadow: `0 0 8px ${i % 3 === 0 ? 'var(--green)' : i % 3 === 1 ? 'var(--cyan)' : 'var(--pink)'}`, animation: `fireUp ${0.8 + (i % 4) * 0.3}s ease-in ${i * 0.12}s infinite` }} />
      ))}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '26%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, padding: '0 14px 14px', background: 'linear-gradient(0deg,rgba(0,0,0,0.9) 0%,transparent 100%)' }}>
        {bars.map((_, i) => (
          <div key={i} style={{ flex: 1, borderRadius: '2px 2px 0 0', background: `linear-gradient(180deg,${i % 3 === 0 ? 'var(--green)' : i % 3 === 1 ? 'var(--cyan)' : 'var(--purple)'},transparent)`, animation: isPlaying ? `barBeat ${0.3 + (i % 6) * 0.12}s ease-in-out ${i * 0.04}s infinite alternate` : 'none', height: isPlaying ? `${15 + (i % 9) * 9}%` : '8%', transition: 'height 0.4s' }} />
        ))}
      </div>
      <style>{`
        @keyframes spinAlbum { from{transform:translate(-50%,-58%) rotate(0deg)} to{transform:translate(-50%,-58%) rotate(360deg)} }
        @keyframes fireUp { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-60px) scale(0);opacity:0} }
        @keyframes barBeat { from{height:8%} to{height:85%} }
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
function PlaylistPanel({ onAddToQueue, canAdd, ytAccessToken, onStartPlaylist, onShufflePlaylist }) {
  const [playlists, setPlaylists] = useState([])
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [selectedPlaylistMeta, setSelectedPlaylistMeta] = useState(null)
  const [view, setView] = useState('playlists') // 'playlists' | 'tracks'

  useEffect(() => {
    if (!ytAccessToken) { setPlaylists([]); return }
    async function loadPlaylists() {
      setLoading(true)
      try {
        const res = await fetch('/api/youtube/playlists', {
          headers: { Authorization: `Bearer ${ytAccessToken}` }
        })
        const data = await res.json()
        setPlaylists(data.playlists || [])
      } catch {
        setPlaylists([])
      } finally {
        setLoading(false)
      }
    }
    loadPlaylists()
  }, [ytAccessToken])

  async function loadPlaylistTracks(playlistId, title, thumbnail) {
    setSelectedPlaylist(title)
    setSelectedPlaylistMeta({ id: playlistId, title, thumbnail })
    setView('tracks')
    setLoading(true)
    try {
      const res = await fetch(`/api/youtube/playlistItems?playlistId=${playlistId}`, {
        headers: { Authorization: `Bearer ${ytAccessToken || ''}` }
      })
      const data = await res.json()
      setTracks(data.results || [])
    } catch {
      toast.error('Could not load playlist tracks')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}><span className="spinner" /></div>

  if (!ytAccessToken) return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 12 }}>Connect YouTube in Settings to see your playlists</div>
      <Link href="/settings" className="btn-ghost" style={{ fontSize: '0.8rem', padding: '8px 16px' }}>Go to Settings →</Link>
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
              onClick={() => { if (!canAdd) { toast('Ask host to allow adding songs'); return } onAddToQueue(track); toast.success('Added!') }}
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
function SearchAndQueue({ room, isHost, canAdd, onAddToQueue, onPlayNow, onRemove, ytAccessToken, initialTab, hideTabs, roomId, playedHistory = [], onStartPlaylist, onShufflePlaylist }) {
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
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&limit=8`)
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
        <PlaylistPanel onAddToQueue={onAddToQueue} canAdd={canAdd} ytAccessToken={ytAccessToken} onStartPlaylist={onStartPlaylist} onShufflePlaylist={onShufflePlaylist} />
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
function ParticipantsPanel({ room, currentUser, isHost, roomId }) {
  const [kickConfirm, setKickConfirm] = useState(null)
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
  const [playedHistory, setPlayedHistory] = useState([])
  const prevTrackRef = useRef(null)
  const [ytToken, setYtToken] = useState(user?.youtubeAccessToken || null)

  const isHost = room?.hostId === user?.uid
  // canAdd = can add songs AND control playback (when host grants access)
  const canAdd = isHost || room?.participantsCanAddToQueue
  // canControl = can use play/pause/seek
  const canControl = isHost || room?.participantsCanAddToQueue

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return }
    return subscribeToRoom(roomId, data => { setRoom(data); setLoading(false) })
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
    const check = () => setIsMobile(window.innerWidth < 768)
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
    return () => clearInterval(tickRef.current)
  }, [])

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

  // ─── Track played history ───
  useEffect(() => {
    if (!room) return
    const curr = room.currentTrack
    const prev = prevTrackRef.current
    if (prev && curr?.videoId !== prev.videoId) {
      setPlayedHistory(h => [...h, prev])
    }
    prevTrackRef.current = curr || null
  }, [room?.currentTrack?.videoId])

  // ─── Non-host sync ───
  useEffect(() => {
    if (!room || isHost) return
    
    // Debounce: skip if we just updated Firebase ourselves (prevents sync loops)
    const now = Date.now()
    if (now - lastUpdateRef.current < 1000) return
    
    try {
      const p = ytPlayerRef.current
      if (!p) return
      const vid = p.getVideoData?.()?.video_id
      if (room.currentTrack?.videoId && vid !== room.currentTrack.videoId) {
        p.loadVideoById({ videoId: room.currentTrack.videoId, startSeconds: room.currentTime || 0 })
        return
      }
      // Guard: only toggle if state actually differs — prevents playVideo() spam every second
      const state = p.getPlayerState?.()
      if (room.isPlaying && state !== 1) p.playVideo?.()
      else if (!room.isPlaying && state !== 2) p.pauseVideo?.()
    } catch {}
  }, [room?.isPlaying, room?.currentTrack?.videoId, isHost])

  // ─── Host: push timestamp every 5s ───
  useEffect(() => {
    if (!isHost || !room?.isPlaying) return
    const iv = setInterval(() => {
      try {
        const t = ytPlayerRef.current?.getCurrentTime?.()
        if (typeof t === 'number' && isFinite(t)) updatePlayback(roomId, { currentTime: t })
      } catch {}
    }, 5000)
    return () => clearInterval(iv)
  }, [isHost, room?.isPlaying, roomId])

  function handlePlayerReady(e) {
    try {
      ytPlayerRef.current = e.target   // store the real YT player object here
      if (!room?.currentTrack?.videoId) return
      if (room.isPlaying) {
        e.target.loadVideoById({ videoId: room.currentTrack.videoId, startSeconds: room.currentTime || 0 })
      } else {
        e.target.cueVideoById({ videoId: room.currentTrack.videoId, startSeconds: room.currentTime || 0 })
      }
      // On desktop, mark as tapped (no overlay needed); on mobile, overlay handles it
      if (!isMobile) setMobileTapped(true)
    } catch {}
  }

  async function handleStateChange(e) {
    if (!canControl || seekLock.current) return
    lastUpdateRef.current = Date.now()  // Mark that we're making a change
    const YT = window.YT?.PlayerState
    if (!YT) return
    if (e.data === YT.PLAYING) await updatePlayback(roomId, { isPlaying: true, currentTime: e.target.getCurrentTime() })
    else if (e.data === YT.PAUSED) await updatePlayback(roomId, { isPlaying: false, currentTime: e.target.getCurrentTime() })
    else if (e.data === YT.ENDED) await skipToNext(roomId)
  }

  async function handlePlayPause() {
    if (!canControl) return
    lastUpdateRef.current = Date.now()  // Mark that we're making a change
    const p = ytPlayerRef.current
    if (!p) return
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
      await updatePlayback(roomId, { currentTime: seekTo })
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
    if (!isHost) return
    const newQueue = room.queue.filter((_, i) => i !== index)
    await setCurrentTrack(roomId, track)
    const { updateDoc, doc } = await import('firebase/firestore')
    const { db } = await import('@/lib/firebase')
    await updateDoc(doc(db, 'rooms', roomId), { queue: newQueue })
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

  // ─── Shared: hidden YT player (always in DOM) ───
  const hiddenPlayer = room.currentTrack ? (
    <div style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: -1, top: 0, left: 0 }}
      hidden={!musicMode}>
    </div>
  ) : null

  // ─── Shared: YouTube player element (kept in DOM always) ───
  const ytPlayerEl = room.currentTrack ? (
    <div style={musicMode
      ? { position: 'fixed', left: '-2000px', top: '-2000px', width: 320, height: 180, pointerEvents: 'none', zIndex: -1 }
      : isMobile
        ? { width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.8)', flexShrink: 0 }
        : { width: '100%', maxWidth: videoFocus ? 1100 : 700, aspectRatio: '16/9', borderRadius: videoFocus ? 8 : 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', flexShrink: 0 }
    }>
      <YouTube
        ref={playerRef}
        videoId={room.currentTrack.videoId}
        opts={{ width: '640', height: '360', playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0 } }}
        onReady={handlePlayerReady}
        onStateChange={handleStateChange}
        style={{ width: '100%', height: '100%' }}
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
        <div style={{ position: 'absolute', bottom: isMobile ? 'auto' : '110%', top: isMobile ? '110%' : 'auto', left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,13,13,0.97)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 12, padding: '12px 16px', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 44 }}>
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
    return room.currentTrack ? (
      <>
        {musicMode && !compact && <MusicVisualizer track={room.currentTrack} isPlaying={room.isPlaying} />}
        {ytPlayerEl}
        {!musicMode && !isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setVideoFocus(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: videoFocus ? 'rgba(52,152,219,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${videoFocus ? 'rgba(52,152,219,0.5)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Oswald', color: videoFocus ? 'var(--cyan)' : 'var(--text-dim)', fontSize: '0.72rem', letterSpacing: '0.1em', transition: 'all 0.2s' }}>
              {videoFocus ? '✕ EXIT FOCUS' : '⛶ FOCUS'}
            </button>
          </div>
        )}
        <div style={{ width: '100%', maxWidth: compact ? '100%' : videoFocus ? 700 : 500 }}>
          <div style={{ textAlign: 'center', marginBottom: compact ? 10 : 14 }}>
            <div style={{ fontWeight: 600, fontSize: compact ? '0.9rem' : '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: compact ? '0.78rem' : '0.875rem', marginTop: 4 }}>{room.currentTrack.channelTitle}</div>
          </div>
          <div style={{ marginBottom: compact ? 12 : 16 }}>
            <ProgressBar currentTime={currentTime} duration={duration} isHost={isHost} canControl={canControl} onSeek={handleSeek} />
          </div>
          {canControl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 12 : 16, justifyContent: 'center' }}>
              <button onClick={handlePlayPause} style={{ width: compact ? 46 : 52, height: compact ? 46 : 52, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: compact ? '1rem' : '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.4)', transition: 'transform 0.15s' }}>{room.isPlaying ? '⏸' : '▶'}</button>
              <button onClick={() => skipToNext(roomId)} style={{ width: compact ? 36 : 40, height: compact ? 36 : 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>⏭</button>
              {volumeWidget}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>{room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}</div>
              {volumeWidget}
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

          {/* Tap-to-unlock overlay */}
          {isMobile && !mobileTapped && room?.currentTrack && (
            <div onClick={() => { setMobileTapped(true); try { ytPlayerRef.current?.playVideo?.() } catch {} }}
              style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', cursor: 'pointer' }}>
              <div style={{ fontSize: '3rem' }}>🎵</div>
              <div style={{ fontFamily: 'Oswald', fontSize: '1rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff' }}>Tap to Start Playing</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Mobile requires a tap to unlock audio</div>
            </div>
          )}

          {/* ── Participants strip (top) ── */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '7px 12px', background: 'rgba(13,13,13,0.7)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              <style>{'.hide-scrollbar::-webkit-scrollbar{display:none}'}</style>
              {isHost && (
                <div onClick={() => toggleParticipantQueueAccess(roomId, !room.participantsCanAddToQueue)}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 8, border: `1px solid ${room.participantsCanAddToQueue ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`, background: room.participantsCanAddToQueue ? 'rgba(0,255,136,0.08)' : 'transparent', cursor: 'pointer' }}>
                  <div style={{ width: 26, height: 14, borderRadius: 7, background: room.participantsCanAddToQueue ? 'var(--green)' : 'rgba(255,255,255,0.12)', position: 'relative', flexShrink: 0, transition: 'background 0.3s' }}>
                    <div style={{ position: 'absolute', top: 2, left: room.participantsCanAddToQueue ? 13 : 2, width: 10, height: 10, borderRadius: '50%', background: room.participantsCanAddToQueue ? '#000' : 'var(--text-dim)', transition: 'left 0.3s' }} />
                  </div>
                  <span style={{ fontFamily: 'Oswald', fontSize: '0.56rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: room.participantsCanAddToQueue ? 'var(--green)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>Guests {room.participantsCanAddToQueue ? 'Can Add' : 'View Only'}</span>
                </div>
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
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '10px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <PlayerContent compact={true} />
          </div>

          {/* ── Tab Bar ── */}
          <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(13,13,13,0.8)', overflowX: 'auto', scrollbarWidth: 'none' }}>
            <style>{`#mob-tabs::-webkit-scrollbar{display:none}`}</style>
            <div id="mob-tabs" style={{ display: 'flex', width: '100%' }}>
              {[['search','🔍','Search'],['queue','🎵','Queue'],['playlists','📋','Playlist'],['aibond','🐻‍❄️','AI Bond'],['chat','💬','Chat']].map(([id, icon, label]) => {
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
              <SearchAndQueue room={room} isHost={isHost} canAdd={canAdd} onAddToQueue={handleAddToQueue} onPlayNow={handlePlayNow} onRemove={i => isHost && removeFromQueue(roomId, i)} ytAccessToken={ytToken} initialTab={mobileTab === 'playlists' ? 'playlists' : mobileTab === 'queue' ? 'queue' : 'search'} hideTabs={true} roomId={roomId} playedHistory={playedHistory} onStartPlaylist={handleStartPlaylist} onShufflePlaylist={handleShufflePlaylist} />
            </div>
            <div style={{ display: mobileTab === 'aibond' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
        <div style={{ borderRight: '1px solid var(--border)', background: 'rgba(13,13,13,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, transition: 'all 0.3s ease', position: 'relative' }}>
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
              <SearchAndQueue room={room} isHost={isHost} canAdd={canAdd} onAddToQueue={handleAddToQueue} onPlayNow={handlePlayNow} onRemove={i => isHost && removeFromQueue(roomId, i)} ytAccessToken={ytToken} roomId={roomId} playedHistory={playedHistory} onStartPlaylist={handleStartPlaylist} onShufflePlaylist={handleShufflePlaylist} />
            </>
          )}
        </div>

        {/* Center */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: videoFocus ? '16px' : '20px 24px', gap: 16, background: 'rgba(10,10,10,0.4)', overflow: 'hidden', minWidth: 0 }}>
          {room.currentTrack ? (
            <>
              {musicMode && <MusicVisualizer track={room.currentTrack} isPlaying={room.isPlaying} />}
              {ytPlayerEl}
              {!musicMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => setVideoFocus(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: videoFocus ? 'rgba(52,152,219,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${videoFocus ? 'rgba(52,152,219,0.5)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Oswald', color: videoFocus ? 'var(--cyan)' : 'var(--text-dim)', fontSize: '0.72rem', letterSpacing: '0.1em', transition: 'all 0.2s' }}>
                    {videoFocus ? '✕ EXIT FOCUS' : '⛶ FOCUS'}
                  </button>
                </div>
              )}
              <div style={{ width: '100%', maxWidth: videoFocus ? 700 : 500 }}>
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.currentTrack.title}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: 4 }}>{room.currentTrack.channelTitle}</div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar currentTime={currentTime} duration={duration} isHost={isHost} canControl={canControl} onSeek={handleSeek} />
                </div>
                {canControl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
                    <button onClick={handlePlayPause} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--green)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.4)', transition: 'transform 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >{room.isPlaying ? '⏸' : '▶'}</button>
                    <button onClick={() => skipToNext(roomId)} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                    >⏭</button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    {room.isPlaying ? '▶ Playing • Synced with host' : '⏸ Paused by host'}
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
          )}
        </div>

        {/* Right */}
        <div style={{ borderLeft: '1px solid var(--border)', background: 'rgba(13,13,13,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
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