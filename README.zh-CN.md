# Movscript

[English](README.md)

Movscript 是一个开源、local-first 的短剧生产与 AI 辅助视频创作桌面工作台。它把项目策划、剧本、素材、分镜、镜头、生成任务、模型管理、插件和本地 Agent 放在一个应用里。

项目仍处于早期阶段。API、插件 manifest 和 Agent 行为在稳定版本发布前可能继续调整。

## 项目结构

```text
movscript/
├── apps/backend/          Go API server、数据库模型、AI adapters、任务 worker
├── apps/frontend/         Electron + Vite + React 桌面应用
├── apps/admin/            凭据、模型、路由和用户管理后台
├── apps/agent/            会话级 Agent runtime
├── apps/cli/              插件脚手架与打包 CLI
├── packages/              共享 SDK、UI、tokens 和领域包
├── plugins/               第一方插件示例
├── contracts/             机器可读 API 与 schema 契约
└── docker-compose.yml     可选的本地 PostgreSQL 与 MinIO 服务
```

## 环境要求

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker 和 Docker Compose，仅在本地使用 PostgreSQL 或 MinIO 时需要

## 本地运行

安装依赖：

```bash
pnpm install
```

启动本地桌面应用：

```bash
make dev-frontend-local
```

此模式会由 Electron 启动后端到 `http://localhost:8766`，默认使用 SQLite 和本地文件存储。管理后台地址：

```text
http://localhost:8766/admin
```

如果需要单独运行后端：

```bash
cp apps/backend/.env.example apps/backend/.env
docker compose up -d db
pnpm --filter @movscript/backend dev
```

再另开一个终端启动桌面前端：

```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm --filter @movscript/desktop dev
```

后端健康检查：

```bash
curl http://localhost:8765/health
```

启动社区版观测栈，包括后端、Prometheus 和 Grafana：

```bash
docker compose --profile observability up --build
```

Grafana 默认地址为 `http://localhost:3002`。Prometheus 会自动抓取后端 `/metrics`，包含 HTTP 路由指标、镜头向量指标、Agent 前端关键阶段、Agent 网络耗时、Web Vitals、前端错误和隐私安全的 telemetry 采集健康指标。同一个 profile 还会自动加载 Prometheus 告警规则，覆盖后端可用性、HTTP 延迟/错误、Agent telemetry 拒收、Agent runtime 延迟/失败、前端错误和 Web Vitals 阈值。

开发 Agent 流程时，用隔离的调试 workspace 启动桌面端：

```bash
pnpm --filter @movscript/desktop dev:agent-workspace
```

默认会把调试会话放在仓库的 `.movscript-dev/.movscript/agent/sessions/YYYY/MM/DD/...`。如果某次调试需要完全隔离，可以指定自己的 workspace：

```bash
MOVSCRIPT_AGENT_WORKSPACE_DIR=/tmp/movscript-agent-debug pnpm --filter @movscript/desktop dev:agent-workspace
```

CLI 可以读取同一个 workspace 的会话列表，并且不会启动 agent 进程：

```bash
pnpm --filter @movscript/cli build
node apps/cli/dist/index.js agent sessions --workspace /tmp/movscript-agent-debug
```

Web UI 应该连接桌面端拥有的 session runtime。正常开发时，不再单独启动一个 standalone agent 服务。

## 常用命令

```bash
pnpm run test
pnpm run build
pnpm run typecheck
pnpm --filter @movscript/backend test
pnpm --filter "./plugins/*" build
```

## 许可证

Movscript 使用 [Apache License 2.0](LICENSE)。
