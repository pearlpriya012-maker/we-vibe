// src/lib/wordChainFirestore.js
// Firestore helpers for Word Chain game.
// Game → rooms/{roomId}/wordchain/game

import { db } from './firebase'
import { doc, setDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore'

const gameRef   = (roomId) => doc(db, 'rooms', roomId, 'wordchain', 'game')
const inviteRef = (roomId) => doc(db, 'rooms', roomId, 'wordchain', 'invite')

// ─── Invite helpers ───────────────────────────────────────────────────────────

export async function writeWordChainInvite(roomId, invite) {
  await setDoc(inviteRef(roomId), invite)
}

export async function respondToWordChainInvite(roomId, uid, response) {
  await updateDoc(inviteRef(roomId), { [`responses.${uid}`]: response })
}

export function subscribeWordChainInvite(roomId, callback) {
  return onSnapshot(inviteRef(roomId), snap => callback(snap.exists() ? snap.data() : null))
}

export async function deleteWordChainInvite(roomId) {
  try { await deleteDoc(inviteRef(roomId)) } catch (_) {}
}

export async function writeWordChainGame(roomId, state) {
  await setDoc(gameRef(roomId), state)
}

export function subscribeWordChainGame(roomId, cb) {
  return onSnapshot(gameRef(roomId), snap => cb(snap.exists() ? snap.data() : null))
}

export async function deleteWordChainGame(roomId) {
  try { await deleteDoc(gameRef(roomId)) } catch (_) {}
}
