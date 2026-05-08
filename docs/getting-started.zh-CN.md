# 快速开始

[English](getting-started.md)

这份文档用于在本地启动 Movscript，适合开发、评估和贡献前验证。

## 环境要求

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker 和 Docker Compose

## 安装依赖

```bash
pnpm install
```

## 选择运行模式

Movscript 支持两种常用本地模式。

### 完整本地栈

如果希望更接近共享后端部署方式，可以使用 PostgreSQL 和 MinIO。

```bash
docker compose up -d db minio createbuckets
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
openssl rand -hex 32
```

把生成的两个值分别写入 `apps/backend/.env` 中的 `ENCRYPTION_KEY` 和 `AUTH_TOKEN_SECRET`。

启动后端：

```bash
make dev-backend
```

另开一个终端，启动桌面端：

```bash
cp apps/frontend/.env.example apps/frontend/.env
make dev-frontend
```

后端健康检查：

```bash
curl http://localhost:8765/health
```

### 本地文件系统模式

如果希望减少依赖，可以使用 SQLite 和本地文件系统存储。

```bash
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
openssl rand -hex 32
```

在 `apps/backend/.env` 中设置：

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

同时把 `ENCRYPTION_KEY` 和 `AUTH_TOKEN_SECRET` 设置为刚生成的值。然后运行：

```bash
make dev-backend
make dev-frontend
```

## 可选 Agent

本地 Agent 是独立的 TypeScript 服务，用于 Agent 实验和 CLI smoke test。

```bash
make dev-agent
```

## 常用检查

```bash
make test
make build
pnpm run typecheck
```

## 下一步

- 阅读[配置](configuration.zh-CN.md)，了解环境变量和存储模式。
- 阅读[开发指南](development.zh-CN.md)，再提交 pull request。
- 阅读[架构](architecture.zh-CN.md)，了解系统边界。
- 如果启动失败，阅读[故障排查](troubleshooting.zh-CN.md)。
