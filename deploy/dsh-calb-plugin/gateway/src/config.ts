import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicLoginUrls, resolveLanTrust } from './lan-trust.js'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_DSH_PATCH = join(PACKAGE_ROOT, 'cordis.patch.yml')

export interface LdapConfig {
  enabled: boolean
  serverUri: string
  baseDn: string
  bindDn: string
  bindPassword: string
  userSearchFilter: string
  emailAttribute: string
  groupAttribute: string
  departmentAttribute: string
  orgIdAttribute: string
  useSsl: boolean
  startTls: boolean
}

export interface GatewayConfig {
  host: string
  port: number
  /** Login URLs printed at startup for operators and LAN users. */
  publicLoginUrls: string[]
  /** Forwarded into each user dsh web-runtime / connection trustedHosts overlay. */
  trustedHosts: string[]
  dataRoot: string
  dshBin: string
  dshProfile: string
  dshPatch?: string
  /** Root of @shangeyao/dsh-calb-plugin; forwarded to each user dsh process. */
  calbPluginRoot: string
  jwtSecret: string
  tokenExpirySeconds: number
  idleTimeoutMs: number
  ldap: LdapConfig
  devAllowLocalLogin: boolean
  devLocalUsername: string
  devLocalPassword: string
  devLocalDepartment: string
  devLocalCompany: string
  devLocalGroups: string[]
  /** Lowercase emails allowed to edit platform-wide model settings. */
  superAdminEmails: string[]
  superAdminGroups: string[]
  adminGroups: string[]
  readonlyGroups: string[]
  weknoraKbMap: Record<string, string[]>
  weknoraKbGroupMap: Record<string, string[]>
  defaultKnowledgeBaseIds: string[]
  cookieSecure: boolean
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

function splitList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
}

function parseStringListMap(name: string): Record<string, string[]> {
  const raw = process.env[name]?.trim()
  if (raw === undefined || raw === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${name} must be valid JSON`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`)
  }
  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
      throw new Error(`${name}.${key} must be a string array`)
    }
    result[key] = value.map(entry => entry.trim()).filter(Boolean)
  }
  return result
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
    groupAttribute: process.env.LDAP_GROUP_ATTRIBUTE?.trim() || 'memberOf',
    departmentAttribute: process.env.LDAP_DEPARTMENT_ATTRIBUTE?.trim() || 'department',
    orgIdAttribute: process.env.CALB_ORG_ID_ATTRIBUTE?.trim() || '',
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

  const host = process.env.GATEWAY_HOST?.trim() || '0.0.0.0'
  const port = envInt('GATEWAY_PORT', 8080)
  const extraTrustedHosts = (process.env.CALB_TRUSTED_HOSTS ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
  const lanTrust = resolveLanTrust(host, extraTrustedHosts)
  const superAdminEmails = splitList(process.env.CALB_SUPER_ADMIN_EMAIL)
    .map(entry => entry.toLowerCase())
  const superAdminGroups = splitList(process.env.CALB_LDAP_SUPER_ADMIN_GROUPS)
  const adminGroups = splitList(process.env.CALB_LDAP_ADMIN_GROUPS)
  const readonlyGroups = splitList(process.env.CALB_LDAP_READONLY_GROUPS)
  const weknoraKbMap = parseStringListMap('CALB_WEKNORA_KB_MAP')
  const weknoraKbGroupMap = parseStringListMap('CALB_WEKNORA_KB_GROUP_MAP')
  const defaultKnowledgeBaseIds = splitList(process.env.WEKNORA_KNOWLEDGE_BASE_IDS)

  return {
    host,
    port,
    publicLoginUrls: publicLoginUrls(host, port, lanTrust.lanAddresses, lanTrust.trustedHosts),
    trustedHosts: lanTrust.trustedHosts,
    dataRoot,
    dshBin: process.env.DSH_BIN?.trim() || 'dsh',
    dshProfile: process.env.DSH_PROFILE?.trim() || 'web',
    dshPatch: process.env.CALB_DSH_PATCH?.trim() || DEFAULT_DSH_PATCH,
    calbPluginRoot: process.env.DSH_CALB_PLUGIN_ROOT?.trim() || PACKAGE_ROOT,
    jwtSecret,
    tokenExpirySeconds: envInt('TOKEN_EXPIRY_SECONDS', 7 * 24 * 3600),
    idleTimeoutMs: envInt('USER_IDLE_TIMEOUT_MS', 60 * 60 * 1000),
    ldap,
    devAllowLocalLogin,
    devLocalUsername: process.env.DEV_LOCAL_USERNAME?.trim() || 'admin',
    devLocalPassword: process.env.DEV_LOCAL_PASSWORD?.trim() || 'admin',
    devLocalDepartment: process.env.DEV_LOCAL_DEPARTMENT?.trim() || 'Development',
    devLocalCompany: process.env.DEV_LOCAL_COMPANY?.trim() || 'CALB',
    devLocalGroups: splitList(process.env.DEV_LOCAL_GROUPS),
    superAdminEmails,
    superAdminGroups,
    adminGroups,
    readonlyGroups,
    weknoraKbMap,
    weknoraKbGroupMap,
    defaultKnowledgeBaseIds,
    cookieSecure: envBool('COOKIE_SECURE', false),
  }
}

/** @param email - authenticated user email from LDAP or dev login. */
export function isSuperAdminEmail(email: string, config: GatewayConfig): boolean {
  if (config.superAdminEmails.length === 0) return false
  return config.superAdminEmails.includes(email.trim().toLowerCase())
}
