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

## 模型能力 Contract

每个启用的模型配置都会解析成 provider-neutral 的能力 contract。运行时通过 `/models?capability=<capability>` 暴露，Agent 通过 `movscript_list_models` 消费。

解析后的模型响应包含：

- `capabilities`：模型实际支持的生成任务。
- `input_requirements`：图片/视频输入的必需数量和最大数量。
- `supported_params`：面向 UI 的模型参数控件。
- `params_schema`：从 `supported_params` 生成的机器可读 JSON Schema。

`movscript_list_models` 额外返回面向 Agent 的 `model_contracts` 摘要。这里的 `supported_params` 是紧凑参数控件，包含 `key`，并按需包含 `label`、`type`、`options`、`default`、`min`、`max`、`step`、`conflicts_with`、`conditional_enum`、`conditional_const` 和 `requires_value`。条件规则字段在摘要里只保留引用关系，Agent 需要完整 JSON Schema 时应读取同一个 raw model 的 `params_schema`。`supported_param_keys` 则用于快速过滤候选 `extra_params`。

`ParamDef.type` 支持 `select`、`number`、`boolean` 和 `string`。

Adapter 默认参数定义在 `apps/backend/internal/infra/ai/catalog.go`。模型之间的差异应通过 `CustomSupportedParams` 表达，可以是完整的 `ParamDef[]` 覆盖，也可以是 `ModelParamProfile`：

```json
{
  "allow": ["duration", "aspect_ratio", "resolution"],
  "override": {
    "duration": {
      "type": "select",
      "options": ["5", "10"],
      "default": "5"
    }
  }
}
```

不要依赖类似“所有视频模型都支持 10 秒”或“所有图像模型都支持同一组尺寸”的 provider-wide 假设。运行时应以解析后的模型 contract 为唯一事实源。

保存模型配置前会校验 `CustomSupportedParams`。非法 JSON、不支持的参数类型、重复 key、没有 options 的 select 控件、非法 number 范围、非法 `json_schema` keyword、与控件类型/options/range/schema 不匹配的默认值，以及引用未知参数或规则值非法的跨参数规则都会作为错误的模型配置被拒绝。Profile 配置还必须保持 `allow`/`deny` 为 key 数组、`override` 为按参数名索引的对象、`add` 为参数定义数组。Profile 的 allow/deny 过滤也会清理继承参数里指向已移除参数的规则，保证导出的 `params_schema` 对 Agent 是安全可信的。

管理端可以调用 `POST /admin/model-configs/preview-contract`，传入 `adapter_type`、`custom_capabilities` 和 `custom_supported_params`，在保存前用后端 resolver 做 dry-run。响应会包含解析后的 `supported_params`、生成的 `params_schema` 和 schema rule 数量。

## 参数校验错误

管理端模型配置的 create/update/patch 和 preview 接口会返回机器可读的配置错误：

```json
{
  "code": "INVALID_MODEL_CONFIG",
  "message": "invalid ai model config: custom_supported_params.add[0]: parameter key is required",
  "error": "invalid ai model config: custom_supported_params.add[0]: parameter key is required"
}
```

客户端应优先根据 `code` 分支处理；`error` 字段保留给已有调用方兼容使用。

生成 job 在创建记录前会先做 preflight。参数错误应返回 Agent 可修复的结构化信息：

```json
{
  "code": "INVALID_PARAMETER_OPTION",
  "field": "duration",
  "allowed_values": ["5", "10"],
  "suggested_fix": { "duration": "5" }
}
```

新增结构化校验错误时使用 `apps/backend/internal/infra/ai/validation_error.go`。只有当修复方案确定且安全时，才应提供 `suggested_fix`。

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
- 模型参数默认值、模型级 profile、校验规则和结构化错误。
- 管理界面的 provider/model 配置页面。
- 覆盖路由和错误处理的测试或 dry-run fixture。

Provider 设置、能力或运维预期变化时，请更新本页。
