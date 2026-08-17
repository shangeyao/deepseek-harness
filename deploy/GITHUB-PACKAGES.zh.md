# 发布到 GitHub Packages

GitHub Packages 要求 npm 包的 **scope 必须与 GitHub 用户名/组织一致**。你的账号是 `shangeyao`，因此 CALB 自有包使用 `@shangeyao/*`。

## 可发布的 CALB 三件套

| 包 | 命令 | 说明 |
|---|---|---|
| `@shangeyao/dsh-client-ui-account` | — | LDAP 账户侧边栏插件 |
| `@shangeyao/calb-ldap-gateway` | `calb-gateway` | LDAP 多用户网关 |
| `@shangeyao/dsh` | `dsh` | CALB 定制 CLI（依赖 npmjs 上的 `@deepseek-ai/*` + 上述插件） |

`@deepseek-ai/*` 运行时依赖从 [npmjs 公共仓库](https://www.npmjs.com/org/deepseek-ai) 自动安装，无需发布到 GitHub Packages。

## 限制说明

| 包 | 能否发布到 shangeyao 的 GitHub Packages |
|---|---|
| `@shangeyao/*`（CALB 三件套） | ✅ 可以 |
| `@deepseek-ai/dsh` 及全部 221 个 dsh 族包 | ❌ 不行（scope 属于 `deepseek-ai` 组织） |

## 方式一：GitHub Actions（推荐）

1. 确保 GitHub 账户 **Billing** 可用（Actions 需计费额度）
2. 打开 **Actions → Publish CALB Packages → Run workflow**
3. 选择 `all` 并点击 **Run workflow**

推送或 PR 若改动了 `deploy/**` 或 `apps/cli/package.json`，会自动跑 **Validate**（只构建不上传）；只有手动 dispatch 才会发布。

成功后安装说明见 **[INSTALL.zh.md](./INSTALL.zh.md)**。

## 方式二：本地发布

1. 授权 packages 权限：

```bash
gh auth refresh -h github.com -s write:packages,read:packages
```

2. 构建并依次发布：

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm --filter @shangeyao/dsh-client-ui-account run bundle
pnpm --filter @shangeyao/calb-ldap-gateway run build

export NODE_AUTH_TOKEN=$(gh auth token)

cd deploy/client-ui-account && npm publish --access restricted
cd ../ldap-gateway && npm publish --access restricted
cd ../.. && npm publish "$(node deploy/scripts/prepare-calb-dsh-publish.mjs)" --access restricted
```

## 安装（任意机器）

详见 **[INSTALL.zh.md](./INSTALL.zh.md)**。简要步骤：

```bash
# ~/.npmrc 配置 @shangeyao → GitHub Packages
npm install -g @shangeyao/dsh @shangeyao/calb-ldap-gateway

export JWT_SECRET=随机长密钥
export DSH_DATA_ROOT=$HOME/.calb-dsh-data
calb-gateway
```

浏览器访问 `http://<服务器IP>:8080/login`。
