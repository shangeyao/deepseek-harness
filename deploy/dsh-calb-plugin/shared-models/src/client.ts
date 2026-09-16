/**
 * CALB shared model policy, browser half: show Models as read-only for non-admin users.
 */

interface RemoteSettings {
  describe(): Promise<{ writable: boolean; hasDocument: boolean; namespaces: unknown[] }>
}

interface ClientContext {
  remote: { settings: RemoteSettings }
}

export const inject = ['remote'] as const

/**
 * Force the Models page into read-only mode when the host marked the session non-admin.
 * @param ctx - client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  if ((globalThis as { __CALB_MODELS_READONLY__?: boolean }).__CALB_MODELS_READONLY__ !== true) return

  const settings = ctx.remote.settings
  const describe = settings.describe.bind(settings)
  settings.describe = async () => {
    const view = await describe()
    return { ...view, writable: false }
  }
}
