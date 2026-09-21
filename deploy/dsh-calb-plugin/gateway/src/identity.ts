import type { GatewayConfig } from './config.js'
import type { CalbRole } from './rbac.js'
import { resolveRole, isModelPolicyEnabled } from './rbac.js'
import { resolveOrgId, orgToTenantId } from './org.js'
import { resolveKnowledgeBaseIds } from './weknora-policy.js'
import type { AuthPrincipal } from './auth.js'
import { stableUserId } from './auth.js'

export interface UserIdentity {
  username: string
  email: string
  displayName: string
  groups: string[]
  department: string
  company: string
  orgId: string
  tenantId: string
  role: CalbRole
  knowledgeBaseIds: string[]
}

export interface RawIdentity {
  username: string
  email: string
  displayName: string
  groups?: string[]
  department?: string
  company?: string
  orgIdAttribute?: string
}

/**
 * Build the full gateway user identity including org tenant and RBAC role.
 * @param raw - authenticated user facts from LDAP or dev login.
 * @param config - gateway configuration.
 * @returns enriched identity for sessions and dsh child processes.
 */
export function buildUserIdentity(raw: RawIdentity, config: GatewayConfig): UserIdentity {
  const groups = raw.groups ?? []
  const department = raw.department?.trim() ?? ''
  const company = raw.company?.trim() ?? ''
  const orgIdAttribute = raw.orgIdAttribute?.trim() ?? ''
  const orgId = resolveOrgId({ orgIdAttribute, department, company })
  const tenantId = orgToTenantId(orgId)
  const role = resolveRole({ email: raw.email, groups }, config)
  const knowledgeBaseIds = resolveKnowledgeBaseIds({ department, groups }, config)

  return {
    username: raw.username,
    email: raw.email,
    displayName: raw.displayName,
    groups,
    department,
    company,
    orgId,
    tenantId,
    role,
    knowledgeBaseIds,
  }
}

/** Dev-login defaults when LDAP is disabled. */
export function devIdentityDefaults(config: GatewayConfig): Pick<RawIdentity, 'groups' | 'department' | 'company'> {
  return {
    groups: config.devLocalGroups,
    department: config.devLocalDepartment,
    company: config.devLocalCompany,
  }
}

/** Whether model policy fanout should run for this identity. */
export function shouldSyncSharedModels(identity: UserIdentity, config: GatewayConfig): boolean {
  return isModelPolicyEnabled(config) && identity.role !== 'super_admin'
}

/** Stable per-user storage id (unchanged from username hash). */
export function userStorageId(username: string): string {
  return stableUserId(username)
}

/** Rehydrate the session identity without recomputing org or KB mappings. */
export function identityFromPrincipal(principal: AuthPrincipal): UserIdentity {
  return {
    username: principal.username,
    email: principal.email,
    displayName: principal.displayName,
    groups: principal.groups,
    department: principal.department,
    company: principal.company,
    orgId: principal.orgId,
    tenantId: principal.tenantId,
    role: principal.role,
    knowledgeBaseIds: principal.knowledgeBaseIds,
  }
}
