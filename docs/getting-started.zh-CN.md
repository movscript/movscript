# 快速开始

## 本地桌面体验

1. 安装依赖：

```bash
pnpm install
```

2. 启动本地桌面版：

```bash
make dev-frontend-local
```

这个命令会构建后端和管理后台，并由 Electron 托管本地后端到 `http://localhost:8766`。本地模式使用 SQLite 和本地文件存储，可以跳过 Docker。

首次进入时选择“本地启动”，创建本地管理员账号，然后打开管理后台配置供应商凭据和模型：

```text
http://localhost:8766/admin
```

## 外部后端开发模式

需要单独调试 Go 后端时，可以使用两终端模式：

```bash
make dev-backend
```

另开一个终端：

```bash
make dev-frontend
```

后端健康检查：

```bash
curl http://localhost:8765/health
```

## 常用下一步

- 在管理后台添加供应商凭据并启用模型。
- 创建项目并上传素材。
- 启动本地 Agent：`make dev-agent`。
