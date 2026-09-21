/**
 * Unified CALB plugin browser entry: shared model read-only policy and account menu UI.
 */

import { apply as applySharedModels } from '../../shared-models/src/client.js'
import { apply as applyAccountUi } from '../../account-ui/src/client/index.tsx'

export const inject = ['remote', 'slots', 'locale'] as const

/**
 * Apply every CALB browser half through one client-modules row.
 * @param ctx - Cordis client context with the merged inject surface.
 */
export function apply(ctx: unknown): void {
  applySharedModels(ctx as Parameters<typeof applySharedModels>[0])
  applyAccountUi(ctx as Parameters<typeof applyAccountUi>[0])
}
