# AI Providers

[English](ai-providers.md)

Movscript 通过后端 AI provider adapter 路由生成任务。项目当前包含面向 OpenAI-compatible APIs、Anthropic、Gemini、Kling、Volcengine 和 dry-run 开发流程的 adapter surface。

## 配置位置

Provider 凭证、模型能力、功能路由、价格和调试调用通过管理界面维护。凭证使用 `ENCRYPTION_KEY` 加密保存。

不要把 provider API key 写入受版本控制的文件。

## 支持的能力方向

Movscript 围绕以下生成工作流设计：

- 文本生成。
- 图像生成。
- 图像编辑。
- 文生视频。
- 图生视频。
- 视频生视频。

不同 provider 和模型可能只支持其中一部分能力。

## 开发 Dry Run

如果只需要测试路由、job 状态、前端流程或 worker 行为，并且不希望消耗 provider credit，可以使用 dry-run provider 行为。

## 安全说明

- 每个环境都应生成独立的 `ENCRYPTION_KEY`。
- 如果 `.env` 文件、debug log、数据库或备份泄露，请轮换 provider key。
- Provider debug log 不应包含 secret 或用户敏感媒体 URL。
- 除非部署明确需要，否则不要公开分享本地对象存储 bucket。

## 添加 Provider

新增 provider 通常会涉及：

- `apps/backend/internal/infra/ai/adapter_*.go`
- `apps/backend/internal/infra/ai/registry.go`
- Provider catalog 或 capability 定义。
- 管理界面的 provider/model 配置页面。
- 覆盖路由和错误处理的测试或 dry-run fixture。

Provider 设置、能力或运维预期变化时，请更新本页。
