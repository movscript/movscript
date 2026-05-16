# 配置

## 本地桌面模式

`make dev-frontend-local` 会设置 `MOVSCRIPT_BACKEND_POLICY=spawn`，由 Electron 启动本地后端。默认地址：

- API: `http://localhost:8766`
- 管理后台: `http://localhost:8766/admin`

本地后端默认使用 SQLite 和本地文件存储。

## 外部后端模式

`make dev-frontend` 使用外部后端，默认 API 地址为 `http://localhost:8765`。后端环境变量可参考 `apps/backend/.env.example`。

常用本地后端配置：

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

## AI 配置

AI 凭据、模型启用、功能路由和调试调用在管理后台配置。
