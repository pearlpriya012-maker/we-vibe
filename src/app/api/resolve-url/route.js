import { NextResponse } from 'next/server'

// Only resolve known short-URL hosts — prevents SSRF abuse
const ALLOWED_HOSTS = new Set(['b23.tv', 'dai.ly'])

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Only http/https allowed' }, { status: 400 })
  }

  const hostname = parsed.hostname.replace(/^www\./, '')
  if (!ALLOWED_HOSTS.has(hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; url-resolve/1.0)',
      },
    })
    return NextResponse.json({ resolved: res.url })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
