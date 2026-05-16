# API 参考

后端 API 默认挂载在 `/api/v1`。

常用本地地址：

- 外部后端开发模式：`http://localhost:8765/api/v1`
- 前端托管本地模式：`http://localhost:8766/api/v1`

公开入口包括认证、项目、资源、生成任务、模型列表和功能配置。管理接口位于 `/api/v1/admin/*`，需要 `super_admin`。

OpenAI-compatible 网关位于：

```text
/v1/models
/v1/chat/completions
```

生成前请先在管理后台配置凭据和启用模型。
