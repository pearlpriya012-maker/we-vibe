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
  const dcRef = useRef(null)
  const [status, setStatus] = useState('connecting') // connecting | watching | ended | error
  const [hostName, setHostName] = useState('Host')
  const [errorMsg, setErrorMsg] = useState('')
  const [dcReady, setDcReady] = useState(false)
  const [interactionEnabled, setInteractionEnabled] = useState(false)
  // stable viewer ID for this tab session
  const viewerIdRef = useRef(null)
  if (!viewerIdRef.current) viewerIdRef.current = (typeof window !== 'undefined' ? (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) : Math.random().toString(36).slice(2))

  function sendInteraction(data) {
    try { if (dcRef.current?.readyState === 'open') dcRef.current.send(JSON.stringify(data)) } catch {}
  }

  function calcNormCoords(e, videoEl) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!videoEl?.videoWidth) return null
    const vAR = videoEl.videoWidth / videoEl.videoHeight
    const rAR = rect.width / rect.height
    let vW, vH, vX, vY
    if (vAR > rAR) { vW = rect.width; vH = rect.width / vAR; vX = 0; vY = (rect.height - vH) / 2 }
    else { vH = rect.height; vW = rect.height * vAR; vX = (rect.width - vW) / 2; vY = 0 }
    const nx = (e.clientX - rect.left - vX) / vW
    const ny = (e.clientY - rect.top - vY) / vH
    return (nx < 0 || nx > 1 || ny < 0 || ny > 1) ? null : { x: nx, y: ny }
  }

  useEffect(() => {
    if (!user) { router.replace('/'); return }
  }, [user])

  useEffect(() => {
    if (!interactionEnabled) return
    function onKey(e) {
      sendInteraction({ type: 'keydown', key: e.key })
      if (!['F5', 'F12', 'F1', 'Tab', 'F11'].includes(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [interactionEnabled])

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

        // Receive DataChannel from host for interaction
        pc.ondatachannel = (e) => {
          if (e.channel.label === 'interaction') {
            dcRef.current = e.channel
            e.channel.onopen = () => setDcReady(true)
            e.channel.onclose = () => { setDcReady(false); setInteractionEnabled(false) }
          }
        }

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
            // Preserve the host's high-bitrate Opus settings in the answer
            const patchedSdp = answer.sdp
              .replace(/a=fmtp:(\\d+) useinbandfec=1/g, 'a=fmtp:$1 useinbandfec=1; stereo=1; sprop-stereo=1; maxaveragebitrate=510000')
            const finalAnswer = { type: answer.type, sdp: patchedSdp }
            await pc.setLocalDescription(finalAnswer)
            await sendSignal(session.id, viewerId, 'host', 'answer', finalAnswer)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dcReady && (
            <button
              onClick={() => setInteractionEnabled(e => !e)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: `1px solid ${interactionEnabled ? 'var(--green)' : 'rgba(255,255,255,0.15)'}`, background: interactionEnabled ? 'rgba(0,255,136,0.1)' : 'transparent', color: interactionEnabled ? 'var(--green)' : 'var(--text-dim)', fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'Oswald', letterSpacing: '0.05em', textTransform: 'uppercase' }}
            >
              🖱️ {interactionEnabled ? 'Interacting' : 'Interact'}
            </button>
          )}
          <Link href="/dashboard" style={{ color: 'var(--text-dim)', fontSize: '0.78rem', textDecoration: 'none' }}>Leave</Link>
        </div>
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
        <div style={{ position: 'relative', display: status === 'watching' ? 'inline-flex' : 'none' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ maxWidth: '100vw', maxHeight: 'calc(100vh - 60px)', objectFit: 'contain', display: 'block' }}
          />
          {/* Interaction overlay — captures events and forwards to host via DataChannel */}
          {dcReady && interactionEnabled && (
            <div
              style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 5 }}
              onClick={(e) => { const c = calcNormCoords(e, videoRef.current); if (c) sendInteraction({ type: 'click', ...c }) }}
              onMouseMove={(e) => { const c = calcNormCoords(e, videoRef.current); if (c) sendInteraction({ type: 'cursor', ...c }) }}
              onWheel={(e) => { e.preventDefault(); sendInteraction({ type: 'scroll', deltaX: e.deltaX / 500, deltaY: e.deltaY / 500 }) }}
              tabIndex={-1}
            />
          )}
        </div>
      </div>
    </div>
  )
}
