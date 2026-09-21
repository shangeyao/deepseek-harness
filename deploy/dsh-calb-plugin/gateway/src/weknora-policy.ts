import type { GatewayConfig } from './config.js'
import { groupMatches } from './rbac.js'

export interface WeknoraPolicyInput {
  department: string
  groups: readonly string[]
}

/**
 * Resolve WeKnora knowledge base ids for a user (group map wins over department map).
 * @param input - department and LDAP groups.
 * @param config - gateway KB mapping configuration.
 * @returns deduplicated KB id list, possibly empty.
 */
export function resolveKnowledgeBaseIds(input: WeknoraPolicyInput, config: GatewayConfig): string[] {
  for (const group of input.groups) {
    for (const [pattern, ids] of Object.entries(config.weknoraKbGroupMap)) {
      if (groupMatches(group, pattern) && ids.length > 0) return [...ids]
    }
  }

  const department = input.department.trim()
  if (department !== '') {
    const deptIds = config.weknoraKbMap[department]
    if (deptIds !== undefined && deptIds.length > 0) return [...deptIds]
  }

  const fallback = config.weknoraKbMap.default
  if (fallback !== undefined && fallback.length > 0) return [...fallback]

  return [...config.defaultKnowledgeBaseIds]
}

/** Serialize KB ids for the WEKNORA_KNOWLEDGE_BASE_IDS env var. */
export function formatKnowledgeBaseIds(ids: readonly string[]): string | undefined {
  const unique = [...new Set(ids.map(id => id.trim()).filter(Boolean))]
  return unique.length > 0 ? unique.join(',') : undefined
}
