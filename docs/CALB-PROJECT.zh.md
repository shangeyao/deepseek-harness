# CALB AIHub / DeepSeek Harness 项目梳理

本文档面向需要理解本仓库**整体功能、架构设计与部署方式**的开发者与运维人员。本仓库基于 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（下称 **Harness** / **dsh**），并在此基础上增加了 **LDAP 多用户部署层**。

更深入的框架细节请参阅官方文档：

- [架构总览](architecture.zh.md)
- [子系统参考](subsystems/README.zh.md)
- [LDAP 部署说明](../deploy/README.zh.md)

---

## 1. 项目定位

### 1.1 是什么

**DeepSeek Harness（`dsh`）** 是一个开源 **Agent Harness（智能体运行时框架）**，由 DeepSeek AI 维护。它不是一个固定的聊天机器人，而是一套可组装的 **插件化智能体平台**：

- 模型调用、工具执行、会话持久化、审批策略、Web UI 等，**每一部分都是可替换的 Cordis 插件**
- 通过 **Profile + Bundle + Patch** 在启动时组合出不同的运行形态（Web 工作台、Headless 一次性任务、ACP 自动化等）

### 1.2 本仓库的特殊性

| 维度 | 说明 |
|------|------|
| **Upstream** | `deepseek-ai/deepseek-harness`（`upstream/master`） |
| **Origin** | `shangeyao/CALB-AIStudio`（组织内 fork） |
| **CALB 增量** | `deploy/ldap-gateway/`：LDAP 登录 + 每用户独立进程与数据隔离 |
| **阶段** | Harness 处于开发者预览期，API 与磁盘格式可能破坏性变更 |

---

## 2. 总体架构

### 2.1 分层视图

```text
┌─────────────────────────────────────────────────────────────┐
│  用户界面层                                                  │
│  Web UI (apps/web) │ CLI/TUI │ ACP │ JSON-RPC SDK           │
├─────────────────────────────────────────────────────────────┤
│  CALB 部署层（本仓库增量）                                    │
│  LDAP Gateway → 反代 → 每用户 dsh web 子进程                  │
├─────────────────────────────────────────────────────────────┤
│  Host 传输层                                                 │
│  webserver / apiproxy / client-connection (HTTP + WebSocket)│
├─────────────────────────────────────────────────────────────┤
│  Agent 平面                                                  │
│  agent-loop │ tools │ system-prompt │ llm │ approval        │
├─────────────────────────────────────────────────────────────┤
│  数据平面                                                    │
│  session │ persistence │ workspace │ goal │ settings │ storage│
├─────────────────────────────────────────────────────────────┤
│  Cordis 插件运行时 + Typert RPC 网关                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Cordis：一切皆插件

Harness 构建在 [Cordis](https://github.com/cordiverse/cordis) 之上。核心思想：

- 每个插件向共享 `Context` 注册 **Service**、**Event**、**Effect**
- 没有「内核补丁」：扩展方式是**挂载新插件**，卸载时副作用自动撤销
- 配置通过 `cordis.yml` / `cordis.patch.yml` 声明要加载哪些插件及其 config

### 2.3 Profile、Bundle、Patch 组合模型

运行中的 `dsh` 是一棵**按序叠加**的插件树：

```text
空根
  → dsh-base 组合包 patch（模型、工具、持久化、设置…）
  → dsh-web-app / dsh-headless 组合包 patch（按 profile 选择）
  → $DSH_HOME/profiles/<name>/cordis.patch.yml（用户 profile 层）
  → $DSH_HOME/cordis.patch.yml（机器级 home 层）
  → --patch 指定的临时覆盖层
