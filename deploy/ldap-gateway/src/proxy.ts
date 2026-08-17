import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { UserBackend } from './user-pool.js'

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** Hop-by-hop headers must not be blindly forwarded to the upstream Harness instance. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

/** Harness /api trust fence requires Host and Origin to describe the same authority. */
function upstreamAuthority(backend: UserBackend): string {
  return `127.0.0.1:${String(backend.port)}`
}

/**
 * Rewrite browser-facing headers to the loopback upstream the user dsh process
 * binds. All other request headers (including WebSocket handshake fields) pass
 * through so remote clients behind GATEWAY_HOST=0.0.0.0 behave like localhost.
 */
export function buildUpstreamHeaders(
  req: IncomingMessage,
  backend: UserBackend,
  extra: Record<string, string> = {},
): Record<string, string> {
  const authority = upstreamAuthority(backend)
  const upstreamOrigin = `http://${authority}`
  const headers: Record<string, string> = {}

  for (const [key, raw] of Object.entries(req.headers)) {
    if (raw === undefined) continue
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower)) continue
    if (lower === 'host' || lower === 'origin' || lower === 'referer') continue
    headers[lower] = Array.isArray(raw) ? raw.join(', ') : raw
  }

  headers.host = authority
  headers.origin = upstreamOrigin

  const referer = req.headers.referer
  if (typeof referer === 'string' && referer.length > 0) {
    try {
      const ref = new URL(referer)
      headers.referer = `${upstreamOrigin}${ref.pathname}${ref.search}`
    } catch {
      // Drop malformed referer rather than fail the trust fence downstream.
    }
  }

  for (const [key, value] of Object.entries(extra)) {
    headers[key.toLowerCase()] = value
  }
  return headers
}

export async function proxyHttp(
  req: IncomingMessage,
  res: ServerResponse,
  backend: UserBackend,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://gateway.local')
  const targetUrl = `http://${upstreamAuthority(backend)}${url.pathname}${url.search}`
  const method = req.method ?? 'GET'
  const body = await readRequestBody(req)

  const upstream = await fetch(targetUrl, {
    method,
    headers: buildUpstreamHeaders(req, backend),
    ...(body === undefined ? {} : { body: new Uint8Array(body) }),
    signal: AbortSignal.timeout(300_000),
  })

  res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()))
  if (upstream.body === null) {
    res.end()
    return
  }
  for await (const chunk of upstream.body) {
    res.write(chunk)
  }
  res.end()
}

export function proxyWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  backend: UserBackend,
): void {
  const url = new URL(req.url ?? '/', 'http://gateway.local')
  const targetPath = `${url.pathname}${url.search}`
  const headers = buildUpstreamHeaders(req, backend, {
    connection: 'Upgrade',
    upgrade: 'websocket',
  })

  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: backend.port,
    path: targetPath,
    method: req.method,
    headers,
  })

  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    const responseLines = [`HTTP/1.1 ${String(upstreamRes.statusCode ?? 101)} ${upstreamRes.statusMessage ?? 'Switching Protocols'}`]
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value === undefined) continue
      responseLines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    }
    responseLines.push('', '')
    socket.write(responseLines.join('\r\n'))
    if (upstreamHead.length > 0) upstreamSocket.write(upstreamHead)
    if (head.length > 0) upstreamSocket.write(head)
    upstreamSocket.pipe(socket)
    socket.pipe(upstreamSocket)
  })

  upstream.on('response', (upstreamRes) => {
    // Non-101 responses (403 trust fence, 426 upgrade required) must reach the browser.
    const responseLines = [`HTTP/1.1 ${String(upstreamRes.statusCode ?? 502)} ${upstreamRes.statusMessage ?? 'Bad Gateway'}`]
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value === undefined) continue
      responseLines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    }
    responseLines.push('', '')
    socket.write(responseLines.join('\r\n'))
    upstreamRes.pipe(socket)
  })

  upstream.on('error', () => {
    socket.destroy()
  })

  upstream.end()
}
