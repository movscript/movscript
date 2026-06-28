# MovScript 模型模板 Registry 设计

## 目标

MovScript 需要一套可维护、可验证、可生成代码的模型模板来源，用来替代当前手写在 Go 代码中的 `catalogTemplateSources`。这套 registry 的目标不是建立通用 AI 模型知识库，也不是取代 adapter，而是稳定表达 MovScript 产品里可用的模型模板和生成参数契约。

最终目标：

- 模型模板源数据从 Go struct 中移出，变成可审阅的数据文件。
- 生成当前后端需要的 `CatalogTemplate` Go 产物。
- 保持现有运行时边界：Catalog Entry 管模型身份和参数契约，Route Binding 管线路和 `provider_model_id`，Adapter 管 provider-native 请求；模板里的 `model_id` 表达默认 API-level/upstream model id。
- 使用 canonical 参数抽象继续承载视频、图像、音频能力，避免把 provider-native 字段泄漏到 UI、Agent contract 或 catalog template。
- 支持每个模板记录官方来源和验证日期，降低模型参数维护时的猜测成本。
- 使用 `models.dev`、LiteLLM、OpenRouter 等外部 catalog 做辅助 audit，不把它们作为最终 truth source。

运行时路由、endpoint profile、route-level capability 和 Admin 路由诊断的后续改造见
[`model-routing-adapter-refactor-plan.zh-CN.md`](./model-routing-adapter-refactor-plan.zh-CN.md)。

## 非目标

第一版不做下面这些事情：

- 不做 public package。
- 不设计完整模型知识图谱。
- 不维护 lab-agnostic / route-specific 双层继承模型。
- 不把 pricing、上下文窗口、benchmark、release notes 全量纳入 registry。
- 不把 adapter mapping 抽成数据文件。
- 不通过网络在运行时拉取外部模型目录。
- 不让 registry 直接决定用户使用哪条 route、哪个 credential、哪个中转站分组。

如果未来 text model 的 context window 或 pricing 进入 MovScript 的配额、预估、路由策略，再在独立字段中扩展；不要提前把通用模型数据库搬进项目。

## 当前问题

目前模型模板集中在：

```text
services/data-service/internal/infra/ai/catalog_templates.go
```

当前实现的好处是简单、类型安全、和 Go 代码放在一起；问题是：

- 模型数量增加后 Go 文件可读性下降。
- 参数来源不明确，难以知道某个枚举来自官方文档、兼容层经验还是历史配置。
- 模型参数和模板展示混在一起，review diff 噪声较大。
- 想批量核对官方文档或外部 catalog 时缺少稳定数据结构。
- 后端、Admin UI、Agent contract 未来可能需要同一份模板数据的不同产物。

## 命名原则：Lab 与 Provider 分离

Registry 的聚合维度使用 **Lab**，不使用 Provider。

在 MovScript 语境中：

- Lab：模型创造方、模型家族或官方模型来源，例如 OpenAI、Anthropic、Google Gemini、Seed、ElevenLabs、Kling、Vidu。
- Provider / AI Account：模型调用账号或接入端点，核心是 key、base URL 和账号类型；它可以是用户自己的 OpenAI key、Volcengine Ark credential、中转站分组、OpenRouter、某个第三方中转站，也可以是本地 OpenAI-compatible endpoint。
- Adapter：Route Binding 使用的调用协议 / 请求构造器，例如 `openai_compat`、`anthropic`、`gemini`、`volcen`、`elevenlabs`。它可以从 Provider 默认值带出，但必须作为 route-level 字段保存，避免把“账号/供应商 lane”和“接口协议”绑死。

本地运行时也遵循同一条边界：`open-source-audio` 是 MusicGen / ACE-Step 这类模型家族 lab，`local_audio_runtime` 才是本地执行通道 Provider。开源模型只有在 MovScript runtime path 真正执行对应模型家族后，才从 `template_only` 提升为可生成一键 combo 的模板。

因此 registry 文件按 lab 聚合：

