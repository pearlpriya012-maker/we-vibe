import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ blocked: false })
  }

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; embed-check/1.0)' },
    })

    const xfo = res.headers.get('x-frame-options') ?? ''
    const csp = res.headers.get('content-security-policy') ?? ''

    // X-Frame-Options DENY or SAMEORIGIN = blocked
    const xfoBlocked = /^(DENY|SAMEORIGIN)$/i.test(xfo.trim())

    // CSP frame-ancestors without a wildcard = blocked for third-party origins
    const cspBlocked =
      /frame-ancestors/i.test(csp) && !/frame-ancestors\s+[^;]*\*/i.test(csp)

    return NextResponse.json({ blocked: xfoBlocked || cspBlocked })
  } catch {
    // Network error / timeout — assume allowed (don't falsely block)
    return NextResponse.json({ blocked: false })
  }
}
