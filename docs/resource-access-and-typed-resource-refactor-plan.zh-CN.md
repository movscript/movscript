# 资源公网访问与 Typed Resource 引用改造计划

状态：实施中。本文档聚焦 RawResource 如何被画布、Tool、Agent 和模型路由安全、稳定地引用与传给上游模型。模型能力、route capability、adapter 边界仍以 `docs/model-routing-adapter-refactor-plan.zh-CN.md` 为主。

## 背景

当前问题有三类：

1. 内容画布和 prompt 编译后的资源引用仍偏文本化，例如 `@[resource:123]`。它只能表达“这里有一个资源”，不能表达资源类型、输入角色和本次生成能力之间的关系。
2. 画布、Tool 和 Agent 都可能引用 RawResource，但不同入口对资源 role 的理解不一致。比如同样是两张图片，可能是普通图生视频、多图参考、首尾帧，或者角色/风格参考。
3. 某些 provider route 只接受公网 URL。现在 `public_base_url` 与 provider asset / deployment settings 有耦合，容易让 Provider 配置承担“本地资源如何出公网”的职责。

这会导致两个直接后果：

- router 容易根据输入数量或 provider 特判猜能力，心智不稳。
- 配置公网 URL 时，用户不知道应该在 Provider、部署资源访问、对象中转还是资源管理里配置。

## 总目标

把资源引用和资源出站访问收敛成统一链路：

```text
Canvas / Tool / Agent
  -> GenerationIntent(capability + operation + typed reference assets)
  -> Router(route capability + asset_transport)
  -> Resource Access Resolver(public URL / file id / provider asset URI)
  -> Adapter(provider payload)
```

核心原则：

- 调用模型必须显式声明 `capability` 和 `operation`。
- 资源输入必须结构化表达 `resource_id`、`media_type` 和 `role`。
- Provider 配置不再拥有公网资源访问配置。
- RawResource 不持久化 ngrok URL 这类运行时公网地址。
- route 只声明媒体传输需求；资源系统负责满足这些需求。

一句话边界：

```text
Provider 管账号和默认 API host；Resource Access 管本地资源如何被外部访问。
```

## 非目标

- 不保留旧的无 operation 推断调用。
- 不让 prompt 文本成为能力判断的事实源。
- 不把 ngrok URL、临时签名 URL 或 provider 输入 URL 写入 RawResource 主记录。
- 不在 adapter 内自行上传、签名或拼接本地资源公网 URL。
- 不要求第一阶段支持所有对象存储上传策略，但接口必须能容纳 ngrok、public backend、object relay 和 provider files API。

## 术语

| 术语 | 含义 |
| --- | --- |
| RawResource | MovScript 内部资源实体，代表上传文件、生成结果或导入媒体 |
| Typed Resource Ref | 带资源类型和角色的资源引用，例如 image first frame |
| Reference Asset | 生成请求里的结构化参考资源输入 |
| Resource Access Profile | 资源出站访问配置，例如 ngrok/public backend/object relay |
| Resource Access Resolver | 后端统一把 RawResource 转成 route 可消费输入的服务 |
| Asset Transport | route 声明的媒体传输要求，例如 public URL、inline base64、provider file id |

## 目标数据合同

### GenerationIntent

画布、Tool 和 Agent 进入生成链路时必须提供显式 intent：

```json
{
  "model_id": "seedance-2-0",
  "capability": "video_generation",
  "operation": "first_last_frame_to_video",
  "prompt": "让角色从室内走向门口",
  "reference_assets": [
    {
      "resource_id": 101,
      "media_type": "image",
      "role": "first_frame"
    },
    {
      "resource_id": 102,
      "media_type": "image",
      "role": "last_frame"
    }
  ],
  "params": {
    "aspect_ratio": "16:9",
    "duration": 5
  }
}
```

`reference_assets` 是能力匹配和资源准备的事实源。prompt 中的资源 token 只能作为可读文本和依赖标记，不作为 route 选择依据。

### Typed Resource Mention

前端可继续用自然的 `@资源名` 交互，但保存/编译后的资源 token 应支持类型和角色：

```text
@[resource:image:101]
@[resource:video:202]
@[resource:audio:303]
@[resource:image:first_frame:101]
@[resource:image:last_frame:102]
@[resource:video:motion_reference:202]
@[resource:image:style_reference:103]
```

