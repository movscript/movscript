# API 参考

[English](api.md)

Movscript 后端由 Go server 暴露 HTTP API。默认本地地址：

```text
http://localhost:8765
```

前端通过 `VITE_API_BASE_URL` 读取后端地址。

## 健康检查

```bash
curl http://localhost:8765/health
```

调试前端请求前，先用这个 endpoint 确认后端进程正在运行。

## API 版本

产品 API 预期位于 `/api/v1` 下。项目仍处于早期阶段，契约可能变化；请求或响应 shape 变化后，应刷新前端生成类型。

```bash
pnpm run generate:api-types
pnpm run check:api-types
```

## 认证

后端使用 `AUTH_TOKEN_SECRET` 签发认证 token。本地开发默认配置只适合可信工作站。

不要把使用默认凭证、本地数据库或对象存储的开发后端暴露到公网。

## 错误结构

后端错误应尽量保持机器可读，前端负责本地化展示文案。新增 API 行为时应记录：

- HTTP method 和 path。
- 必需认证以及组织/项目上下文。
- Request body 和 query 参数。
- 成功响应。
- 错误码和恢复建议。

## 更新这份参考

新增或修改 API 行为时：

- 在本页更新公开契约。
- 如果 OpenAPI 来源变化，重新生成前端 API 类型。
- 添加或更新 handler/use case 的后端测试。
- 在 pull request 中说明 migration 或兼容性影响。
