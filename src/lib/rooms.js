// src/lib/rooms.js
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  addDoc,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from './firebase'

// ─── Generate unique 6-char room code ───
export async function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  let attempts = 0
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('')
    const exists = await roomCodeExists(code)
    if (!exists) return code
    attempts++
  } while (attempts < 10)
  throw new Error('Could not generate unique room code')
}

async function roomCodeExists(code) {
  const q = query(collection(db, 'rooms'), where('roomCode', '==', code))
  const snap = await import('firebase/firestore').then(({ getDocs }) => getDocs(q))
  return !snap.empty
}

// ─── Create a new room ───
export async function createRoom({ hostId, hostName, hostPhoto, mode }) {
  const roomCode = await generateRoomCode()
  const roomRef = doc(collection(db, 'rooms'))
  const roomData = {
    id: roomRef.id,
    roomCode,
    hostId,
    participants: [
      {
        uid: hostId,
        displayName: hostName,
        photoURL: hostPhoto || '',
        canAddToQueue: true,
        joinedAt: Date.now(),
      },
    ],
    mode,
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    queue: [],
    participantsCanAddToQueue: false,
    participantsFullControl: false,
    playedHistory: [],
    musicMode: true,
    createdAt: serverTimestamp(),
    lastActivity: serverTimestamp(),
  }
  await setDoc(roomRef, roomData)
  return { id: roomRef.id, roomCode }
}

// ─── Join a room by code ───
export async function joinRoomByCode({ code, uid, displayName, photoURL }) {
  const q = query(collection(db, 'rooms'), where('roomCode', '==', code.toUpperCase()))
  const { getDocs } = await import('firebase/firestore')
  const snap = await getDocs(q)
  if (snap.empty) throw new Error('Room not found. Check the code and try again.')
  const roomDoc = snap.docs[0]
  const room = roomDoc.data()

  // Check if already a participant
  const alreadyIn = room.participants.some((p) => p.uid === uid)
  if (!alreadyIn) {
    if (room.participants.length >= 50)
      throw new Error('This room is full (50/50 participants).')
    await updateDoc(roomDoc.ref, {
      participants: arrayUnion({
        uid,
        displayName,
        photoURL: photoURL || '',
        canAddToQueue: room.participantsCanAddToQueue,
        joinedAt: Date.now(),
      }),
      lastActivity: serverTimestamp(),
    })
  }
  return roomDoc.id
}

// ─── Get room once ───
export async function getRoom(roomId) {
  const snap = await getDoc(doc(db, 'rooms', roomId))
  if (!snap.exists()) return null
  return snap.data()
}

// ─── Subscribe to room (real-time) ───
export function subscribeToRoom(roomId, callback) {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (snap.exists()) callback(snap.data())
  })
}

// ─── Update playback state (host only) ───
export async function updatePlayback(roomId, { isPlaying, currentTime, currentTrack }) {
  const updates = { lastActivity: serverTimestamp() }
  if (isPlaying !== undefined) updates.isPlaying = isPlaying
  if (currentTime !== undefined) updates.currentTime = currentTime
  if (currentTrack !== undefined) updates.currentTrack = currentTrack
  await updateDoc(doc(db, 'rooms', roomId), updates)
}

// ─── Queue management ───
export async function addToQueue(roomId, track) {
  const room = await getRoom(roomId)
  if (!room) throw new Error('Room not found')
  if (room.queue.length >= 100) throw new Error('Queue is full (100 tracks max)')

  // If nothing is playing, auto-play this track immediately
  if (!room.currentTrack) {
    await updateDoc(doc(db, 'rooms', roomId), {
      currentTrack: track,
      isPlaying: true,
      currentTime: 0,
      lastActivity: serverTimestamp(),
    })
    return
  }

  await updateDoc(doc(db, 'rooms', roomId), {
    queue: arrayUnion(track),
    lastActivity: serverTimestamp(),
  })
}

export async function removeFromQueue(roomId, trackIndex) {
  const room = await getRoom(roomId)
  if (!room) return
  const newQueue = room.queue.filter((_, i) => i !== trackIndex)
  await updateDoc(doc(db, 'rooms', roomId), { queue: newQueue })
}

