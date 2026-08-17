/**
 * Package-owned invariant companion for `@shangeyao/dsh-client-ui-account`.
 * @module @shangeyao/dsh-client-ui-account/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@shangeyao/dsh-client-ui-account'

/** Cordis companion plugin name. */
export const name = 'client-ui-account-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** 只读网关会话投影，无跨插件可变状态。 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
