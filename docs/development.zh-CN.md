# 开发指南

[English](development.md)

这份文档说明 Movscript 的贡献者开发流程。

## 工作区

Movscript 是一个 monorepo，包含 Go 后端、Electron/React 应用、TypeScript packages、插件和本地 Agent。

```text
apps/backend/          Go API server 和 worker
apps/frontend/         Electron + Vite + React 桌面应用
apps/admin/            管理界面
apps/agent/            本地 Agent 服务
apps/movcli/           CLI 工具
packages/plugin-sdk/   插件 SDK
packages/ui/           共享 UI
packages/tokens/       共享设计 token
plugins/               第一方插件示例
```

## 日常命令

```bash
pnpm install
make dev-backend
make dev-frontend
make dev-agent
```

常用检查：

```bash
make test
make build
pnpm run typecheck
cd apps/backend && go test ./...
```

## 后端改动

- HTTP handler 保持轻量：绑定输入、调用 application service、映射错误、返回 JSON。
- 路由注册放在 `apps/backend/internal/interfaces/http/router/*_routes.go`。
- 用例放在 `apps/backend/internal/app/<domain>/`。
- 持久化实体放在 `apps/backend/internal/domain/model/`。
- Provider 集成、存储、任务、认证和可观测性放在 `apps/backend/internal/infra/`。

后端变更后运行：

```bash
cd apps/backend && go test ./...
```

## 前端改动

- 使用 `apps/frontend/src/lib/api.ts` 中的共享 API client。
- 保持 TanStack Query key 稳定，mutation 后尽量只 invalidate 必要的 key。
- 用户可见文案同时加入 `apps/frontend/src/i18n/locales/zh-CN.json` 和 `apps/frontend/src/i18n/locales/en-US.json`。
- 如果 `packages/ui` 已有合适组件，优先复用。

可用时运行前端检查：

```bash
pnpm --filter movscript-frontend typecheck
```

## 插件改动

插件 manifest 解析和导入 helper 位于 `apps/backend/internal/infra/pluginkit`。前端插件运行时界面位于 `apps/frontend/src/pages/plugins/` 和 `apps/frontend/src/lib/`。

如果插件 manifest、运行时能力或 CLI 打包行为变化，请同步更新[插件文档](plugins.zh-CN.md)。

## API 类型生成

API shape 变化后，重新生成并检查前端 API 类型：

```bash
pnpm run generate:api-types
pnpm run check:api-types
```

## Pull Request 检查清单

- 变更保持聚焦。
- 在 PR 描述中写明验证命令。
- 后端行为、共享逻辑和 bug fix 应补充或更新测试。
- 启动方式、配置、API 行为、发布行为或用户工作流变化时，同步更新文档。
- 不提交 secret、生成的二进制、本地数据库、对象存储数据或 provider 凭证。
