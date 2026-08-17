/** LDAP 网关账户侧边栏插件：底部用户信息与退出登录。 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { AccountFooter } from './AccountFooter.tsx'
import { NS, en, zh } from './locales.ts'

/** 所需服务：槽位注册与文案。 */
export const inject = ['slots', 'locale']

/**
 * 注册 sidebar.footer.action 账户行（位于设置按钮上方）。
 * @param ctx - client root context。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-account: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'account',
    order: -100,
    locale: NS,
  }, AccountFooter))
}
