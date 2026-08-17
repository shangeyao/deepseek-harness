/** 侧边栏底部：当前登录用户信息与退出登录。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  fetchAuthPrincipal, logoutAndRedirect, principalInitial, type AuthPrincipal,
} from './auth.ts'
import type { AccountKey } from './locales.ts'
import css from './AccountFooter.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    account: AccountKey
  }
}

/** 侧边栏 footer.action 槽位 props。 */
export type AccountFooterProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'account'>

/**
 * 渲染账户行；非 LDAP 网关环境（无 /auth/status）时不占位。
 * @param props - 槽位运行时 props。
 * @returns 账户 UI 或 null。
 */
export function AccountFooter({ wide, t }: AccountFooterProps) {
  const [user, setUser] = useState<AuthPrincipal | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAuthPrincipal().then((principal) => {
      if (!cancelled) setUser(principal)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const logout = useCallback(async () => {
    if (loggingOut) return
    setLoggingOut(true)
    await logoutAndRedirect()
  }, [loggingOut])

  if (user === null) return null

  const initial = principalInitial(user.displayName)
  const subtitle = user.email.includes('@') ? user.email : user.username

  if (!wide) {
    return (
      <div className={css.railWrap} ref={wrapRef}>
        <Tooltip label={user.displayName} side="right" delayMs={400}>
          <button
            type="button"
            className={css.railButton}
            data-open={menuOpen ? '' : undefined}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={user.displayName}
            onClick={() => { setMenuOpen(open => !open) }}
          >
            <span className={css.railAvatar}>{initial}</span>
          </button>
        </Tooltip>
        {menuOpen && (
          <div className={css.menu} role="menu">
            <div className={css.menuHead}>
              <div className={css.menuName}>{user.displayName}</div>
              <div className={css.menuSub}>{subtitle}</div>
            </div>
            <button
              type="button"
              className={css.menuLogout}
              role="menuitem"
              disabled={loggingOut}
              onClick={() => { void logout() }}
            >
              {loggingOut ? t('loggingOut') : t('logout')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={clsx(css.row)}>
      <span className={css.avatar} aria-hidden>{initial}</span>
      <div className={css.meta}>
        <div className={css.name} title={user.displayName}>{user.displayName}</div>
        <div className={css.sub} title={subtitle}>{subtitle}</div>
      </div>
      <button
        type="button"
        className={css.logout}
        disabled={loggingOut}
        onClick={() => { void logout() }}
      >
        {loggingOut ? t('loggingOut') : t('logout')}
      </button>
    </div>
  )
}
