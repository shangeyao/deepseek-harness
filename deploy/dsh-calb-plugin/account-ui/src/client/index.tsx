/**
 * CALB account menu browser half: account pill at the sidebar foot with settings and logout actions.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { AccountFooter } from './AccountFooter'
import { startPolicyUi } from './PolicyUi'
import { en, zh } from './locales'
import { ACCOUNT_UI_STYLE } from './styles'

export const inject = ['slots', 'locale'] as const

interface FooterOwnerProps {
  wide: boolean
}

interface FooterComponentProps extends FooterOwnerProps {
  t: (key: string) => string
}

const NS = 'calb-account'

/**
 * Register the CALB account footer when the gateway session is active.
 * @param ctx - client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  if ((globalThis as { __CALB_ACCOUNT_UI__?: boolean }).__CALB_ACCOUNT_UI__ !== true) return

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-calb-account-ui: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.calbAccountUiStyles = ''
    style.textContent = ACCOUNT_UI_STYLE
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-calb-account-ui: styles')
  ctx.effect(() => startPolicyUi(), 'dsh-calb-account-ui: policy-ui')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'calb-account',
    order: -100,
    locale: NS,
  }, (props: FooterComponentProps) => (
    <AccountFooter wide={props.wide} t={props.t} />
  )))
}
