# Movscript 文档

这是 Movscript 唯一的公开文档入口。机器可读契约放在 `contracts/`；设计历史和维护者上下文放在 `memory/`。

## 快速开始

安装依赖并启动本地桌面工作流：

```bash
pnpm install
make dev-frontend-local
```

本地模式由 Electron 启动后端到 `http://localhost:8766`，默认使用 SQLite 和本地文件存储，管理后台地址是 `http://localhost:8766/admin`。

需要拆开调试后端和前端时：

```bash
pnpm --filter movscript-backend dev
pnpm --filter movscript-frontend dev
curl http://localhost:8765/health
```

开发 Agent 流程时启动本地 Agent：

```bash
pnpm --filter movscript-agent dev
```

## 配置

本地桌面模式会设置 `MOVSCRIPT_BACKEND_POLICY=spawn`。外部后端开发默认地址为 `http://localhost:8765`；后端环境变量参考 `apps/backend/.env.example`。
如果本地桌面模式需要连接外部 Agent 服务，复用同一个入口并运行 `MOVSCRIPT_AGENT_POLICY=external make dev-frontend-local`。

常用本地后端配置：

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

供应商凭据、启用模型、模型能力、价格、参数和功能路由都在管理后台配置。如果生成流程提示没有可用模型，先确认凭据和模型都已启用。

## 架构

Movscript 是 local-first 桌面工作台，主要由四个应用组成：

- `apps/frontend`: Electron + React 桌面端。
- `apps/backend`: Go API、数据库、任务、存储和 AI gateway。
- `apps/admin`: 管理后台，负责凭据、模型、路由、用户和资源配置。
- `apps/agent`: 本地 Agent 服务，负责线程、运行、计划、草案、记忆和 trace。

运行时边界：

- 后端保存正式项目数据和供应商凭据。
- 桌面端持有当前 UI 上下文，并暴露本地集成入口。
- Agent 保存本地运行状态、草案、记忆和 trace。
- 跨边界能力应通过 API、IPC 或明确的共享包表达。

## API

后端 API 默认挂载在 `/api/v1`。

- 外部后端开发模式：`http://localhost:8765/api/v1`
- 前端托管本地模式：`http://localhost:8766/api/v1`

常见公开入口包括认证、项目、资源、生成任务、模型列表和功能配置。管理接口位于 `/api/v1/admin/*`，需要 `super_admin`。

OpenAI-compatible 路由：

```text
/v1/models
/v1/chat/completions
```

OpenAPI 和其他机器可读契约放在 `contracts/`，不要放在 `docs/`。

## 开发

常用命令：

```bash
pnpm install
make dev-frontend-local
pnpm --filter movscript-backend dev
pnpm --filter movscript-frontend dev
pnpm --filter movscript-agent dev
pnpm run typecheck
pnpm --filter movscript-backend test
pnpm run test:contracts
pnpm run test:scripts
pnpm run verify:scripts
```

插件相关代码位于 `apps/movcli`、`packages/plugin-sdk` 和 `plugins/*`。开发插件打包时使用 `pnpm --filter movcli dev` 和 `pnpm --filter "./plugins/*" build`。

脚本归属和生命周期规则见 [Script Management](./script-management.md)。新增、移动、废弃或删除仓库自动化脚本时，必须同步更新 `scripts/script-manifest.json`。

AI 生成素材进入审核链路时使用候选集语义，而不是直接绑定；素材需求、画面锚点和未来视觉锚点的候选规则与发布验收清单见 [候选集工作流](./candidate-workflow.zh-CN.md)。

Agent 设置、Agent 调试和对话详情的职责边界见 [Agent 设置与调试边界](./agent-settings-debug.zh-CN.md)。
稳定的 Agent Debug Bundle 和 Agent Settings Snapshot schema 见 [Agent Schema 参考](./agent-schema-reference.zh-CN.md)。
影视生产语境下的 Agent 调试收敛框架见 [Movscript 影视 Hardness Kernel](./film-hardness.zh-CN.md)。

## 发布与部署

当前仓库主要面向本地桌面和开发环境。

构建和打包命令：

```bash
pnpm run build
pnpm run release -- package-desktop
pnpm run release -- package-desktop --platform=darwin --arch=arm64
pnpm run release -- package-desktop --platform=linux --arch=x64
pnpm run release -- package-desktop --platform=win32 --arch=x64
```

发布前至少确认：

- `pnpm run typecheck`
- `pnpm --filter movscript-backend test`
- `pnpm run test:contracts`
- `pnpm --filter movscript-frontend typecheck`
- `pnpm --filter movscript-admin typecheck`
- `pnpm run verify:scripts`
- `pnpm run test:scripts`
- `pnpm run release -- audit-ffmpeg --all --all-archs`
- 管理后台静态资源已构建并复制。
- 本地桌面模式能启动 `http://localhost:8766`。
- 管理后台能打开 `http://localhost:8766/admin`。
- 桌面端视频剪辑使用 `apps/frontend/vendor/ffmpeg` 中已 staged 的可再分发 ffmpeg 二进制。

如果 AgentRun 调试改动确实需要浏览器或截图覆盖，再在能启动 Chromium 的环境中手动运行 `make test-agent-run-debugging-e2e`。

## 故障排查

本地后端启动失败：

- 确认应用设置使用“本地启动”。
- 点击启动失败遮罩中的“重试启动”。
- 开发环境使用 `make dev-frontend-local`。

管理后台打不开：

- 检查 `curl http://localhost:8766/health`。
- 使用 `http://localhost:8766/admin`。
- 外部后端模式下，确认后端能找到 admin 静态资源。

没有可用模型：

- 打开 `http://localhost:8766/admin/models`。
- 添加供应商凭据并启用模型。
- 确认凭据和模型都没有被禁用。

视频剪辑找不到 ffmpeg：

- 本机剪辑只在桌面端可用。
- 打包应用会查找 `resources/ffmpeg/<platform>/<arch>/<binary>`。
- 开发环境可以使用 `FFMPEG_PATH`、`MOVSCRIPT_FFMPEG_PATH`，或 `PATH` 中的 `ffmpeg`。
- 发布包必须用 `pnpm run release -- stage-ffmpeg` 或 `pnpm run release -- download-ffmpeg-static` 准备可再分发二进制。
