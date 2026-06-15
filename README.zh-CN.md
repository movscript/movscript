<p align="center">
  <img src="assets/logo.png" alt="Movscript" width="96" />
</p>

<h1 align="center">Movscript</h1>

<p align="center">
  面向短剧生产与 AI 辅助视频创作的 local-first 桌面工作台。
</p>

<p align="center">
  简体中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> |
  <a href="#核心能力">核心能力</a> |
  <a href="#工作区模型">工作区模型</a> |
  <a href="#开发">开发</a> |
  <a href="#文档入口">文档入口</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue" />
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D20-43853d" />
  <img alt="Go" src="https://img.shields.io/badge/go-%3E%3D1.25-00add8" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-10.32.1-f69220" />
</p>

## Movscript 是什么？

Movscript 是一个开源社区版桌面生产工作台，面向创作者团队的本地创作、短剧生产和 AI 辅助视频工作流。它把项目策划、剧本、素材、分镜、镜头、生成任务、模型管理、插件和由 provider 支撑的助手工作流放在一个应用里。

项目仍处于早期阶段。API、插件 manifest、工作区契约和 provider 行为在稳定版本发布前可能继续调整。当前更适合本地开发、工作流探索、插件集成和社区反馈。

## 快速开始

### 环境要求

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker 和 Docker Compose，仅在本地使用 PostgreSQL、MinIO、Redis、Gitea 或观测栈时需要

### 启动桌面应用

```bash
pnpm install
make dev-frontend-local
```

推荐的本地模式会由 Electron 启动后端到 `http://localhost:8766`。默认使用 SQLite、文件系统对象存储、本地 Git HTTP backend provider、本地 AI gateway 模式和内存缓存。

管理后台地址：

```text
http://localhost:8766/admin
```

## 核心能力

| 领域 | 社区版能力 |
| --- | --- |
| 桌面工作台 | Electron + Vite + React 本地生产应用 |
| 后端 API | Go API server、数据库模型、AI adapters、生成任务与 worker 路径 |
| 创作生产模型 | 项目、剧本、素材、分镜、镜头、关键帧、音频 cue 和 content unit |
| 助手工作流 | Provider-backed sessions、模型路由、领域工具、资源工具和生成工具 |
| 工作区引擎 | Source review、interpret、diagnostics 和确定性 read-model refresh |
| 管理后台 | 凭据、模型、路由、用户和运行设置 |
| 插件系统 | 第一方 app-server 插件示例，包含 MCP bridge、skills 和 manifests |
| 本地依赖 | 默认 SQLite 和文件系统存储；可用 PostgreSQL、MinIO、Redis、Gitea 测试 external profile |
| 观测能力 | 可选 Prometheus 和 Grafana 栈，覆盖后端、前端、provider 与 Web Vitals 信号 |

## 项目结构

```text
movscript/
├── apps/backend/          Go API server、数据库模型、AI adapters、任务 worker
├── apps/frontend/         Electron + Vite + React 桌面应用
├── apps/admin/            凭据、模型、路由和用户管理后台
├── apps/cli/              Movscript 命令行工具
├── packages/              共享 UI、tokens、workspace、interpreter 和领域包
├── plugins/               第一方 app-server 插件示例
├── contracts/             机器可读 API、media、agent 和 telemetry 契约
├── docs/                  架构说明、审计记录和原型
└── docker-compose.yml     可选 PostgreSQL、MinIO、Redis、Gitea、Prometheus、Grafana 服务
```

## 工作区模型

Movscript 把选中的本地目录视为 project workspace root。在 Git-backed project 工作流里，这个 root 就是项目仓库。产品状态应由 source files 加 Movscript 结构化 domain APIs 表达；生成出来的 interpreter/debug artifacts 不是 source of truth。

```text
project-workspace/
├── project.json
├── project_standards.json
├── settings/
├── scripts/
├── content_units/
├── productions/
├── .movscript/
│   ├── manifest.json       本地工作区控制契约
│   ├── providers/          Provider configs、sessions、runs 与 cache
│   └── backend/            本地 backend auth 与连接配置
└── .interpret/             可选 interpreter diagnostics 与 debug output
```

