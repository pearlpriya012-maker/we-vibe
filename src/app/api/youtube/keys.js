// src/app/api/youtube/keys.js
// Collects up to 3 YouTube API keys from env vars and rotates through them.
// If the chosen key is quota-exhausted (403 quotaExceeded), the next key is tried.

function getKeys() {
  const keys = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
  ].map(k => k?.trim()).filter(Boolean)
  if (!keys.length) throw new Error('No YouTube API keys configured')
  return keys
}

// Returns the result of fetchFn(apiKey), rotating keys on quota errors.
// fetchFn receives the API key and must return the parsed JSON data.
export async function withYouTubeKey(fetchFn) {
  const keys = getKeys()
  // Start from a random key so load is spread across keys over time
  const start = Math.floor(Math.random() * keys.length)
  let lastError
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length]
    try {
      const data = await fetchFn(key)
      // Quota exhausted or key invalid — try next
      if (data?.error?.code === 403 || data?.error?.code === 400) {
        lastError = data.error
        continue
      }
      return data
    } catch (err) {
      lastError = err
    }
  }
  // All keys failed
  throw lastError || new Error('All YouTube API keys failed')
}

export function hasKeys() {
  return getKeys().length > 0
}
