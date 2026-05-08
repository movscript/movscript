# 数据与隐私

[English](data-and-privacy.md)

Movscript 被设计为 local-first 桌面生产工作台。这份文档说明数据保存位置，以及在真实剧本、媒体或 provider 凭证进入项目之前需要理解的边界。

## 本地项目数据

在本地文件系统模式下，Movscript 会把运行数据保存在 `MOVSCRIPT_DATA_DIR` 下，常见路径为：

```text
$HOME/.movscript
```

典型本地数据包括：

- SQLite 数据库文件。
- 上传或生成的媒体资源。
- 桌面应用和后端使用的运行元数据。

在 PostgreSQL/MinIO 模式下，关系数据保存在 PostgreSQL，媒体文件保存在 MinIO 或其他 S3-compatible 后端。

## Provider 凭证

AI provider 凭证通过管理界面配置，并使用 `ENCRYPTION_KEY` 加密保存。

以下内容都应视为敏感信息：

- `apps/backend/.env`
- 数据库备份
- 对象存储凭证
- AI provider key
- 可能包含请求元数据的 debug log

如果这些文件或日志暴露，请轮换 provider key。

## AI Provider 调用

启用 AI 生成功能时，prompt、媒体引用或上传资产可能会根据工作流和模型能力发送到已配置的 provider。使用生产内容或机密内容前，请先审阅对应 provider 的数据使用政策。

如果只想测试工作流且不希望内容发送到外部 provider，请使用 dry-run provider 行为。

## 对象存储

MinIO/S3-compatible storage 可能包含用户上传媒体、生成图片、生成视频和工作流中间资产。除非部署明确需要公开资产分发，并且访问策略已经审阅，否则不要公开 bucket。

简单单用户本地使用可以选择 filesystem storage，让媒体保留在本机。

## 本地 Agent 数据

本地 Agent 可能把 threads、runs、memory、tool metadata 和生成 artifact 保存在本地运行文件中。它们应视为项目数据；如果其中包含私有剧本、prompt 或媒体引用，不要随意分享。

## 分享日志或 Issue 前

发布日志、截图、复现项目或 issue 附件前：

- 移除 provider key 和 token。
- 移除私有剧本、prompt 和媒体 URL。
- 如果本地路径会暴露敏感项目名或用户信息，请移除。
- 说明问题是通过 dry-run provider 复现，还是通过真实 provider 调用复现。
