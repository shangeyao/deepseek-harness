#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv'
import { watch } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { isModelPolicyEnabled } from './rbac.js'
import { writeRuntimePatch } from './patch.js'
import { startGateway } from './server.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
loadDotenv({ path: join(packageRoot, '.env') })

const config = loadConfig()
if (process.env.CALB_DSH_PATCH?.trim() === undefined) {
  config.dshPatch = await writeRuntimePatch(config.calbPluginRoot, config.trustedHosts)
}

let fanoutQueued = false
if (isModelPolicyEnabled(config)) {
  const sharedModelsDirPath = join(config.dataRoot, 'shared', 'models')
  await mkdir(sharedModelsDirPath, { recursive: true })
  watch(sharedModelsDirPath, (_event, filename) => {
    if (filename !== 'settings.yaml' && filename !== 'credentials.yaml') return
    if (fanoutQueued) return
    fanoutQueued = true
    setTimeout(() => {
      fanoutQueued = false
      void import(join(config.calbPluginRoot, 'shared-models/dist/store.js'))
        .then(mod => (mod as { fanoutSharedModelsToAllUsers: (root: string) => Promise<void> })
          .fanoutSharedModelsToAllUsers(config.dataRoot))
        .catch((error: unknown) => {
          process.stderr.write(`[gateway] model policy fanout failed: ${String(error)}\n`)
        })
    }, 300)
  })
}

const gateway = await startGateway(config)

async function shutdown(): Promise<void> {
  await gateway.close()
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
