'use client'
// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

const AuthContext = createContext({})

const VIBE_WORDS = ['Vibe', 'Beat', 'Wave', 'Sync', 'Echo', 'Bass', 'Drop', 'Flow', 'Bolt', 'Neon']
function randomGuestName() {
  const word = VIBE_WORDS[Math.floor(Math.random() * VIBE_WORDS.length)]
  const num = Math.floor(1000 + Math.random() * 9000)
  return `${word}${num}`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const timeoutRef = useRef(null)

  // ─── Create user doc in Firestore ───
  async function createUserDoc(firebaseUser, extra = {}) {
    const ref = doc(db, 'users', firebaseUser.uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        displayName: extra.displayName || firebaseUser.displayName || 'Vibe User',
        photoURL: firebaseUser.photoURL || '',
        youtubeAccessToken: null,
        youtubeRefreshToken: null,
        createdAt: serverTimestamp(),
      })
    }
  }

  // ─── Enter with custom name (persists across sessions) ───
  async function loginWithName(name) {
    localStorage.setItem('we-vibe-mode', 'named')  // set BEFORE sign-in so onAuthStateChanged sees it
    try {
      const cred = await signInAnonymously(auth)
      await updateProfile(cred.user, { displayName: name.trim() })
      await createUserDoc(cred.user, { displayName: name.trim() })
      return cred.user
    } catch (err) {
      localStorage.removeItem('we-vibe-mode')
      throw err
    }
  }

  // ─── Enter with random name (session only — no persistence) ───
  async function loginWithRandomName() {
    const name = randomGuestName()
    sessionStorage.setItem('we-vibe-mode', 'random')  // set BEFORE sign-in
    try {
      const cred = await signInAnonymously(auth)
      await updateProfile(cred.user, { displayName: name })
      await createUserDoc(cred.user, { displayName: name })
      return cred.user
    } catch (err) {
      sessionStorage.removeItem('we-vibe-mode')
      throw err
    }
  }

  // ─── Google OAuth (YouTube linking) ───
  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider()
    provider.addScope('profile')
    provider.addScope('email')
    const cred = await signInWithPopup(auth, provider)
    await createUserDoc(cred.user)
    return cred.user
  }

  // ─── Sign Out ───
  async function logout() {
    localStorage.removeItem('we-vibe-mode')
    sessionStorage.removeItem('we-vibe-mode')
    await signOut(auth)
  }

  // ─── Listen to auth state ───
  useEffect(() => {
    // Safety timeout: if Firebase never responds (e.g. missing env vars), unblock the UI
    timeoutRef.current = setTimeout(() => setLoading(false), 8000)

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeoutRef.current)
      if (firebaseUser) {
        let isRandomGuest = false

        if (firebaseUser.isAnonymous) {
          const persistedMode = localStorage.getItem('we-vibe-mode')   // 'named' or null
          const sessionMode = sessionStorage.getItem('we-vibe-mode')   // 'random' or null

          if (persistedMode === 'named') {
            isRandomGuest = false
          } else if (sessionMode === 'random') {
            isRandomGuest = true
          } else {
            // Stale anonymous session (e.g. leftover from a past random visit) → clear it
            await signOut(auth)
            setUser(null)
            setLoading(false)
            return
          }
        }

        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            isRandomGuest,
            ...(snap.exists() ? snap.data() : {}),
          })
        } catch {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            isRandomGuest,
          })
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return () => {
      clearTimeout(timeoutRef.current)
      unsub()
    }
  }, [])

  const value = {
    user,
    loading,
    loginWithName,
    loginWithRandomName,
    loginWithGoogle,
    logout,
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0d0d0d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid rgba(0,255,136,0.2)',
          borderTopColor: '#00ff88',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