```text
labs/openai.yaml
labs/anthropic.yaml
labs/alibaba-dashscope.yaml
labs/deepseek.yaml
labs/zai.yaml
labs/minimax.yaml
labs/google-gemini.yaml
labs/seed.yaml
labs/elevenlabs.yaml
labs/stability-audio.yaml
labs/mureka.yaml
labs/open-source-audio.yaml
labs/kling.yaml
labs/vidu.yaml
labs/xai.yaml
```

Admin 相关模板也应进入同一套 registry 源文件：

```text
providers.yaml     # AI Account / Provider 内置模板
combo_rules.yaml   # Catalog 模板如何派生一键启用的 Provider 组合
```

Route Binding 仍然使用 provider 语义，因为它描述的是实际调用线路：

```text
Catalog Entry: seedance-2-0
Lab: seed
Route Binding A: provider_id=volcengine-ark, adapter_type=volcen, provider_model_id=doubao-seedance-2-0-260128
Route Binding B: provider_id=relay-video-gateway, adapter_type=openai_compat, route_group=video-default, provider_model_id=seedance-2-0
```

这条边界可以避免把“模型是谁做的”、“账号从哪里走”和“用什么接口协议调用”混在一起。

## Admin 信息架构

Admin 里用户真正要配置的不是“模型厂商”，而是 **AI 账号**。

AI 账号回答：

- 这是谁的调用账号？
- 用什么 API 类型调用？
- key / AK/SK / OAuth token 放在哪里？
- base URL 是官方地址、中转站地址，还是本地 endpoint？
- 这个账号当前是否健康？
- 它能支撑哪些能力包？

因此 Admin 应把当前容易混淆的 Provider 配置拆成三个层次：

```text
AI Account / Provider
  -> Credentials
  -> Model Routes
```

### AI Account / Provider

面向用户的主概念建议叫“AI 账号”或“接入账号”。代码和 API 可以继续保留 `AIProvider` / `provider_id`，但 UI 不要直接把 provider 当成模型来源。

它表达：

- `provider_id`
- `provider_kind`
- `provider_category`
- `display_name`
- `adapter_key`
- `base_url_prefix`
- `account_ref`
- asset library state
- trusted resource state
- health state

示例：

| AI 账号 | 类型 | Base URL | Adapter |
| --- | --- | --- | --- |
| 我的火山方舟 | `volcengine_ark_official` | `https://ark.cn-beijing.volces.com/api/v3` | `volcen` |
| 公司中转站 | `openai_compat_gateway` | `https://gateway.example.com/v1` | `openai_compat` |
| 本地 Comfy / vLLM | `local_openai_compat` | `http://127.0.0.1:8000/v1` | `openai_compat` |

### Credentials

Credentials 是 AI 账号下面可轮换的密钥，不应成为用户理解系统的第一层入口。

它表达：

- `credential_key`
- `credential_kind`
- encrypted secrets
- masked secrets
- plain config
- status
- primary / priority
- expires / rotated / last used
- health state

因此 Admin 第一屏不应该是“Credentials 列表”，而应该是“AI 账号列表”；进入账号详情后再看到密钥、轮换、禁用、测试和健康状态。

### Model Routes

Model Route 负责把 MovScript 的 public model 接到某个 AI 账号上的实际 upstream model。

它表达：

- `catalog_entry_id`
- `source_type`
- `provider_id`
- `provider_model_id`
- `route_group`
- `api_kinds`
- priority / capacity / concurrency

Route 不应该承担 key、base URL、账号类型这些信息；这些信息属于 AI Account。

### Admin 页面建议

本地 / Basic Admin：

```text
AI 账号
  -> 添加账号
  -> 选择账号类型
  -> 填 key 和 base URL
  -> 测试连接
  -> 应用能力包
```

Cloud / Advanced Admin：

```text
AI 账号
模型目录
模型线路
密钥轮换
健康检查
用量和成本
审计
```

