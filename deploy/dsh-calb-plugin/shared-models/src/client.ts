/**
 * CALB shared model policy, browser half: show Models as read-only for non-admin users.
 */

import { isModelCredentialRef } from './namespaces.js'

interface RemoteSettings {
  describe(): Promise<{ writable: boolean; hasDocument: boolean; namespaces: unknown[] }>
}

interface CredentialRefView {
  ref: string
  writable?: boolean
  [key: string]: unknown
}

interface RemoteCredentials {
  describe(): Promise<{ refs: CredentialRefView[] }>
}

interface ClientContext {
  remote: { settings: RemoteSettings; credentials: RemoteCredentials }
}

export const inject = ['remote'] as const

/**
 * Force the Models page into read-only mode when the host marked the session non-admin.
 * @param ctx - client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  if ((globalThis as { __CALB_MODELS_READONLY__?: boolean }).__CALB_MODELS_READONLY__ !== true) return

  const settings = ctx.remote.settings
  const settingsDescribe = settings.describe.bind(settings)
  settings.describe = async () => {
    const view = await settingsDescribe()
    return { ...view, writable: false }
  }

  const credentials = ctx.remote.credentials
  const credentialsDescribe = credentials.describe.bind(credentials)
  credentials.describe = async () => {
    const view = await credentialsDescribe()
    return {
      ...view,
      refs: view.refs.map((entry) => (
        isModelCredentialRef(entry.ref) ? { ...entry, writable: false } : entry
      )),
    }
  }
}
