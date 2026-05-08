# 故障排查

[English](troubleshooting.md)

这份文档用于排查常见本地启动问题。

## 后端无响应

检查健康接口：

```bash
curl http://localhost:8765/health
```

如果失败，确认后端正在运行：

```bash
make dev-backend
```

同时检查 `apps/backend/.env` 中的 `SERVER_PORT` 是否和 `apps/frontend/.env` 中的 `VITE_API_BASE_URL` 匹配。

## 数据库连接失败

PostgreSQL 模式下启动数据库：

```bash
docker compose up -d db
```

SQLite 模式下设置：

```env
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
MOVSCRIPT_APP_MODE=local
```

确认父目录对当前用户可写。

## 对象存储失败

MinIO 模式下运行：

```bash
docker compose up -d minio createbuckets
```

确认后端使用的 bucket 和凭证与 Docker Compose 一致：

```env
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=movscript
MINIO_USE_SSL=false
```

Filesystem 模式下设置：

```env
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

## 缺少 Secret

生成值：

```bash
openssl rand -hex 32
openssl rand -hex 32
```

在 `apps/backend/.env` 设置 `ENCRYPTION_KEY` 和 `AUTH_TOKEN_SECRET`。

## 前端无法连接后端

检查 `apps/frontend/.env`：

```env
VITE_API_BASE_URL=http://localhost:8765
```

如果修改了 `SERVER_PORT`，这里也要同步更新。

## Typecheck 或 Build 失败

运行更小范围的命令定位失败 package：

```bash
pnpm run typecheck
cd apps/backend && go test ./...
pnpm --filter movscript-frontend typecheck
```

提交 pull request 前尽量运行 `make test`。
