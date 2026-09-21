# @shangeyao/dsh-calb-plugin

CALB 多租户 DeepSeek Harness 扩展：**一个包**包含 LDAP 登录网关与租户对齐的 WeKnora 检索。

**兼容 dsh `0.1.6-alpha.1` 及以上**（Node `^22.19 || >=24`）。启用全局模型策略时，请勿在网关 shell 中 export `DEEPSEEK_*` 或 `*_API_KEY`，密钥由超级管理员在 Models 页统一配置。

## 组成

| 部分 | 路径 | 作用 |
|---|---|---|
| LDAP 网关 | `gateway/` | 登录页、JWT 会话、每用户 `DSH_HOME` + dsh 进程池、反代 |
| WeKnora 插件 | `weknora/` | 租户 = LDAP 登录用户（`DSH_TENANT_ID`），API Key 由网关统一注入 |
| Cordis patch | `cordis.patch.yml` | web-runtime 调整 + 挂载 WeKnora |

用户**不需要**在 profile 或 UI 里配置 WeKnora API Key；管理员仅在网关环境变量中设置 `WEKNORA_API_KEY` 与 `WEKNORA_BASE_URL`。

## 快速启动（本机开发）

```bash
cd deploy/dsh-calb-plugin
npm install
npm run build

export DSH_BIN=/path/to/deepseek-harness/apps/cli/lib/bin.js
export DSH_CALB_PLUGIN_ROOT="$(pwd)"
export GATEWAY_HOST=127.0.0.1
export WEKNORA_API_KEY=sk-...
export WEKNORA_BASE_URL=http://your-weknora-host/api/v1
export DEV_ALLOW_LOCAL_LOGIN=true
export JWT_SECRET=dev-secret
npm start
```

浏览器打开 **http://127.0.0.1:8080/login**（默认开发账号 `admin` / `admin`）。请统一使用 `127.0.0.1`，不要与 `localhost` 混用。

## 局域网部署

网关对外监听，各用户的 dsh 子进程仍只绑定 `127.0.0.1`（经网关反代，不直接暴露到局域网）。

```bash
cd deploy/dsh-calb-plugin
npm install && npm run build

export DSH_BIN=/path/to/deepseek-harness/apps/cli/lib/bin.js
export DSH_CALB_PLUGIN_ROOT="$(pwd)"
export DSH_DATA_ROOT=/var/lib/calb-dsh
export GATEWAY_HOST=0.0.0.0
export GATEWAY_PORT=8080
export JWT_SECRET=请替换为强随机密钥
export LDAP_ENABLED=true
# … LDAP_* 见 .env.example
export WEKNORA_API_KEY=sk-...
export WEKNORA_BASE_URL=http://your-weknora-host/api/v1
# 可选：内网 DNS 名称
# export CALB_TRUSTED_HOSTS=calb-ai.local
npm start
```

启动后会打印可访问的登录地址，例如 `http://192.168.1.100:8080/login`。局域网内其他设备用**同一主机名或 IP** 访问，不要在不同机器之间混用 `127.0.0.1` 与 `localhost`。

生产环境请关闭 `DEV_ALLOW_LOCAL_LOGIN`，并确保防火墙仅允许内网访问 `GATEWAY_PORT`。

## 企业能力（LDAP 组 / 组织租户 / WeKnora KB）

- **LDAP 组 → 角色**：`CALB_LDAP_SUPER_ADMIN_GROUPS`、`CALB_LDAP_ADMIN_GROUPS`、`CALB_LDAP_READONLY_GROUPS`（与 `CALB_SUPER_ADMIN_EMAIL` 并集生效）
- **组织租户**：从 LDAP `department`（或 `CALB_ORG_ID_ATTRIBUTE`）解析 `orgId`，同部门用户共享 `DSH_TENANT_ID`（WeKnora 检索边界）；每用户 `DSH_HOME` 仍独立
- **WeKnora KB 映射**：`CALB_WEKNORA_KB_MAP`（按部门）、`CALB_WEKNORA_KB_GROUP_MAP`（按 LDAP 组，优先）
- **账号菜单**：展示部门/角色，「平台信息」只读面板；只读用户不可打开设置

详见 [`.env.example`](.env.example)。

## 超级管理员（全局模型配置）

设置 `CALB_SUPER_ADMIN_EMAIL` 为平台管理员的登录邮箱（LDAP 的 `mail` 或开发模式下的 `admin@local`）：

```bash
export CALB_SUPER_ADMIN_EMAIL=admin@company.com
```

- **仅该邮箱**登录的用户可以在「设置 → 模型」中修改 Provider、API Key、默认模型等。
- 保存后会写入 `$DSH_DATA_ROOT/shared/models/`，并同步到所有普通用户。
- 其他用户 Models 页为只读，自动使用管理员配置的模型。

开发模式示例（本地 admin 账号邮箱为 `admin@local`）：

```bash
export CALB_SUPER_ADMIN_EMAIL=admin@local
export DEV_ALLOW_LOCAL_LOGIN=true
```

## 安装到 dsh profile（可选）

```bash
dsh plugin --profile web add @shangeyao/dsh-calb-plugin
```

生产环境通过 **calb-gateway** 反代时，网关会自动生成 `cordis.runtime.patch.yml`（含 WeKnora 绝对路径与 LAN `trustedHosts`），并为每个用户注入 `DSH_TENANT_ID`。
