#!/usr/bin/env node
/**
 * Stage @shangeyao/dsh for npm publish: rename the CLI package, pnpm pack
 * (resolves workspace:* deps), then restore apps/cli/package.json.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const CLI_MANIFEST = join(ROOT, 'apps/cli/package.json')
const OUT_DIR = join(ROOT, '.calb-publish')
const VERSION = process.env.CALB_PUBLISH_VERSION?.trim() || '0.1.0'

mkdirSync(OUT_DIR, { recursive: true })

const original = readFileSync(CLI_MANIFEST, 'utf8')
const manifest = JSON.parse(original)

const published = {
  ...manifest,
  name: '@shangeyao/dsh',
  version: VERSION,
  publishConfig: {
    registry: 'https://npm.pkg.github.com',
  },
  repository: {
    type: 'git',
    url: 'git+https://github.com/shangeyao/CALB-AIStudio.git',
    directory: 'apps/cli',
  },
}

writeFileSync(CLI_MANIFEST, `${JSON.stringify(published, null, 2)}\n`)

try {
  execFileSync('pnpm', ['--dir', 'apps/cli', 'pack', '--pack-destination', OUT_DIR], {
    cwd: ROOT,
    stdio: 'inherit',
  })
} finally {
  writeFileSync(CLI_MANIFEST, original)
}

const tarball = readdirSync(OUT_DIR)
  .filter(name => name.startsWith('shangeyao-dsh-') && name.endsWith('.tgz'))
  .sort()
  .at(-1)

if (tarball === undefined) {
  throw new Error('pnpm pack did not produce shangeyao-dsh-*.tgz')
}

process.stdout.write(`${join(OUT_DIR, tarball)}\n`)
