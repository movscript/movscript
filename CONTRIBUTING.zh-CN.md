# 贡献 Movscript

[English](CONTRIBUTING.md)

感谢你帮助改进 Movscript。项目重视聚焦的变更、可复现的验证，以及与实际代码一致的文档。

## 开发环境

安装 Go 1.25+、Node.js 20+、pnpm 10+、Docker 和 Docker Compose。

```bash
pnpm install
docker compose up -d db minio createbuckets
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
openssl rand -hex 32
```

把生成的两个值分别写入 `apps/backend/.env` 中的 `ENCRYPTION_KEY` 和 `AUTH_TOKEN_SECRET`。

启动主要开发服务：

```bash
make dev-backend
make dev-frontend
```

可选本地 Agent：

```bash
make dev-agent
```

## 提交 Pull Request 前

尽量运行相关检查：

```bash
make test
make build
```

较小的前端改动至少运行：

```bash
pnpm --filter movscript-frontend typecheck
```

后端改动运行：

```bash
cd apps/backend
go test ./...
```

## Pull Request 要求

- 保持变更聚焦，并说明用户可见行为。
- 在 PR 描述中写明验证步骤。
- 后端行为、共享逻辑和 bug fix 应添加或更新测试。
- 启动方式、配置、API 行为、发布行为或用户工作流变化时，同步更新文档。
- 不提交本地 secret、生成的二进制、私有 provider 凭证、本地数据库或对象存储数据。

## 文档标准

- 公开文档放在 `docs/`；设计历史和仅维护者需要的上下文放在 `memory/`。
- 机器可读契约和 fixture 放在 `contracts/`，不要放在 `docs/`。
- 优先更新合并后的文档入口，避免新增过窄的一次性指南。
- 先记录当前行为。如果描述的是提案，请移到 `memory/` 或明确标注。

## 国际化

前端使用 `react-i18next`。

- 用户可见前端文案同时添加到 `apps/frontend/src/i18n/locales/zh-CN.json` 和 `apps/frontend/src/i18n/locales/en-US.json`。
- 使用按产品区域分组的稳定 key，例如 `sidebar.items.scripts`。
- 后端 API 错误尽量保持机器可读；展示文案在前端本地化。
