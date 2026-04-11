// src/app/api/youtube/playlistItems/route.js
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
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const playlistId = searchParams.get('playlistId')
  const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!playlistId) return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 })

  const API_KEY = process.env.YOUTUBE_API_KEY?.trim()
  if (!API_KEY) return NextResponse.json({ error: 'YouTube API not configured' }, { status: 500 })

  try {
    // Fetch playlist items (up to 25)
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    const itemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=25&key=${API_KEY}`
    const itemsRes = await fetch(itemsUrl, { headers })
    const itemsData = await itemsRes.json()

    if (!itemsData.items?.length) return NextResponse.json({ results: [] })

    // Filter out deleted/private videos
    const validItems = itemsData.items.filter(
      (i) => i.snippet.title !== 'Deleted video' && i.snippet.title !== 'Private video'
    )

    const videoIds = validItems.map((i) => i.contentDetails.videoId).join(',')

    // Fetch durations
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${API_KEY}`
    const detailRes = await fetch(detailUrl)
    const detailData = await detailRes.json()

    const durationMap = {}
    detailData.items?.forEach((v) => {
      durationMap[v.id] = parseDuration(v.contentDetails.duration)
    })

    const results = validItems.map((item) => {
      const videoId = item.contentDetails.videoId
      const snippet = item.snippet
      const duration = durationMap[videoId] || 0
      return {
        videoId,
        title: snippet.title,
        channelTitle: snippet.videoOwnerChannelTitle || snippet.channelTitle || '',
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        duration,
        durationFormatted: formatDuration(duration),
        playlistPosition: item.snippet.position,
      }
    })

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Playlist items error:', err)
    return NextResponse.json({ error: 'Failed to fetch playlist items' }, { status: 500 })
  }
}
