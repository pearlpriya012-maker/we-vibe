import { NextResponse } from 'next/server'

// Private/loopback IP ranges — block to prevent SSRF
function isSafeUrl(raw) {
  try {
    const u = new URL(raw)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    const h = u.hostname
    if (
      h === 'localhost' ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h === '::1' ||
      h === '0.0.0.0' ||
      h === '[::1]'
    ) return false
    return true
  } catch {
    return false
  }
}

// Headers the browser should never see from us
const STRIP_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
  'strict-transport-security',
  'transfer-encoding',
  'connection',
])

// Neutralise common frame-buster JS patterns in HTML
function killFramebusters(html) {
  return html
    // if (top !== self) / if (top != window) / if (self !== window) etc.
    .replace(
      /if\s*\(\s*(?:window\s*(?:!==?|===?)\s*(?:top|parent)|(?:top|parent)\s*(?:!==?|===?)\s*window|top\s*(?:!==?|===?)\s*self|self\s*(?:!==?|===?)\s*top)\s*\)/g,
      'if (false)'
    )
    // top.location = / parent.location.href = etc.
    .replace(
      /\b(?:top|parent)\.location(?:\.href)?\s*=/g,
      'window.__proxied_redirect ='
    )
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get('url')

  if (!targetUrl || !isSafeUrl(targetUrl)) {
    return new NextResponse('Invalid or disallowed URL', { status: 400 })
  }

  let upstream
  try {
    upstream = await fetch(targetUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // avoid compressed responses we can't rewrite easily
        Referer: new URL(targetUrl).origin + '/',
      },
    })
  } catch (err) {
    return new NextResponse('Upstream fetch failed: ' + err.message, { status: 502 })
  }

  // Build clean response headers
  const outHeaders = new Headers()
  for (const [k, v] of upstream.headers.entries()) {
    if (!STRIP_HEADERS.has(k.toLowerCase())) {
      outHeaders.set(k, v)
    }
  }
  // Explicitly allow framing from any origin
  outHeaders.set('X-Frame-Options', 'ALLOWALL')

  const contentType = upstream.headers.get('content-type') || ''

  if (contentType.includes('text/html')) {
    let html = await upstream.text()
    const origin = new URL(targetUrl).origin

    // Remove CSP meta tags
    html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')

    // Neutralise frame-busters
    html = killFramebusters(html)

    // Inject <base> so relative URLs resolve to the real origin
    if (!/<base[\s>]/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1<base href="${origin}/">`)
    }

    outHeaders.set('Content-Type', 'text/html; charset=utf-8')
    return new NextResponse(html, { status: upstream.status, headers: outHeaders })
  }

  // For non-HTML (scripts, images, video segments): stream through as-is
  const body = await upstream.arrayBuffer()
  return new NextResponse(body, { status: upstream.status, headers: outHeaders })
}
