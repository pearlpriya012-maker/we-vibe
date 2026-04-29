'use client'
// src/app/screenshare/[code]/page.jsx — Screen share viewer page
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { findSessionByCode, sendSignal, listenSignals, listenSession } from '@/lib/screenshare'

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
}

export default function ScreenShareViewerPage() {
  const { code } = useParams()
  const { user } = useAuth()
  const router = useRouter()
  const videoRef = useRef(null)
  const pcRef = useRef(null)
  const unsubsRef = useRef([])
  const [status, setStatus] = useState('connecting') // connecting | watching | ended | error
  const [hostName, setHostName] = useState('Host')
  const [errorMsg, setErrorMsg] = useState('')
  // stable viewer ID for this tab session
  const viewerIdRef = useRef(null)
  if (!viewerIdRef.current) viewerIdRef.current = (typeof window !== 'undefined' ? (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) : Math.random().toString(36).slice(2))

  useEffect(() => {
    if (!user) { router.replace('/'); return }
  }, [user])

  useEffect(() => {
    if (!user || !code) return
    const viewerId = viewerIdRef.current
    let pc = null
    const pendingCandidates = []
    let remoteDescSet = false

    async function connect() {
      try {
        const session = await findSessionByCode(code)
        setHostName(session.hostName || 'Host')

        pc = new RTCPeerConnection(ICE_CONFIG)
        pcRef.current = pc

        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0]
            setStatus('watching')
          }
        }

        pc.onicecandidate = (e) => {
          if (e.candidate) sendSignal(session.id, viewerId, 'host', 'ice', e.candidate)
        }

        pc.onconnectionstatechange = () => {
          if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            setStatus('ended')
          }
        }

        // Detect host ending the session
        const unsubSession = listenSession(session.id, (data) => {
          if (data && !data.active) setStatus('ended')
        })
        unsubsRef.current.push(unsubSession)

        // Listen for signaling messages from host
        const unsubSig = listenSignals(session.id, viewerId, async (msg) => {
          if (msg.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data))
            remoteDescSet = true
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await sendSignal(session.id, viewerId, 'host', 'answer', answer)
            // Flush buffered ICE candidates
            for (const c of pendingCandidates) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
            }
            pendingCandidates.length = 0
          } else if (msg.type === 'ice') {
            if (remoteDescSet) {
              try { await pc.addIceCandidate(new RTCIceCandidate(msg.data)) } catch {}
            } else {
              pendingCandidates.push(msg.data)
            }
          }
        })
        unsubsRef.current.push(unsubSig)

        // Announce presence to host
        await sendSignal(session.id, viewerId, 'host', 'join', { name: user.displayName || 'Viewer' })
      } catch (err) {
        setErrorMsg(err.message || 'Could not connect')
        setStatus('error')
      }
    }

    connect()
    return () => {
      unsubsRef.current.forEach(u => u?.())
      unsubsRef.current = []
      pc?.close()
    }
  }, [user, code])

  const bgStyle = { minHeight: '100vh', background: '#0d0d0d', display: 'flex', flexDirection: 'column' }

  if (status === 'ended') return (
    <div style={{ ...bgStyle, alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-dim)' }}>
      <div style={{ fontSize: '3rem' }}>🖥️</div>
      <div style={{ fontFamily: 'Oswald', fontSize: '1.2rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Screen share ended</div>
      <div style={{ fontSize: '0.85rem' }}>{hostName} has stopped sharing</div>
      <Link href="/dashboard" style={{ marginTop: 12, padding: '10px 24px', background: 'var(--green)', color: '#000', borderRadius: 8, fontFamily: 'Oswald', fontSize: '0.8rem', textDecoration: 'none' }}>Back to Dashboard</Link>
    </div>
  )

  if (status === 'error') return (
    <div style={{ ...bgStyle, alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-dim)' }}>
      <div style={{ fontSize: '3rem' }}>⚠️</div>
      <div style={{ fontFamily: 'Oswald', fontSize: '1.1rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Connection failed</div>
      <div style={{ fontSize: '0.82rem', color: 'var(--pink)' }}>{errorMsg}</div>
      <Link href="/dashboard" style={{ marginTop: 12, padding: '10px 24px', background: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 8, fontFamily: 'Oswald', fontSize: '0.8rem', textDecoration: 'none' }}>Back to Dashboard</Link>
    </div>
  )

  return (
    <div style={bgStyle}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.2rem' }}>🖥️</span>
          <div>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {status === 'connecting' ? 'Connecting…' : `${hostName}'s Screen`}
            </div>
            {status === 'watching' && (
              <div style={{ fontSize: '0.65rem', color: 'var(--green)', marginTop: 1 }}>● LIVE</div>
            )}
          </div>
        </div>
        <Link href="/dashboard" style={{ color: 'var(--text-dim)', fontSize: '0.78rem', textDecoration: 'none' }}>Leave</Link>
      </div>

      {/* Video */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', position: 'relative' }}>
        {status === 'connecting' && (
          <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'rgba(255,255,255,0.4)' }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(0,255,136,0.3)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontFamily: 'Oswald', fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Waiting for host…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 60px)', objectFit: 'contain', display: status === 'watching' ? 'block' : 'none' }}
        />
      </div>
    </div>
  )
}
