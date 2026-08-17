import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEPLOY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DSH_PATCH = join(DEPLOY_ROOT, 'profiles', 'ldap-web.patch.yml')

export interface LdapConfig {
  enabled: boolean
  serverUri: string
  baseDn: string
  bindDn: string
  bindPassword: string
  userSearchFilter: string
  emailAttribute: string
  useSsl: boolean
  startTls: boolean
}

export interface GatewayConfig {
  host: string
  port: number
  dataRoot: string
  dshBin: string
  dshProfile: string
  dshPatch?: string
  jwtSecret: string
  tokenExpirySeconds: number
  idleTimeoutMs: number
  ldap: LdapConfig
  devAllowLocalLogin: boolean
  devLocalUsername: string
  devLocalPassword: string
}

function envBool(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  if (value === undefined || value === '') return fallback
  return value === '1' || value === 'true' || value === 'yes'
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function loadConfig(): GatewayConfig {
  const dataRoot = resolve(process.env.DSH_DATA_ROOT?.trim() || join(homedir(), '.calb-dsh-data'))
  const ldapEnabled = envBool('LDAP_ENABLED', false)
  const devAllowLocalLogin = envBool('DEV_ALLOW_LOCAL_LOGIN', !ldapEnabled)

  const ldap: LdapConfig = {
    enabled: ldapEnabled,
    serverUri: process.env.LDAP_SERVER_URI?.trim() || '',
    baseDn: process.env.LDAP_BASE_DN?.trim() || '',
    bindDn: process.env.LDAP_BIND_DN?.trim() || '',
    bindPassword: process.env.LDAP_BIND_PASSWORD?.trim() || '',
    userSearchFilter: process.env.LDAP_USER_SEARCH_FILTER?.trim()
      || '(|(mail={username})(uid={username})(sAMAccountName={username}))',
    emailAttribute: process.env.LDAP_EMAIL_ATTRIBUTE?.trim() || 'mail',
    useSsl: envBool('LDAP_USE_SSL', false),
    startTls: envBool('LDAP_START_TLS', false),
  }

  if (ldap.enabled) {
    const missing = ['LDAP_SERVER_URI', 'LDAP_BASE_DN'].filter(key => !process.env[key]?.trim())
    if (missing.length > 0) {
      throw new Error(`LDAP is enabled but missing: ${missing.join(', ')}`)
    }
  }

  const jwtSecret = process.env.JWT_SECRET?.trim()
    || (devAllowLocalLogin ? 'dev-only-change-me' : required('JWT_SECRET'))

  return {
    host: process.env.GATEWAY_HOST?.trim() || '0.0.0.0',
    port: envInt('GATEWAY_PORT', 8080),
    dataRoot,
    dshBin: process.env.DSH_BIN?.trim() || 'dsh',
    dshProfile: process.env.DSH_PROFILE?.trim() || 'web',
    dshPatch: process.env.DSH_PATCH?.trim() || DEFAULT_DSH_PATCH,
    jwtSecret,
    tokenExpirySeconds: envInt('TOKEN_EXPIRY_SECONDS', 7 * 24 * 3600),
    idleTimeoutMs: envInt('USER_IDLE_TIMEOUT_MS', 60 * 60 * 1000),
    ldap,
    devAllowLocalLogin,
    devLocalUsername: process.env.DEV_LOCAL_USERNAME?.trim() || 'admin',
    devLocalPassword: process.env.DEV_LOCAL_PASSWORD?.trim() || 'admin',
  }
}
