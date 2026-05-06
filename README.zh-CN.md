# Movscript

Movscript 是一个开源的短剧生产与 AI 辅助视频创作桌面工作台。它把项目策划、剧本、素材、分集、分场、分镜、镜头、资源库、画布工作流、生成任务、模型管理、插件和本地 Agent 整合到一个 local-first 应用中。

> 项目仍处于早期阶段。API、插件 manifest 和 Agent 契约在稳定版本发布前可能继续调整。

## 可以用它做什么

- 管理短剧项目中的剧本、素材、分集、分场、分镜和镜头。
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
├── apps/movcli/           插件打包和 Agent 调试 CLI
├── packages/plugin-sdk/   TypeScript 插件 SDK
├── packages/tokens/       共享设计 token
├── packages/ui/           共享 React UI primitives
├── plugins/               第一方插件示例
├── docs/                  用户、运维、开发、API、插件和 Agent 文档
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
```

把生成的 64 位十六进制值写入 `apps/backend/.env` 的 `ENCRYPTION_KEY`。
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

```bash
make dev-backend
```

另开一个终端：

```bash
cp apps/frontend/.env.example apps/frontend/.env
make dev-frontend
```

后端健康检查：

```bash
curl http://localhost:8765/health
```

## 常用命令

```bash
make dev-backend          # Go API server
make dev-frontend         # Electron 桌面应用
make dev-agent            # 本地 Agent
make test                 # 后端测试 + workspace typecheck
make build                # 后端、packages、apps 和 plugins 构建
pnpm run typecheck        # 可用包的 TypeScript 类型检查
```

## 文档

文档入口：[docs/README.md](docs/README.md)。

主要文档：

- [快速开始](docs/getting-started.md)
- [配置](docs/configuration.md)
- [开发指南](docs/development.md)
- [架构](docs/architecture.md)
- [API 参考](docs/api.md)
- [AI Providers](docs/ai-providers.md)
- [插件](docs/plugins.md)
- [部署](docs/deployment.md)
- [故障排查](docs/troubleshooting.md)

英文入口：[README.md](README.md)。

## 开源

Movscript 使用 [MIT License](LICENSE)。参与贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
