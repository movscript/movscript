# 架构

[English](architecture.md)

这份文档是公开架构概览。更详细的贡献者地图见 [../ARCHITECTURE.md](../ARCHITECTURE.md)。

## 系统概览

Movscript 是一个 local-first 桌面生产工作台，由 Go API server 提供后端能力。桌面端通过 HTTP 调用后端；后端负责关系数据、媒体元数据、provider 凭证、生成任务、插件 manifest 和存储适配。

```text
Electron 桌面应用
  -> React 前端
  -> Go Gin API
  -> PostgreSQL 或 SQLite
  -> MinIO/S3-compatible 存储或本地文件系统存储
  -> AI provider adapters
  -> 异步生成 worker

本地 Agent
  -> TypeScript HTTP service
  -> 本地 threads、runs、memory 和 tool metadata
  -> 可选 model gateway 或 OpenAI-compatible endpoint
```

## 主要应用

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| Backend | `apps/backend` | API server、migration、domain service、worker、storage、AI adapter。 |
| Desktop | `apps/frontend` | Electron shell 和主要用户工作台。 |
| Admin | `apps/admin` | 模型、provider、能力和运行配置界面。 |
| Agent | `apps/agent` | 本地 Agent runtime 和实验。 |
| CLI | `apps/movcli` | 插件打包和 Agent smoke test。 |
| SDK | `packages/plugin-sdk` | TypeScript 插件开发接口。 |

## 后端分层

后端采用务实的领域边界：

- `interfaces/http`：transport handler、middleware、route 注册。
- `app`：用例、校验、编排、领域错误。
- `domain/model`：GORM 持久化实体。
- `infra`：provider 集成、存储、认证、任务、数据库、日志、插件导入 helper。
- `bootstrap`：应用组合根。

Application package 不应依赖 HTTP handler 或 route 注册。Infrastructure package 应实现平台能力，而不是承载产品工作流。

## 核心产品模型

```text
Project
  ├─ Scripts
  ├─ Assets
  ├─ Episodes
  ├─ Scenes
  │   └─ Storyboards
  │       └─ Shots
  ├─ PipelineNodes and PipelineEdges
  └─ Canvases
      ├─ CanvasNodes
      ├─ CanvasEdges
      └─ CanvasRuns / CanvasTasks
```

媒体文件作为 resource 跟踪，并通过配置的 storage backend 保存。

## AI 和任务

AI model/provider 配置通过管理界面维护。生成请求以 job 表示，并由后端 worker 异步执行。Provider 相关逻辑位于 `apps/backend/internal/infra/ai`，job 状态、重试规则和取消行为位于 `apps/backend/internal/app/job`。

## 插件

插件通过 manifest 描述，经后端 plugin-kit 导入，并在桌面运行时暴露。插件契约仍处于早期阶段，稳定发布前可能变化。

## Agent

本地 Agent 是独立的 TypeScript HTTP service。它负责 thread/run 生命周期、policy check、tool metadata、本地 memory 和 skill 加载。应把它视作通过明确 HTTP 边界通信的独立 runtime。
