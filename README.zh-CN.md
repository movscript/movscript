# Movscript

Movscript 是一个开源的短剧生产与 AI 辅助视频工作台。它把剧本、素材、分集、分场、分镜、镜头、资源库、管线、画布和生成任务管理整合到一个 Electron 桌面应用中。

## 核心能力

- 管理剧本、素材、分集、分场、分镜和镜头
- 支持文生图、参考生图、参考生视频、动作迁移、画风迁移、多角度和头脑风暴等 AI 工作流
- 后端提供 OpenAI-compatible、Anthropic、Gemini、火山、Kling 和 dry-run 等 provider 适配
- 前端基于 Electron、Vite、React、TypeScript、Tailwind CSS 和 shadcn/ui primitives
- 后端基于 Go、Gin、GORM、PostgreSQL 和 MinIO-compatible 对象存储
- 已建立中英文国际化基础

## 快速开始

### 环境要求

- Go 1.25+
- Node.js 20+
- Docker 和 Docker Compose

### 启动基础设施

```bash
docker compose up -d db minio createbuckets
```

### 配置并启动后端

```bash
cp backend/.env.example backend/.env
openssl rand -hex 32
# 将生成值写入 backend/.env 的 ENCRYPTION_KEY
make dev-backend
```

健康检查地址：`http://localhost:8765/health`。

### 配置并启动前端

```bash
cp frontend/.env.example frontend/.env
cd frontend
npm install
npm run dev
```

## 更多文档

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [AI providers](docs/ai-providers.md)
- [Internationalization](docs/internationalization.md)
- [Troubleshooting](docs/troubleshooting.md)

## 开源

Movscript 使用 [MIT License](LICENSE)。参与贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