创建 Catalog Entry 时，模板选择应先按 `lab` 过滤，例如 `seed`、`openai`、`kling`。Provider / AI Account 不参与模板筛选；它只在 Model Route 绑定阶段决定请求从哪个账号、base URL 和 credential 出去。Route Binding 还必须显式保存 `adapter_type`，用于表达这条 route 实际采用哪个调用协议；UI 可以从 Provider / AI Account 自动填默认值，但运行时应该优先使用 route 自己的 adapter。

这个拆法可以让用户先理解“我接入了哪个账号”，再理解“哪些模型走这个账号”，最后才需要看到 route matrix、fallback、priority、capacity 等高级治理能力。

## 现有边界

现有边界是正确的，应保留。

### Catalog Template

`CatalogTemplate` 是后台快速创建 Catalog Entry 的只读模板。它不是运行时路由表。

模板表达：

- MovScript 模板 ID
- 默认 public model id
- 默认 API-level/upstream model id
- lab id
- display name
- adapter type
- capabilities
- 输入约束
- supported params

### AIModelCatalogEntry

`AIModelCatalogEntry` 是 MovScript 对外稳定模型身份和参数契约。

它表达：

- `public_model_id`
- `display_name`
- `capabilities`
- `accepts_image`
- `max_input_images`
- `max_input_videos`
- `supported_params`
- `param_limits_json`

Catalog Entry 是调用方和 Agent 看到的模型入口。

### AIModelRouteBinding

`AIModelRouteBinding` 管连接到 AI Account / Provider 的模型线路，不属于 registry 源数据。

它表达：

- `source_type`
- `route_group`
- `provider_id`
- `provider_model_id`
- `api_kinds`
- AI account credential / 中转站分组
- priority / capacity / concurrency

同一个 Catalog Entry 可以绑定不同 `provider_model_id`、不同 route group 或不同 credential。Registry 不应替它做线路选择。

### Adapter

Adapter 负责把 MovScript 的 canonical request 转成 provider-native request。

例如：

- Volcengine Ark 视频任务把 `aspect_ratio` 写为 `ratio`。
- DashScope 视频参数把 `aspect_ratio` 写到 `parameters.ratio`。
- Vidu 使用 `aspect_ratio` 字段。
- Kling 使用 `aspect_ratio` 字段。
- OpenAI image API 使用 `size`，但 MovScript UI 暴露 `image_size`。

这些映射是 adapter 的请求构造责任，不属于模型 registry。

## 参数抽象边界

MovScript 已经有一套 canonical generation params：

```text
services/data-service/internal/infra/ai/params.go
services/data-service/internal/infra/ai/validator.go
```

Registry 只声明模型支持哪些 canonical 参数：

```yaml
params:
  - key: duration
  - key: aspect_ratio
  - key: resolution
  - key: frames
  - key: audio
```

Registry 不声明 provider-native 字段：

```yaml
# 不要这样做
param_map:
  aspect_ratio: ratio
  audio: generate_audio
```

最终边界：

```text
Registry: 这个模型允许用户调哪些旋钮
Validator: 用户提交的旋钮是否合法，并归一成 canonical key
Adapter: canonical key 如何变成 upstream API request
```

这样可以避免数据模型过度设计，也能保持视频参数抽象层的稳定。

## 目录结构

第一版建议直接放在后端 AI infra 目录下，避免 prematurely public package：

```text
services/data-service/internal/infra/ai/model_registry/
  schema.json
  labs/
    openai.yaml
    anthropic.yaml
    google-gemini.yaml
    xai.yaml
    elevenlabs.yaml
    seed.yaml
    kling.yaml
    vidu.yaml
    alibaba-dashscope.yaml
  README.md
```

生成产物：

```text
services/data-service/internal/infra/ai/catalog_templates.generated.go
services/data-service/internal/infra/ai/model_registry.snapshot.json
```

工具：

```text
services/data-service/internal/infra/ai/cmd/model-registry-generate
services/data-service/internal/infra/ai/cmd/model-registry-audit
```