export async function addManyToQueue(roomId, tracks) {
  if (!tracks || tracks.length === 0) return
  const room = await getRoom(roomId)
  if (!room) throw new Error('Room not found')
  const existing = room.queue || []
  const cap = Math.max(0, 100 - existing.length)
  const toAdd = tracks.slice(0, cap)
  if (!toAdd.length) throw new Error('Queue is full (100 tracks max)')
  if (!room.currentTrack) {
    const [first, ...rest] = toAdd
    await updateDoc(doc(db, 'rooms', roomId), {
      currentTrack: first,
      isPlaying: true,
      currentTime: 0,
      queue: [...existing, ...rest],
      lastActivity: serverTimestamp(),
    })
    return
  }
  await updateDoc(doc(db, 'rooms', roomId), {
    queue: [...existing, ...toAdd],
    lastActivity: serverTimestamp(),
  })
}

export async function reorderQueue(roomId, newQueue) {
  await updateDoc(doc(db, 'rooms', roomId), { queue: newQueue })
}

export async function setCurrentTrack(roomId, track) {
  await updateDoc(doc(db, 'rooms', roomId), {
    currentTrack: track,
    currentTime: 0,
    isPlaying: true,
    lastActivity: serverTimestamp(),
  })
}

// ─── Skip to next track ───
export async function skipToNext(roomId) {
  const room = await getRoom(roomId)
  if (!room || room.queue.length === 0) {
    await updateDoc(doc(db, 'rooms', roomId), {
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
    })
    return
  }
  const [next, ...rest] = room.queue
  await updateDoc(doc(db, 'rooms', roomId), {
    currentTrack: next,
    queue: rest,
    currentTime: 0,
    isPlaying: true,
    lastActivity: serverTimestamp(),
  })
}

// ─── Toggle participant queue access ───
export async function toggleParticipantQueueAccess(roomId, enabled) {
  await updateDoc(doc(db, 'rooms', roomId), {
    participantsCanAddToQueue: enabled,
    // Downgrading from full control when disabling "can add"
    ...(enabled === false ? { participantsFullControl: false } : {}),
  })
}

// ─── Toggle participant full control (play/pause/skip/previous/add/seek — everything) ───
export async function toggleParticipantFullControl(roomId, enabled) {
  await updateDoc(doc(db, 'rooms', roomId), {
    participantsFullControl: enabled,
    // Full control implies can-add
    ...(enabled === true ? { participantsCanAddToQueue: true } : {}),
  })
}

// ─── Update music mode ───
export async function updateMusicMode(roomId, musicMode) {
  await updateDoc(doc(db, 'rooms', roomId), {
    musicMode,
    lastActivity: serverTimestamp(),
  })
}

// ─── Leave room ───
export async function leaveRoom(roomId, uid) {
  const room = await getRoom(roomId)
  if (!room) return

  const remaining = room.participants.filter((p) => p.uid !== uid)

  if (remaining.length === 0) {
    // Delete room if empty
    await deleteDoc(doc(db, 'rooms', roomId))
    return
  }

  const updates = {
    participants: remaining,
    lastActivity: serverTimestamp(),
  }

  // Transfer host if needed
  if (room.hostId === uid) {
    const sorted = [...remaining].sort((a, b) => a.joinedAt - b.joinedAt)
    updates.hostId = sorted[0].uid
  }

  await updateDoc(doc(db, 'rooms', roomId), updates)
}

// ─── Kick participant (host only) ───
export async function kickParticipant(roomId, targetUid) {
  const room = await getRoom(roomId)
  if (!room) return
  const remaining = room.participants.filter((p) => p.uid !== targetUid)
  await updateDoc(doc(db, 'rooms', roomId), { participants: remaining })
}

// ─── Chat messages ───
export async function sendMessage(roomId, { uid, displayName, text }) {
  await addDoc(collection(db, 'rooms', roomId, 'messages'), {
    uid,
    displayName,
    text: text.slice(0, 500),
    reactions: {},
    timestamp: serverTimestamp(),
  })
}

export function subscribeToMessages(roomId, callback) {
  const q = query(
    collection(db, 'rooms', roomId, 'messages'),
    orderBy('timestamp', 'asc'),
    limit(100)
  )
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(messages)
  })
}

export async function addReaction(roomId, messageId, emoji, uid) {
  const msgRef = doc(db, 'rooms', roomId, 'messages', messageId)
  const snap = await getDoc(msgRef)
  if (!snap.exists()) return
  const reactions = snap.data().reactions || {}
  const users = reactions[emoji] || []
  const updated = users.includes(uid)
    ? users.filter((u) => u !== uid) // toggle off
    : [...users, uid]
  await updateDoc(msgRef, { [`reactions.${emoji}`]: updated })
}