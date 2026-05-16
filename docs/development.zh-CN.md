# 开发指南

## 常用命令

```bash
pnpm install
make dev-frontend-local
make dev-backend
make dev-frontend
make dev-agent
pnpm --filter movscript-frontend typecheck
pnpm run test:backend
```

## 代码边界

- `apps/frontend`: Electron + React 桌面端。
- `apps/backend`: Go API、数据库、任务和 AI gateway。
- `apps/admin`: 管理后台。
- `apps/agent`: 本地 Agent 服务。
- `packages/*`: 共享 UI、tokens、SDK 和 schema。

优先保持前端、后台、后端和 Agent 的边界清晰。跨边界能力应通过 API、IPC 或明确的共享包表达。