后端应兼容解析新 token 到结构化对象：

```json
{
  "resource_id": 101,
  "media_type": "image",
  "role": "first_frame"
}
```

旧的 `@[resource:123]` 不再作为新运行时合同的首选格式；迁移期只允许用于提示用户补全 media type / role，不能静默推断首尾帧或视频参考。

### ResourceAccessProfile

新增资源出站访问配置：

```json
{
  "id": "local-ngrok",
  "enabled": true,
  "mode": "public_tunnel",
  "public_base_url": "https://example.ngrok-free.app",
  "internal_base_url": "http://127.0.0.1:8766",
  "signing_enabled": true,
  "expires_seconds": 3600,
  "health_check_path": "/api/v1/resource-access/health"
}
```

建议 mode：

| mode | 说明 |
| --- | --- |
| `public_tunnel` | ngrok、Cloudflare Tunnel 等把本地 backend 暴露到公网 |
| `public_backend` | 自部署后端本身已具备公网域名 |
| `object_relay` | S3/OSS/TOS 等公网对象中转 |
| `provider_files` | provider 自有 files API，输出 provider file id |
| `provider_asset_uri` | provider 资产库认证后的 asset URI |

ResourceAccessProfile 属于资源管理，不属于 Provider 配置。

### Resource Access Resolver

新增统一解析接口：

```http
POST /api/v1/resource-access/resolve
```

请求：

```json
{
  "resource_id": 101,
  "purpose": "provider_input",
  "required_media_type": "image",
  "transport": "public_url",
  "route_id": 88
}
```

响应：

```json
{
  "resource_id": 101,
  "media_type": "image",
  "transport": "public_url",
  "url": "https://example.ngrok-free.app/api/v1/resource-access/resources/101/file?expires=1790000000&signature=...",
  "expires_at": "2026-06-28T13:00:00Z"
}
```

Resolver 负责：

- 校验资源归属和可见性。
- 校验资源 media type。
- 选择可用 ResourceAccessProfile。
- 生成临时签名访问 URL、对象中转 URL、provider file id 或 provider asset URI。
- 返回可审计的诊断信息。

## 架构分工

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| Canvas / Tool UI | 让用户选择 output kind、operation、资源 role；构造 GenerationIntent | 猜 route、拼公网 URL |
| Prompt Compiler | 把语义 refs 编译为 typed resource mention，并导出 reference assets | 根据图片数量推断生成能力 |
| Generation API | 校验 `capability + operation + reference_assets` 合同 | 理解 provider endpoint 差异 |
| Router | 根据 model capability、route capability 和 asset_transport 选择 route | 读取 ngrok 配置或生成 signed URL |
| Resource Access Resolver | 把 RawResource 转成 route 需要的媒体输入 | 选择模型 route |
| Adapter | 序列化 provider 请求体和解析响应 | 上传本地资源、签名本地 URL、决定资源 role |
| Admin | 配置资源公网访问、诊断 provider route 是否满足 | 把 Provider 页面变成资源访问配置事实源 |

## 技术架构落地边界

这次改造要把“资源语义”和“资源出站传输”拆成两条清晰链路，但在运行时重新汇合。

### 资源语义链路

```text
Canvas / Tool / Agent
  -> Operation Slot
  -> ReferenceAsset(resource_id + media_type + role)
  -> GenerationIntent
  -> Router capability matcher
```

资源语义链路回答的是：

- 本次生成是什么能力和 operation。
- 每个资源在本次生成里扮演什么角色。
- 这些角色是否满足模型能力和 route capability。

这里的事实源只能是 `GenerationIntent.reference_assets`。prompt 里的 `@[resource:...]` 只是可读依赖标记和 prompt 编译产物，不能作为 router 选择 route 的事实源。

### 资源出站链路

```text
Route asset_transport
  -> Resource Access Resolver
  -> ResourceAccessProfile
  -> public_url / object_relay / provider_file_id / provider_asset_uri
  -> Adapter provider-ready input
```

资源出站链路回答的是：

- route 需要什么媒体传输方式。
- 当前本地 RawResource 能不能变成该传输方式。
- 生成的 URL、file id 或 asset URI 是否有过期、签名、可诊断信息。

