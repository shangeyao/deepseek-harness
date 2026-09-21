const HIDDEN_SECTION_LABELS = new Set(['插件', 'Plugins', 'Plugin list', '插件列表'])

/** Hide advanced settings nav entries for non-admin CALB roles. */
function patchSettingsNav(): void {
  const role = document.documentElement.dataset.calbRole
  if (role !== 'user' && role !== 'readonly') return

  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
  if (dialog === null) return

  const buttons = dialog.querySelectorAll('nav button')
  for (const button of buttons) {
    const label = button.textContent?.trim() ?? ''
    if (HIDDEN_SECTION_LABELS.has(label)) {
      button.setAttribute('hidden', 'hidden')
    }
  }
}

/**
 * Observe settings dialog mounts and hide plugin inventory for standard users.
 */
export function startPolicyUi(): () => void {
  const role = document.documentElement.dataset.calbRole
  if (role !== 'user' && role !== 'readonly') return () => {}

  const observer = new MutationObserver(() => { patchSettingsNav() })
  observer.observe(document.body, { childList: true, subtree: true })
  patchSettingsNav()
  return () => { observer.disconnect() }
}
