import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { GatewayConfig } from './config.js'

export interface AuthPrincipal {
  username: string
  email: string
  displayName: string
  userId: string
  exp: number
}

const COOKIE_NAME = 'dsh_session'

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export function stableUserId(username: string): string {
  return createHmac('sha256', 'dsh-user-id')
    .update(username.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16)
}

export function createToken(principal: Omit<AuthPrincipal, 'exp'>, config: GatewayConfig): string {
  const payload: AuthPrincipal = {
    ...principal,
    exp: Math.floor(Date.now() / 1000) + config.tokenExpirySeconds,
  }
  const body = b64url(JSON.stringify(payload))
  const signature = createHmac('sha256', config.jwtSecret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyToken(token: string, config: GatewayConfig): AuthPrincipal | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = createHmac('sha256', config.jwtSecret).update(body).digest('base64url')
  const sigBuf = fromB64url(signature)
  const expBuf = fromB64url(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as AuthPrincipal
    if (!payload.username || !payload.userId || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function setSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAgeSeconds)}`
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readSessionToken(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const cookie = req.headers.cookie
  const header = Array.isArray(cookie) ? cookie.join('; ') : cookie
  return parseCookie(header, COOKIE_NAME)
}

export function newCsrfToken(): string {
  return randomBytes(16).toString('hex')
}

export function cookieHeader(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${String(maxAgeSeconds)}`
}

export function readCsrfCookie(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const cookie = req.headers.cookie
  const header = Array.isArray(cookie) ? cookie.join('; ') : cookie
  return parseCookie(header, 'dsh_csrf')
}
