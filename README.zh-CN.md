# Movscript

[English](README.md)

Movscript 是一个开源、local-first 的短剧生产与 AI 辅助视频创作桌面工作台。它把项目策划、剧本、素材、分镜、镜头、生成任务、模型管理、插件和由 provider 支撑的助手工作流放在一个应用里。

项目仍处于早期阶段。API、插件 manifest 和 provider 行为在稳定版本发布前可能继续调整。

## 项目结构

```text
movscript/
├── apps/backend/          Go API server、数据库模型、AI adapters、任务 worker
├── apps/frontend/         Electron + Vite + React 桌面应用
├── apps/admin/            凭据、模型、路由和用户管理后台
├── apps/cli/              MovScript 命令行工具
├── packages/              共享 UI、tokens 和领域包
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

桌面本地启动使用 `MOVSCRIPT_DEPENDENCY_PROFILE=local` 后端依赖组：SQLite、文件系统对象存储、本地 Git HTTP backend provider、本地 AI gateway 模式和内存缓存。外部服务模式使用 `MOVSCRIPT_DEPENDENCY_PROFILE=external`：PostgreSQL、MinIO、Gitea、new-api 和 Redis。`DB_DRIVER`、`STORAGE_BACKEND`、`MOVSCRIPT_WORKSPACE_STORAGE_BACKEND`、`MOVSCRIPT_AI_GATEWAY_PROVIDER`、`CACHE_BACKEND` 等单项 provider 环境变量仍然可以覆盖依赖组默认值。

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

Grafana 默认地址为 `http://localhost:3002`。Prometheus 会自动抓取后端 `/metrics`，包含 HTTP 路由指标、镜头向量指标、助手前端关键阶段、provider 网络耗时、Web Vitals、前端错误和隐私安全的 telemetry 采集健康指标。同一个 profile 还会自动加载 Prometheus 告警规则，覆盖后端可用性、HTTP 延迟/错误、助手 telemetry 拒收、provider 延迟/失败、前端错误和 Web Vitals 阈值。

开发助手流程时，用隔离的调试 workspace 启动桌面端：

```bash
pnpm --filter @movscript/desktop dev:workspace
```

默认会把本地调试状态放在仓库的 `.movscript-dev`。如果某次调试需要完全隔离，可以指定自己的 workspace：

```bash
MOVSCRIPT_WORKSPACE_DIR=/tmp/movscript-debug pnpm --filter @movscript/desktop dev:workspace
```

## 工作区模型

MovScript 把启动时选择的目录视为 workspace root。该目录下的 `.movscript/` 是 MovScript 控制目录，不是普通缓存目录。

```text
.movscript/
├── manifest.json          工作区根契约
├── data/                  由数据库投射出来的项目文件
├── reviews/               preview 与前端审阅证据
├── sync/                  投影 hash 与冲突元信息
├── providers/             Provider configs、sessions、runs 与 cache
├── .mova/                 Mova managed provider home
└── .codex/                兼容保留的 Codex managed provider home
```

MovScript 工作区根目录就是桌面端选择的本地文件夹，或 `MOVSCRIPT_WORKSPACE_DIR` 指向的目录；`.movscript/` 是这个根目录下的控制目录。`production_workspace`、`setting_workspace`、`project_standards_workspace`、`content_unit_workspace`、`asset_workspace`、`project.json`、剧本 `script.md` 和只读的用户 `projects.index.json` 都是 `.movscript/data` 下的业务文件。Production 级文件进入 `users/{userId}/projects/{projectId}/productions/{productionId}`；单个 content unit 的文件会继续落到 `scene_moments/{sceneMomentId}/content_units/{contentUnitId}`，避免同一情节下的多个 unit 互相覆盖。Workspace 工具按 namespace 工作，而不是按单个路径工作：`workspace_fetch(namespace)`、`workspace_status(namespace)`、`workspace_review(namespace)` 和 `workspace_submit(namespace)` 会为 `movscript.project:123` 这样的 namespace 返回 Git canonical handoff；实际同步、检查、审阅、提交和推送使用标准 git fetch/status/diff/commit/push。项目 namespace 内部映射到 `data/users/{userId}/projects/{projectId}`，包含项目元数据、references、assets、scripts、productions 和未来新增的项目级业务对象组。Provider session 直接使用选中的 `.movscript/data/...` 目录作为真实 `cwd`，所以文件编辑工具改的就是 git review/submit 流程检查的同一批文件。当 `namespace` 省略时，会用当前 MCP focus 推断当前项目 namespace。review 证据可以写入 `.movscript/reviews`。Provider 配置、cache/run 目录和 provider session 索引归属到 `.movscript/providers/{profile}`；旧的 `.movscript/{profile}/config.json` 会在 profile 初始化时复制到新位置。`.movscript/.mova` 和 `.movscript/.codex` 这类 provider home 只是 app-server 兼容 home，不拥有 MovScript 业务文件，也不拥有 workspace 层面的会话索引。

当前命名与目录不变量见 [docs/movscript-workspace-topology.md](docs/movscript-workspace-topology.md)。面向 provider session 直接编辑文件的目标设计见 [docs/workdir-file-projection-design.zh-CN.md](docs/workdir-file-projection-design.zh-CN.md)。

桌面 UI 会连接已配置的助手 provider。正常开发时，不需要单独启动 standalone 本地 provider 服务。

## 常用命令

```bash
pnpm run test
pnpm run build
pnpm run typecheck
pnpm --filter @movscript/backend test
pnpm --filter @movscript/cli dev -- workspace status --namespace movscript.project:123
pnpm --filter "./plugins/*" build
```

## 许可证

Movscript 使用 [Apache License 2.0](LICENSE)。
