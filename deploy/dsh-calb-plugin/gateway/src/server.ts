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
  verifyToken,
} from './auth.js'
import { auditLog } from './audit.js'
import { hasDshSessionForBackend } from './dsh-cookie.js'
import { buildUserIdentity, devIdentityDefaults, identityFromPrincipal, userStorageId } from './identity.js'
import { ldapAuthenticate } from './ldap.js'
import { isModelPolicyEnabled } from './rbac.js'
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

function statusPayload(principal: NonNullable<ReturnType<typeof verifyToken>>): Record<string, unknown> {
  return {
    authenticated: true,
    username: principal.username,
    email: principal.email,
    displayName: principal.displayName,
    userId: principal.userId,
    groups: principal.groups,
    department: principal.department,
    orgId: principal.orgId,
    tenantId: principal.tenantId,
    role: principal.role,
    knowledgeBaseIds: principal.knowledgeBaseIds,
  }
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
        json(res, 200, {
          ok: true,
          activeBackends: pool.activeBackendCount(),
          ldapEnabled: config.ldap.enabled,
        })
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
          'set-cookie': cookieHeader('dsh_csrf', csrf, 3600, config.cookieSecure),
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
        json(res, 200, statusPayload(principal))
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

        let identity = null as ReturnType<typeof buildUserIdentity> | null
        if (config.ldap.enabled) {
          const ldapUser = await ldapAuthenticate(username, password, config.ldap)
          if (ldapUser !== null) {
            identity = buildUserIdentity({
              username: ldapUser.username,
              email: ldapUser.email,
              displayName: ldapUser.displayName,
              groups: ldapUser.groups,
              department: ldapUser.department,
              company: ldapUser.company,
              orgIdAttribute: ldapUser.orgIdAttribute,
            }, config)
          }
        } else if (config.devAllowLocalLogin
          && username === config.devLocalUsername
          && password === config.devLocalPassword) {
          const devDefaults = devIdentityDefaults(config)
          identity = buildUserIdentity({
            username,
            email: `${username}@local`,
            displayName: username,
            ...devDefaults,
          }, config)
        }

        if (identity === null) {
          auditLog('login_failed', { username, ldap: config.ldap.enabled })
          json(res, 401, { error: 'invalid-credentials' })
          return
        }

        const userId = userStorageId(identity.username)
        const sessionToken = createToken({
          username: identity.username,
          email: identity.email,
          displayName: identity.displayName,
          userId,
          groups: identity.groups,
          department: identity.department,
          company: identity.company,
          orgId: identity.orgId,
          tenantId: identity.tenantId,
          role: identity.role,
          knowledgeBaseIds: identity.knowledgeBaseIds,
        }, config)

        auditLog('login_success', {
          username: identity.username,
          role: identity.role,
          orgId: identity.orgId,
          tenantId: identity.tenantId,
          department: identity.department,
        })

        let backend
        try {
          backend = await pool.ensure(identity)
        } catch (error: unknown) {
          process.stderr.write(`[gateway] failed to start dsh for ${identity.username}: ${String(error)}\n`)
          json(res, 503, { error: 'workspace-start-failed' })
          return
        }

        const launchToken = backend.launchToken
        const redirectTo = launchToken === undefined ? '/' : `/?token=${launchToken}`

        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'set-cookie': setSessionCookie(sessionToken, config.tokenExpirySeconds, config.cookieSecure),
        })
        res.end(JSON.stringify({
          ok: true,
          username: identity.username,
          displayName: identity.displayName,
          role: identity.role,
          department: identity.department,
          redirect: redirectTo,
        }))
        return
      }

      if (pathname === '/auth/logout' && req.method === 'POST') {
        const token = readSessionToken(req)
        const principal = token === undefined ? null : verifyToken(token, config)
        if (principal !== null) {
          auditLog('logout', { username: principal.username, userId: principal.userId })
          await pool.stop(principal.userId)
        }
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

      const identity = identityFromPrincipal(principal)
      const backend = await pool.ensure(identity)

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
        const identity = identityFromPrincipal(principal)
        const backend = await pool.ensure(identity)
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
  if (isModelPolicyEnabled(config)) {
    const admins = [...config.superAdminEmails, ...config.superAdminGroups]
    process.stdout.write(`  model super admin: ${admins.join(', ')}\n`)
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
