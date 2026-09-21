export const ACCOUNT_UI_STYLE = `
.calb-account-root { position: relative; width: 100%; }
.calb-account-pill {
  display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0;
  height: 42px; padding: 0 10px 0 8px; box-sizing: border-box; border: none;
  border-radius: 12px; background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 14px; line-height: 22px; cursor: pointer;
}
.calb-account-pill:hover { background: var(--dsw-alias-interactive-bg-hover); }
.calb-account-pill.is-rail {
  width: 36px; height: 36px; justify-content: center; padding: 0; margin: 8px 0 10px;
}
.calb-account-avatar {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px;
  background: linear-gradient(135deg, #4176e6, #2f5fbf); color: #fff;
  font-size: 13px; font-weight: 600; line-height: 1;
}
.calb-account-identity { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.calb-account-name, .calb-account-email {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.calb-account-name { font-weight: 600; }
.calb-account-email {
  font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary);
}
.calb-account-menu {
  position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 20; min-width: 220px;
  padding: 8px; border: 1px solid var(--dsw-alias-border-primary); border-radius: 16px;
  background: var(--dsw-alias-bg-layer-2); box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
}
.calb-account-menu-header {
  padding: 8px 10px 10px; border-bottom: 1px solid var(--dsw-alias-border-primary); margin-bottom: 4px;
}
.calb-account-menu-name { font-size: 14px; font-weight: 600; line-height: 20px; }
.calb-account-menu-email, .calb-account-menu-meta {
  margin-top: 2px; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.calb-platform-info {
  margin: 0 4px 4px; padding: 8px 10px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); font-size: 12px; line-height: 18px;
}
.calb-platform-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
.calb-platform-label { color: var(--dsw-alias-label-secondary); flex: none; }
.calb-platform-value { min-width: 0; text-align: right; word-break: break-all; }
.calb-platform-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.calb-account-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 0 10px;
  box-sizing: border-box; border: none; border-radius: 10px; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 20px;
  text-align: left; cursor: pointer;
}
.calb-account-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.calb-account-menu-item.is-danger { color: #dc2626; }
.calb-account-backdrop { position: fixed; inset: 0; z-index: 10; }
`
