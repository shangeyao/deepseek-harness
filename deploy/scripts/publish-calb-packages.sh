#!/usr/bin/env bash
# 本地发布 CALB 三件套（Actions Billing 不可用时的替代方案）。
# 前置：gh auth refresh -h github.com -s write:packages,read:packages
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PACKAGE="${1:-all}"
export CALB_PUBLISH_VERSION="${CALB_PUBLISH_VERSION:-0.1.1}"
export NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$(gh auth token)}"

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "error: gh 未登录，请先 gh auth login" >&2
  exit 1
fi

echo "Publishing CALB packages @${CALB_PUBLISH_VERSION} (package=${PACKAGE})"

cd "$ROOT"
pnpm install --frozen-lockfile
pnpm run build

publish_account() {
  pnpm --filter @shangeyao/dsh-client-ui-account run bundle
  (cd deploy/client-ui-account && npm publish)
}

publish_gateway() {
  pnpm --filter @shangeyao/calb-ldap-gateway run build
  (cd deploy/ldap-gateway && npm publish)
}

publish_dsh() {
  publish_account
  local tarball
  tarball="$(node deploy/scripts/prepare-calb-dsh-publish.mjs)"
  npm publish "$tarball"
}

case "$PACKAGE" in
  all)
    publish_account
    publish_gateway
    publish_dsh
    ;;
  dsh-client-ui-account) publish_account ;;
  calb-ldap-gateway) publish_gateway ;;
  dsh) publish_dsh ;;
  *)
    echo "usage: $0 [all|dsh-client-ui-account|calb-ldap-gateway|dsh]" >&2
    exit 2
    ;;
esac

echo "Done. Install: npm install -g @shangeyao/dsh @shangeyao/calb-ldap-gateway"