```

查看本机实际启动树：

```bash
dsh --profile web --dump-config
```

**Patch 规则**：按 `id` 定位插件行，**整行替换 config**（非 merge）；也可 `insert` 新行或 `disabled: true` 禁用。

### 2.4 Harness Home（`DSH_HOME`）

所有用户级数据默认落在 `~/.dsh`（或环境变量 `DSH_HOME`）：

| 路径 | 内容 |
|------|------|
| `settings.yaml` | 模型路由、插件配置（热加载） |
| `.credentials.yaml` | API Key 等凭据（仅引用，UI 不回显明文） |
| `sessions/` | JSONL 会话日志 |
| `storages/` | 领域 KV（如 workspace 注册表） |
| `profiles/` | 各 profile 的 patch 与 node_modules |
| `.agent-presets/` | 用户自定义 Agent 预设 |
| `AGENTS.md` | 用户/global 级 agent 说明 |

**CALB 多用户模式下**，每位 LDAP 用户拥有独立 `DSH_HOME`（见第 7 节）。

---

## 3. 核心运行机制

### 3.1 Agent 轮次（Turn / Step）

一次用户输入触发一个 **Turn（轮次）**，其中可包含多个 **Step（步骤）**：

```text
turn/start
  → 领取 inbox 消息，组装 system prompt + tool schemas
  → agent/pre-step（可改写或拒绝输入）
  → step/start
      → 追加 user/message 到会话日志
      → llm/stream → assistant/chunk* → assistant/message
      → tool/call* → 执行工具 → tool/result*
  → step/end
  → 若工具要求继续或又有新输入 → 下一步
turn/end
```

**设计原则：模型可见即已记录。** 凡进入模型上下文的内容必须能由会话日志重建；UI 回放、Fork、遥测均派生自该事件流。

### 3.2 能力接缝（Capability Seam）

可替换能力遵循三角色：

1. **Service Definition** — 接口声明
2. **Service Provider** — 具体实现（本地 FS、E2B 沙箱、HTTP 抓取…）
3. **Consumer** — 面向模型的工具或命令

例如切换 `fs` / `subprocess` provider 到远程沙箱时，Bash、PTY、LSP 会一并迁移，无需 fork 各工具。

### 3.3 Agent Preset（按会话组装的 Agent）

Web 模式下，**Host 平面**与 **Agent 平面**分离：

- Host 平面：会话列表、API 网关、goal 服务、subagent 注册表、jobs 注册表…（跨会话共享）
- Agent 平面：bash、fs、skill、subagent 工具等，由 **Agent Preset** 按会话挂载

每个新会话可选择不同 preset（如 `standard`、`code`、`minimal`），决定该会话可用的工具集与 prompt 片段。

---

## 4. 功能清单

### 4.1 面向用户的功能（Web UI）

| 功能 | 说明 | 相关子系统 |
|------|------|-----------|
| **多工作区** | 按目录组织会话；工作区 = 规范路径 + 会话成员关系 | [workspace](subsystems/workspace.zh.md) |
| **对话与流式输出** | 多轮对话、工具调用树、轨迹视图 | session, client-ui-* |
| **模型选择与配置** | 设置页配置 DeepSeek / 自定义 OpenAI 兼容端点 | settings, llm, credentials |
| **文件与终端工具** | 读写编辑文件、bash/pwsh、持久 PTY | fs, shell, terminal |
| **Skill 调用** | `/` 或 `@` 触发技能目录 | skill |
| **Subagent 委派** | 子 agent 并行/嵌套任务 | subagent |
| **Goal 模式** | 同会话持久目标，多轮驱动直至完成 | [goal](subsystems/goal.zh.md) |
| **Plan 模式** | 计划审查后退出 | plan |
| **Workflow / Ralph** |  durable 工作流与循环任务 | workflow |
| **权限与审批** | 工具执行前人工批准 | approval, permission-presets |
| **上下文压缩** | 长对话 token 压缩 | compaction |
| **会话搜索** | 标题/全文检索（可配置） | session-query |
| **消息反馈** | 点赞/点踩 + 备注 | feedback |
| **后台任务** | `run_in_background` 类任务管理 | jobs |
| **Web 搜索/抓取** | 模型可用的 web_search / web_fetch | web |
| **插件配置 UI** | 各插件 namespace 的可视化设置 | ui-settings-plugins |
| **Agent Preset 管理** | 选择/复制/编辑预设组合 | preset, ui-agent-preset |

### 4.2 面向开发者/自动化的功能

| 功能 | 入口 | 说明 |
|------|------|------|
| **Headless 一次性任务** | `dsh --profile headless "任务描述"` | 无 UI，跑完打印结果退出 |
| **ACP 服务器** | `dsh --profile acp-agent` 等 examples | Agent Client Protocol 自动化 |
| **JSON-RPC SDK** | `packages/sdk` | 进程外集成 |
| **Python SDK** | `python/` | 见 [Python SDK 指南](user/guide/python-sdk.zh.md) |
| **Cordis 自修改** | tool-cordis 等 | Agent 可 inspect/mount 自身插件（高权限） |
| **MCP 客户端** | dsh-mcp-client | 接入外部 MCP 记忆/工具服务 |
| **Hooks 桥接** | hooks 包 | Claude Code / Codex hook 协议 |

### 4.3 安全与隔离

| 机制 | 说明 |
|------|------|
| **Sandbox** | Landlock / bwrap / Seatbelt 等后端约束子进程 |
| **Approval** | 敏感工具需 UI 确认 |
| **Permission Presets** | 会话级工具策略预设 |
| **Browser Trust Fence** | `/api` 的 Host/Origin 校验，防 DNS rebinding（**不是认证**） |
| **Privileged API 锁定** | settings/credentials 等仅 loopback 同源可调用 |
| **LDAP Gateway（CALB）** | 企业登录 + 进程级数据隔离 |

---

## 5. Web 应用架构

### 5.1 前后端分离方式

Harness Web **不是**独立 SPA 直连后端，而是：

1. `dsh web` 启动 Node **Host 进程**（Cordis 插件树 + HTTP 服务器）
2. Host 通过 `frontend-static` 提供 `apps/web` 构建产物
3. 浏览器加载 `index.html`，由 Host 注入 `window.__DSH_BOOT__`（插件清单、API 基址等）
4. 浏览器端再启动 **Client 插件树**（UI 模块、connection、runtime）

```text
浏览器                    Host (Node)
  │                         │
  │  GET /                  │ frontend-static
  │  GET /plugins/.../client.js
  │                         │
  │  POST /api/session.*    │ client-connection → apiproxy
  │  WS  /api/events.*      │ WebSocket downlink
  └─────────────────────────┘
