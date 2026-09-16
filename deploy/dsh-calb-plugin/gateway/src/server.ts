import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GatewayConfig } from './config.js'
import {
  clearSessionCookie,
  createToken,
  newCsrfToken,
  cookieHeader,
  readCsrfCookie,
  readSessionToken,
  setSessionCookie,
  stableUserId,
  verifyToken,
} from './auth.js'
import { hasDshSessionForBackend } from './dsh-cookie.js'
import { ldapAuthenticate } from './ldap.js'
import { proxyHttp, proxyWebSocket } from './proxy.js'
import { UserPool } from './user-pool.js'

const PUBLIC_PREFIXES = ['/auth/', '/login', '/health']
const ROOT = dirname(fileURLToPath(import.meta.url))

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location })
  res.end()
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix))
}

export async function startGateway(config: GatewayConfig): Promise<{ close: () => Promise<void> }> {
  const pool = new UserPool(config)
  const publicDir = join(ROOT, '..', 'public')
  const loginHtml = await readFile(join(publicDir, 'login.html'), 'utf8')
  const calbLogoPng = await readFile(join(publicDir, 'calb-logo.png'))

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://gateway.local')
      const pathname = url.pathname

      if (pathname === '/health') {
        json(res, 200, { ok: true })
        return
      }

      if (pathname === '/calb-logo.png' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
        res.end(calbLogoPng)
        return
      }

      if (pathname === '/login' && req.method === 'GET') {
        const csrf = newCsrfToken()
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'set-cookie': cookieHeader('dsh_csrf', csrf, 3600),
        })
        res.end(loginHtml.replace('__CSRF__', csrf))
        return
      }

      if (pathname === '/auth/status' && req.method === 'GET') {
        const token = readSessionToken(req)
        const principal = token === undefined ? null : verifyToken(token, config)
        if (principal === null) {
          json(res, 200, { authenticated: false })
          return
        }
        json(res, 200, {
          authenticated: true,
          username: principal.username,
          email: principal.email,
          displayName: principal.displayName,
          userId: principal.userId,
        })
        return
      }

      if (pathname === '/auth/login' && req.method === 'POST') {
        const bodyText = await readBody(req)
        let payload: { username?: string; password?: string; csrf?: string }
        try {
          payload = JSON.parse(bodyText) as { username?: string; password?: string; csrf?: string }
        } catch {
          json(res, 400, { error: 'invalid-json' })
          return
        }

        const csrfCookie = readCsrfCookie(req)
        if (payload.csrf === undefined || csrfCookie === undefined || payload.csrf !== csrfCookie) {
          json(res, 403, { error: 'csrf' })
          return
        }

        const username = payload.username?.trim() ?? ''
        const password = payload.password ?? ''
        if (!username || !password) {
          json(res, 400, { error: 'missing-credentials' })
          return
        }

        let identity = null as null | { username: string; email: string; displayName: string }
        if (config.ldap.enabled) {
          const ldapUser = await ldapAuthenticate(username, password, config.ldap)
          if (ldapUser !== null) {
            identity = {
              username: ldapUser.username,
              email: ldapUser.email,
              displayName: ldapUser.displayName,
            }
          }
        } else if (config.devAllowLocalLogin
          && username === config.devLocalUsername
          && password === config.devLocalPassword) {
          identity = {
            username,
            email: `${username}@local`,
            displayName: username,
          }
        }

        if (identity === null) {
          json(res, 401, { error: 'invalid-credentials' })
          return
        }

        const userId = stableUserId(identity.username)
        const sessionToken = createToken({
          username: identity.username,
          email: identity.email,
          displayName: identity.displayName,
          userId,
        }, config)

        let backend
        try {
          backend = await pool.ensure(identity)
        } catch (error: unknown) {
          process.stderr.write(`[gateway] failed to start dsh for ${identity.username}: ${String(error)}\n`)
          json(res, 503, { error: 'workspace-start-failed' })
          return
        }

        const launchToken = backend.launchToken
        const redirect = launchToken === undefined ? '/' : `/?token=${launchToken}`

        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'set-cookie': setSessionCookie(sessionToken, config.tokenExpirySeconds),
        })
        res.end(JSON.stringify({
          ok: true,
          username: identity.username,
          displayName: identity.displayName,
          redirect,
        }))
        return
      }

      if (pathname === '/auth/logout' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'set-cookie': clearSessionCookie(),
        })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (isPublicPath(pathname)) {
        json(res, 404, { error: 'not-found' })
        return
      }

      const token = readSessionToken(req)
      const principal = token === undefined ? null : verifyToken(token, config)
      if (principal === null) {
        if (req.headers.accept?.includes('text/html')) {
          redirect(res, '/login')
          return
        }
        json(res, 401, { error: 'unauthorized' })
        return
      }

      const backend = await pool.ensure({
        username: principal.username,
        email: principal.email,
        displayName: principal.displayName,
      })

      if (
        req.method === 'GET'
        && pathname === '/'
        && !url.searchParams.has('token')
        && !hasDshSessionForBackend(req, backend)
        && backend.launchToken !== undefined
      ) {
        redirect(res, `/?token=${backend.launchToken}`)
        return
      }

      await proxyHttp(req, res, backend)
    } catch (error) {
      process.stderr.write(`${String(error)}\n`)
      if (!res.headersSent) {
        json(res, 500, { error: 'internal-error' })
      }
    }
  })

  server.on('clientError', () => {
    // Browser tab closes and aborted requests must not crash the gateway process.
  })

  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const token = readSessionToken(req)
      const principal = token === undefined ? null : verifyToken(token, config)
      if (principal === null) {
        socket.destroy()
        return
      }
      try {
        const backend = await pool.ensure({
          username: principal.username,
          email: principal.email,
          displayName: principal.displayName,
        })
        proxyWebSocket(req, socket, head, backend)
      } catch {
        socket.destroy()
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const loginUrls = config.publicLoginUrls.length > 0
    ? config.publicLoginUrls
    : [`http://${config.host}:${String(config.port)}/login`]
  process.stdout.write(
    `CALB gateway ready (LDAP ${config.ldap.enabled ? 'enabled' : 'disabled'}, data root: ${config.dataRoot})\n`,
  )
  for (const url of loginUrls) {
    process.stdout.write(`  login: ${url}\n`)
  }
  if (config.trustedHosts.length > 0) {
    process.stdout.write(`  dsh trustedHosts: ${config.trustedHosts.join(', ')}\n`)
  }
  if (config.superAdminEmails.length > 0) {
    process.stdout.write(`  model super admin: ${config.superAdminEmails.join(', ')}\n`)
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      })
      await pool.shutdown()
    },
  }
}
