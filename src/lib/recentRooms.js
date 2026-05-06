// src/lib/recentRooms.js
// Recent room history — 100% localStorage, zero Firestore reads/writes.
// Stores up to 5 entries: { id, code, name, ts }

const KEY = 'we-vibe-recent-rooms'
const MAX = 5

export function saveRecentRoom(id, code, name = '') {
  if (typeof window === 'undefined') return
  try {
    const existing = JSON.parse(localStorage.getItem(KEY) || '[]')
    const filtered = existing.filter((r) => r.id !== id) // deduplicate
    const updated = [{ id, code, name: name || '', ts: Date.now() }, ...filtered].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(updated))
  } catch {
    // localStorage unavailable (private mode, quota full, etc.) — silently ignore
  }
}

export function getRecentRooms() {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
