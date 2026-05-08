# 配置

[English](configuration.md)

本地开发时，Movscript 后端从 `apps/backend/.env` 读取配置。启动后端前先复制 `apps/backend/.env.example`。

## 必填密钥

生成两个独立值：

```bash
openssl rand -hex 32
openssl rand -hex 32
```

设置：

- `ENCRYPTION_KEY`：用于加密保存的 provider 凭证。
- `AUTH_TOKEN_SECRET`：用于签发认证 token。

不要提交 `.env` 文件、生成的密钥、provider API key、本地数据库或对象存储数据。

## 后端服务

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_PORT` | `8765` | 后端 HTTP 端口。 |
| `MOVSCRIPT_APP_MODE` | `cloud` | 运行模式。本地优先的 SQLite/filesystem 模式使用 `local`。 |
| `MOVSCRIPT_DATA_DIR` | 空 | 本地运行数据的基础目录。 |

前端从 `apps/frontend/.env` 的 `VITE_API_BASE_URL` 读取后端地址；示例值为 `http://localhost:8765`。

## 数据库

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DB_DRIVER` | `postgres` | `postgres` 或 `sqlite`。 |
| `DB_HOST` | `localhost` | PostgreSQL host。 |
| `DB_PORT` | `5432` | PostgreSQL port。 |
| `DB_USER` | `postgres` | PostgreSQL 用户。 |
| `DB_PASSWORD` | `postgres` | PostgreSQL 密码。 |
| `DB_NAME` | `movscript` | PostgreSQL 数据库名。 |
| `DB_PATH` | 空 | `DB_DRIVER=sqlite` 时的 SQLite 数据库路径。 |

推荐的本地 SQLite 配置：

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
```

## 存储

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `STORAGE_BACKEND` | `minio` | `minio` 或 `filesystem`。 |
| `FILESYSTEM_STORAGE_ROOT` | 空 | 显式指定本地文件存储路径。默认位于 `MOVSCRIPT_DATA_DIR` 下。 |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO 或 S3-compatible endpoint。 |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key。 |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key。 |
| `MINIO_BUCKET` | `movscript` | 对象存储 bucket。 |
| `MINIO_USE_SSL` | `false` | 对象存储是否使用 HTTPS。 |

推荐的本地文件系统配置：

```env
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

## 本地 Agent 和 MCP-shaped 访问

`MCP_TOKEN` 是可选配置。设置后，运行时启用的 MCP-shaped endpoint 应要求 `Authorization: Bearer <MCP_TOKEN>`。

除非有明确认证层，否则本地 Agent endpoint 应只绑定到可信本地接口。

## AI Providers

Provider 凭证通过管理界面配置，并使用 `ENCRYPTION_KEY` 加密保存。不同 provider/model 能力应通过管理页配置，不要把凭证提交到源码仓库。
