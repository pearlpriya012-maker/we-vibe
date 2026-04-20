// src/lib/pictionaryFirestore.js
// Firestore helpers for Pictionary game + canvas state.
// Game   → rooms/{roomId}/pictionary/game
// Canvas → rooms/{roomId}/pictionary/canvas  (strokes keyed by id)

import { db } from './firebase'
import { doc, setDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore'

const gameRef   = (roomId) => doc(db, 'rooms', roomId, 'pictionary', 'game')
const canvasRef = (roomId) => doc(db, 'rooms', roomId, 'pictionary', 'canvas')
const inviteRef = (roomId) => doc(db, 'rooms', roomId, 'pictionary', 'invite')

// ─── Invite helpers ───────────────────────────────────────────────────────────

export async function writePictionaryInvite(roomId, invite) {
  await setDoc(inviteRef(roomId), invite)
}

export async function respondToPictionaryInvite(roomId, uid, response) {
  await updateDoc(inviteRef(roomId), { [`responses.${uid}`]: response })
}

export function subscribePictionaryInvite(roomId, callback) {
  return onSnapshot(inviteRef(roomId), snap => callback(snap.exists() ? snap.data() : null))
}

export async function deletePictionaryInvite(roomId) {
  try { await deleteDoc(inviteRef(roomId)) } catch (_) {}
}

// ─── Game state ───────────────────────────────────────────────────────────────

export async function writePictionaryGame(roomId, state) {
  await setDoc(gameRef(roomId), state)
}

export async function updatePictionaryGame(roomId, updates) {
  await setDoc(gameRef(roomId), updates, { merge: true })
}

export function subscribePictionaryGame(roomId, cb) {
  return onSnapshot(gameRef(roomId), snap => cb(snap.exists() ? snap.data() : null))
}

export async function deletePictionaryGame(roomId) {
  try { await deleteDoc(gameRef(roomId)) } catch (_) {}
  try { await deleteDoc(canvasRef(roomId)) } catch (_) {}
}

// ─── Canvas strokes ───────────────────────────────────────────────────────────
// Strokes stored as a map { [strokeId]: strokeData } for O(1) insertion
// without arrayUnion issues on nested arrays.

export async function addStroke(roomId, stroke) {
  try {
    await updateDoc(canvasRef(roomId), { [`strokes.${stroke.id}`]: stroke })
  } catch {
    await setDoc(canvasRef(roomId), { strokes: { [stroke.id]: stroke }, clearedAt: 0 })
  }
}

export async function clearCanvas(roomId) {
  await setDoc(canvasRef(roomId), { strokes: {}, clearedAt: Date.now() })
}

export function subscribeCanvas(roomId, cb) {
  return onSnapshot(canvasRef(roomId), snap =>
    cb(snap.exists() ? snap.data() : { strokes: {}, clearedAt: 0 })
  )
}
