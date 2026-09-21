import { Client } from 'ldapts'
import type { LdapConfig } from './config.js'

const FILTER_ESCAPE_RE = /([\\*()\0])/g

function escapeFilterValue(value: string): string {
  return value.replace(FILTER_ESCAPE_RE, match => `\\${match.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

function readAttribute(entry: Record<string, unknown>, attribute: string): string {
  const keys = [attribute, attribute.toLowerCase(), attribute.toUpperCase()]
  for (const key of keys) {
    const raw = entry[key]
    if (Array.isArray(raw) && raw.length > 0) {
      return String(raw[0]).trim()
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim()
    }
  }
  return ''
}

function readAttributeList(entry: Record<string, unknown>, attribute: string): string[] {
  const keys = [attribute, attribute.toLowerCase(), attribute.toUpperCase()]
  for (const key of keys) {
    const raw = entry[key]
    if (Array.isArray(raw)) {
      return raw.map(value => String(value).trim()).filter(Boolean)
    }
    if (typeof raw === 'string' && raw.trim()) {
      return [raw.trim()]
    }
  }
  return []
}

export interface LdapUser {
  username: string
  email: string
  displayName: string
  dn: string
  groups: string[]
  department: string
  company: string
  orgIdAttribute: string
}

export async function ldapAuthenticate(
  username: string,
  password: string,
  config: LdapConfig,
): Promise<LdapUser | null> {
  const loginId = username.trim()
  if (!loginId || !password || !config.enabled) return null

  const client = new Client({
    url: config.serverUri,
    tlsOptions: config.useSsl ? { rejectUnauthorized: true } : undefined,
  })

  try {
    if (config.bindDn) {
      await client.bind(config.bindDn, config.bindPassword)
    } else {
      await client.bind('', '')
    }

    if (config.startTls && !config.useSsl) {
      await client.startTLS({ rejectUnauthorized: true })
    }

    const searchFilter = config.userSearchFilter.replace('{username}', escapeFilterValue(loginId))
    const searchAttributes = [
      config.emailAttribute,
      'cn',
      'displayName',
      'uid',
      'mail',
      config.groupAttribute,
      config.departmentAttribute,
      'company',
      'o',
      ...(config.orgIdAttribute !== '' ? [config.orgIdAttribute] : []),
    ]
    const { searchEntries } = await client.search(config.baseDn, {
      scope: 'sub',
      filter: searchFilter,
      attributes: [...new Set(searchAttributes)],
    })

    if (searchEntries.length === 0) return null

    const entry = searchEntries[0] as Record<string, unknown> & { dn: string }
    const userDn = entry.dn
    const emailRaw = readAttribute(entry, config.emailAttribute) || readAttribute(entry, 'mail') || loginId
    const email = emailRaw.includes('@') ? emailRaw.toLowerCase() : `${loginId.toLowerCase()}@local`

    const userClient = new Client({
      url: config.serverUri,
      tlsOptions: config.useSsl ? { rejectUnauthorized: true } : undefined,
    })
    try {
      if (config.startTls && !config.useSsl) {
        await userClient.startTLS({ rejectUnauthorized: true })
      }
      await userClient.bind(userDn, password)
    } finally {
      await userClient.unbind().catch(() => {})
    }

    const displayName = readAttribute(entry, 'displayName')
      || readAttribute(entry, 'cn')
      || readAttribute(entry, 'uid')
      || email.split('@')[0]
      || loginId

    return {
      username: loginId,
      email,
      displayName,
      dn: userDn,
      groups: readAttributeList(entry, config.groupAttribute),
      department: readAttribute(entry, config.departmentAttribute),
      company: readAttribute(entry, 'company') || readAttribute(entry, 'o'),
      orgIdAttribute: config.orgIdAttribute !== ''
        ? readAttribute(entry, config.orgIdAttribute)
        : '',
    }
  } catch {
    return null
  } finally {
    await client.unbind().catch(() => {})
  }
}
