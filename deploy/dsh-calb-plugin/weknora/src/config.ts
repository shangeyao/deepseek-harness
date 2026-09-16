import { ConfigError, resolveConfig } from '@wxg-prc-cpg/dsh-weknora'

function requiredEnv(name: string, hint: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') {
    throw new ConfigError([`${name} is required — ${hint}`])
  }
  return value
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/**
 * Resolve WeKnora settings for CALB: tenant follows LDAP login (`DSH_TENANT_ID`),
 * credentials are owned by the gateway (`WEKNORA_API_KEY`), not end users.
 * @param raw - optional Cordis row overrides (tools toggles, timeouts).
 */
export function resolveCalbConfig(raw: unknown) {
  const tenantId = requiredEnv(
    'DSH_TENANT_ID',
    'WeKnora tenant must match the authenticated LDAP user; the CALB gateway injects this per session',
  )
  const apiKey = requiredEnv(
    'WEKNORA_API_KEY',
    'configure the platform WeKnora API key on the CALB gateway only',
  )
  const baseUrl = optionalEnv('WEKNORA_BASE_URL')
  const agentId = optionalEnv('WEKNORA_AGENT_ID')
  const knowledgeBaseIds = (process.env.WEKNORA_KNOWLEDGE_BASE_IDS ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)

  const row = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...raw } : {}
  return resolveConfig({
    ...row,
    tenantId,
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(agentId !== undefined ? { agentId } : {}),
    ...(knowledgeBaseIds.length > 0 ? { knowledgeBaseIds } : {}),
  })
}