如果之后 Admin/Agent 需要直接消费 TS 产物，再把 registry 上移到 `packages/model-registry`。第一版不要先上移，避免增加 workspace、发布和跨语言构建复杂度。当前阶段，data-service 里的 Admin 模板不再手写 Go 列表，而是由 `model_registry` YAML 生成。

## 数据模型

数据模型只覆盖当前 `CatalogTemplate` 能表达的内容，加上最小来源信息。

### Lab 文件

每个 lab 一个 YAML 文件：

```yaml
lab: seed
templates:
  - id: volcengine:seedance-2-0
    lab: seed
    model_id: doubao-seedance-2-0-260128
    display_name: Seedance 2.0 视频
    adapter_type: volcen
    capabilities: [video, video_i2v, video_v2v]
    allow_model_id_override: true
    input:
      accepts_image: true
      max_images: 1
      max_videos: 1
    video:
      default_duration_sec: 5
      max_duration_sec: 15
    params:
      - key: duration
        label: 时长(秒)
        type: select
        options: ["-1", "4", "5", "10", "11", "15"]
        default: "5"
        conflicts_with: [frames]
      - key: frames
        label: 帧数
        type: number
        min: 29
        max: 289
        step: 4
        json_schema:
          enum: [29, 33, 37]
          description: Frame count must be in [29,289] and match 25 + 4n.
        conflicts_with: [duration]
      - key: aspect_ratio
        label: 画面比例
        type: select
        options: [adaptive, "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
        default: "16:9"
      - key: resolution
        label: 清晰度
        type: select
        options: [480p, 720p, 1080p]
        default: 720p
        conditional_enum:
          - when_param: workspace
            when_value: true
            options: [480p]
    source:
      url: https://www.volcengine.com/docs/82379/1520757
      verified_at: 2026-06-25
      status: verified
```

### 字段说明

必填字段：

| 字段 | 说明 |
| --- | --- |
| `id` | MovScript 模板 ID，格式建议为 `{route-family}:{slug}` 或 `{lab}:{slug}`，例如 `openai:gpt-5.2`、`volcengine:seedance-2-0`；`volcengine:*` 是兼容既有 Volcengine/Ark 接入族的模板 key，不代表 Lab |
| `lab` | 模型来源或模型家族，例如 `openai`、`seed`、`elevenlabs` |
| `model_id` | 默认 API-level/upstream model id，即 adapter 发请求时默认使用的模型名；如果线路需要替换，交给 Route Binding 的 `provider_model_id` 或 override |
| `display_name` | Admin 展示名 |
| `adapter_type` | 现有 adapter type，例如 `openai_compat`、`volcen`、`elevenlabs` |
| `capabilities` | MovScript 能力列表 |
| `source.url` | 参数来源 |
| `source.verified_at` | 最近人工核对日期 |
| `source.status` | `verified`、`needs_review`、`deprecated`、`unofficial`、`observed`、`template_only` |

可选字段：

| 字段 | 说明 |
| --- | --- |
| `allow_model_id_override` | 是否允许管理员替换 model id，例如 Ark endpoint id |
| `input.accepts_image` | 是否支持图片输入 |
| `input.max_images` | 最大图片输入数，`0` 表示不支持，`-1` 表示不限制 |
| `input.max_videos` | 最大视频输入数 |
| `image_edit_field` | 图片编辑 multipart 字段名 |
| `video.default_duration_sec` | 默认时长 |
| `video.max_duration_sec` | 最大时长 |
| `params` | 模型支持的 canonical 参数列表 |

不要加入第一版的字段：

- `pricing`
- `context_window`
- `max_output_tokens`
- `knowledge_cutoff`
- `release_date`
- `benchmarks`
- `tool_call`
- `structured_output`
- `provider_native_param_map`

这些字段不是当前模板系统的核心需求。未来如果确实需要，可以在不破坏现有 schema 的情况下新增。

## ParamDef 映射

YAML 中的 `params` 直接映射到现有 `ParamDef`：