Provider 配置只能提供账号、默认 base URL 和 provider 私有能力；不能继续持有“RawResource 如何公网访问”的运行时配置。Admin 里的 provider 公网字段可以删除，历史值通过迁移进入 ResourceAccessProfile。

### 运行时调用顺序

```text
1. Client 提交 model + capability + operation + reference_assets
2. Generation API 校验合同完整性
3. Router 用 model capability ∩ route capability 选择 route
4. Runner 按 route asset_transport 调 Resource Access Resolver
5. Adapter 只接收 provider-ready references 并构造上游 payload
6. Debug 记录 route trace + resource access trace
```

任何一步失败都应返回 MovScript 可解释错误，不应等 upstream 返回 400/503 后再反推。

## 总体验收条件

这份改造的验收标准不是“字段存在”，而是画布、Tool、Agent、Router、Runner、Admin 和 Debug 在同一套语义下工作。

| 范围 | 验收条件 |
| --- | --- |
| 调用合同 | 所有新生成入口都必须提交 `model_id`、`capability`、`operation` 和结构化 `reference_assets`；缺少 operation 或 resource role 时直接返回合同错误 |
| Typed Resource | `@[resource:image:123]`、`@[resource:video:456]`、`@[resource:image:first_frame:123]`、`@[resource:image:last_frame:456]` 都能被解析；旧 `@[resource:123]` 只能作为迁移/提示补全来源 |
| 能力匹配 | `first_last_frame_to_video` 必须同时存在 `first_frame` 和 `last_frame`；普通 `image_to_video` 不会因为传两张图被自动升级为首尾帧 |
| Route 选择 | Router 只根据显式能力、operation、输入 role、media type 和 route `asset_transport` 选择 route；不根据 prompt 文案、资源数量、provider kind 或 adapter 猜测 |
| Resource Access | 配置 `public_tunnel` 或 `public_backend` 后，本地 RawResource 可以解析成临时签名公网 URL；RawResource 主记录不保存 ngrok URL、临时 URL 或 provider 输入 URL |
| Provider 配置 | Provider 页面不再有可编辑 `public_base_url`、签名 secret、ngrok 地址或对象中转地址；Provider 页只展示资源公网访问状态和跳转建议 |
| 内部资源管理 | Admin 有独立的“资源公网访问”入口，可以新增/编辑 ResourceAccessProfile、测试资源 URL、查看外部可访问性和 route 依赖诊断 |
| Runner | 需要 public URL 的 route 会在 runner 阶段调用 Resource Access Resolver；未配置可用 profile 时不会发送 upstream 请求，并返回 `missing_resource_access_profile` 类错误 |
| Adapter 边界 | Adapter 不读取 ResourceAccessProfile，不拼接本地公网 URL，不决定 first/last frame 语义；只把 provider-ready references 转成上游请求体 |
| Canvas | 内容画布节点有明确 operation 和资源端口 role；首尾帧节点提交 typed image resources；旧无 role 资源运行时提示补全而不是静默执行 |
| Tool | Tool 按最终产物分类，按 operation 定义输入 slot；提交时 slot 生成 reference asset role；历史记录按 capability + operation 过滤 |
| Debug | 调用日志能看到 intent、selected route、rejected reasons、resource access trace、sanitized public URL 形态；密钥、签名 secret 和私有文件路径不泄露 |
| 迁移 | 历史 Provider public URL 配置迁移为默认 ResourceAccessProfile；迁移失败时不启用隐式 fallback，而是在 Admin 显示可操作诊断 |
| 回归 | 火山 Ark/Seedance、Seedream、Yunwu grok 图片/视频模型在只配置账号 key 和资源访问 profile 后可以通过统一 route + resolver 链路调用 |

关键手工验收用例：