```

### 5.2 API 网关（ApiProxy）

`packages/host/apiproxy` 实现 transport-agnostic 的 RPC 面：

- 方法命名如 `session.create`、`workspace.list`、`goal.create`
- HTTP 载体：`POST /api/<method>` + JSON body
- 业务错误通常仍返回 HTTP 200 + RPC error envelope

完整方法列表见 `packages/host/apiproxy/src/api/`。

### 5.3 默认 Web 组合包要点

`packages/bundle/web-app/cordis.patch.yml` 在 base 之上：

- 启用 `workspace`、`storage-domain`、`session-projection-cache`
- 挂载完整 `client/ui-*` 插件 roster
- **禁用** base 层的 per-process 工具行，改由 **agent preset** 按会话挂载
- Host 平面保留：jobs 注册表、goal 服务、subagent 注册表、token meter…

---

## 6. 数据模型与「记忆」

Harness 没有单一名为「Memory」的内置模块；**用户级记忆**分散在以下持久化层：

| 层级 | 存储位置 | 内容 |
|------|----------|------|
| **会话日志** | `$DSH_HOME/sessions/*.jsonl` | 完整对话、工具调用、turn/step 事件 |
| **Goal** | 会话关联的领域存储 | 同会话持久目标与 round 状态 |
| **Settings** | `$DSH_HOME/settings.yaml` | 模型、插件偏好 |
| **Workspace 注册** | `$DSH_HOME/storages/` | 工作区与会话归属 |
| **Agent Preset / AGENTS.md** | preset 目录 + `$DSH_HOME/AGENTS.md` | 行为指令与组合 |
| **MCP Memory（可选）** | 外部 MCP 服务 | 如 engram、memorix（见 `examples/mcp-memory/`） |

**CALB 多用户隔离**：上述所有路径均在每用户独立 `DSH_HOME` 下，天然不共享。

---

## 7. CALB 扩展：LDAP 多用户部署

### 7.1 为什么需要网关

Harness 原生 Web **故意不含 TLS/认证**（见 `packages/host/webserver/README.md`）。面向企业内网多用户场景时，CALB 在之外增加 **LDAP Gateway**。

### 7.2 架构

```text
                    ┌──────────────────┐
  浏览器 ──────────►│ LDAP Gateway     │
  :8080             │ :8080            │
                    │  /login          │
                    │  /auth/*         │
                    └────────┬─────────┘
                             │ 已认证请求反代
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        dsh web :portA  dsh web :portB  …
        DSH_HOME=userA  DSH_HOME=userB
        cwd=workspaceA  cwd=workspaceB
```

### 7.3 核心组件（`deploy/ldap-gateway/`）

| 模块 | 文件 | 职责 |
|------|------|------|
| **config** | `src/config.ts` | 环境变量加载（LDAP、JWT、路径） |
| **ldap** | `src/ldap.ts` | ldapts 绑定认证，提取 email/displayName |
| **auth** | `src/auth.ts` | HMAC-JWT Cookie 会话 |
| **user-pool** | `src/user-pool.ts` | 按用户 spawn `dsh web`，管理端口与空闲回收 |
| **proxy** | `src/proxy.ts` | HTTP/WebSocket 反代到 127.0.0.1:<user-port> |
| **server** | `src/server.ts` | 路由：登录页、auth API、受保护反代 |

### 7.4 用户数据目录

```text
$DSH_DATA_ROOT/
  users/
    <userId>/              # sha256(username) 前 16 位
      workspace/           # agent cwd，用户项目文件
      .dsh/                # 完整 Harness home
        sessions/
        settings.yaml
        storages/
        AGENTS.md
        profiles/web/cordis.patch.yml
```

### 7.5 启动方式

```bash
# 1. 构建 Harness
pnpm install && pnpm run build

# 2. 启动网关（开发模式 admin/admin）
cd deploy/ldap-gateway
export DSH_DATA_ROOT=$HOME/.calb-dsh-data
export DSH_BIN=$PWD/bin/dsh    # 包装脚本指向 apps/cli/lib/bin.js
export DEV_ALLOW_LOCAL_LOGIN=true
export JWT_SECRET=dev-secret
pnpm start
```

生产配置见 [deploy/.env.example](../deploy/.env.example)。

---

## 8. 仓库目录结构

```text
CALB-AIHub/
├── apps/
│   ├── cli/                 # dsh 命令行入口、内置 agent-presets
│   └── web/                 # Web 前端 SPA（Vite + React）
├── packages/                # 全部 Cordis 插件（@deepseek-ai/dsh-*）
│   ├── core/                # session, agent, agent-loop, tools…
│   ├── bundle/              # dsh-base, dsh-web-app, dsh-headless
│   ├── host/                # webserver, apiproxy, frontend-static
│   ├── client/              # connection, runtime, ui-*
│   ├── llm/, fs/, shell/, subagent/, goal/, workspace/ …
│   └── ...
├── vendor/                  #  vendored Cordis / schemastery
├── examples/                # 可运行 cordis.yml 示例（acp, headless, mcp-memory…）
├── docs/                    # 架构与子系统文档（官方 + 本文档）
├── deploy/                  # ★ CALB 增量：LDAP 网关与部署 patch
│   ├── ldap-gateway/
│   ├── profiles/
│   └── README.zh.md
├── python/                  # Python SDK
├── native/                  # Landlock 等 native addon
├── scripts/                 # CI gate、代码生成
└── website/                 # VitePress 文档站
```

### 8.1 关键 packages 分组速查

| 分组 | 职责 |
|------|------|
| `core/` | Agent 循环主干 |
| `session/` + `session-query/` | 会话日志、检索 |
| `interaction/` | 审批、命令、ask-user |
| `preset/` | Agent 预设组合 |
| `api/` + `typert/` | 远程 RPC 类型图与网关 |
| `host/` + `client/` | Web 双端插件 |
| `bundle/` | 发行版组合包 patch |

完整分组表见 [packages/README.zh.md](../packages/README.zh.md)。

---

## 9. 运行形态对比

| 形态 | 命令 | 适用场景 |
|------|------|----------|
| **Web 单机** | `pnpm dsh web` | 本地开发，默认 `127.0.0.1:3080` |
| **Headless** | `dsh --profile headless "任务"` | CI、脚本、一次性问答 |
| **LDAP 多用户** | `deploy/ldap-gateway` + `dsh web` 子进程 | 企业内网、每用户隔离 |
| **ACP** | examples/acp-agent | IDE/自动化客户端 |
| **npx 快速体验** | `npx @deepseek-ai/dsh web` | 无需 clone |

---

## 10. 开发与构建

### 10.1 环境要求

- Node.js `^22.19` 或 `>=24`
- pnpm `11.x`
- 构建 Web 前端需完整 `pnpm run build`

### 10.2 常用命令

```bash
pnpm install
pnpm run build              # lib + web 前端
pnpm dsh web                # 源码模式启动 Web
pnpm run test               # 单元测试
pnpm run test:e2e           # 需 DEEPSEEK_API_KEY
pnpm run typecheck
pnpm run lint
dsh --profile web --dump-config
```

### 10.3 扩展开发路径

| 目标 | 做法 |
|------|------|
| 新增工具 | 注册 `ctx.tools`，见 [tool 开发指南](user/develop/basic/tool.zh.md) |
| 新增模型 Provider | 注册 `ctx.llm` adapter |
| 新增 Web UI 模块 | `dsh.client` 插件 + `packages/client/ui-*` |
| 修改部署行为 | 编写 `cordis.patch.yml` 或新 bundle |
| 发布插件 | 见 [publish 指南](user/develop/basic/publish.zh.md) |

面向 AI Agent 的仓库约定见根目录 [AGENTS.md](../AGENTS.md)。

---

## 11. 测试体系

| 类型 | 命令 | 说明 |
|------|------|------|
| 单元测试 | `pnpm run test` | Vitest，packages 覆盖率门禁 |
| E2E | `pnpm run test:e2e` | 真实 LLM API，无 key 自跳过 |
| Snapshot | `pnpm run test:snapshot` | ACP/headless 回放对比 |
| 文档门禁 | `pnpm run doc-sync` | 链接、类型等价、i18n 配对 |
| Web E2E | `apps/web/tests/*.e2e.ts` | 浏览器级 UI 测试 |

---

## 12. 与 Upstream 同步

```bash
git remote -v
# upstream → deepseek-ai/deepseek-harness
# origin   → shangeyao/CALB-AIStudio

git fetch upstream
git rebase upstream/master
pnpm install && pnpm run build
```

**合并策略建议**：

- Harness 核心改动尽量提交到 upstream 或保持 patch 层薄
- CALB 专有逻辑集中在 `deploy/`，减少与 upstream 冲突

---

## 13. 设计取舍与已知限制

### 13.1 Harness 原生限制

- Web 默认仅 `127.0.0.1`（`--host 0.0.0.0` 尚未开放，防未授权 RCE 暴露）
- `/api` trust fence **不是认证**；非 loopback 部署需 `trustedHosts` + 前置认证
- 开发者预览期：磁盘格式、`SCHEMA_VERSION` 不保证向后兼容

### 13.2 CALB LDAP 网关限制

- **每活跃用户一个 `dsh web` 进程**，内存开销随并发用户数线性增长
- 空闲超时（默认 1h）后进程回收，下次登录需冷启动（约十秒级）
- 网关与 Harness 间为 HTTP 反代，生产必须加 **HTTPS 终止层**
- LDAP 绑定失败时无本地回退（生产应关闭 `DEV_ALLOW_LOCAL_LOGIN`）

### 13.3 多用户下的 Host 平面

单个 `dsh web` 进程内，goal/subagent/jobs 等 Host 服务仍是**进程级单例**；因此 CALB 选择**进程级隔离**而非单进程多租户。单进程多租户需要 Harness 上游架构支持 per-request `DSH_HOME`，目前未实现。

---

## 14. 相关文档索引

| 文档 | 用途 |
|------|------|
| [architecture.zh.md](architecture.zh.md) | 框架架构必读 |
| [subsystems/README.zh.md](subsystems/README.zh.md) | 各子系统 API 参考 |
| [user/guide/index.zh.md](user/guide/index.zh.md) | Web UI 使用指南 |
| [deploy/README.zh.md](../deploy/README.zh.md) | LDAP 部署操作手册 |
| [config-catalog.zh.md](config-catalog.zh.md) | 全部插件配置字段 |
| [tool-catalog.zh.md](tool-catalog.zh.md) | 内置工具列表 |
| [development.zh.md](development.zh.md) | 贡献与门禁 |

---

## 15. 总结

本仓库 = **DeepSeek Harness 完整源码** + **CALB LDAP 多用户部署方案**。

- **Harness** 提供插件化 Agent 运行时、Web 工作台、Headless/ACP/SDK 等多种入口
- **核心设计** 是 Cordis 插件树 + 会话事件日志 + 能力接缝 + Agent Preset 按会话组装
- **CALB 增量** 通过 LDAP Gateway 实现企业登录，并以**独立进程 + 独立 DSH_HOME** 保证每用户工作区与会话数据隔离

如需针对某一子系统（如 subagent、workflow、sandbox）的更深入说明，可结合 [subsystems/](subsystems/) 下对应中文页面阅读。
