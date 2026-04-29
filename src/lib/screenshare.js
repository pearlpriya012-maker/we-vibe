// src/lib/screenshare.js — WebRTC screen share signaling via Firestore
import { db } from '@/lib/firebase'
import {
  collection, doc, setDoc, addDoc, updateDoc,
  onSnapshot, serverTimestamp, query, where, getDocs,
} from 'firebase/firestore'

const COL = 'screenshares'

export async function createScreenSession(hostId, hostName) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const ref = doc(collection(db, COL))
  await setDoc(ref, { code, hostId, hostName, active: true, createdAt: serverTimestamp() })
  return { id: ref.id, code }
}

export async function findSessionByCode(code) {
  const q = query(
    collection(db, COL),
    where('code', '==', code.toUpperCase()),
    where('active', '==', true),
  )
  const snap = await getDocs(q)
  if (snap.empty) throw new Error('Session not found or has ended')
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

// Send one WebRTC signaling message
export async function sendSignal(sessionId, from, to, type, data) {
  await addDoc(collection(db, COL, sessionId, 'signals'), {
    from, to, type, data: JSON.stringify(data), ts: Date.now(),
  })
}

// Listen for signals addressed to `myId`; calls onNew for each new one
export function listenSignals(sessionId, myId, onNew) {
  const sigRef = collection(db, COL, sessionId, 'signals')
  const seen = new Set()
  return onSnapshot(sigRef, snap => {
    snap.docs.forEach(d => {
      if (seen.has(d.id)) return
      const msg = d.data()
      if (msg.to !== myId) return
      seen.add(d.id)
      try { onNew({ ...msg, data: JSON.parse(msg.data) }) } catch {}
    })
  })
}

// Watch session doc — fires with doc data whenever it changes
export function listenSession(sessionId, onChange) {
  return onSnapshot(doc(db, COL, sessionId), snap => onChange(snap.data()))
}

export async function endScreenSession(sessionId) {
  await updateDoc(doc(db, COL, sessionId), { active: false })
}
