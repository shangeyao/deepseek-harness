import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { UserBackend } from './user-pool.js'

const COOKIE_PREFIX = 'dsh-auth-'

function encodeBase64Url(value: Buffer): string {
  return value.toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

/** Harness browser-session cookie name bound to one loopback upstream authority. */
export function dshCookieName(backend: UserBackend): string {
  const authority = `127.0.0.1:${String(backend.port)}`
  return COOKIE_PREFIX + encodeBase64Url(createHash('sha256').update(authority).digest())
}

/** True when the request carries the Harness session cookie for this backend port. */
export function hasDshSessionForBackend(req: IncomingMessage, backend: UserBackend): boolean {
  const raw = req.headers.cookie
  if (typeof raw !== 'string') return false
  const name = dshCookieName(backend)
  for (const segment of raw.split(';')) {
    const at = segment.indexOf('=')
    if (at === -1 || segment.slice(0, at).trim() !== name) continue
    return segment.slice(at + 1).trim().length > 0
  }
  return false
}