1. 配置一个 ngrok `public_base_url`，任选一张本地图片 RawResource，Resource Access 测试能生成公网 URL，并且外部访问返回正确 `content-type` 和 `content-length`。
2. 删除或禁用 ResourceAccessProfile 后，调用需要 public image URL 的 Yunwu / 火山 route，后端在发送 upstream 前失败，并提示去内部资源管理配置公网访问。
3. 在 Tool 里选择“首尾帧生视频”，两个图片 slot 分别生成 `first_frame` 和 `last_frame`；Debug route trace 只选中支持 `first_last_frame_to_video` 的 route。
4. 在 Tool 里选择“图生视频”，即使传入两张图片，也不会自动改成 `first_last_frame_to_video`，除非用户显式切换 operation。
5. 内容画布引用资源时生成 typed ref，例如 `@[resource:image:first_frame:123]`；后端能从 typed ref 解析出 resource id、media type 和 role，但 route 仍以 `reference_assets` 为准。
6. Provider 配置页看不到公网 Base URL 输入框；资源公网访问入口可以看到当前 profile、签名状态、健康检查和最近失败诊断。
7. 历史 `ProviderAssetSettings.PublicBaseURL` 存在时，迁移后能在 ResourceAccessProfile 中看到等价配置；ProviderAssetSettings 不再作为运行时资源公网访问来源。
8. Debug 日志里能看到某个 resource 解析为 public URL / object relay / provider file id 的方式，但不会展示原始 signing secret。

## Admin 改造

### 删除 Provider 配置中的公网资源字段

Provider 配置应保留：

- API key / AKSK / token
- base URL
- provider kind
- credential health
- provider asset library 私有能力
- route / adapter 诊断入口

Provider 配置应移除或迁出：

- `public_base_url`
- resource signing secret
- ngrok / tunnel 地址
- 公网对象中转地址
- “本地 RawResource 如何让外部 provider 访问”的配置项

迁移后 Provider 页面只展示只读诊断：

```text
资源公网访问：已配置 / 未配置
当前 route 需要 public_url：是 / 否
建议操作：去内部资源管理配置资源公网访问
```

### 新增内部资源管理 / 资源公网访问

建议入口：

```text
Admin -> 资源管理 -> 资源公网访问
```

页面能力：

- 查看当前 ResourceAccessProfile 列表。
- 新增 ngrok / public backend / object relay 配置。
- 配置签名 secret 和过期时间。
- 测试某个 RawResource 是否能生成公网 URL。
- 执行外部可访问性测试：HTTP status、content-type、content-length、range request。
- 展示哪些 route 依赖 public URL。
- 展示最近失败的资源访问诊断。

### Provider Asset Library 的处理

火山 Ark asset library、Yunwu 私有头像认证等仍然属于 provider 私有能力，但它们如果需要读取本地 RawResource，必须调用 Resource Access Resolver。

也就是说：

```text
Provider asset certification
  -> Resource Access Resolver
  -> public URL / signed URL
  -> provider asset library API
```

Provider asset settings 不再直接持有 `public_base_url`。

### Cloud Files / Public Object Relay 的归属

现有公网对象中转配置可以保留，但应纳入 ResourceAccessProfile 的一种 mode：`object_relay`。

UI 文案应从“模型输入中转的独立配置”调整为“资源公网访问方式之一”。这样 ngrok 和对象存储不会成为两套并列事实源。

## 画布改造

### 资源端口类型

当前 `CanvasParamType` 只有 `resource`，建议扩展端口约束：

```ts
type CanvasResourceMediaType = 'image' | 'video' | 'audio' | 'text' | 'any'
type CanvasResourceRole =
  | 'generic'
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'motion_reference'
  | 'style_reference'
  | 'source_video'
  | 'source_audio'
```

Canvas port 定义增加：

```ts
interface CanvasPortDef {
  type: 'resource'
  mediaType?: CanvasResourceMediaType
  acceptedMediaTypes?: CanvasResourceMediaType[]
  role?: CanvasResourceRole
  maxCount?: number
}
```

Canvas port value 增加：

```ts
interface CanvasPortValue {
  type: 'resource'
  resource_id: number
  media_type: CanvasResourceMediaType
  role?: CanvasResourceRole
}
```

### 画布节点运行

画布节点不再根据连接了几个资源推断 operation。节点必须有明确 operation：

- 图片输出：`text_to_image`、`image_to_image`、`image_edit`
- 视频输出：`prompt_to_video`、`image_to_video`、`first_frame_to_video`、`first_last_frame_to_video`、`reference_to_video`、`video_to_video`
- 音频输出：`tts`、`music`、`sfx`、`stt`、`speech_translate`、`audio_chat`、`voice_clone`、`voice_design`

