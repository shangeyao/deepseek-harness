import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { GatewayConfig } from './config.js'
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

async function waitForHttp(port: number, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/`, { signal: AbortSignal.timeout(2000) })
      if (response.status < 500) return
    } catch {
      // keep polling until the child process is ready
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
      existing.lastAccess = Date.now()
      return existing
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
    if (backend !== undefined) backend.lastAccess = Date.now()
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

    const port = await reservePort()
    const args = ['--profile', this.config.dshProfile]
    if (this.config.dshPatch !== undefined) {
      args.push('--patch', this.config.dshPatch)
    }
    args.push('--host', '127.0.0.1', '--port', String(port))

    const child = spawn(this.config.dshBin, args, {
      cwd: workspace,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        // directory-picker-auto treats SSH launch as remote-browser context and
        // mounts the browse host + browse client pair (in-app directory browser).
        SSH_CONNECTION: 'ldap-gateway',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(`[dsh:${user.username}] ${String(chunk)}`)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[dsh:${user.username}] ${String(chunk)}`)
    })

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.backends.delete(userId)
      process.stderr.write(`[dsh:${user.username}] exited code=${String(code)} signal=${String(signal)}\n`)
    })

    await waitForHttp(port)

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
