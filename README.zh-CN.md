# Movscript

[English](README.md)

Movscript 是一个开源的短剧生产与 AI 辅助视频创作桌面工作台。它把项目策划、剧本、素材、制作、分场、分镜、镜头、资源库、画布工作流、生成任务、模型管理、插件和本地 Agent 整合到一个 local-first 应用中。

> 项目仍处于早期阶段。API、插件 manifest 和 Agent 契约在稳定版本发布前可能继续调整。

## 可以用它做什么

- 管理短剧项目中的剧本、素材、制作、分场、分镜和镜头。
- 上传并复用媒体资源，支持本地文件系统或 MinIO/S3-compatible 对象存储保存文件。
- 在管理页配置 AI 凭证、模型能力、功能路由、积分价格和调试调用。
- 异步执行文本、文生图、图像编辑、文生视频、图生视频和视频生视频任务。
- 使用画布组合手动媒体节点、AI 节点、工具节点、审批节点和插件节点。
- 通过本地插件与独立本地 Agent 扩展桌面端能力。

## 仓库结构

```text
movscript/
├── apps/backend/          Go API server、数据库模型、AI adapters、任务 worker
├── apps/frontend/         Electron + Vite + React 桌面应用
├── apps/agent/            本地 Agent HTTP 服务与实验
├── apps/movcli/           插件脚手架与打包 CLI
├── packages/plugin-sdk/   TypeScript 插件 SDK
├── packages/tokens/       共享设计 token
├── packages/ui/           共享 React UI primitives
├── plugins/               第一方插件示例
├── docs/                  公开文档入口
├── memory/                维护者记忆与设计历史记录
└── docker-compose.yml     本地 PostgreSQL、MinIO 和 backend stack
```

## 快速开始

### 环境要求

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker 和 Docker Compose

### 1. 安装 Node 依赖

```bash
pnpm install
```

### 2. 启动本地基础设施

如果只是体验本地桌面版，可以跳过 Docker。前端托管的本地模式会启动内置后端，使用 SQLite 和本地文件存储。

需要单独运行后端、PostgreSQL 或 MinIO 时再启动基础设施：

```bash
docker compose up -d db
```

这会启动 PostgreSQL `localhost:5432`。如果要使用 MinIO/S3-compatible 对象存储而不是本地文件系统：

```bash
docker compose up -d db minio createbuckets
```

### 3. 配置后端

```bash
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
openssl rand -hex 32
```

把生成的两个 64 位十六进制值分别写入 `apps/backend/.env` 的 `ENCRYPTION_KEY` 和 `AUTH_TOKEN_SECRET`。
开发本地版时可以设置：

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

此模式会把数据库写入 `$HOME/.movscript/movscript.db`，资源文件写入 `$HOME/.movscript/resources`，不需要启动 MinIO；SQLite 模式也不需要 PostgreSQL。
前端托管的本地后端默认使用 `localhost:8766`，可以和单独启动的后端 `localhost:8765` 同时运行。

### 4. 启动后端和前端

本地桌面体验优先使用一条命令：

```bash
make dev-frontend-local
```

这会构建后端和管理后台，由 Electron 托管本地后端到 `http://localhost:8766`。首次进入选择“本地启动”并创建本地管理员后，请打开管理后台配置供应商凭据和模型：

```text
http://localhost:8766/admin
```

如果你在开发外部后端，使用两终端模式：

```bash
pnpm --filter movscript-backend dev
```

另开一个终端：

```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm --filter movscript-frontend dev
```

后端健康检查：

```bash
curl http://localhost:8765/health
```

## 常用命令

```bash
pnpm --filter movscript-backend dev          # Go API server
pnpm --filter movscript-frontend dev         # Electron 桌面应用
make dev-frontend-local   # 本地桌面一键启动，托管后端、SQLite 和管理后台
pnpm --filter movscript-agent dev            # 本地 Agent
pnpm run test             # 根 workspace 测试门禁
pnpm run build            # 后端、packages、apps 和 plugins 构建
pnpm run typecheck        # 可用包的 TypeScript 类型检查
```

## 文档

文档入口：[docs/README.zh-CN.md](docs/README.zh-CN.md)。

英文入口：[README.md](README.md)。

## 开源

Movscript 使用 [Apache License 2.0](LICENSE)。参与贡献前请阅读 [贡献指南](CONTRIBUTING.zh-CN.md)、[安全策略](SECURITY.zh-CN.md) 和 [行为准则](CODE_OF_CONDUCT.zh-CN.md)。