画布可以根据 prompt 给出建议，例如“检测到第一张/最后一张描述，建议切换到首尾帧生视频”，但必须由节点 operation 落库后才能运行。

## Tool 改造

此前 Tool 已按最终产出结果收敛为图片、视频、音频、文本四类。后续需要补齐：

- 每个 Tool operation 定义输入 slot 的 `media_type` 和 `role`。
- `ToolDialog` 提交的 `reference_assets` 必须来自 slot，而不是只按资源类型粗略映射。
- 历史记录按照 `generation_capability + generation_operation` 过滤。
- 当 route 需要 public URL 且未配置 ResourceAccessProfile 时，Tool 面板显示可操作诊断。

## Router 与 Runner 改造

route capability 应声明输入角色和媒体传输需求：

```json
{
  "video_generation": {
    "operations": ["first_last_frame_to_video"],
    "reference_assets": {
      "modalities": ["image"],
      "roles": ["first_frame", "last_frame"],
      "min": 2,
      "max": 2
    }
  },
  "asset_transport": {
    "input_media": ["public_url"],
    "output_media": ["url"]
  }
}
```

Runner 执行顺序：

1. 校验 GenerationIntent。
2. router 选择 route。
3. 根据 route `asset_transport` 调用 Resource Access Resolver。
4. 把 resolver 输出传给 adapter。
5. adapter 构造 provider payload。
6. Debug 记录 sanitized route trace 和 resource access trace。

失败应在 runner 阶段给出可解释错误，而不是等 upstream 报错：

- `missing_resource_access_profile`
- `resource_media_type_mismatch`
- `resource_public_url_unreachable`
- `route_requires_public_url`
- `reference_asset_role_missing`
- `reference_asset_role_unsupported`

## 数据迁移

### 迁移 Provider / Deployment 中的 public_base_url

一次性迁移：

1. 读取现有 `ProviderAssetSettings.PublicBaseURL`、signing secret 和相关 deployment settings。
2. 生成默认 ResourceAccessProfile：

```json
{
  "id": "default-public-backend",
  "mode": "public_backend",
  "public_base_url": "...",
  "signing_enabled": true
}
```

3. 清空 Provider Asset Settings 中的公网访问字段。
4. Provider asset library 诊断改为读取 ResourceAccessProfile 状态。

无法迁移时：

- 不生成隐式 fallback。
- 在 Admin 资源公网访问页显示“检测到历史 Provider 公网配置，但缺少必要字段”。
- 相关需要 public URL 的 route 进入 warning 或 unavailable 状态。

### 迁移资源引用

旧 token：

```text
@[resource:123]
```

迁移策略：

- 如果 RawResource 有明确 `type`，可迁移为 `@[resource:image:123]` / `@[resource:video:123]`。
- role 不自动迁移；需要由 operation slot 或人工确认提供。
- 对首尾帧场景，不允许仅凭两个 image token 推断 `first_frame` / `last_frame`。

## 分阶段实施

### 阶段 0：文档与字段审计

- 固化本文档。
- 列出所有读取 `public_base_url` 的后端和前端位置。
- 列出所有生成或解析 `@[resource:...]` 的位置。
- 列出画布和 Tool 中会构造 `input_resource_ids` / `reference_assets` 的位置。

验收：

- 审计清单能覆盖 Provider asset、Tool、Canvas、MCP generation、prompt compiler。
- 没有运行时代码变更。

### 阶段 1：ResourceAccessProfile Schema

- 新增资源公网访问配置的 domain/service/repository/API。
- 支持 `public_tunnel` 和 `public_backend` 两种 mode。
- 新增 health check 和 resource URL resolve 接口。
- 新增 signed resource file endpoint。

验收：

- 配置 ngrok `public_base_url` 后，任意可见 RawResource 能生成公网 URL。
- 外部访问测试能返回 status、content-type、content-length。
- RawResource 主记录不写入 ngrok URL。

### 阶段 2：迁移 Provider 公网配置

- 一次性迁移现有 `public_base_url` 和 signing secret 到默认 ResourceAccessProfile。
- Provider 页面删除编辑入口。
- Provider asset library 诊断改读 ResourceAccessProfile。

验收：

