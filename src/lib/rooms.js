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
export async function createRoom({ hostId, hostName, hostPhoto, mode, watchUrl, permanent = false, name = '' }) {
  const roomCode = await generateRoomCode()
  const roomRef = doc(collection(db, 'rooms'))
  const roomData = {
    id: roomRef.id,
    roomCode,
    name: name.trim(),
    hostId,
    permanent,
    ...(watchUrl ? { watchUrl, watchIsPlaying: false, watchCurrentTime: 0, watchUpdatedAt: null } : {}),
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
    participantsCanAddToQueue: true,
    participantsFullControl: true,
    playedHistory: [],
    musicMode: true,
    createdAt: serverTimestamp(),
    lastActivity: serverTimestamp(),
  }
  await setDoc(roomRef, roomData)
  return { id: roomRef.id, roomCode }
}

// ─── Create a permanent room and save its ID to the user's profile ───
export async function createPermanentRoom({ hostId, hostName, hostPhoto, name = '' }) {
  const result = await createRoom({ hostId, hostName, hostPhoto, mode: 'music', permanent: true, name })
  await updateDoc(doc(db, 'users', hostId), { permanentRoomId: result.id, permanentRoomCode: result.roomCode })
  return result
}

// ─── Get the user's permanent room (returns room data or null) ───
export async function getUserPermanentRoom(uid) {
  const userSnap = await getDoc(doc(db, 'users', uid))
  if (!userSnap.exists()) return null
  const { permanentRoomId } = userSnap.data()
  if (!permanentRoomId) return null
  const roomSnap = await getDoc(doc(db, 'rooms', permanentRoomId))
  if (!roomSnap.exists()) return null
  return roomSnap.data()
}

// ─── Update watch URL room playback state ───
export async function updateWatchPlayback(roomId, data) {
  const { updateDoc, doc: firestoreDoc } = await import('firebase/firestore')
  await updateDoc(firestoreDoc(db, 'rooms', roomId), data)
}

// ─── Report this participant's current video time ───
export async function updateParticipantWatchTime(roomId, uid, seconds) {
  const { updateDoc, doc: firestoreDoc } = await import('firebase/firestore')
  await updateDoc(firestoreDoc(db, 'rooms', roomId), {
    [`watchTimes.${uid}`]: Math.floor(seconds)
  })
}

// ─── Join a room by code ───
export async function joinRoomByCode({ code, uid, displayName, photoURL }) {
  const q = query(collection(db, 'rooms'), where('roomCode', '==', code.toUpperCase()))
  const { getDocs } = await import('firebase/firestore')
  const snap = await getDocs(q)
  if (snap.empty) throw new Error('Room not found. Check the code and try again.')
  const roomDoc = snap.docs[0]
  const room = roomDoc.data()

  if (room.permanent) {
    // For permanent rooms: sweep out ghost participants (joined > 8 h ago, clearly offline)
    // to keep the participants array lean and prevent accumulation over time.
    const EIGHT_HOURS = 8 * 3600 * 1000
    const fresh = room.participants.filter(
      (p) => p.uid === uid || Date.now() - p.joinedAt < EIGHT_HOURS
    )
    const alreadyIn = fresh.some((p) => p.uid === uid)
    if (!alreadyIn && fresh.length >= 50)
      throw new Error('This room is full (50/50 participants).')
    const newParticipants = alreadyIn
      ? fresh
      : [...fresh, { uid, displayName, photoURL: photoURL || '', canAddToQueue: true, joinedAt: Date.now() }]
    await updateDoc(roomDoc.ref, { participants: newParticipants, lastActivity: serverTimestamp() })
  } else {
    // Regular room — simple arrayUnion, no ghost cleanup needed
    const alreadyIn = room.participants.some((p) => p.uid === uid)
    if (!alreadyIn) {
      if (room.participants.length >= 50)
        throw new Error('This room is full (50/50 participants).')
      await updateDoc(roomDoc.ref, {
        participants: arrayUnion({
          uid,
          displayName,
          photoURL: photoURL || '',
          canAddToQueue: true,
          joinedAt: Date.now(),
        }),
        lastActivity: serverTimestamp(),
      })
    }
  }

  return { id: roomDoc.id, name: room.name || '', roomCode: room.roomCode }
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
  if (currentTime !== undefined) {
    updates.currentTime = currentTime
    updates.currentTimeAt = Date.now()  // wall-clock ms — guests add elapsed time to compensate for latency
  }
  if (currentTrack !== undefined) updates.currentTrack = currentTrack
  await updateDoc(doc(db, 'rooms', roomId), updates)
}

// ─── Queue management ───
export async function addToQueue(roomId, track) {
  // Fast path: no extra getRoom read — just append with arrayUnion.
  // Caller is responsible for auto-play if !currentTrack (use setCurrentTrack).
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

export async function addManyToQueue(roomId, tracks, currentRoom = null) {
  if (!tracks || tracks.length === 0) return
  const room = currentRoom || await getRoom(roomId)
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

// ─── Skip to next using the already-subscribed live queue (no extra Firestore read) ───
// Use this in automatic skip paths (ENDED, error, watchdog) for zero-latency transitions.
export async function skipToNextFromQueue(roomId, currentQueue) {
  if (!currentQueue || currentQueue.length === 0) {
    await updateDoc(doc(db, 'rooms', roomId), {
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
    })
    return
  }
  const [next, ...rest] = currentQueue
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
    if (room.permanent) {
      // Permanent rooms are never deleted — just clear participants
      await updateDoc(doc(db, 'rooms', roomId), {
        participants: [],
        lastActivity: serverTimestamp(),
      })
      return
    }
    // Delete room if empty
    await deleteDoc(doc(db, 'rooms', roomId))
    return
  }

  const updates = {
    participants: remaining,
    lastActivity: serverTimestamp(),
  }

  // Transfer host if needed (skip for permanent rooms — original host keeps ownership)
  if (room.hostId === uid && !room.permanent) {
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
  const alreadyOnThis = (reactions[emoji] || []).includes(uid)
  // Build update: remove uid from every emoji, then toggle on the clicked one
  const updates = {}
  for (const e of Object.keys(reactions)) {
    updates[`reactions.${e}`] = (reactions[e] || []).filter((u) => u !== uid)
  }
  if (!alreadyOnThis) {
    updates[`reactions.${emoji}`] = [...(reactions[emoji] || []).filter((u) => u !== uid), uid]
  }
  await updateDoc(msgRef, updates)
}