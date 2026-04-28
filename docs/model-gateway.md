# 模型网关架构设计

## 背景

当前系统已经有一层 `apps/backend/internal/ai` Provider 抽象，用于屏蔽 OpenAI-compatible、Anthropic、Gemini、Kling、Volcengine 等供应商差异。业务侧接口例如 `/api/v1/ai/chat`、画布节点、生成任务、脚本分析等，直接调用 `AIService.CallText`、`CallImage`、`CallVideo`。

这个结构能支撑 MovScript 内部业务，但对外部 Agent 接入不够标准：

- `/api/v1/ai/chat` 是业务自定义接口，返回结构不是主流模型调用协议。
- `movscript-agent` 当前可以直接调用 OpenAI-compatible endpoint，绕过后端模型配置、权限、审计和用量记录。
- Agent 生态通常默认支持 OpenAI Chat Completions、Responses、Embeddings、Audio、Images 等标准接口。
- 如果后端只暴露业务接口，每接入一个 Agent 都需要做一次适配。

目标是把后端升级为一个标准化模型网关：对外提供标准模型接口，对内继续复用现有 Provider、模型配置、计费、审计和调试能力。

## 目标

1. 后端提供 OpenAI-compatible 模型网关接口，优先支持 Chat Completions。
2. Agent、插件、前端和内部业务都可以通过同一模型网关调用模型。
3. 保留现有业务接口，避免一次性破坏前端和生成任务。
4. 网关层统一处理鉴权、模型路由、供应商适配、用量统计、调试、限流和错误格式。
5. 支持后续扩展到 Responses API、Images API、Videos API、Embeddings API、工具调用和流式输出。

## 非目标

1. 不要求第一阶段完全替换现有 `/api/v1/ai/chat`。
2. 不要求所有供应商原生能力一次性映射为标准协议。
3. 不把 Agent 业务编排逻辑塞进模型网关；网关只负责模型调用，不负责 Agent 记忆、规划、工具执行。

## 分层设计

推荐把后端 AI 调用拆成四层：

```text
Agent / Plugin / Frontend / Internal Business
        |
        v
Model Gateway API
OpenAI-compatible endpoints, auth, streaming, request/response standardization
        |
        v
Gateway Service
model routing, policy, quota, usage, debug, tracing, provider selection
        |
        v
Provider Adapter Layer
OpenAI-compatible / Anthropic / Gemini / Volcen / Kling / DryRun
        |
        v
External Model Providers
```

现有 `apps/backend/internal/ai` 里的 Provider Adapter Layer 可以继续保留。新增的是 Gateway API 和 Gateway Service。

## API 设计

第一阶段建议先提供 OpenAI Chat Completions 兼容接口：

```http
POST /api/v1/model-gateway/chat/completions
Authorization: Bearer <MovScript token or gateway key>
Content-Type: application/json
```

请求体兼容 OpenAI Chat Completions：

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": false
}
```

响应体兼容 OpenAI Chat Completions：

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "created": 1777363200,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 3,
    "total_tokens": 15
  }
}
```

建议同时提供模型列表：

```http
GET /api/v1/model-gateway/models
Authorization: Bearer <MovScript token or gateway key>
```

