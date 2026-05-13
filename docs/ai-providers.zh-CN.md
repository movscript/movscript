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

`movscript_list_models` 额外返回面向 Agent 的 `model_contracts` 摘要，并带有 `contract_version: 1`。这里的 `input_requirements` 是必需字段，记录图片/视频输入的最小数量和最大数量；`max: 0` 表示模型不接受该输入类型，`max: -1` 表示不限制数量。`supported_params` 是紧凑参数控件，包含 `key`，并按需包含 `label`、`type`、`options`、`default`、`min`、`max`、`step`、`conflicts_with`、`conditional_enum`、`conditional_const` 和 `requires_value`。条件规则字段会保留带触发参数和值约束的紧凑规则对象；Agent 只有在需要完整 JSON Schema 时才需要读取同一个 raw model 的 `params_schema`。`supported_param_keys` 则用于快速过滤候选 `extra_params`。

静态 Agent catalog 和 Electron MCP 工具声明都会为 `movscript_list_models` 与 `movscript_create_generation_job` 发布 `outputSchema`。`movscript_list_models.outputSchema` 声明稳定的发现字段，例如 `model_contracts[].model_config_id`、`logical_model_id`、`capabilities`、`input_requirements`、`supported_param_keys` 和 `supported_params`。`movscript_create_generation_job.outputSchema` 声明稳定的生成结果字段，例如 `status`、`job`、`jobId`、`monitor`、`output_resource`、`output_resource_id`、`media`、`param_validation`、`terminal` 和 `message`；其中 `monitor` 指向后续 job 查询工具，`param_validation` 携带下文描述的 audit-version-1 字段。修改这些结果字段时，需要同步运行时 MCP 结果、Electron MCP `outputSchema`、静态 Agent catalog `outputSchema`、prompt-summary 测试和 `scripts/verify-agent-compact-contract.mjs`。

紧凑契约 v1 的字段形状由 `docs/agent-compact-contract-v1.schema.json` 定义，canonical 示例在 `docs/agent-compact-contract-v1.fixture.json`。`scripts/verify-agent-compact-contract.mjs`、后端 preview、admin fallback 和 MCP 测试都会读取这些产物，因此修改 compact contract 字段形状时，需要同步更新它们和 focused model capability gate。

`ParamDef.type` 支持 `select`、`number`、`boolean` 和 `string`。

Adapter 默认参数定义在 `apps/backend/internal/infra/ai/catalog.go`。模型之间的差异应通过 `CustomSupportedParams` 表达，可以是完整的 `ParamDef[]` 覆盖，也可以是 `ModelParamProfile`。Admin 模型预设也可以携带模型级 `supported_params`；`/admin/model-presets` 会以 canonical key 返回这些参数，选择这类预设会预填 `custom_supported_params`，让管理员在保存前预览并保存准确的模型 contract，而不是误继承过宽的 adapter 默认参数。

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

不要依赖类似“所有视频模型都支持 10 秒”或“所有图像模型都支持同一组尺寸”的 provider-wide 假设。运行时应以解析后的模型 contract 为唯一事实源。显式模型契约在运行时只使用自己声明的参数规则；历史 provider-wide 跨参数保护只保留给尚未显式覆盖的 adapter 默认契约。

参数 key 在校验前会归一化，确保 admin 配置、MCP 和后端运行时使用同一份契约。支持的别名记录在 `docs/model-param-aliases.json`；当前包括 `ratio -> aspect_ratio`、`duration_seconds -> duration`、`size -> image_size`、`guidance_scale -> prompt_strength`、`max_images -> image_count`、`camera_fixed -> fixed_camera` 和 `generate_audio -> audio`。

