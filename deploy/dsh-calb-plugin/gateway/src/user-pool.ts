import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { GatewayConfig } from './config.js'
import { isSuperAdminEmail } from './config.js'
import { stableUserId } from './auth.js'

export interface UserIdentity {
  username: string
  email: string
  displayName: string
}

export interface UserBackend {
  userId: string
  username: string
  email: string
  displayName: string
  port: number
  process: ChildProcess
  dshHome: string
  workspace: string
  lastAccess: number
  /** Process launch token parsed from dsh web stdout; used once per browser session. */
  launchToken?: string
}

const LAUNCH_TOKEN_PATTERN = /[?&]token=([A-Za-z0-9_-]{43})/u

/** Strip model credential env vars so dsh 0.1.6+ env precedence cannot bypass shared model policy. */
function childProcessEnv(
  parent: NodeJS.ProcessEnv,
  modelPolicyEnabled: boolean,
  overrides: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env = { ...parent, ...overrides }
  if (!modelPolicyEnabled) return env
  for (const key of Object.keys(env)) {
    if (key.endsWith('_API_KEY') || key.startsWith('DEEPSEEK_')) delete env[key]
  }
  return env
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => { reject(new Error('failed to reserve port')) })
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

async function waitForLaunch(port: number, readToken: () => string | undefined, timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const launchToken = readToken()
    if (launchToken !== undefined) {
      try {
        const response = await fetch(`http://127.0.0.1:${String(port)}/`, { signal: AbortSignal.timeout(2000) })
        if (response.status < 500) return launchToken
      } catch {
        // stdout may carry the token before the HTTP listener accepts connections
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for dsh web on port ${String(port)}`)
}

async function ensureUserLayout(baseDir: string, dshHome: string, workspace: string, displayName: string): Promise<void> {
  await mkdir(workspace, { recursive: true })
  await mkdir(dshHome, { recursive: true })
  await mkdir(join(dshHome, 'profiles'), { recursive: true })
  await mkdir(join(dshHome, 'storages'), { recursive: true })

  const agentsMd = join(dshHome, 'AGENTS.md')
  if (!(await pathExists(agentsMd))) {
    await writeFile(
      agentsMd,
      `# ${displayName} 的专属工作区\n\n`
      + '这是你的独立 Harness 数据目录。会话、设置、目标与记忆数据都保存在此目录下，'
      + '不会与其他用户共享。\n',
      'utf8',
    )
  }

  const profilePatch = join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
  if (!(await pathExists(profilePatch))) {
    await mkdir(join(dshHome, 'profiles', 'web'), { recursive: true })
    await writeFile(
      profilePatch,
      `# 用户级 Web profile 覆盖：默认工作目录指向专属 workspace。\n`
      + `- id: system-prompt\n`
      + `  config:\n`
      + `    persona: >-\n`
      + `      你是 ${displayName} 的编程助手。当前工作目录是 {{cwd}}，请始终在此用户专属工作区内协作。\n`,
      'utf8',
    )
  }
}

function isBackendAlive(backend: UserBackend): boolean {
  return backend.process.exitCode === null && !backend.process.killed
}

export class UserPool {
  private readonly backends = new Map<string, UserBackend>()
  private readonly starting = new Map<string, Promise<UserBackend>>()
  private readonly sweeper: NodeJS.Timeout

  constructor(private readonly config: GatewayConfig) {
    this.sweeper = setInterval(() => { void this.evictIdle() }, 60_000)
    this.sweeper.unref()
  }

  async ensure(user: UserIdentity): Promise<UserBackend> {
    const userId = stableUserId(user.username)
    const existing = this.backends.get(userId)
    if (existing !== undefined) {
      if (isBackendAlive(existing)) {
        existing.lastAccess = Date.now()
        return existing
      }
      this.backends.delete(userId)
    }

    const pending = this.starting.get(userId)
    if (pending !== undefined) return await pending

    const startPromise = this.startBackend(userId, user)
    this.starting.set(userId, startPromise)
    try {
      const backend = await startPromise
      this.backends.set(userId, backend)
      return backend
    } finally {
      this.starting.delete(userId)
    }
  }

