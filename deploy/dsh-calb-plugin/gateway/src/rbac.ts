import type { GatewayConfig } from './config.js'
import { isSuperAdminEmail } from './config.js'

export type CalbRole = 'super_admin' | 'admin' | 'user' | 'readonly'

export interface RoleContext {
  email: string
  groups: readonly string[]
}

function extractCn(value: string): string {
  const match = /^CN=([^,]+)/iu.exec(value.trim())
  return match?.[1]?.trim().toLowerCase() ?? value.trim().toLowerCase()
}

/** Match LDAP group DN/CN against configured patterns (exact DN or CN substring). */
export function groupMatches(userGroup: string, pattern: string): boolean {
  const user = userGroup.trim().toLowerCase()
  const target = pattern.trim().toLowerCase()
  if (user === target) return true
  if (user.includes(target) || target.includes(user)) return true
  return extractCn(userGroup) === extractCn(pattern)
}

function matchesAnyGroup(groups: readonly string[], patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false
  return groups.some(group => patterns.some(pattern => groupMatches(group, pattern)))
}

/**
 * Resolve the CALB role for an authenticated principal.
 * @param ctx - email and LDAP groups from the session.
 * @param config - gateway configuration.
 * @returns resolved role.
 */
export function resolveRole(ctx: RoleContext, config: GatewayConfig): CalbRole {
  if (isSuperAdminEmail(ctx.email, config)) return 'super_admin'
  if (matchesAnyGroup(ctx.groups, config.superAdminGroups)) return 'super_admin'
  if (matchesAnyGroup(ctx.groups, config.adminGroups)) return 'admin'
  if (matchesAnyGroup(ctx.groups, config.readonlyGroups)) return 'readonly'
  return 'user'
}

/** Whether platform-wide model policy is active for this deployment. */
export function isModelPolicyEnabled(config: GatewayConfig): boolean {
  return config.superAdminEmails.length > 0 || config.superAdminGroups.length > 0
}

/** Whether the role may edit platform model settings. */
export function isSuperAdminRole(role: CalbRole): boolean {
  return role === 'super_admin'
}
