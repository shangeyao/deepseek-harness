# CALB AIStudio — 任意机器安装使用

发布到 GitHub Packages 后，在**任意 Linux/macOS 机器**（Node.js 22.19+ 或 24+）上按以下步骤即可运行 LDAP 多用户 Web 部署。

## 1. 配置 npm 认证

GitHub Packages 上的 `@shangeyao/*` 需要 Token（`read:packages` 即可安装）。

```bash
export NODE_AUTH_TOKEN=ghp_你的GitHub_PAT
mkdir -p ~/.npm
cat >> ~/.npmrc <<'EOF'
@shangeyao:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
@deepseek-ai:registry=https://registry.npmjs.org/
EOF
```

也可复制模板：`deploy/scripts/npmrc.github-packages.example`

## 2. 全局安装

```bash
npm install -g @shangeyao/dsh @shangeyao/calb-ldap-gateway @shangeyao/dsh-client-ui-account
```

说明：

| 包 | 作用 |
|---|---|
| `@shangeyao/dsh` | CALB 定制 CLI（含 LDAP 账户侧边栏插件依赖） |
| `@shangeyao/calb-ldap-gateway` | LDAP 网关，`calb-gateway` 命令 |
| `@shangeyao/dsh-client-ui-account` | 由 `dsh` 间接依赖，单独安装可避免版本解析问题 |

`@deepseek-ai/*` 运行时依赖会从 [npmjs 公共仓库](https://www.npmjs.com/org/deepseek-ai) 自动拉取，无需额外配置。

## 3. 启动（开发 / 内网）

```bash
export JWT_SECRET=请换成随机长密钥
export DEV_ALLOW_LOCAL_LOGIN=true
export DEV_LOCAL_USERNAME=admin
export DEV_LOCAL_PASSWORD=admin
export DSH_DATA_ROOT=$HOME/.calb-dsh-data

calb-gateway
```

浏览器访问：`http://<本机IP>:8080/login`（默认 `GATEWAY_HOST=0.0.0.0`）。

## 4. 生产 LDAP

```bash
export JWT_SECRET=强随机密钥
export LDAP_ENABLED=true
export LDAP_SERVER_URI=ldap://ldap.company.com:389
export LDAP_BASE_DN=dc=company,dc=com
export DSH_DATA_ROOT=/var/lib/calb-dsh-data

calb-gateway
```

完整环境变量见 `deploy/.env.example`。

## 5. 验证安装

```bash
dsh --version
calb-gateway --help 2>/dev/null || which calb-gateway
```

## 发布方（维护者）

GitHub Actions：**Publish CALB Packages** → 选择 `all` → Run workflow。

会按顺序发布：

1. `@shangeyao/dsh-client-ui-account`
2. `@shangeyao/calb-ldap-gateway`
3. `@shangeyao/dsh`（依赖前两者 + npmjs 上的 `@deepseek-ai/*`）

详见 `deploy/GITHUB-PACKAGES.zh.md`。