| YAML 字段 | Go 字段 |
| --- | --- |
| `key` | `ParamDef.Key` |
| `label` | `ParamDef.Label` |
| `type` | `ParamDef.Type` |
| `options` | `ParamDef.Options` |
| `default` | `ParamDef.Default` |
| `min` | `ParamDef.Min` + `minSet` |
| `max` | `ParamDef.Max` + `maxSet` |
| `step` | `ParamDef.Step` + `stepSet` |
| `json_schema` | `ParamDef.JSONSchema` |
| `conflicts_with` | `ParamDef.ConflictsWith` |
| `conditional_enum` | `ParamDef.ConditionalEnum` |
| `conditional_const` | `ParamDef.ConditionalConst` |
| `requires_value` | `ParamDef.RequiresValue` |

生成器必须保留显式 `min: 0`、`max: 0`、`step: 0` 的语义。现有 `ParamDef` 通过 `minSet`、`maxSet`、`stepSet` 区分零值和未设置，生成器需要正确设置这些内部状态。

## 生成流程

```text
model_registry/labs/*.yaml
        ↓ validate schema
        ↓ normalize canonical param keys
        ↓ validate ParamDef rules
        ↓ generate catalog_templates.generated.go
        ↓ generate model_registry.snapshot.json
        ↓ go test
```

### catalog_templates.generated.go

生成文件应提供：

```go
var catalogTemplateSources = []ModelDef{ ... }
```

或者更明确地提供：

```go
func generatedCatalogTemplateSources() []ModelDef
```

为了减少现有代码改动，第一版可以继续生成 `catalogTemplateSources`，让 `CatalogTemplates()` 无需大改。

### snapshot

`model_registry.snapshot.json` 用于 review 和外部 audit，不参与运行时：

```json
[
  {
    "id": "volcengine:seedance-2-0",
    "lab": "seed",
    "model_id": "doubao-seedance-2-0-260128",
    "adapter_type": "volcen",
    "capabilities": ["video", "video_i2v", "video_v2v"],
    "param_keys": ["duration", "frames", "aspect_ratio", "resolution"],
    "source": {
      "url": "https://www.volcengine.com/docs/82379/1520757",
      "verified_at": "2026-06-25",
      "status": "verified"
    }
  }
]
```

Snapshot 的作用：

- PR 中容易看出模板变化。
- 外部 audit 可以对 snapshot 做 diff。
- Admin/Agent 后续如果要生成文档或测试 fixture，可以复用 snapshot。

## 校验规则

Registry validator 至少检查：

- `id` 非空且唯一。
- `lab` 非空，且与所在 lab 文件一致。
- `model_id` 非空。
- `display_name` 非空。
- `adapter_type` 必须是现有 adapter type。
- `capabilities` 必须全部是现有 `Capability*`。
- `params.key` 必须是 canonical key，不能是 legacy alias。
- `params.type` 必须是 `select`、`number`、`boolean`、`string`、`text` 中的已支持类型。
- `select` 参数的 `default` 必须在 `options` 中。
- `number` 参数的 `default` 必须落在 `min/max/json_schema` 约束内。
- `conflicts_with`、`conditional_enum.when_param`、`conditional_const.when_param`、`requires_value.param` 必须引用当前模型声明的参数。
- `source.url` 非空。
- `source.verified_at` 是 `YYYY-MM-DD`。
- `source.status` 是允许枚举。

生成后的 Go tests 继续复用现有能力：

- `ValidateModelParamConfig`
- `ValidateGenerationParams`
- `ParamsSchema`
- visual template 默认参数验证
- input metadata consistency

## 外部 Catalog 的角色

外部 catalog 只做辅助，不做最终事实源。

### models.dev

可用于检查：

- OpenAI / Anthropic / Google / xAI text model 是否过时。
- model id 是否存在。
- modalities / reasoning 等基础事实是否有明显冲突。

不用于覆盖：

- Seedream / Seedance / Kling / Vidu / ElevenLabs 的 MovScript 参数契约。
- adapter type。
- input count。
- route binding。
- provider-native request mapping。

### LiteLLM

