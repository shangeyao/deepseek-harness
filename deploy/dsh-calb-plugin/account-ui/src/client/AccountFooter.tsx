import { useCallback, useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconSettingsOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

type CalbRole = 'super_admin' | 'admin' | 'user' | 'readonly'

interface CalbUser {
  displayName: string
  email: string
  username: string
  role: CalbRole
  department: string
  orgId: string
  tenantId: string
  knowledgeBaseIds: string[]
  modelPolicyEnabled: boolean
}

interface AccountFooterProps {
  wide: boolean
  t: (key: string) => string
}

function readBootUser(): CalbUser | undefined {
  const boot = (globalThis as { __CALB_USER__?: Partial<CalbUser> }).__CALB_USER__
  if (boot === undefined) return undefined
  if (boot.displayName === '' && boot.email === '' && boot.username === '') return undefined
  return {
    displayName: boot.displayName?.trim() || boot.username?.trim() || '',
    email: boot.email?.trim() || '',
    username: boot.username?.trim() || '',
    role: (boot.role as CalbRole | undefined) ?? 'user',
    department: boot.department?.trim() || '',
    orgId: boot.orgId?.trim() || '',
    tenantId: boot.tenantId?.trim() || '',
    knowledgeBaseIds: boot.knowledgeBaseIds ?? [],
    modelPolicyEnabled: boot.modelPolicyEnabled === true,
  }
}

function avatarLetter(user: CalbUser, fallback: string): string {
  const source = user.displayName || user.username || user.email || fallback
  const trimmed = source.trim()
  if (trimmed === '') return '?'
  return trimmed.charAt(0).toUpperCase()
}

function roleLabel(role: CalbRole, t: (key: string) => string): string {
  if (role === 'super_admin') return t('role.super_admin')
  if (role === 'admin') return t('role.admin')
  if (role === 'readonly') return t('role.readonly')
  return t('role.user')
}

function openSettingsDialog(): void {
  requestAnimationFrame(() => {
    const trigger = document.querySelector(
      '[data-slot="sidebar.settings"] button[aria-haspopup="dialog"]',
    )
    if (!(trigger instanceof HTMLButtonElement)) return
    trigger.click()
  })
}

function PlatformInfoPanel({ user, t }: { user: CalbUser; t: (key: string) => string }) {
  return (
    <div className="calb-platform-info" role="group" aria-label={t('menu.platformInfo')}>
      <div className="calb-platform-row">
        <span className="calb-platform-label">{t('platform.role')}</span>
        <span className="calb-platform-value">{roleLabel(user.role, t)}</span>
      </div>
      {user.department !== '' && (
        <div className="calb-platform-row">
          <span className="calb-platform-label">{t('platform.department')}</span>
          <span className="calb-platform-value">{user.department}</span>
        </div>
      )}
      {user.orgId !== '' && (
        <div className="calb-platform-row">
          <span className="calb-platform-label">{t('platform.orgId')}</span>
          <span className="calb-platform-value">{user.orgId}</span>
        </div>
      )}
      {user.tenantId !== '' && (
        <div className="calb-platform-row">
          <span className="calb-platform-label">{t('platform.tenantId')}</span>
          <span className="calb-platform-value calb-platform-mono">{user.tenantId}</span>
        </div>
      )}
      <div className="calb-platform-row">
        <span className="calb-platform-label">{t('platform.knowledgeBases')}</span>
        <span className="calb-platform-value">
          {user.knowledgeBaseIds.length > 0 ? user.knowledgeBaseIds.join(', ') : t('platform.kbNone')}
        </span>
      </div>
      <div className="calb-platform-row">
        <span className="calb-platform-label">{t('platform.modelPolicy')}</span>
        <span className="calb-platform-value">
          {user.modelPolicyEnabled ? t('platform.modelPolicyOn') : t('platform.modelPolicyOff')}
        </span>
      </div>
    </div>
  )
}

/**
 * CALB account pill and menu at the sidebar foot; settings opens the existing settings dialog.
 * @param props.wide - sidebar column width mode.
 * @param props.t - locale dictionary seat.
 * @returns the account footer control.
 */
export function AccountFooter({ wide, t }: AccountFooterProps) {
  const [user, setUser] = useState<CalbUser | undefined>(() => readBootUser())
  const [open, setOpen] = useState(false)
  const [showPlatformInfo, setShowPlatformInfo] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  useEffect(() => {
    if (user !== undefined) return
    let cancelled = false
    void fetch('/auth/status', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return undefined
        const payload = await response.json() as {
          authenticated?: boolean
          displayName?: string
          email?: string
          username?: string
          role?: CalbRole
          department?: string
          orgId?: string
          tenantId?: string
          knowledgeBaseIds?: string[]
        }
        if (payload.authenticated !== true) return undefined
        return {
          displayName: payload.displayName?.trim() || payload.username?.trim() || '',
          email: payload.email?.trim() || '',
          username: payload.username?.trim() || '',
          role: payload.role ?? 'user',
          department: payload.department?.trim() || '',
          orgId: payload.orgId?.trim() || '',
          tenantId: payload.tenantId?.trim() || '',
          knowledgeBaseIds: payload.knowledgeBaseIds ?? [],
          modelPolicyEnabled: false,
        } satisfies CalbUser
      })
      .then((resolved) => {
        if (!cancelled && resolved !== undefined) setUser(resolved)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => { document.removeEventListener('mousedown', onPointerDown) }
  }, [open])

  const resolved = user ?? {
    displayName: t('account.fallback'),
    email: '',
    username: '',
    role: 'user' as const,
    department: '',
    orgId: '',
    tenantId: '',
    knowledgeBaseIds: [],
    modelPolicyEnabled: false,
  }

  const subtitle = [resolved.department, roleLabel(resolved.role, t)].filter(Boolean).join(' · ')
  const canOpenSettings = resolved.role !== 'readonly'

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } finally {
      window.location.assign('/login')
    }
  }, [])

  return (
    <div className="calb-account-root" ref={rootRef}>
      <button
        type="button"
        className={clsx('calb-account-pill', !wide && 'is-rail')}
        aria-label={t('account.openMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className="calb-account-avatar" aria-hidden="true">{avatarLetter(resolved, t('account.fallback'))}</span>
        {wide && (
          <span className="calb-account-identity">
            <span className="calb-account-name">{resolved.displayName}</span>
            {subtitle !== '' && <span className="calb-account-email">{subtitle}</span>}
            {subtitle === '' && resolved.email !== '' && <span className="calb-account-email">{resolved.email}</span>}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="calb-account-backdrop" aria-hidden="true" onClick={() => { setOpen(false) }} />
          <div className="calb-account-menu" id={menuId} role="menu">
            <div className="calb-account-menu-header">
              <div className="calb-account-menu-name">{resolved.displayName}</div>
              {resolved.email !== '' && <div className="calb-account-menu-email">{resolved.email}</div>}
              {subtitle !== '' && <div className="calb-account-menu-meta">{subtitle}</div>}
            </div>
            <button
              type="button"
              className="calb-account-menu-item"
              role="menuitem"
              aria-expanded={showPlatformInfo}
              onClick={() => { setShowPlatformInfo(value => !value) }}
            >
              <span>{t('menu.platformInfo')}</span>
            </button>
            {showPlatformInfo && <PlatformInfoPanel user={resolved} t={t} />}
            {canOpenSettings && (
              <button
                type="button"
                className="calb-account-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  openSettingsDialog()
                }}
              >
                <IconSettingsOutline16 size={16} />
                <span>{t('menu.settings')}</span>
              </button>
            )}
            <button
              type="button"
              className={clsx('calb-account-menu-item', 'is-danger')}
              role="menuitem"
              disabled={loggingOut}
              onClick={() => { void handleLogout() }}
            >
              <span>{loggingOut ? t('menu.logoutPending') : t('menu.logout')}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