保存模型配置前会校验 `CustomSupportedParams`。非法 JSON、不支持的参数类型、重复 key、没有 options 的 select 控件、非法 number 范围、非法 `json_schema` keyword、与控件类型/options/range/schema 不匹配的默认值，以及引用未知参数或规则值非法的跨参数规则都会作为错误的模型配置被拒绝。number 控件会保留显式的零值 `min` 和 `max`，因此 `max: 0` 会被执行，而不会被当成“未设置”；`step` 一旦提供必须大于 0。`json_schema.enum` 必须是非空标量数组；对象或数组 enum 元素会被拒绝。Legacy `ParamDef[]` 只能包含参数定义对象。Profile 配置还必须保持 `allow`/`deny` 为 key 数组、`override` 为按参数名索引的对象、`add` 为参数定义数组。`override` 里的内部 `key` 可以省略；一旦出现，必须和 `override` 的 map key 一致。`add` 只能用于新增参数；重复的 `add` key、以及和 adapter 默认参数或 `override` 已有参数重复的 `add` 项都会被拒绝。Profile 对象、`ParamDef` 对象以及嵌套跨参数规则对象都是闭合字段集合；未知字段会被拒绝，而不是被静默忽略，并且参数字段和嵌套规则字段都会拒绝显式 `null`。标量和数组元素形状也会校验：`key`、`label`、`type` 必须是字符串，`min`、`max`、`step` 必须是数字，`options` 和 `conflicts_with` 的元素必须是字符串，规则数组的元素必须是对象，`when_param`、`param`、`conditional_enum[].options` 等嵌套规则引用也必须符合字符串或字符串数组形状。Profile 的 allow/deny 过滤也会清理继承参数里指向已移除参数的规则，保证导出的 `params_schema` 对 Agent 是安全可信的。

管理端可以调用 `POST /admin/model-configs/preview-contract`，传入 `adapter_type`、`custom_capabilities` 和 `custom_supported_params`，在保存前用后端 resolver 做 dry-run。响应会包含解析后的 `supported_params`、生成的 `params_schema`、schema rule 数量，以及和 Agent 规划使用的 v1 紧凑结构一致的 `agent_contract` 预览。该紧凑预览包含必需的 `input_requirements`、`supported_param_keys`，以及每个参数的 `label`、`type`、`options`、`default`、`min`、`max`、`step`、从 schema 合并出的 `enum`/`description` 和紧凑跨参数规则。

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

新增结构化校验错误时使用 `apps/backend/internal/infra/ai/validation_error.go`。只有当修复方案确定且安全时，才应提供 `suggested_fix`。如果互斥参数的安全修复是移除某个生成参数，用 `null` 作为建议值，例如 `{"frames": null}`。Agent 必须把它解释为从顶层生成参数或 `extra_params` 中删除该参数，而不是把 JSON `null` 提交给服务商。

模型和任务类型不匹配时使用 `code: "UNSUPPORTED_OUTPUT_TYPE"`，`field` 为 `"output_type"`，并用 typed `allowed_values` 列出所选模型支持的 capability。这类错误可以解释，并应引导 Agent 重新选择兼容的模型契约；它不是在同一个 `model_config_id` 上根据 `suggested_fix` 自动重试的场景。

输入资源数量错误使用 `code: "INVALID_INPUT_COUNT"`，`field` 为 `"image"` 或 `"video"`，并带上 `required_min`、`allowed_max` 和 `actual_count`。这类错误可以解释，但不能自动修复：后端不应为它附带会新增、删除或重排 `input_resource_ids` 的 `suggested_fix`，Agent 也不能根据数量信息自行推断要修改哪些引用资源。

后端校验错误的 canonical 形状见 `docs/agent-generation-validation-error-v1.schema.json`，示例见 `docs/agent-generation-validation-error-v1.fixture.json`。

MCP 生成调用成功时还会在工具结果里附带 `param_validation` 审计数据。这个带版本的审计对象包含 `audit_version: 1`、已提交和已过滤的参数 key、`drop_reasons`、`renamed_extra_params` 中的别名归一化、所选模型的 `input_requirements`、已提交的图片/视频输入数量，以及根据模型契约在本地发现的类型/options/range 或紧凑跨参数规则不匹配 `preflight_errors`。`preflight_errors` 可以包含 `allowed_values` 和 `suggested_fix` 提示，包括互斥参数场景里的 `null` 删除提示，方便 Agent/UI 在后端拒绝前解释可能的修复方式。引用资源数量不匹配会单独记录为非阻塞的 `input_preflight_errors`，包含最小要求、最大允许值和实际数量。它们仍然只用于解释，不是最终校验裁决；后端校验仍是权威来源，也只有后端结构化错误才应驱动自动 `suggested_fix` 重试。canonical 审计形状见 `docs/agent-param-validation-audit-v1.schema.json`，示例见 `docs/agent-param-validation-audit-v1.fixture.json`。

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
- 当能力、模型参数、schema 规则或生成校验行为变化时，运行 `pnpm run test:model-capability-contract`。

Provider 设置、能力或运维预期变化时，请更新本页。