可用于检查：

- LLM context / pricing / provider alias。
- OpenAI-compatible 文本模型是否已有通用 metadata。

不用于生成 MovScript 视频、图像、音频参数。

### OpenRouter

可用于检查：

- 网关提供的 model availability。
- context、pricing、modalities、supported parameter hints。

不作为直接 adapter 的 truth source，除非用户线路就是 OpenRouter。

## 官方参数获取策略

官方参数不应该靠记忆维护，但第一版也不需要纯自动化。正确方式是 **人工确认 + 机器辅助 audit**。

### 来源优先级

参数来源按可信度排序：

1. 官方 API schema / OpenAPI / model metadata endpoint。
2. 官方 API Reference 文档。
3. 官方模型页面 / changelog / release notes。
4. models.dev、LiteLLM、OpenRouter 等外部 catalog。
5. 中转商文档或第三方示例。

Registry 的 `source.status=verified` 只能来自 1-3。外部 catalog 只能标记为 `needs_review` 或 `observed` 的参考证据，不能直接把参数写成 verified。

默认 registry 只维护当前官方文档能够证明的 public model template。历史 slug、灰度 slug、第三方路由 slug、以及官方当前页面无法证明的模型，不进入默认 catalog；如果业务仍需要调用，应通过 Admin 的 AI Account + Model Route 绑定自定义 `provider_model_id`，而不是把它们伪装成 MovScript 官方模板。

当模型名来自官方资料但 MovScript 尚未实现对应 adapter/runtime path 时，可以标记 `source.status=template_only`。这类模板用于 Admin 发现和后续适配排期，不生成一键启用的 combo template。

如果官方明确标记 retired / deprecated / shutdown，但 MovScript 仍需要兼容旧项目，可以保留模板并标记 `source.status=deprecated`。Deprecated 模板用于解释和迁移，不代表推荐新建使用。

### 获取方式

不同 lab 的可自动化程度不一样：

| Lab | 获取方式 | 说明 |
| --- | --- | --- |
| OpenAI | 官方 models 页面、API Reference、必要时 `/v1/models` 辅助 | `/v1/models` 更适合确认 model id 存在；图像、音频等参数仍以 API Reference 为准 |
| Anthropic | 官方 models 页面、context window 文档、Messages API Reference | text model facts 可半自动；请求参数以 API Reference 为准 |
| Google Gemini | 官方 models guide、`models.get` / `models.list`、API Reference | Gemini 对模型 metadata 的 API 支持相对好，适合自动 audit |
| xAI | 官方 Models、Imagine、migration 文档 | 默认 catalog 只收当前官方模型；旧 slug 走 route 自定义或 deprecated 兼容 |
| ElevenLabs | 官方 Models 页面、TTS/STT API Reference、voice settings API | voice settings 需要区分“请求参数”和“voice 默认配置” |
| Seed | Volcengine Ark / BytePlus ModelArk 官方模型 API 文档 | Seedream/Seedance 的官方 API 文档发布在 Ark/ModelArk 文档体系中；Volcengine 是接入供应商，不是 Lab |
| Kling | KlingAI Open Platform API Reference | 视频参数以具体 endpoint 为准，注意版本差异 |
| Vidu | Vidu API Reference | 参数随模型版本差异明显，需要按 endpoint 和 model id 记录 |
| DashScope | DashScope 官方 API Reference | 参数位置和 adapter request body 结构要分开记录 |

### 不要试图一次全自动

很多视频模型的官方文档不是稳定机器 schema，而是网页表格。第一版可以这样做：

```text
现有 catalog_templates.go
-> 生成待核对清单
-> 按 lab 拉取官方文档快照
-> 自动抽取参数名、枚举、默认值、限制
-> 和 registry snapshot diff
-> 人工确认差异
-> 更新 YAML source.verified_at
```

也就是说，工具负责发现差异，人负责决定 MovScript 的 canonical contract。

### 记录粒度

第一版只要求模板级来源：

```yaml
source:
  url: https://...
  verified_at: 2026-06-25
  status: verified
```

