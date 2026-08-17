import type { UserConfig } from 'tsdown'
import { clientBundle } from '../../packages/client/tsdown.client.ts'

const PACKAGE_ID = '@shangeyao/dsh-client-ui-account'
/** 开发阶段旧 scope；bundle 同时注册两个 id，避免 patch 未更新时报错。 */
const LEGACY_PACKAGE_ID = '@calb/dsh-client-ui-account'

type BuildFaceConfig = (inlineConfig: Pick<UserConfig, 'env'>) => UserConfig[]

function withLegacyClientAlias(configs: BuildFaceConfig): BuildFaceConfig {
  return (inline) => {
    const resolved = configs(inline)
    return resolved.map((config) => {
      if (config.name !== `${PACKAGE_ID}/client`) return config
      return {
        ...config,
        outputOptions: {
          ...(config.outputOptions ?? {}),
          banner: 'const __dsh_client_factory__ = (require) => {',
          footer: [
            'return module.exports; };',
            `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: __dsh_client_factory__ });`,
            `window.__ModuleLoader__.load({ id: ${JSON.stringify(LEGACY_PACKAGE_ID)}, factory: __dsh_client_factory__ });`,
          ].join('\n'),
        },
      }
    })
  }
}

export default withLegacyClientAlias(
  clientBundle(PACKAGE_ID, ['lib/types/index.js', 'lib/types/invariant.js']),
)
