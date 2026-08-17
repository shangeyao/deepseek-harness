/** `account` namespace：侧边栏账户区文案（中文-only 产品）。 */

export const NS = 'account'

export type AccountKey = 'logout' | 'loggingOut'

export const zh = {
  logout: '退出登录',
  loggingOut: '退出中…',
} as const satisfies Record<AccountKey, string>

export const en = {
  logout: 'Sign out',
  loggingOut: 'Signing out…',
} as const satisfies Record<AccountKey, string>