- Provider 配置页没有公网 Base URL 输入框。
- 旧配置迁移后，依赖 public URL 的 provider asset certification 仍可工作。
- 后端运行时不再从 ProviderAssetSettings 读取 `PublicBaseURL` 作为资源公网访问来源。

### 阶段 3：Typed Resource Ref

- 扩展 prompt token parser / formatter。
- 扩展 GenerationIntent `reference_assets` 校验。
- 前端资源选择器返回 media type。
- Canvas / Tool slot 写入 role。

验收：

- `@[resource:image:123]`、`@[resource:video:456]` 可以被解析。
- `@[resource:image:first_frame:123]` 可以被解析为 role `first_frame`。
- `first_last_frame_to_video` 缺少 `first_frame` 或 `last_frame` 时直接合同错误。
- 视频 role 传入只接受 image 的 route 时直接合同错误。

### 阶段 4：Canvas 接入

- Canvas node executable spec 改为显式 capability + operation。
- Canvas resource ports 增加 media type 和 role。
- Canvas runtime jobs 使用 typed `reference_assets`。
- UI 提供 operation 建议，但不自动改写。

验收：

- 内容画布首尾帧生视频节点提交两个 typed image resources 和明确 operation。
- 普通 reference-to-video 节点可以接 image/video/audio mixed refs，role 为 generic/reference。
- 只有 `@[resource:123]` 的旧画布运行时会提示补全类型/角色，而不是静默执行。

### 阶段 5：Tool 接入

- Tool operation config 中每个 slot 固化 media type 和 role。
- ToolDialog 按 slot 生成 reference assets。
- Tool 历史按 operation 过滤。
- Tool 面板展示 ResourceAccess 诊断。

验收：

- 首帧生视频 slot 生成 role `first_frame`。
- 首尾帧生视频 slots 生成 `first_frame` + `last_frame`。
- 全能参考生视频可以接 image/video/audio，并以 `reference_*` 或 `generic` role 进入请求。
- 未配置公网访问时，选择只接受 public URL 的 route 会在提交前或 runner 阶段给出明确提示。

### 阶段 6：Router / Runner 接入

- route selection 读取 `asset_transport`。
- runner 调用 Resource Access Resolver。
- adapter 入参只接收 provider-ready references。
- Debug 记录 resource access trace。

验收：

- Yunwu / 火山这类只接受 URL 的 route 能消费本地 RawResource。
- 未配置 ResourceAccessProfile 时，不会发送 upstream 请求。
- Debug 能看到每个 resource 如何被解析为 public URL / file id / provider asset URI。

### 阶段 7：清理旧路径

- 删除 provider/deployment public URL 运行时 fallback。
- 删除 adapter 内拼本地资源公网 URL 的逻辑。
- 删除无 operation 的资源数量推断。
- 更新文案和测试。

验收：

- 全仓搜索确认运行时不再从 provider settings 读取 `public_base_url` 做 RawResource 出站访问。
- 所有生成入口都要求 operation。
- 所有需要资源输入的 route 都通过 Resource Access Resolver。

## 总体验收条件

### 合同验收

- [x] 所有生成调用都必须包含 `capability` 和 `operation`。
- [x] 所有资源输入都必须包含 `resource_id` 和 `media_type`。
- [x] 需要语义角色的 operation 必须包含 role，例如首尾帧必须有 `first_frame` 和 `last_frame`。
- [x] 旧 `@[resource:123]` 不再触发隐式首尾帧、图生视频或视频参考推断。

### Admin 验收

- [x] Provider 配置页不再出现可编辑的公网 Base URL。
- [x] 内部资源管理提供资源公网访问配置入口。
- [x] 能配置 ngrok/public tunnel，并测试某个 RawResource 的公网 URL。
- [x] Provider 页面能只读展示“资源公网访问已配置/未配置”。
- [x] 需要 public URL 的 route 在 Admin diagnose 中能指出依赖 ResourceAccessProfile。

### 资源访问验收

- [x] RawResource 本地文件可通过 Resource Access Resolver 生成临时公网 URL。
- [x] 临时 URL 支持签名和过期时间。
- [x] 外部可访问性测试能验证 HTTP status、content-type、content-length。
- [x] RawResource 主记录不保存 ngrok URL 或临时签名 URL。
- [x] object relay 和 public tunnel 都能作为 ResourceAccessProfile 的实现方式接入。

