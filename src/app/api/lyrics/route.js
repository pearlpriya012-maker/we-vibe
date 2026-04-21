import { NextResponse } from 'next/server'

function parseLRC(lrc) {
  const lines = []
  for (const line of lrc.split('\n')) {
    const match = line.match(/\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/)
    if (match) {
      const time = parseInt(match[1]) * 60 + parseFloat(match[2])
      const text = match[3].trim()
      if (text) lines.push({ time, text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

// Returns true if the text is predominantly Latin-script (English-readable)
function isLatin(text) {
  if (!text || text.length < 5) return true
  const sample = text.slice(0, 300)
  const latinCount = (sample.match(/[\u0000-\u024F]/g) || []).length
  return latinCount / sample.length > 0.7
}

// Pick the best result: prefer synced + Latin, but accept non-Latin (will be transliterated)
function pickBest(results) {
  if (!Array.isArray(results) || !results.length) return null
  const latinSynced = results.find(r => r.syncedLyrics && isLatin(r.syncedLyrics))
  if (latinSynced) return latinSynced
  const latinPlain = results.find(r => r.plainLyrics && isLatin(r.plainLyrics))
  if (latinPlain) return latinPlain
  // Fall back to any result with synced or plain lyrics even if non-Latin — will be transliterated
  return results.find(r => r.syncedLyrics) || results.find(r => r.plainLyrics) || results[0] || null
}

// Transliterate non-Latin lyrics to Roman script phonetically via Groq
async function transliterateToRoman(lines) {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey || !lines.length) return lines
  const input = lines.join('\n')
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'user',
          content: `Transliterate the following song lyrics to Roman (Latin/English) script phonetically. DO NOT translate the meaning — write the same words using English letters so they sound like the original language when read aloud. Keep the exact same number of lines in the same order. Return ONLY the transliterated lines, nothing else.\n\n${input}`
        }],
        temperature: 0.1,
        max_tokens: 4096,
      })
    })
    if (!res.ok) return lines
    const data = await res.json()
    const output = data.choices?.[0]?.message?.content?.trim() || ''
    const outLines = output.split('\n').map(l => l.trim()).filter(Boolean)
    if (outLines.length === lines.length) return outLines
    return lines.map((l, i) => outLines[i] || l)
  } catch {
    return lines
  }
}

// Remove YouTube-specific noise from titles so lrclib can match them
function normalizeTitle(raw) {
  return raw
    // Strip non-ASCII (Telugu, Hindi, etc.)
    .replace(/[^\x00-\x7F]+/g, ' ')
    // Remove bracketed/parenthesized junk: (Official Video), [4K], (feat. X), (Lyric Video), etc.
    .replace(/\((?:official|lyrics?|lyric|video|audio|mv|hd|4k|ft\.?|feat\.?|with|prod\.?)[^)]*\)/gi, '')
    .replace(/\[(?:official|lyrics?|lyric|video|audio|mv|hd|4k|ft\.?|feat\.?|with|prod\.?)[^\]]*\]/gi, '')
    // Remove trailing separators and labels: "| Sony Music", "- Topic", "· Album", etc.
    .replace(/[\|\·•—–]\s*.+$/g, '')
    .replace(/\s*-\s*(official|lyrics?|audio|video|hd|4k|topic|music|records?|entertainment)\s*$/gi, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ').trim()
}

function normalizeArtist(raw) {
  return raw
    .replace(/[^\x00-\x7F]+/g, ' ')
    .replace(/\s*-\s*Topic\s*$/i, '')
    .replace(/\s+/g, ' ').trim()
}

// Search lrclib with a given title+artist, return best Latin result
async function searchLrclib(title, artist) {
  const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`
  const r = await fetch(url, { headers: { 'Lrclib-Client': 'WeVibe/1.0' } })
  if (!r.ok) return null
  const results = await r.json()
  return pickBest(results)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title') || ''
  const artist = searchParams.get('artist') || ''
  const duration = parseFloat(searchParams.get('duration') || '0')

  if (!title) return NextResponse.json({ lines: [], plain: null, synced: false })

  const cleanTitle  = normalizeTitle(title)
  const cleanArtist = normalizeArtist(artist)

  try {
    let data = null

    // 1. Exact match (title + artist + duration) — fastest, highest accuracy
    const res = await fetch(
      `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}&duration=${Math.round(duration)}`,
      { headers: { 'Lrclib-Client': 'WeVibe/1.0' }, next: { revalidate: 3600 } }
    )
    const exact = res.ok ? await res.json() : null
    // Accept exact match regardless of script (non-Latin will be transliterated below)
    if (exact && (exact.syncedLyrics || exact.plainLyrics)) {
      data = exact
    }

    // 2. Search with cleaned title + artist
    if (!data) {
      data = await searchLrclib(cleanTitle, cleanArtist)
    }

    // 3. Search with title only (no artist) — catches mismatched artist names
    if (!data) {
      data = await searchLrclib(cleanTitle, '')
    }

    // 4. Further strip the title: remove everything after " - " (e.g. "Song Name - Artist")
    if (!data && cleanTitle.includes(' - ')) {
      const shortTitle = cleanTitle.split(' - ')[0].trim()
      data = await searchLrclib(shortTitle, cleanArtist)
      if (!data) data = await searchLrclib(shortTitle, '')
    }

    if (!data) return NextResponse.json({ lines: [], plain: null, synced: false })

    // Transliterate non-Latin lyrics (e.g. Telugu, Hindi, Tamil) to Roman script
    const lyricsText = data.syncedLyrics || data.plainLyrics || ''
    if (!isLatin(lyricsText)) {
      if (data.syncedLyrics) {
        const parsed = parseLRC(data.syncedLyrics)
        const romanTexts = await transliterateToRoman(parsed.map(l => l.text))
        const romanLines = parsed.map((l, i) => ({ ...l, text: romanTexts[i] || l.text }))
        return NextResponse.json({ lines: romanLines, plain: data.plainLyrics || null, synced: true })
      }
      if (data.plainLyrics) {
        const rawLines = data.plainLyrics.split('\n').filter(l => l.trim())
        const romanLines = await transliterateToRoman(rawLines)
        return NextResponse.json({ lines: [], plain: romanLines.join('\n'), synced: false })
      }
    }

    if (data.syncedLyrics) {
      return NextResponse.json({
        lines: parseLRC(data.syncedLyrics),
        plain: data.plainLyrics || null,
        synced: true,
      })
    }

    return NextResponse.json({ lines: [], plain: data.plainLyrics || null, synced: false })
  } catch {
    return NextResponse.json({ lines: [], plain: null, synced: false })
  }
}
