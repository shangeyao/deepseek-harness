/**
 * CALB shared model policy: only the super admin may edit Models settings;
 * changes are published platform-wide for every user.
 */

import { fanoutSharedModelsToAllUsers, publishAdminModelsToShared, sharedModelsDir } from './store.js'
import { isModelCredentialRef, isModelSettingsNamespace } from './namespaces.js'

interface SettingsService {
  mutate(ns: string, ops: unknown, expectedRevision?: number): Promise<void>
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>
  replace(ns: string, section: object, expectedRevision?: number): Promise<void>
}

interface CredentialsService {
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

interface HarnessContext {
  settings: SettingsService
  credentials: CredentialsService
  on(event: string, listener: (...args: unknown[]) => void): void
  effect(disposer: () => void | Promise<void>, label?: string): void
  inject(deps: readonly string[], fn: (ctx: HarnessContext) => void): void
}

export const name = 'dsh-calb-shared-models'

export const inject = ['settings', 'credentials'] as const

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function denyModelWrite(action: string, target: string): never {
  throw new Error(
    `模型配置由平台超级管理员统一管理，当前账号无法${action} ${target}。请联系管理员修改全局模型设置。`,
  )
}

/**
 * Host plugin: gate model settings/credentials and publish admin edits platform-wide.
 * @param ctx - Cordis context with settings and credentials services.
 */
export function apply(ctx: HarnessContext): void {
  if (!envFlag('CALB_MODEL_POLICY_ENABLED')) return

  const isSuperAdmin = envFlag('CALB_IS_SUPER_ADMIN')
  const dataRoot = process.env.CALB_DATA_ROOT?.trim()
  const dshHome = process.env.DSH_HOME?.trim()
  if (dataRoot === undefined || dataRoot === '') {
    throw new Error('dsh-calb-shared-models: CALB_DATA_ROOT is required')
  }
  if (dshHome === undefined || dshHome === '') {
    throw new Error('dsh-calb-shared-models: DSH_HOME is required')
  }

  const sharedDir = sharedModelsDir(dataRoot)

  if (!isSuperAdmin) {
    const settings = ctx.settings
    const original = {
      mutate: settings.mutate.bind(settings),
      update: settings.update.bind(settings),
      replace: settings.replace.bind(settings),
    }
    settings.mutate = async (ns, ops, expectedRevision) => {
      if (isModelSettingsNamespace(ns)) denyModelWrite('修改', ns)
      return original.mutate(ns, ops, expectedRevision)
    }
    settings.update = async (ns, patch, expectedRevision) => {
      if (isModelSettingsNamespace(ns)) denyModelWrite('修改', ns)
      return original.update(ns, patch, expectedRevision)
    }
    settings.replace = async (ns, section, expectedRevision) => {
      if (isModelSettingsNamespace(ns)) denyModelWrite('修改', ns)
      return original.replace(ns, section, expectedRevision)
    }

    const credentials = ctx.credentials
    const originalSet = credentials.set.bind(credentials)
    const originalUnset = credentials.unset.bind(credentials)
    credentials.set = async (ref, value) => {
      if (isModelCredentialRef(ref)) denyModelWrite('配置', ref)
      return originalSet(ref, value)
    }
    credentials.unset = async (ref) => {
      if (isModelCredentialRef(ref)) denyModelWrite('删除', ref)
      return originalUnset(ref)
    }

    ctx.inject(['webServer'], (webCtx) => {
      webCtx.on('webserver/index-inject', (table: unknown) => {
        if (!Array.isArray(table)) return
        table.push({ kind: 'global', name: '__CALB_MODELS_READONLY__', value: true })
      })
    })
    return
  }

  let publishQueued = false
  const queuePublish = (): void => {
    if (publishQueued) return
    publishQueued = true
    queueMicrotask(() => {
      publishQueued = false
      void publishAdminModelsToShared(sharedDir, dshHome)
        .then(() => fanoutSharedModelsToAllUsers(dataRoot))
        .catch((error: unknown) => {
          process.stderr.write(`[calb-shared-models] publish failed: ${String(error)}\n`)
        })
    })
  }

  ctx.on('settings/updated', (ns: unknown) => {
    if (typeof ns === 'string' && isModelSettingsNamespace(ns)) queuePublish()
  })
  ctx.on('credentials/reference-updated', (ref: unknown) => {
    if (typeof ref === 'string' && isModelCredentialRef(ref)) queuePublish()
  })

  const adminEmail = process.env.CALB_USER_EMAIL?.trim() || 'super-admin'
  process.stdout.write(`[calb-shared-models] super admin session for ${adminEmail}\n`)
}
