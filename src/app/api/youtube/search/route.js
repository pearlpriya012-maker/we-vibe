// src/app/api/youtube/search/route.js
import { NextResponse } from 'next/server'

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
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 25)

  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  const API_KEY = process.env.YOUTUBE_API_KEY
  if (!API_KEY) return NextResponse.json({ error: 'YouTube API not configured' }, { status: 500 })

  try {
    // Step 1: Search (videoEmbeddable + videoSyndicated = only playable in browser)
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&maxResults=${limit}&key=${API_KEY}&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true`
    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()

    if (!searchData.items?.length) return NextResponse.json({ results: [] })

    const videoIds = searchData.items.map((i) => i.id.videoId).join(',')

    // Step 2: Get durations
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${API_KEY}`
    const detailRes = await fetch(detailUrl)
    const detailData = await detailRes.json()

    const durationMap = {}
    detailData.items?.forEach((v) => {
      durationMap[v.id] = parseDuration(v.contentDetails.duration)
    })

    // Note: "- Topic" auto-generated channels are kept — they're the cleanest pure audio versions.
    // videoEmbeddable=true&videoSyndicated=true already filters unplayable ones at the API level.
    const results = searchData.items
      .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      duration: durationMap[item.id.videoId] || 0,
      durationFormatted: formatDuration(durationMap[item.id.videoId] || 0),
      publishedAt: item.snippet.publishedAt,
    }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error('YouTube search error:', err)
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 })
  }
}
