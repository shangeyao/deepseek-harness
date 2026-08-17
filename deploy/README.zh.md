# CALB DeepSeek Harness — LDAP 多用户部署

> 完整项目功能与架构梳理见 [docs/CALB-PROJECT.zh.md](../docs/CALB-PROJECT.zh.md)

本目录提供 **LDAP 认证网关**，在 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 之上实现：

- 企业 LDAP 登录
- **每位用户独立 `DSH_HOME`**（会话、设置、目标、存储域互不共享）
- **每位用户独立 workspace 目录**（文件工作区隔离）
- 按需为活跃用户启动独立 `dsh web` 子进程，空闲后自动回收

## 架构

```text
浏览器 -> LDAP Gateway (:8080)
              |-- /login, /auth/*  认证
              |-- /*               反代到 127.0.0.1:<user-port>
                    └── dsh web (DSH_HOME=.../users/<id>/.dsh)
```

Harness 原生 Web 服务不含认证层；网关负责登录与会话 Cookie，并将已认证流量代理到对应用户的本地 Harness 实例。

## 前置条件

**任意机器 npm 安装（推荐）**：见 [INSTALL.zh.md](./INSTALL.zh.md)，无需克隆仓库。

**从源码运行**（开发调试）：

1. 已在仓库根目录完成 Harness 构建（含 LDAP 账户侧边栏插件）：

```bash
pnpm install
pnpm run build
pnpm --filter @shangeyao/dsh-client-ui-account run bundle
pnpm link --global   # 或确保 PATH 中有 dsh
```

2. Node.js `^22.19` 或 `>=24`

## 快速开始（开发）

```bash
cd deploy/ldap-gateway
pnpm install

# 未配置 LDAP 时使用本地账号 admin/admin
export DSH_DATA_ROOT=$HOME/.calb-dsh-data
export DEV_ALLOW_LOCAL_LOGIN=true
export JWT_SECRET=dev-secret

pnpm start
```

打开 `http://127.0.0.1:8080/login`，登录后进入 Harness Web UI。

## 生产 LDAP 配置

复制 `deploy/.env.example` 为 `deploy/.env` 并填写 LDAP 参数，然后：

```bash
set -a && source ../.env && set +a
pnpm start
```

必填项：

| 变量 | 说明 |
|------|------|
| `LDAP_ENABLED` | `true` |
| `LDAP_SERVER_URI` | 如 `ldap://ldap.company.com:389` |
| `LDAP_BASE_DN` | 如 `dc=company,dc=com` |
| `JWT_SECRET` | 随机强密钥 |
| `DSH_DATA_ROOT` | 用户数据持久化根目录 |

可选：`LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` 用于先搜索用户再 bind 验证。

## 用户数据布局

```text
$DSH_DATA_ROOT/
  users/
    <userId>/
      workspace/          # dsh 进程 cwd，用户文件工作区
      .dsh/               # DSH_HOME：sessions、settings、storages、goals
        AGENTS.md         # 用户级说明（首次登录创建）
        profiles/web/     # 用户级 cordis 覆盖
```

`userId` 由用户名稳定哈希生成，同一 LDAP 账号始终映射到同一目录。

## 与 upstream 同步

```bash
git fetch upstream
git rebase upstream/master
pnpm install && pnpm run build
```

当前仓库已基于 `deepseek-ai/deepseek-harness` 最新 `master`。

## 远程 / 局域网访问

**不要**对用户实例执行 `dsh web --host 0.0.0.0`（Harness CLI 会主动拒绝，且缺少认证层）。

正确做法：只让 **LDAP 网关** 监听 `0.0.0.0`（默认 `GATEWAY_HOST=0.0.0.0`），每个用户的 `dsh web` 仍绑定 `127.0.0.1`，由网关反代 HTTP 与 WebSocket，并重写 `Host`/`Origin` 以满足 Harness 信任边界。

```bash
export GATEWAY_HOST=0.0.0.0
export GATEWAY_PORT=8080
pnpm start
```

从其他机器访问 `http://<服务器IP>:8080/login` 即可；SSH 端口转发到本机 `127.0.0.1:8080` 同样适用。

修改网关或 patch 后，请**退出并重新登录**，以便 spawn 新的 `dsh web` 子进程（目录选择器需 browse 模式）。

## 注意事项

- 网关对外暴露时应置于 TLS 终止层（Nginx / 负载均衡）之后。
- 每个活跃用户占用一个 `dsh web` 进程；通过 `USER_IDLE_TIMEOUT_MS` 控制回收。
- Harness 的 `/api` 信任边界仍由 loopback 代理保证；请勿将用户实例直接暴露到公网。