如果后续发现同一个模型的不同参数来自不同页面，再扩展为参数级来源：

```yaml
params:
  - key: duration
    source:
      url: https://...
      section: Request parameters / duration
      verified_at: 2026-06-25
```

不要第一版就强制所有参数都有独立 source，否则迁移成本会过高。

### 官方文档变更监控

Audit 工具可以做这些事：

- 检查 `verified_at` 超过 90 天的模板。
- 抓取官方文档并保存摘要 hash。
- 抽取参数表和当前 snapshot 对比。
- 发现模型下线、重命名、新版本或参数枚举变化。
- 输出报告，不自动改 YAML。

这个策略把“挨个翻官网”变成一次性建档 + 周期性变更检查。

## Audit 工具

`model-registry-audit` 应输出报告，不自动改 registry：

```text
template_id                         source       finding
openai:gpt-5.2                      models.dev   upstream recommends newer gpt-5.5
anthropic:claude-opus-4             official     model_id points to claude-opus-4-5 but display says Opus 4
gemini:gemini-2-0-flash             official     upstream deprecated or shut down
volcengine:seedance-2-0             official     verified_at older than 90 days
```

报告分级：

| 级别 | 说明 |
| --- | --- |
| `error` | 本地 schema 无效或生成会失败 |
| `warning` | 外部事实不一致、来源过期、模型疑似过时 |
| `info` | 上游有新模型或字段可参考 |

Audit 不应在 CI 中因为外部网络失败而阻塞普通构建。可以提供手动命令或定时 job。

## Admin 和 Agent Contract

Admin 创建 Catalog Entry 的流程保持：

```text
registry template
-> CatalogTemplate API
-> 用户创建/编辑 AIModelCatalogEntry
-> Route Binding 配置 provider_model_id / group / credential
```

Agent contract 来源保持：

```text
AIModelCatalogEntry.supported_params
-> ResolveModelDef
-> ParamsSchema
-> AgentContract
```

Registry 只影响模板初始值，不直接绕过 Catalog Entry。

## 运行时流程

生成任务：

```text
用户/Agent 选择 public model id
-> Resolve Catalog Entry + Route Binding
-> ResolveModelDef
-> ValidateGenRequest
-> ValidateAndNormalizeGenerationParams
-> canonical params
-> adapter VideoRequest/ImageRequest/AudioRequest
-> provider-native request body
```

关键约束：

- `ValidateAndNormalizeGenerationParams` 输出 canonical keys。
- `VideoRequest`、`ImageRequest`、`AudioRequest` 是 adapter 前的内部 request。
- adapter request builder 负责 native 字段。
- registry 不参与运行时线路选择。

## 迁移策略

本项目当前不需要渐进式兼容旧架构，但需要一次迁移后保持行为等价。

### 第一步：建立 registry 数据文件

把当前 73 个模板完整迁移到 YAML，字段与现有 `ModelDef` 对齐。

要求：

- 生成后的 `CatalogTemplates()` 输出与当前输出等价。
- 每个模板补 `source`，无法确认来源的先标 `needs_review`。
- 参数 key 全部 canonical 化。

### 第二步：生成 Go 产物

新增生成器，产出 `catalog_templates.generated.go`。

旧 `catalog_templates.go` 中的手写 `catalogTemplateSources` 删除或替换为生成说明。

保留手写 helper：

- `volcenSeedream*Params`
- `volcenSeedanceParams`
- `openAIGPTImageParams`
- `elevenLabsTTSParams`
- `viduVideoParams`

是否保留这些 helper 取决于迁移后的可读性。更推荐 YAML 直接展开参数，避免 registry 继续依赖 Go helper 作为隐藏事实源。

### 第三步：删除手写模板源

模板源只允许存在于 registry YAML。Go 文件只允许生成。

在生成文件头部写明：

```go
// Code generated by model-registry-generate; DO NOT EDIT.
```

### 第四步：加 CI 校验

CI 至少运行：