Agent 和产品代码应使用 source files 加 Movscript domain APIs 写入持久状态。`.movscript/` 是本地控制状态，`.interpret/` 是可以重新生成的调试输出。

## 高级本地启动

### 分开启动后端和前端

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

### 依赖 profile

桌面本地启动默认使用 `MOVSCRIPT_DEPENDENCY_PROFILE=local`：

| 依赖 | local profile |
| --- | --- |
| 数据库 | SQLite |
| 对象存储 | 文件系统 |
| Workspace backend | 本地 Git HTTP backend provider |
| AI gateway | Local mode |
| 缓存 | Memory |

使用 `MOVSCRIPT_DEPENDENCY_PROFILE=external` 可以测试外部服务集成：

| 依赖 | external profile |
| --- | --- |
| 数据库 | PostgreSQL |
| 对象存储 | MinIO |
| Workspace backend | Gitea |
| AI gateway | new-api |
| 缓存 | Redis |

`DB_DRIVER`、`STORAGE_BACKEND`、`MOVSCRIPT_WORKSPACE_STORAGE_BACKEND`、`MOVSCRIPT_AI_GATEWAY_PROVIDER`、`CACHE_BACKEND` 等单项环境变量仍然可以覆盖 profile 默认值。

### 观测栈

启动社区版观测栈，包括后端、Prometheus、Grafana、node-exporter 和 cAdvisor：

```bash
docker compose --profile observability up --build
```

Grafana 默认地址为 `http://localhost:3002`。Prometheus 会抓取后端 `/metrics`，包含 HTTP 路由指标、镜头向量指标、助手前端关键阶段、provider 网络耗时、Web Vitals、前端错误和隐私安全的 telemetry 采集健康指标。

### 隔离调试 workspace

开发助手流程时，可以用隔离的调试 workspace 启动桌面端：

```bash
pnpm --filter @movscript/desktop dev:workspace
```

默认会把本地调试状态放在 `.movscript-dev`。如果某次调试需要完全隔离，可以指定自己的 workspace：

```bash
MOVSCRIPT_WORKSPACE_DIR=/tmp/movscript-debug pnpm --filter @movscript/desktop dev:workspace
```

## 开发

常用命令：

```bash
pnpm run test
pnpm run build
pnpm run typecheck
pnpm --filter @movscript/backend test
pnpm --filter @movscript/cli dev -- workspace review --workspace /path/to/project-repo
pnpm --filter "./plugins/*" build
```

安装内置 app-server 插件到本地 provider：

```bash
pnpm app-server:install-plugin -- --provider mova
```

验证 desktop-managed app-server 启动路径：

```bash
pnpm --filter @movscript/desktop verify:app-server -- --provider mova
```

## 文档入口

| 主题 | 链接 |
| --- | --- |
| CLI | [apps/cli/README.md](apps/cli/README.md) |
| Workspace package | [packages/workspace/README.md](packages/workspace/README.md) |
| Engine package | [packages/engine/README.md](packages/engine/README.md) |
| Interpreter package | [packages/interpreter/README.md](packages/interpreter/README.md) |
| Prompt package | [packages/prompt/README.md](packages/prompt/README.md) |
| Decision package | [packages/decision/README.md](packages/decision/README.md) |
| App-server plugin | [plugins/movscript/README.md](plugins/movscript/README.md) |
| Observability | [apps/backend/observability/README.md](apps/backend/observability/README.md) |
| 架构说明 | [docs/](docs/) |
| 机器可读契约 | [contracts/](contracts/) |

## 社区版范围

这份 README 描述开源社区版。Enterprise overlays、hosted operations、组织级私有工作流和私有部署策略，除非已经发布到社区版目录，否则不在本文档范围内。

欢迎通过 issue 和 pull request 参与贡献。适合的贡献包括 bug report、工作流反馈、文档改进、provider 集成、插件示例、测试和聚焦的修复。

## 许可证

Movscript 使用 [Apache License 2.0](LICENSE)。
