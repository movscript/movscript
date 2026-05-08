# 安全策略

[English](SECURITY.md)

## 支持版本

在项目发布正式版本支持策略前，安全修复会在默认分支处理。

## 报告漏洞

请不要为疑似漏洞创建公开 issue。

请通过邮件联系维护者，或在仓库平台支持时使用 private security advisory。报告中请包含：

- 问题描述
- 复现步骤或 proof of concept
- 影响范围和受影响配置
- 已知缓解建议

项目使用 `ENCRYPTION_KEY` 加密保存 provider 凭证。泄露的数据库、`.env` 文件、对象存储凭证和 API provider key 都应视为敏感信息。

## 部署建议

- 使用 `openssl rand -hex 32` 设置唯一的 `ENCRYPTION_KEY`。
- 后端 `/mcp` endpoint 当前已移除。如果桌面端或本地 Agent 暴露 MCP-shaped endpoint，应绑定到可信本地接口，或使用明确认证层保护。
- 不要把 PostgreSQL 或 MinIO 直接暴露到公网。
- 如果 debug log 或环境文件暴露，请轮换 AI provider 凭证。
