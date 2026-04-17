'use client'
// src/app/auth/login/page.jsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'

export default function LoginPage() {
  const { login, loginWithGoogle, resetPassword } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [redirectTo, setRedirectTo] = useState('/dashboard')

  // Read optional ?redirect= param set by /join/[code] when user isn't logged in
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('redirect')
    if (p) setRedirectTo(p)
  }, [])

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (resetMode) {
      try {
        await resetPassword(form.email)
        toast.success('Password reset email sent!')
        setResetMode(false)
      } catch {
        toast.error('Could not send reset email')
      }
      return
    }
    setLoading(true)
    try {
      await login(form.email, form.password)
      toast.success('Welcome back! 🎵')
      router.push(redirectTo)
    } catch (err) {
      toast.error('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      toast.success('Welcome back! 🎵')
      router.push(redirectTo)
    } catch {
      toast.error('Google sign-in failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }}>
      <div className="grid-bg" />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Link href="/" style={{ fontFamily: 'Oswald', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', textShadow: '0 0 20px rgba(0,255,136,0.5)', textDecoration: 'none' }}>
            WE🕊️
          </Link>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: 8 }}>
            {resetMode ? 'Reset your password' : 'Welcome back. Time to vibe.'}
          </p>
        </div>

        <div className="glass-card" style={{ padding: '40px 36px' }}>
          {!resetMode && (
            <>
              <button onClick={handleGoogle} disabled={googleLoading} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 24, gap: 10 }}>
                {googleLoading ? <span className="spinner" /> : (
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.2C29.5 35.5 26.9 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.6 5.1C9.8 39.7 16.4 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C40.8 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                )}
                Continue with Google
              </button>
              <div className="divider" style={{ marginBottom: 24 }}>or log in with email</div>
            </>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 8, fontFamily: 'Oswald', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Email</label>
              <input name="email" type="email" required placeholder="you@example.com" className="input-vibe" value={form.email} onChange={handleChange} />
            </div>
            {!resetMode && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontFamily: 'Oswald', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Password</label>
                  <button type="button" onClick={() => setResetMode(true)} style={{ fontSize: '0.75rem', color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer' }}>Forgot?</button>
                </div>
                <input name="password" type="password" required placeholder="Your password" className="input-vibe" value={form.password} onChange={handleChange} />
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '14px' }}>
              {loading ? <span className="spinner" /> : resetMode ? 'Send Reset Email' : 'Log In 🎵'}
            </button>
            {resetMode && (
              <button type="button" onClick={() => setResetMode(false)} className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                Back to Login
              </button>
            )}
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: 24 }}>
          No account yet?{' '}
          <Link href="/auth/signup" style={{ color: 'var(--green)', textDecoration: 'none', fontWeight: 500 }}>Sign Up Free</Link>
        </p>
      </div>
    </div>
  )
}
