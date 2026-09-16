/**
 * Emit the browser half in dsh client-module factory format (lazy CJS table).
 */
import * as esbuild from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outFile = join(root, 'dist/client.js')
const packageId = '@shangeyao/dsh-calb-plugin-shared-models'

const { outputFiles } = await esbuild.build({
  entryPoints: [join(root, 'src/client.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  write: false,
})

const inner = outputFiles[0].text.replace(/^"use strict";\n?/, '')
const bundle = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(packageId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${inner.split('\n').map((line) => `    ${line}`).join('\n')}
    return module.exports;
  }
});
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, bundle)
