/**
 * CALB WeKnora plugin: tenant-aligned retrieval without per-user API keys.
 * @module @shangeyao/dsh-calb-plugin/weknora
 */

import { WeknoraClient, createTools } from '@wxg-prc-cpg/dsh-weknora'
import { resolveCalbConfig } from './config.js'

interface HarnessContext {
  tools: { register(definition: unknown): void }
  logger?: { info(message: string): void }
}

export const name = 'dsh-calb-weknora'

/** Cordis waits for the tool registry before applying this plugin. */
export const inject = ['tools'] as const

/**
 * Register WeKnora tools using gateway-owned credentials and the logged-in tenant.
 * @param ctx - Cordis context with `ctx.tools` injected.
 * @param config - optional Cordis row overrides (tool toggles, timeouts).
 */
export function apply(ctx: HarnessContext, config: unknown): void {
  const resolved = resolveCalbConfig(config)
  const client = new WeknoraClient(resolved)
  const registered: string[] = []
  for (const definition of createTools(client, resolved)) {
    ctx.tools.register(definition)
    registered.push(definition.name)
  }
  ctx.logger?.info(
    `dsh-calb-weknora: registered ${registered.join(', ')} for tenant ${resolved.tenantId} at ${resolved.baseUrl}`,
  )
}
