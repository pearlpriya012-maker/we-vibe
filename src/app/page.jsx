'use client'
// src/app/page.jsx  — Landing Page
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'

// ─── Floating background shapes ───
function Shapes() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {[
        { size: 80, color: 'var(--green)',  top: '10%', left: '5%',   duration: 18, delay: -3,  radius: 12, rot: 15 },
        { size: 50, color: 'var(--pink)',   top: '30%', right: '8%',  duration: 22, delay: -8,  radius: 50 },
        { size: 100, color: 'var(--cyan)', top: '65%', left: '3%',   duration: 26, delay: -12, radius: 16, rot: 30 },
        { size: 60, color: 'var(--purple)',top: '80%', right: '15%', duration: 20, delay: -6,  radius: 8,  rot: -20 },
        { size: 35, color: 'var(--green)', top: '50%', right: '3%',  duration: 14, delay: -2,  radius: 4,  rot: 45 },
        { size: 70, color: 'var(--pink)',  top: '15%', right: '30%', duration: 30, delay: -15, radius: 50 },
      ].map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: s.size,
            height: s.size,
            border: `1px solid ${s.color}`,
            borderRadius: s.radius ? s.radius + (s.radius === 50 ? '%' : 'px') : '4px',
            top: s.top,
            left: s.left,
            right: s.right,
            opacity: 0.12,
            transform: `rotate(${s.rot || 0}deg)`,
            animation: `floatShape ${s.duration}s linear ${s.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes floatShape {
          0%   { transform: translateY(0) rotate(0deg); }
          50%  { transform: translateY(-30px) rotate(180deg); }
          100% { transform: translateY(0) rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ─── Scroll reveal hook ───
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
}

const FEATURES = [
  { icon: '🎵', title: 'Sync Playback', accent: 'var(--green)',  desc: 'Real-time synchronized YouTube playback across all participants. Host controls, everyone follows — zero drift.' },
  { icon: '💬', title: 'Live Chat',     accent: 'var(--cyan)',   desc: 'Text messages with emoji reactions fly in real-time. React, vibe, and share the moment as it happens.' },
  { icon: '🤖', title: 'AI Picks',      accent: 'var(--purple)', desc: 'Groq-powered AI reads your room\'s vibe and suggests tracks that keep the energy flowing perfectly.' },
  { icon: '🎛️', title: 'Collab Queue',  accent: 'var(--pink)',   desc: 'Host-controlled queue with optional participant access. Let everyone add tracks or keep full control.' },
  { icon: '🔗', title: 'Instant Rooms', accent: 'var(--green)',  desc: 'Generate a unique 6-digit code in one click. Share it and you\'re in the same room instantly.' },
  { icon: '📺', title: 'Music & Video', accent: 'var(--cyan)',   desc: 'Switch between YouTube Music playlists and full video watching modes. One platform, every vibe.' },
]

const STEPS = [
  { num: '01', color: 'var(--green)',  title: 'Enter Your Name', desc: 'Type any name you like and jump straight in — or let us pick a random one for you instantly.' },
  { num: '02', color: 'var(--cyan)',   title: 'Create Room',    desc: 'Choose Music or Video mode. Hit Create and get your unique 6-digit room code.' },
  { num: '03', color: 'var(--purple)', title: 'Invite Friends', desc: 'Share the code. Friends enter it on their dashboard and they\'re in instantly.' },
  { num: '04', color: 'var(--pink)',   title: 'Vibe Together',  desc: 'Search tracks, build a queue, let AI suggest bangers. Chat and vibe in real-time.' },
]

export default function LandingPage() {
  useScrollReveal()
  const { user, loginWithName, loginWithRandomName, loginWithGoogle, loginWithEmail, signupWithEmail, resetPassword } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [entering, setEntering] = useState(false)
  // email auth state
  const [authMode, setAuthMode] = useState('name') // 'name' | 'email'
  const [emailMode, setEmailMode] = useState('login') // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('')
  const [emailName, setEmailName] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    if (user) router.replace('/dashboard')
  }, [user])

  async function handleEnterWithName(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return toast.error('Enter a name first!')
    if (trimmed.length < 2) return toast.error('Name must be at least 2 characters')
    setEntering(true)
    try {
      await loginWithName(trimmed)
      router.push('/dashboard')
    } catch (err) {
      console.error('loginWithName failed:', err)
      const msg = err?.code === 'auth/operation-not-allowed'
        ? 'Anonymous sign-in is disabled — enable it in Firebase Console'
        : (err?.message?.replace('Firebase: ', '') || 'Something went wrong, try again')
      toast.error(msg)
    } finally {
      setEntering(false)
    }
  }

  async function handleRandom() {
    setEntering(true)
    try {
      await loginWithRandomName()
      router.push('/dashboard')
    } catch (err) {
      console.error('loginWithRandomName failed:', err)
      const msg = err?.code === 'auth/operation-not-allowed'
        ? 'Anonymous sign-in is disabled — enable it in Firebase Console'
        : (err?.message?.replace('Firebase: ', '') || 'Something went wrong, try again')
      toast.error(msg)
    } finally {
      setEntering(false)
    }
  }

  function friendlyAuthError(err) {
    const map = {
      'auth/invalid-email': 'Invalid email address.',
      'auth/user-not-found': 'No account with that email.',
      'auth/wrong-password': 'Wrong password.',
      'auth/email-already-in-use': 'That email is already registered — sign in instead.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
      'auth/invalid-credential': 'Email or password is incorrect.',
    }
    return map[err?.code] || err?.message?.replace('Firebase: ', '') || 'Something went wrong.'
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setAuthError('')
    setEntering(true)
    try {
      if (emailMode === 'reset') {
        await resetPassword(email)
        setResetSent(true)
        setEntering(false)
        return
      }
      if (emailMode === 'signup') {
        if (!emailName.trim()) { setAuthError('Enter a display name.'); setEntering(false); return }
        await signupWithEmail(email, password, emailName)
      } else {
        await loginWithEmail(email, password)
      }
      router.push('/dashboard')
    } catch (err) {
      setAuthError(friendlyAuthError(err))
    } finally {
      setEntering(false)
    }
  }

  return (
    <>
      <div className="grid-bg" />
      <Shapes />

      {/* ─── NAV ─── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 48px',
        backdropFilter: 'blur(20px)',
        background: 'rgba(13,13,13,0.75)',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.3s',
      }}>
        <Link href="/" style={{ fontFamily: 'Oswald', fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', textShadow: '0 0 20px rgba(0,255,136,0.5)', textDecoration: 'none' }}>
          WE<span style={{ color: 'var(--text)' }}>🕊️</span>
        </Link>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="#features" className="btn-ghost" style={{ padding: '9px 18px', fontSize: '0.85rem' }}>Features</Link>
          <Link href="#how" className="btn-ghost" style={{ padding: '9px 18px', fontSize: '0.85rem' }}>How It Works</Link>
        </div>
      </nav>

      <main style={{ position: 'relative', zIndex: 1 }}>

        {/* ─── HERO ─── */}
        <section style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '140px 24px 80px',
        }}>
          <div className="badge badge-green" style={{ marginBottom: 36, animation: 'fadeUp 0.6s ease both' }}>
            <span className="pulse-dot" />
            Live Rooms Active Now
          </div>

          <h1 style={{
            fontFamily: 'Oswald', fontWeight: 700, letterSpacing: '-0.02em',
            lineHeight: 0.9, textTransform: 'uppercase', marginBottom: 32,
            fontSize: 'clamp(5rem, 14vw, 11rem)',
            animation: 'fadeUp 0.7s ease 0.1s both',
          }}>
            <span style={{ display: 'block' }}>WE</span>
            <span className="glitch neon-green" data-text="🕊️" style={{ display: 'block' }}>🕊️</span>
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', fontWeight: 300, color: 'var(--text-dim)',
            maxWidth: 560, marginBottom: 48, animation: 'fadeUp 0.7s ease 0.2s both',
          }}>
            <span style={{ color: 'var(--text)' }}>Connect with friends. Share the moment.</span><br />
            Watch. Listen. Vibe together — in perfect sync.
          </p>

          {/* ─── Auth Widget ─── */}
          <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp 0.7s ease 0.3s both' }}>
            {/* Mode toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 16, gap: 4 }}>
              {[{ key: 'name', label: '👤 Guest' }, { key: 'email', label: '✉️ Email' }].map(({ key, label }) => (
                <button key={key} onClick={() => { setAuthMode(key); setAuthError('') }}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'Oswald', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'all 0.2s',
                    background: authMode === key ? 'var(--green)' : 'transparent',
                    color: authMode === key ? '#000' : 'var(--text-dim)',
                  }}>{label}</button>
              ))}
            </div>

            {authMode === 'name' ? (
              <form onSubmit={handleEnterWithName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input type="text" className="input-vibe" placeholder="Enter your name..."
                  value={name} onChange={e => setName(e.target.value)} maxLength={30}
                  style={{ width: '100%', textAlign: 'center', fontSize: '1rem', padding: '14px 20px' }} />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="submit" disabled={entering} className="btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '14px', fontSize: '0.95rem' }}>
                    {entering ? <span className="spinner" /> : "Let's Go 🚀"}
                  </button>
                  <button type="button" disabled={entering} onClick={handleRandom}
                    style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-dim)', padding: '14px', borderRadius: 8, fontFamily: 'Work Sans', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>
                    🎲 Random
                  </button>
                </div>
                <button type="button" onClick={() => loginWithGoogle().then(() => router.push('/dashboard')).catch(e => toast.error(e.message))}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: 8, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'Work Sans', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Login / Signup / Reset sub-tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[{ key: 'login', label: 'Sign In' }, { key: 'signup', label: 'Sign Up' }, { key: 'reset', label: 'Reset' }].map(({ key, label }) => (
                    <button key={key} type="button" onClick={() => { setEmailMode(key); setAuthError(''); setResetSent(false) }}
                      style={{ flex: 1, padding: '7px 4px', background: 'transparent', border: 'none', borderBottom: emailMode === key ? '2px solid var(--green)' : '2px solid transparent', color: emailMode === key ? 'var(--green)' : 'var(--text-dim)', fontFamily: 'Oswald', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {resetSent ? (
                  <div style={{ textAlign: 'center', padding: '14px', color: 'var(--green)', fontSize: '0.88rem' }}>
                    ✅ Reset link sent — check your inbox.
                  </div>
                ) : (
                  <>
                    {emailMode === 'signup' && (
                      <input type="text" className="input-vibe" placeholder="Display name…"
                        value={emailName} onChange={e => setEmailName(e.target.value)} maxLength={30}
                        style={{ fontSize: '0.9rem', padding: '12px 16px' }} />
                    )}
                    <input type="email" className="input-vibe" placeholder="Email…"
                      value={email} onChange={e => setEmail(e.target.value)}
                      style={{ fontSize: '0.9rem', padding: '12px 16px' }} />
                    {emailMode !== 'reset' && (
                      <input type="password" className="input-vibe" placeholder="Password…"
                        value={password} onChange={e => setPassword(e.target.value)}
                        style={{ fontSize: '0.9rem', padding: '12px 16px' }} />
                    )}
                    {authError && <p style={{ color: 'var(--pink)', fontSize: '0.78rem', margin: '2px 0 0', textAlign: 'center' }}>{authError}</p>}
                    <button type="submit" disabled={entering} className="btn-primary" style={{ marginTop: 4, justifyContent: 'center', padding: '13px' }}>
                      {entering ? <span className="spinner" /> : emailMode === 'signup' ? 'Create Account 🚀' : emailMode === 'reset' ? 'Send Reset Link' : 'Sign In 🔑'}
                    </button>
                  </>
                )}
              </form>
            )}
          </div>

          <div style={{ display: 'flex', gap: 48, marginTop: 80, animation: 'fadeUp 0.7s ease 0.4s both' }}>
            {[
              { num: '6-Digit', label: 'Room Codes' },
              { num: '50+',     label: 'Per Room' },
              { num: 'Real-Time', label: 'Sync Playback' },
              { num: 'AI',      label: 'Recommendations' },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald', fontSize: '2rem', fontWeight: 700, color: 'var(--green)', textShadow: '0 0 20px rgba(0,255,136,0.4)' }}>{s.num}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section id="features" className="reveal" style={{ padding: '100px 48px', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'end', marginBottom: 72 }}>
            <div>
              <span className="section-label">What You Get</span>
              <h2 style={{ fontFamily: 'Oswald', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.05 }}>
                Everything<br />You Need<br />to Vibe
              </h2>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '1.05rem', fontWeight: 300, maxWidth: 480 }}>
              Six powerful features built for seamless music and video co-watching. No lag, no drift — just shared moments.
            </p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1px', background: 'var(--border)',
            border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
          }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                background: 'var(--glass)', padding: '36px 32px',
                transition: 'background 0.2s', cursor: 'default',
                position: 'relative',
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--glass-hover)'
                  e.currentTarget.querySelector('.top-line').style.opacity = 1
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--glass)'
                  e.currentTarget.querySelector('.top-line').style.opacity = 0
                }}
              >
                <div className="top-line" style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg, transparent, ${f.accent}, transparent)`,
                  opacity: 0, transition: 'opacity 0.3s',
                }} />
                <span style={{ fontSize: '2rem', marginBottom: 20, display: 'block' }}>{f.icon}</span>
                <div style={{ fontFamily: 'Oswald', fontSize: '1.15rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{f.title}</div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 300, lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── ROOM PREVIEW MOCKUP ─── */}
        <section className="reveal" style={{
          padding: '100px 48px', maxWidth: 1280, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center',
        }}>
          <div>
            <span className="section-label">The Room Experience</span>
            <h2 style={{ fontFamily: 'Oswald', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.05, marginBottom: 24 }}>
              Your Room.<br />Your Rules.
            </h2>
            <p style={{ color: 'var(--text-dim)', fontWeight: 300, fontSize: '1rem', lineHeight: 1.7, marginBottom: 32 }}>
              A three-panel command center for hosting the perfect listening session. Search, queue, play, chat — all in one.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                ['Left Panel', 'YouTube search & queue management'],
                ['Center', 'Synchronized YouTube player with host controls'],
                ['Right Panel', 'Tabbed: Chat, Participants, AI Picks'],
                ['Host Transfer', 'Seamless handoff if the host leaves'],
                ['Up to 50 participants', 'per room, 100 tracks in queue'],
              ].map(([strong, rest]) => (
                <li key={strong} style={{ display: 'flex', gap: 14, fontSize: '0.95rem', color: 'var(--text-dim)', fontWeight: 300 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', marginTop: 9, flexShrink: 0 }} />
                  <span><strong style={{ color: 'var(--text)', fontWeight: 500 }}>{strong}</strong> — {rest}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Mini Room Mockup */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 60px rgba(0,255,136,0.05)', fontSize: '0.75rem' }}>
            <div style={{ background: 'rgba(0,255,136,0.05)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#ff5f57','#ffbd2e','#28c840'].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'block' }} />)}
              </div>
              <span style={{ fontFamily: 'Oswald', color: 'var(--green)', fontSize: '0.75rem', letterSpacing: '0.15em' }}>ROOM: A1B2C3</span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>👥 7 vibing</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 0.9fr', height: 260 }}>
              {/* Queue */}
              <div style={{ borderRight: '1px solid var(--border)', padding: 12 }}>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Queue</div>
                {[['Starboy','The Weeknd',true],['Blinding Lights','The Weeknd'],['Save Your Tears','The Weeknd'],['Die For You','The Weeknd']].map(([t,c,active]) => (
                  <div key={t} style={{ display: 'flex', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 4, alignItems: 'center', background: active ? 'rgba(0,255,136,0.08)' : 'transparent' }}>
                    <div style={{ width: 28, height: 20, borderRadius: 3, background: 'linear-gradient(135deg,#1a1a2e,#16213e)', flexShrink: 0, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 6, color:'var(--green)' }}>▶</div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{c}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Player */}
              <div style={{ borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg,#0a0a1a,#1a0a2e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 28, height: 28, background: 'rgba(0,255,136,0.9)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color:'#000', boxShadow:'0 0 20px rgba(0,255,136,0.5)' }}>▶</div>
                </div>
                <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:0, width:'38%', height:'100%', background:'var(--green)', boxShadow:'0 0 6px var(--green)', borderRadius:2 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {['⏮','⏸','⏭'].map((ctrl, i) => (
                    <div key={ctrl} style={{ width: i===1?28:22, height: i===1?28:22, borderRadius:'50%', border: i===1?'1px solid var(--green)':'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: i===1?9:7, color: i===1?'var(--green)':'var(--text-dim)', boxShadow: i===1?'0 0 10px rgba(0,255,136,0.3)':undefined }}>{ctrl}</div>
                  ))}
                </div>
              </div>
              {/* Chat */}
              <div style={{ padding: 12 }}>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Chat</div>
                {[['Alex','var(--green)','This track is 🔥🔥'],['Sam','var(--cyan)','add blinding lights!'],['Maya','var(--pink)','already in queue 😂']].map(([name,color,text]) => (
                  <div key={name} style={{ paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.05em', marginBottom: 2, color }}>{name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section id="how" className="reveal" style={{ padding: '100px 48px', background: 'linear-gradient(180deg, transparent, rgba(0,255,136,0.02) 50%, transparent)' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 80 }}>
              <span className="section-label">Get Started in Minutes</span>
              <h2 style={{ fontFamily: 'Oswald', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>How It Works</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '1.05rem', fontWeight: 300, maxWidth: 480, margin: '0 auto' }}>Four steps to a shared musical experience with anyone, anywhere.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
              {STEPS.map((s) => (
                <div key={s.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontSize: '1.5rem', fontWeight: 700, marginBottom: 28, background: `${s.color}1A`, border: `1px solid ${s.color}66`, color: s.color, boxShadow: `0 0 30px ${s.color}26` }}>{s.num}</div>
                  <div style={{ fontFamily: 'Oswald', fontSize: '1rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>{s.title}</div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', fontWeight: 300, lineHeight: 1.65 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="reveal" style={{ padding: '120px 48px', textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(0,255,136,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontFamily: 'Oswald', fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1, marginBottom: 24 }}>
              Ready to<br /><span style={{ color: 'var(--green)', textShadow: '0 0 40px rgba(0,255,136,0.4)' }}>Vibe?</span>
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', fontWeight: 300, marginBottom: 48 }}>
              Join thousands already listening together. It's free, it's instant, it's electric.
            </p>
            <div style={{ display: 'flex', gap: 12, maxWidth: 440, margin: '0 auto' }}>
              <input type="email" className="input-vibe" placeholder="Enter your email..." />
              <Link href="/auth/signup" className="btn-primary" style={{ whiteSpace: 'nowrap', padding: '13px 28px' }}>Get Started 🚀</Link>
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: 'Oswald', fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 0 15px rgba(0,255,136,0.4)' }}>WE🕊️</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>🕊️ Vibe and Play, darling! Made with ❤️ by Team SPY</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[['About','#'],['Privacy','/privacy'],['Terms','#'],['GitHub','https://github.com/pearlpriya012-maker/we-vibe-and-play']].map(([l,href]) => (
            <Link key={l} href={href} style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = 'var(--green)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
            >{l}</Link>
          ))}
        </div>
      </footer>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </>
  )
}
