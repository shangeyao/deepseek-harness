# 发布到 GitHub Packages

GitHub Packages 要求 npm 包的 **scope 必须与 GitHub 用户名/组织一致**。你的账号是 `shangeyao`，因此 CALB 自有包使用 `@shangeyao/*`。

## 限制说明

| 包 | 能否发布到 shangeyao 的 GitHub Packages |
|---|---|
| `@shangeyao/dsh-client-ui-account` | ✅ 可以 |
| `@deepseek-ai/dsh` 及全部 221 个 dsh 族包 | ❌ 不行（scope 属于 `deepseek-ai` 组织） |
| `@calb/*` | ❌ 不行（需 GitHub 上存在 `calb` 组织） |

整套 Harness 若要进 GitHub Packages，需要：

- 在 GitHub 创建与 scope 匹配的组织并重命名全部包，或
- 改用 [Verdaccio](https://verdaccio.org/) / 公司 Nexus 等允许自定义 scope 的私服，或
- 使用 [npmjs.com](https://www.npmjs.com/) 公开发布（upstream 已发 `@deepseek-ai/*`）

## 方式一：GitHub Actions（推荐）

1. 将代码推送到 `shangeyao/CALB-AIStudio` 的 `main` 分支
2. 打开 **Actions → Publish CALB Packages → Run workflow**
3. 选择 `dsh-client-ui-account` 并点击 **Run workflow**

推送或 PR 若改动了 `deploy/client-ui-account/`，会自动跑 **Validate** 任务（只构建不上传）；只有手动 dispatch 才会发布。

成功后包地址：

```text
https://github.com/shangeyao/CALB-AIStudio/pkgs/npm/dsh-client-ui-account
```

## 方式二：本地发布

1. 授权 packages 权限（需在本机终端交互执行一次）：

```bash
gh auth refresh -h github.com -s write:packages,read:packages
```

2. 构建并发布：

```bash
pnpm --filter @shangeyao/dsh-client-ui-account run bundle
cd deploy/client-ui-account
NODE_AUTH_TOKEN=$(gh auth token) npm publish \
  --registry=https://npm.pkg.github.com \
  --//npm.pkg.github.com/:_authToken="$(gh auth token)"
```

## 安装已发布的包

在项目或用户 `~/.npmrc` 中：

```ini
@shangeyao:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

```bash
npm install @shangeyao/dsh-client-ui-account
```

`dsh` 主程序仍从源码构建或通过 upstream 的 `@deepseek-ai/dsh` 安装；LDAP 部署层通过 `deploy/profiles/ldap-web.patch.yml` 引用 `@shangeyao/dsh-client-ui-account`。
