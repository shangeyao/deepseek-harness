#!/usr/bin/env node
import { loadConfig } from './config.js'
import { startGateway } from './server.js'

const config = loadConfig()
const gateway = await startGateway(config)

async function shutdown(): Promise<void> {
  await gateway.close()
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
