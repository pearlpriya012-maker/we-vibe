// src/app/api/youtube/search/route.js
import { NextResponse } from 'next/server'
import { withYouTubeKey } from '../keys'

function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const h = parseInt(match[1] || 0)
  const m = parseInt(match[2] || 0)
  const s = parseInt(match[3] || 0)
  return h * 3600 + m * 60 + s
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50)

  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  try {
    // Step 1: Search with automatic key rotation (up to 3 keys via withYouTubeKey)
    const searchData = await withYouTubeKey(key => {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&maxResults=${limit}&key=${key}&videoEmbeddable=true`
      return fetch(url).then(r => r.json())
    })

    if (!searchData.items?.length) return NextResponse.json({ results: [] })

    const videoIds = searchData.items.map((i) => i.id.videoId).join(',')

    // Step 2: Get durations — also uses key rotation; falls back gracefully on failure
    let durationMap = {}
    try {
      const detailData = await withYouTubeKey(key => {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${key}`
        return fetch(url).then(r => r.json())
      })
      detailData.items?.forEach((v) => {
        durationMap[v.id] = parseDuration(v.contentDetails.duration)
      })
    } catch {
      // details unavailable — proceed without duration info
    }

    const results = searchData.items
      .map((item) => {
        const dur = durationMap[item.id.videoId] ?? -1 // -1 = unknown
        return {
          videoId: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
          duration: dur < 0 ? 0 : dur,
          durationFormatted: dur > 0 ? formatDuration(dur) : '',
          publishedAt: item.snippet.publishedAt,
        }
      })
      // Keep if duration is unknown (dur = -1) OR if it's longer than 60 s (filter Shorts)
      .filter((item) => item.duration === 0 || item.duration > 60)

    return NextResponse.json({ results })
  } catch (err) {
    console.error('YouTube search error:', err)
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 })
  }
}
