/**
 * CALB account UI host half: expose the logged-in gateway user to the browser boot payload.
 */

interface WebServerContext {
  on(event: 'webserver/index-inject', listener: (table: unknown[]) => void): void
}

interface HarnessContext {
  inject(deps: readonly string[], fn: (ctx: WebServerContext) => void): void
}

export const name = 'dsh-calb-account-ui'

export const inject = ['webServer'] as const

const HIDE_SETTINGS_FOOT_CSS = `
/* Hide only the sidebar-foot trigger row; keep the fixed overlay dialog visible. */
html[data-calb-account-ui] [data-slot="sidebar.settings"] > div:first-of-type {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
`

function envList(name: string): string[] {
  const raw = process.env[name]?.trim()
  if (raw === undefined || raw === '') return []
  return raw.split(',').map(entry => entry.trim()).filter(Boolean)
}

/**
 * Inject CALB user boot facts and sidebar layout overrides for the account menu.
 * @param ctx - Cordis host context.
 */
export function apply(ctx: HarnessContext): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.on('webserver/index-inject', (table: unknown[]) => {
      const displayName = process.env.CALB_USER_DISPLAY_NAME?.trim()
        || process.env.CALB_USER_USERNAME?.trim()
        || process.env.CALB_USER_EMAIL?.trim()
        || ''
      const email = process.env.CALB_USER_EMAIL?.trim() || ''
      const username = process.env.CALB_USER_USERNAME?.trim() || ''
      if (displayName === '' && email === '' && username === '') return

      const role = process.env.CALB_USER_ROLE?.trim() || 'user'
      const department = process.env.CALB_USER_DEPARTMENT?.trim() || ''
      const orgId = process.env.CALB_USER_ORG_ID?.trim() || ''
      const tenantId = process.env.DSH_TENANT_ID?.trim() || ''
      const knowledgeBaseIds = envList('WEKNORA_KNOWLEDGE_BASE_IDS')
      const modelPolicyEnabled = process.env.CALB_MODEL_POLICY_ENABLED?.trim() === 'true'

      table.push({
        kind: 'global',
        name: '__CALB_USER__',
        value: {
          displayName,
          email,
          username,
          role,
          department,
          orgId,
          tenantId,
          knowledgeBaseIds,
          modelPolicyEnabled,
        },
      })
      table.push({ kind: 'global', name: '__CALB_ACCOUNT_UI__', value: true })
      table.push({
        kind: 'html',
        placement: 'head',
        html: `<style data-calb-account-ui>${HIDE_SETTINGS_FOOT_CSS}</style>`,
      })
      table.push({
        kind: 'html',
        placement: 'body',
        html: `<script>document.documentElement.dataset.calbAccountUi="";document.documentElement.dataset.calbRole=${JSON.stringify(role)}</script>`,
      })
    })
  })
}
