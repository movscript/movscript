# 部署

[English](deployment.md)

Movscript 可以作为本地桌面应用运行，也可以连接单独管理的后端基础设施，用于开发和评估。

## 本地桌面打包

桌面打包脚本定义在根目录 `package.json`：

```bash
pnpm run package:desktop
pnpm run package:desktop:mac
pnpm run package:desktop:win
pnpm run package:desktop:win:arm64
```

打包过程会构建共享 packages、admin assets、后端二进制、agent deploy bundle 和 Electron 应用。

## 后端栈

仓库内置 Docker Compose 文件可启动本地基础设施：

```bash
docker compose up -d db minio createbuckets
```

Compose 文件也定义了 backend service，便于容器化本地评估。类生产部署应使用自己的 secret，避免默认凭证。

## 生产必需配置

- 设置唯一的 `ENCRYPTION_KEY` 和 `AUTH_TOKEN_SECRET`。
- 使用强数据库和对象存储凭证。
- PostgreSQL、Redis 和 MinIO 应保持私有。
- 明确配置对象存储访问策略。
- 对公开后端加上认证和网络访问控制。
- 如果 log、backup、database 或 `.env` 文件泄露，请轮换 AI provider key。

## 存储选择

如果媒体需要从对象存储服务，使用 MinIO/S3-compatible storage。如果只是单机 local-first 使用，可以选择 filesystem storage。

具体变量见[配置](configuration.zh-CN.md)。

## 商业边界

暴露托管、多用户或商业能力前，请阅读 [Deployment and commercial boundaries](deployment-and-commercial-boundaries.md) 和 [Commercial capability abstraction](commercial-capability-abstraction.md)。