响应兼容 OpenAI models list：

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "owned_by": "movscript"
    }
  ]
}
```

为兼容更多 Agent，也可以额外提供无 `/api/v1` 前缀的代理路径：

```http
POST /v1/chat/completions
GET /v1/models
```

这个路径可以作为“标准模型网关入口”，让 Agent 只需要配置：

```text
OPENAI_API_BASE=http://localhost:8080/v1
OPENAI_API_KEY=<MovScript gateway key>
```

当前第一版已落地非流式 Chat Completions：

```text
GET  /v1/models
POST /v1/chat/completions
GET  /api/v1/model-gateway/models
POST /api/v1/model-gateway/chat/completions
```

在正式 Gateway API Key 表实现前，认证暂时复用现有用户身份：

```text
X-User-ID: <user id>
```

为了兼容 OpenAI-compatible 客户端，也临时支持：

```text
Authorization: Bearer <user id>
Authorization: Bearer user_<user id>
```

正式上线前应替换为哈希存储的 Gateway API Key，不应把用户 ID 当作长期 API key 使用。

## 模型路由

网关不能直接让外部调用方访问真实供应商模型 ID，否则会暴露内部配置，也会让切换供应商变困难。建议引入一个稳定的 Gateway Model ID。

```text
gateway model id -> AIModelConfig.ID -> provider adapter -> provider model id
```

示例：

```text
movscript-default-chat -> ai_model_configs.id=12 -> openai_compat -> gpt-4o-mini
movscript-fast-chat    -> ai_model_configs.id=18 -> volcen         -> ep-xxx
movscript-reasoning    -> ai_model_configs.id=21 -> anthropic      -> claude-xxx
```

路由优先级：

1. 请求里的 `model` 命中 Gateway Model Alias。
2. 请求里的 `model` 命中后台配置的公开模型 ID。
3. 如果没有传 `model`，使用默认 text capability 模型。
4. 如果能力不匹配，返回标准错误。

建议新增一张模型别名表，或者先在 `AIModelConfig` 上增加公开别名字段：

```text
gateway_model_id string
is_gateway_visible bool
gateway_priority int
```

第一阶段也可以不改表，临时使用：

```text
model_config:<id>
```

但长期不建议把数据库主键暴露给 Agent。

## 标准请求到内部请求的映射

Chat Completions 请求映射到现有 `ai.TextRequest`：

```text
model             -> Gateway routing result
messages          -> TextRequest.Messages
max_tokens        -> TextRequest.MaxTokens
temperature       -> TextRequest.Temperature
response_format   -> TextRequest.JSONMode
extra fields      -> TextRequest.ExtraParams
```

响应从 `ai.TextResponse` 映射回 OpenAI-compatible：

```text
Content            -> choices[0].message.content
Usage.InputTokens  -> usage.prompt_tokens
Usage.OutputTokens -> usage.completion_tokens
```

`raw payload` 建议保留在调试链路里：

- 原始网关请求体。
- 标准化后的内部 `TextRequest`。
- 实际供应商 HTTP 请求体。
- 实际供应商 HTTP 响应体。

这些内容必须做脱敏，不能记录 API Key、Authorization、签名 URL、私有资源地址。

## 鉴权设计

模型网关需要同时支持两类调用方：

1. 用户态调用：使用当前 MovScript 登录 token，按用户身份计费和审计。
2. Agent/API 调用：使用 Gateway API Key，映射到一个用户、项目或服务账号。

建议新增 API Key 管理：

```text
gateway_api_keys
- id
- name
- key_hash
- owner_user_id
- project_id nullable
- allowed_model_ids json
- allowed_scopes json
- rate_limit_rpm
- monthly_budget
- is_enabled
- created_at
- last_used_at
```

Scope 示例：

```text
model:chat
model:image
model:video
model:tools
```

第一阶段可以先复用现有登录鉴权，随后再加 Gateway API Key。

## 错误格式

对外错误建议兼容 OpenAI 风格：

```json
{
  "error": {
    "message": "model not found",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

内部错误需要映射：

```text
模型不存在       -> 404 model_not_found
无权限           -> 403 insufficient_permissions
参数错误         -> 400 invalid_request_error
余额不足         -> 402 insufficient_quota
供应商超时       -> 504 provider_timeout
供应商返回错误   -> 502 provider_error
```

## 流式输出

第一阶段可以先支持非流式。第二阶段补充 SSE：

```http
POST /v1/chat/completions
{
  "stream": true
}
```

响应：

```text
data: {"id":"chatcmpl_xxx","object":"chat.completion.chunk","choices":[...]}

data: [DONE]
```

为了真正支持流式，Provider 接口需要增加：

```go
TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error)
```

在 Provider 不支持流式时，可以选择：

1. 返回不支持流式的标准错误。
2. 内部非流式调用完成后一次性返回一个 chunk。

推荐第一阶段先显式报错，避免 Agent 误判为真实流式。

## 与现有接口的关系

现有接口保留：

```text
/api/v1/ai/chat
/api/v1/gen-jobs
/api/v1/canvases/:id/nodes/:nodeId/run
```

但内部逐步改为：

```text
业务接口 -> Gateway Service -> AIService/Provider
标准接口 -> Gateway Service -> AIService/Provider
```

这样外部 Agent 和内部业务走同一套模型策略，但业务接口仍然可以保留自己的业务语义。

## Agent 接入方式

`movscript-agent` 不再直接读取 `MOVSCRIPT_AGENT_OPENAI_API_KEY` 调供应商，而是默认调用后端模型网关：

```text
MOVSCRIPT_AGENT_OPENAI_BASE_URL=http://localhost:8080/v1
MOVSCRIPT_AGENT_OPENAI_API_KEY=<MovScript gateway key>
MOVSCRIPT_AGENT_OPENAI_MODEL=movscript-default-chat
```

这样 Agent 可以继续按 OpenAI-compatible 协议工作，同时复用后端配置的任何模型供应商。

第三方 Agent 接入同理：

```text
base_url = http://localhost:8080/v1
api_key = <MovScript gateway key>
model = movscript-default-chat
```

## 实施计划

### 第一阶段：Chat Completions 网关

1. 新增 `apps/backend/internal/gateway` 或 `apps/backend/internal/ai/gateway`。
2. 定义 OpenAI-compatible request/response DTO。
3. 新增 `ModelGatewayService.ChatCompletion`。
4. 复用 `AIService.CallText` 完成真实调用。
5. 新增路由：

```text
POST /api/v1/model-gateway/chat/completions
GET /api/v1/model-gateway/models
POST /v1/chat/completions
GET /v1/models
```

6. 非流式先跑通。
7. `movscript-agent` 默认接入后端 `/v1`。

### 第二阶段：API Key、审计、限流

1. 新增 Gateway API Key 表和管理接口。
2. 支持服务账号调用。
3. 记录 gateway request log。
4. 增加 per-key、per-user、per-model 限流。
5. 增加 budget 控制。

### 第三阶段：Streaming 和 Tool Calls

1. Provider 增加流式接口。
2. Chat Completions 支持 SSE。
3. 支持 OpenAI tool calls 格式。
4. Agent 工具执行仍由 Agent Runtime 控制，模型网关只透传或规范化 tool call 结构。

### 第四阶段：多模态和更多标准接口

1. `/v1/images/generations`
2. `/v1/images/edits`
3. `/v1/videos/generations` 或内部约定的 video extension。
4. `/v1/responses`
5. `/v1/embeddings`

## 推荐目录结构

```text
apps/backend/internal/gateway/
  handler.go          // HTTP handler, Gin binding, SSE
  service.go          // Gateway orchestration
  openai_types.go     // OpenAI-compatible DTO
  router.go           // Optional route registration helper
  auth.go             // Gateway key resolution, user resolution
  errors.go           // Standard error mapping
  models.go           // Gateway model listing and routing
```

`apps/backend/internal/ai` 保持为 Provider 和模型配置层，不直接承担标准协议兼容职责。

## 关键原则

1. 标准接口对外，Provider 差异对内。
2. Agent 只依赖 OpenAI-compatible 协议，不依赖 MovScript 私有业务接口。
3. 业务接口可以继续存在，但模型调用必须收口到同一个 Gateway Service。
4. 模型 ID 对外稳定，真实供应商和真实模型可以后台切换。
5. Raw payload 可调试，但必须脱敏、可开关、可按权限查看。
