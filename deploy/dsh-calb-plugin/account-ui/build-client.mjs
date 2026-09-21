/**
 * Emit the browser half in dsh client-module factory format (lazy CJS table).
 */
import * as esbuild from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outFile = join(root, 'dist/client.js')
const packageId = '@shangeyao/dsh-calb-plugin-account-ui'

const externals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const { outputFiles } = await esbuild.build({
  entryPoints: [join(root, 'src/client/index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: externals,
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