  get(userId: string): UserBackend | undefined {
    const backend = this.backends.get(userId)
    if (backend === undefined) return undefined
    if (!isBackendAlive(backend)) {
      this.backends.delete(userId)
      return undefined
    }
    backend.lastAccess = Date.now()
    return backend
  }

  async shutdown(): Promise<void> {
    clearInterval(this.sweeper)
    await Promise.all([...this.backends.values()].map(backend => this.stopBackend(backend)))
    this.backends.clear()
  }

  private async startBackend(userId: string, user: UserIdentity): Promise<UserBackend> {
    const baseDir = join(this.config.dataRoot, 'users', userId)
    const dshHome = join(baseDir, '.dsh')
    const workspace = join(baseDir, 'workspace')
    await ensureUserLayout(baseDir, dshHome, workspace, user.displayName)

    if (this.config.superAdminEmails.length > 0 && !isSuperAdminEmail(user.email, this.config)) {
      const storePath = join(this.config.calbPluginRoot, 'shared-models/dist/store.js')
      const store = await import(storePath) as {
        syncSharedModelsToUser: (sharedDir: string, dshHome: string) => Promise<void>
        sharedModelsDir: (dataRoot: string) => string
      }
      await store.syncSharedModelsToUser(store.sharedModelsDir(this.config.dataRoot), dshHome)
    }

    const port = await reservePort()
    const modelPolicyEnabled = this.config.superAdminEmails.length > 0
    const isSuperAdmin = modelPolicyEnabled && isSuperAdminEmail(user.email, this.config)
    const args = ['--profile', this.config.dshProfile]
    if (this.config.dshPatch !== undefined) {
      args.push('--patch', this.config.dshPatch)
    }
    args.push('--host', '127.0.0.1', '--port', String(port))

    let launchToken: string | undefined
    let stdoutBuffer = ''

    const child = spawn(this.config.dshBin, args, {
      cwd: workspace,
      env: childProcessEnv(process.env, modelPolicyEnabled, {
        DSH_HOME: dshHome,
        DSH_CALB_PLUGIN_ROOT: this.config.calbPluginRoot,
        DSH_TENANT_ID: userId,
        CALB_USER_TENANT_ID: userId,
        CALB_USER_EMAIL: user.email,
        CALB_DATA_ROOT: this.config.dataRoot,
        ...(modelPolicyEnabled ? { CALB_MODEL_POLICY_ENABLED: 'true' } : {}),
        ...(isSuperAdmin ? { CALB_IS_SUPER_ADMIN: 'true' } : {}),
        ...(this.config.superAdminEmails[0] !== undefined
          ? { CALB_SUPER_ADMIN_EMAIL: this.config.superAdminEmails.join(',') }
          : {}),
        // directory-picker-auto treats SSH launch as remote-browser context and
        // mounts the browse host + browse client pair (in-app directory browser).
        SSH_CONNECTION: 'ldap-gateway',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk: Buffer) => {
      const text = String(chunk)
      process.stdout.write(`[dsh:${user.username}] ${text}`)
      stdoutBuffer += text
      if (launchToken === undefined) {
        const match = LAUNCH_TOKEN_PATTERN.exec(stdoutBuffer)
        if (match?.[1] !== undefined) launchToken = match[1]
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[dsh:${user.username}] ${String(chunk)}`)
    })

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.backends.delete(userId)
      process.stderr.write(`[dsh:${user.username}] exited code=${String(code)} signal=${String(signal)}\n`)
    })

    const resolvedLaunchToken = await waitForLaunch(port, () => launchToken)

    return {
      userId,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      port,
      process: child,
      dshHome,
      workspace,
      lastAccess: Date.now(),
      launchToken: resolvedLaunchToken,
    }
  }

  private async stopBackend(backend: UserBackend): Promise<void> {
    if (backend.process.exitCode !== null || backend.process.killed) return
    backend.process.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (backend.process.exitCode === null && !backend.process.killed) {
          backend.process.kill('SIGKILL')
        }
        resolve()
      }, 5000)
      backend.process.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private async evictIdle(): Promise<void> {
    const now = Date.now()
    for (const backend of this.backends.values()) {
      if (now - backend.lastAccess < this.config.idleTimeoutMs) continue
      this.backends.delete(backend.userId)
      await this.stopBackend(backend)
    }
  }
}
