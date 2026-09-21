import { createHash } from 'node:crypto'

/** Normalize a human org label into a stable tenant key segment. */
export function normalizeOrgKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

/**
 * Resolve the logical organization id for WeKnora tenant scoping.
 * @param input - LDAP-derived org facts and fallbacks.
 * @returns normalized org id string.
 */
export function resolveOrgId(input: {
  orgIdAttribute: string
  department: string
  company: string
}): string {
  if (input.orgIdAttribute !== '') return normalizeOrgKey(input.orgIdAttribute)
  if (input.department !== '') return normalizeOrgKey(input.department)
  if (input.company !== '') return normalizeOrgKey(input.company)
  return 'default'
}

/**
 * Map an org id to the dsh WeKnora tenant id (shared within the org).
 * @param orgId - normalized organization id.
 * @returns 16-char hex tenant id.
 */
export function orgToTenantId(orgId: string): string {
  return createHash('sha256').update(orgId).digest('hex').slice(0, 16)
}