```bash
go test ./internal/infra/ai
go run ./internal/infra/ai/cmd/model-registry-generate --check
```

`--check` 需要验证生成文件和 snapshot 没有未提交 diff。

### 第五步：官方参数专项校正

按 lab 校正参数：

1. Seed / Seedream / Seedance
2. ElevenLabs
3. Gemini
4. OpenAI
5. Anthropic
6. xAI
7. Kling / Vidu / DashScope

每次校正需要更新：

- YAML params
- `source.verified_at`
- 相关 adapter tests 或 validator tests
- snapshot

## 文件所有权

建议所有权：

| 文件 | Owner |
| --- | --- |
| `model_registry/labs/*.yaml` | AI lab/catalog 维护者 |
| `params.go` | MovScript canonical 参数抽象维护者 |
| `validator.go` | 运行时契约维护者 |
| `adapter_*.go` | adapter 维护者 |
| `AIModelCatalogEntry` / `AIModelRouteBinding` | catalog/route 数据模型维护者 |

特别约束：

- 修改 registry 只是在修改模型支持的 canonical 参数。
- 修改 provider-native 字段名必须改 adapter。
- 修改 canonical 参数名必须改 `params.go`、validator、Admin/Agent contract tests。

## 设计取舍

### 为什么不用 models.dev 做主源

`models.dev` 对 LLM 基础事实很好，但 MovScript 的核心是图像、视频、音频生成参数契约。Seedance、Seedream、Kling、Vidu、ElevenLabs 的参数和条件约束很难由通用模型库完整覆盖。

因此：

```text
models.dev = reference / audit
MovScript registry = product contract truth source
```

### 为什么不把 mapping 放进 registry

因为 MovScript 已经有 canonical 参数层。把 mapping 放进 registry 会让数据模型同时承担“产品契约”和“upstream request builder”两个职责，后续会导致：

- 同一 adapter 的映射在多个模型里重复。
- 上游 SDK 或 API 结构变化需要改数据文件而不是 adapter tests。
- UI/Agent contract 容易混入 native 字段。
- 参数校验和请求构造边界变模糊。

所以 mapping 留在 adapter。

### 为什么第一版不上移到 package

第一版目标是替换模板源数据，不是创建可复用库。放在 backend infra 内可以：

- 减少 workspace 构建复杂度。
- 复用现有 Go tests。
- 避免过早承诺 public API。
- 等 Admin/Agent 真正需要 TS 产物时再上移。

## 风险和缓解

| 风险 | 缓解 |
| --- | --- |
| YAML 和 Go 生成不一致 | `--check` + snapshot diff |
| 参数来源不完整 | `source.status=needs_review`，audit 报告提示 |
| registry 过度膨胀 | 第一版 schema 限定在 CatalogTemplate 能表达的字段 |
| provider-native 字段泄漏到 registry | validator 禁止 legacy/native alias key |
| adapter mapping 被遗漏 | adapter tests 覆盖 upstream request body |
| 外部 catalog 不稳定 | audit 不阻塞普通构建，不自动覆盖 |

## 完成标准

第一版完成时应满足：

- 当前所有模板都迁移到 registry YAML。
- `catalog_templates.generated.go` 是唯一模板源产物。
- `CatalogTemplates()` 行为与迁移前等价，除非同一 PR 明确修正官方参数。
- 每个模板有 `source`。
- registry validator 覆盖字段、参数、来源和 canonical key。
- Go tests 覆盖生成模板的参数合法性。
- adapter mapping 仍然在 adapter 层，文档和测试明确约束。

## 后续扩展

只有在明确需求出现时再扩展：

- Admin 需要离线展示更多模型事实时，增加 text model facts。
- 配额/成本需要统一计算时，增加 pricing source。
- Agent 需要按 context window 选模型时，增加 text limits。
- 多语言前端需要直接消费模板时，生成 TS/JSON 产物。
- 外部用户需要复用时，再考虑 public package。

扩展原则：

```text
先证明运行时或产品需要，再扩展 registry schema。
```
