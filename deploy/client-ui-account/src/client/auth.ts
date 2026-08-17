/** 网关 `/auth/*` 会话信息（与 deploy/ldap-gateway 对齐）。 */

export interface AuthPrincipal {
  username: string
  email: string
  displayName: string
}

interface AuthStatusResponse {
  authenticated: boolean
  username?: string
  email?: string
  displayName?: string
}

/** 读取当前登录用户；非网关环境或未登录时返回 null。 */
export async function fetchAuthPrincipal(): Promise<AuthPrincipal | null> {
  try {
    const response = await fetch('/auth/status', { credentials: 'same-origin' })
    if (!response.ok) return null
    const body = await response.json() as AuthStatusResponse
    if (!body.authenticated || body.username === undefined) return null
    return {
      username: body.username,
      email: body.email ?? `${body.username}@local`,
      displayName: body.displayName ?? body.username,
    }
  } catch {
    return null
  }
}

/** 清除网关会话并跳转到登录页。 */
export async function logoutAndRedirect(): Promise<void> {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {
    // 仍跳转登录页，避免卡在半登出状态。
  }
  window.location.assign('/login')
}

/** 显示名首字，用作头像占位。 */
export function principalInitial(displayName: string): string {
  const trimmed = displayName.trim()
  if (trimmed === '') return '?'
  return trimmed.slice(0, 1).toUpperCase()
}