### Canvas 验收

- [x] Canvas resource port 能声明 accepted media type 和 role。
- [x] Canvas executable spec 使用显式 `capability + operation`。
- [x] 首尾帧生视频节点能提交两个 typed resources。
- [x] reference-to-video 节点能提交多模态 reference assets。
- [x] 旧画布缺失 media type / role 时给出可修复诊断。

### Tool 验收

- [x] Tool 按最终产出分类后，每个 operation 的 slot 都有明确 role。
- [x] Tool 提交请求中的 `reference_assets` 与 UI slot 一一对应。
- [x] 生成记录按 `generation_capability + generation_operation` 过滤。
- [x] Tool 能展示 ResourceAccess 缺失或不可达的诊断。

### 生成记录验收

- [x] Job `request_context.intent` 是生成记录能力归档的事实源；`job_type` 只允许作为历史兜底。
- [x] 记录列表按 `capability + operation` 分组展示，例如 `video_generation:first_last_frame_to_video` 和 `video_generation:reference_to_video` 分开。
- [x] 筛选请求使用 `/jobs?generation_capability=...&generation_operation=...`，不再用 `type=videoI2V` 表达首尾帧或全能参考。
- [x] UI 取消按钮、图标和详情页展示优先使用 intent capability；旧 `job_type` 不得覆盖显式 intent。
- [x] 操作命名统一到 canonical vocabulary；文生图使用 `text_to_image`，不再使用旧的 prompt/image 混合命名。

### Router / Runner 验收

- [x] route capability 与 `reference_assets` role 做严格匹配。
- [x] route `asset_transport.input_media=["public_url"]` 时，runner 必须先解析 public URL。
- [x] ResourceAccessProfile 缺失时，runner 不发送 upstream 请求。
- [x] Debug 日志包含 route trace 和 resource access trace。
- [x] adapter 不读取 RawResource 本地路径、不拼接公网 URL。

### Yunwu / 火山场景验收

- [x] 只配置 Yunwu API key 和 base URL 后，本地图片 RawResource 可用于 Yunwu 视频模型。
- [x] Yunwu `grok-video-3` 这类 JSON URL 输入模型能通过 ResourceAccessResolver 获得图片 URL。
- [x] 火山 Seedance 需要公网图片/视频 URL 的 route 能消费本地 RawResource。
- [x] provider asset certification 仍可通过 ResourceAccessResolver 获取 signed public URL。
- [x] 没有公网访问配置时，Yunwu/火山相关 route 给出可解释错误，而不是 upstream 503。

### 清理验收

- [x] 后端运行时不再从 ProviderAssetSettings 读取 `PublicBaseURL` 作为资源出站访问来源。
- [x] Provider asset diagnostics 中的 public URL 状态来自 ResourceAccessProfile。
- [x] 旧字段只允许出现在 migration 或历史配置读取代码中。
- [x] 测试覆盖 ResourceAccessProfile CRUD、URL resolve、typed resource parser、Canvas intent、Tool intent、runner media prep。

## 风险与处理

| 风险 | 处理 |
| --- | --- |
| ngrok URL 经常变化 | ResourceAccessProfile 支持快速更新和 health check，不写入 RawResource |
| Provider asset library 仍依赖 public URL | certification 流程改为调用 Resolver，不直接读 Provider 配置 |
| 旧画布里只有 `@[resource:123]` | 迁移 media type，role 由 operation slot 或人工确认补全 |
| public URL 泄露 | 使用短期签名、过期时间、审计日志，不把 URL 存入长期资源记录 |
| route 和 resource access 诊断分散 | Debug 统一展示 route trace + resource access trace |

## 与模型路由文档的关系

本文档补齐模型路由文档中的 `asset_transport` 执行层：

- 模型路由文档定义 route 如何表达“我需要 public URL”。
- 本文档定义 MovScript 如何把 RawResource 变成 public URL。
- 模型路由文档定义 operation 和 route capability。
- 本文档定义 Canvas / Tool / prompt 如何把资源输入结构化为 typed reference assets。

最终用户和 Agent 看到的是：

```text
模型 + 能力 + 输入资源
```

而不是：

```text
provider endpoint + adapter + ngrok URL + multipart/json 差异
```
