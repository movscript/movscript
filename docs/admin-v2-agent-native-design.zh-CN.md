# MovScript Admin v2 Agent 原生设计

本文档补充 Admin v2 的 Agent-native 设计。Admin v2 不应只是一个人类浏览的管理后台，也应成为 Agent 可打开、可解释、可驱动、可回填结果的管理 Surface。

核心要求：

1. **支持现在的路由方式**
   - 用户仍然可以像普通后台一样访问 `/admin/...` 页面。
   - 现有 Admin v1 的 route 可以迁移、redirect 或兼容到 Admin v2。

2. **支持 Agent 专注模式**
   - Agent 可以打开一个只围绕当前任务的 Admin Surface。
   - 用户不用在完整后台中找页面，直接看到当前任务、阻塞项、证据和确认动作。

Agent 专注模式不是第三套 Admin。Admin v2 的产品形态只有两套：

```text
Local Admin = 个人 key 接入和视频闭环
Cloud Admin = 团队 / 平台治理后台
```

Agent Focus 只是 Local 和 Cloud 内部的任务辅助层。

## 1. Agent 原生的含义

Agent 原生不是给后台加一个聊天框，而是让 Admin v2 具备以下能力：

1. **可寻址**
   - 每个管理任务都有稳定 route。
   - 每个 route 可以带入 focus、entity、step、return target。

2. **可解释**
   - 页面能用结构化状态告诉 Agent：当前准备度、阻塞项、下一步动作。
   - Agent 不需要抓 DOM 猜状态。

3. **可驱动**
   - 页面上的关键动作有 action descriptor。
   - Agent 可以建议动作，但涉及密钥、费用、删除、禁用时必须交给用户确认。

4. **可回填**
   - 用户在页面里完成 key、TOS、preset apply、verify 后，Agent 能收到最新状态。
   - Surface 完成后能把结果回传给发起任务的 Agent flow。

5. **可降级**
   - 没有 Agent 时，它仍然是完整 Admin。
   - 没有浏览器 Surface 时，Agent 仍可通过 MCP 返回文本状态和操作建议。

## 2. 双模式架构

Admin v2 有两种展示模式，底层读写同一套接口。

| 模式 | 面向对象 | 入口 | UI 壳 | 适合场景 |
| --- | --- | --- | --- | --- |
| 标准路由模式 | 人类管理员 | `/admin/...` | 完整导航、完整页面 | 主动浏览、全量管理、高级配置 |
| Agent 专注模式 | Agent + 用户协作 | `/admin/focus/...` 或带 `?mode=agent-focus` | 极简导航、任务面板、证据面板 | 完成单个任务、处理阻塞、确认高风险动作 |

两个模式不能分叉业务逻辑。区别只在：

- shell
- 默认可见区域
- 文案密度
- action footer
- Agent context panel
- completion handoff

### 2.1 Local / Cloud 中的 Agent 入口

Agent-native Admin 的入口要先按 Local / Cloud 区分，再按用户层级决定是否默认展示 Admin：

| 产品形态 | 标准 Admin | Agent Focus | 典型触发 |
| --- | --- | --- | --- |
| Local | 可见，极简 | 修复和引导入口 | 填中转站 key、配置素材中转、解释失败 |
| Cloud | 可见，完整 | 精准治理入口 | 成员、用量、审计、route、provider 故障 |
| 付费基础用户所在 Cloud | 默认不可见 | 主要入口 | 额度、授权、能力不可用、少量确认 |

这意味着：

- Local focus 必须围绕“中转站 key -> 视频能力 -> 验证”这条路径优化。
- Cloud focus 可以跳入高级对象，但仍然必须有证据面板和确认边界。
- 付费基础用户的 Admin 能力主要以 Cloud focus surface 出现，不以完整后台出现。

## 3. 标准路由模式

### 3.1 目标

标准路由模式保留现在的后台访问方式，让用户可以自由浏览和管理。

### 3.2 Canonical routes

建议 Admin v2 本地模式 canonical route：

| 页面 | Canonical route |
| --- | --- |
| 开始 | `/admin` 或 `/admin/v2` |
| 设置 Provider | `/admin/provider-setup` |
| 能力状态 | `/admin/capabilities` |
| 素材中转 | `/admin/relay` |
| 任务诊断 | `/admin/diagnostics` |
| 高级 | `/admin/advanced` |

团队/云端 profile 可以额外启用完整后台 route：

| 页面 | Canonical route |
| --- | --- |
| Provider | `/admin/providers` |
| 模型与路由 | `/admin/models` |
| 资源与存储 | `/admin/storage` |
| 项目与工作区 | `/admin/projects` |
| 用量与审计 | `/admin/governance` |
| 用户与组织 | `/admin/identity` |
| 系统设置 | `/admin/settings` |

### 3.3 兼容现有路由

现有路由不应立即失效，应映射到 v2：

| 现有 route | v2 目标 |
| --- | --- |
| `/admin/models/providers` | `/admin/provider-setup` 或 `/admin/advanced?tab=providers` |
| `/admin/models/catalog` | `/admin/advanced?tab=models&section=catalog` |
| `/admin/models/routes` | `/admin/advanced?tab=models&section=routes` |
| `/admin/cloud-files` | `/admin/relay` |
| `/admin/debug` | `/admin/diagnostics` |
| `/admin/usage-logs` | `/admin/advanced?tab=usage`；团队/云端为 `/admin/governance?tab=usage` |
| `/admin/audit-logs` | 团队/云端为 `/admin/governance?tab=audit` |
| `/admin/user-management` | 团队/云端为 `/admin/identity?tab=users` |
| `/admin/orgs` | 团队/云端为 `/admin/identity?tab=orgs` |
| `/admin/shot-vectors` | `/admin/diagnostics?tab=advanced-vectors` |

兼容策略：

1. 第一阶段：旧 route render v2 对应页面。
2. 第二阶段：旧 route redirect 到 v2 canonical route。
3. 第三阶段：删除 v1 页面代码，保留 route alias 一段时间。

### 3.4 URL 状态约定

标准路由模式支持 URL 状态：

- `tab`
- `entity`
- `panel`
- `provider_id`
- `model_id`
- `job_id`
- `capability`
- `return_to`

示例：

```text
/admin/models?tab=routes&entity=video.i2v&panel=inspector
/admin/storage?tab=public-relay&provider_id=volcengine_ark_official
/admin/diagnostics?tab=jobs&job_id=123
```

## 4. Agent 专注模式

### 4.1 目标

Agent 专注模式回答：

> 当前 Agent 正在帮用户完成什么管理任务？用户只需要确认或补充什么？

它不是完整后台，而是一个 task surface。

### 4.2 Focus route

建议两种等价入口：

```text
/admin/focus/:focus_id
/admin/:page?mode=agent-focus&focus=:focus_id
```

第一种适合 Agent 直接打开；第二种适合从普通页面切入。

示例：

```text
/admin/focus/setup.video.start
/admin/focus/provider.key.add?provider_kind=volcengine_ark_official
/admin/focus/storage.public_relay.configure?provider_kind=volcengine_ark_official
/admin/focus/job.failure.triage?job_id=123
```

### 4.3 专注模式 Shell

Agent 专注模式使用不同 shell：

1. **任务头**
   - 当前任务标题
   - 发起来源：Agent / 用户 / 系统推荐
   - 当前状态：待输入 / 待确认 / 执行中 / 已完成 / 阻塞

2. **Agent 计划栏**
   - Agent 正在尝试完成的步骤。
   - 每一步状态：done / current / blocked / skipped。
   - 不显示冗长推理，只显示可审计动作。

3. **主操作区**
   - 当前任务需要的最小 UI。
   - 比如只填 API Key，不展示完整 Provider 列表。

4. **证据面板**
   - 当前状态来自哪些检查。
   - 比如 provider key missing、route ready、TOS missing。

5. **确认底栏**
   - 主确认动作。
   - 取消 / 稍后处理 / 打开完整 Admin。

6. **完成回传**
   - 完成后显示 summary。
   - Agent 可继续原任务。

### 4.4 专注模式禁止事项

专注模式不应该：

- 展示完整左侧导航。
- 把用户带进高级表格。
- 默认展示 JSON / route matrix / credential 管理。
- 在同一个 Surface 内处理多个无关任务。
- 让 Agent 自动提交高风险动作。

### 4.5 专注模式允许事项

专注模式可以：

- 展示必要的高级对象摘要。
- 提供“打开完整 Admin”。
- 提供“查看高级详情”折叠区。
- 在用户确认后调用 apply / verify / enable / disable。

## 5. Focus Intent 列表

第一版建议支持这些 Agent focus：

| Focus ID | 目标 | 对应页面 | 典型发起原因 |
| --- | --- | --- | --- |
| `setup.video.start` | 配置最小视频创作闭环 | 快速设置 | 用户说“我想开始做视频” |
| `provider.key.add` | 添加或修复 provider key | Provider / 快速设置 | 生成失败，缺 key |
| `relay_provider.key.add` | 添加中转站 / 聚合站 key | 设置 Provider | 免费个人用户买了中转站 key |
| `setup.preset.apply` | 应用推荐能力包 | 快速设置 | provider 已有，但模型未启用 |
| `storage.public_relay.configure` | 配置公网素材中转 | 资源与存储 | 图生视频缺公网 URL |
| `capability.test` | 测试某个能力 | 生产能力 | 用户/Agent 想验证可用性 |
| `model.route.inspect` | 检查模型路由 | 模型与路由 | route 不存在或选错 provider |
| `job.failure.triage` | 分析失败任务 | 任务与诊断 | job failed |
| `provider.call.inspect` | 查看 provider 调用 | 任务与诊断 | 上游错误、慢、限流 |
| `usage.cost.review` | 查看成本异常 | 用量与审计 | 费用异常 |
| `runtime.health.recover` | 恢复 runtime 健康 | 系统设置 / 任务与诊断 | worker/backend/storage 异常 |

## 6. Surface Descriptor

Agent 打开 Admin Surface 时，不应只拿到 URL，还应该拿到 descriptor。

建议结构：

```ts
type AdminSurfaceDescriptor = {
  surface_id: string
  mode: 'standard' | 'agent-focus'
  route: string
  focus_id?: string
  title: string
  summary: string
  status: 'ready' | 'missing' | 'partial' | 'blocked' | 'warning' | 'checking' | 'complete'
  entities: Array<{
    kind: 'provider' | 'model' | 'route' | 'job' | 'storage' | 'user' | 'org' | 'project'
    id: string
    label: string
  }>
  checks: Array<{
    key: string
    label: string
    status: string
    reason?: string
  }>
  actions: Array<{
    key: string
    label: string
    risk: 'safe' | 'credential' | 'cost' | 'destructive' | 'security'
    requires_user_confirm: boolean
  }>
  return_to?: {
    kind: 'agent_thread' | 'admin_route' | 'project_surface'
    ref: string
  }
}
```

Descriptor 的用途：

- Agent 可以解释当前 Surface。
- UI 可以根据 descriptor 渲染 focus shell。
- 完成后可以返回原 agent thread / project surface。
- 测试可以校验每个 focus 是否有明确动作。

## 7. Agent 可调用的 Admin 动作

Admin v2 的关键动作需要结构化，而不是只绑定按钮。

建议动作分级：

### 7.1 Safe actions

Agent 可以建议，部分可自动执行：

- refresh status
- run readonly health check
- preview preset
- open inspector
- filter list

### 7.2 Confirmation actions

必须用户确认：

- apply setup preset
- enable route
- disable route
- set provider primary key
- update public relay config
- run paid generation test

### 7.3 Sensitive input actions

必须由用户输入，Agent 不应代填明文：

- API Key
- Secret Access Key
- Signing Secret
- encryption key

### 7.4 Destructive actions

必须二次确认，Agent 只能发起建议：

- delete provider
- delete credential
- delete catalog entry
- revoke key
- disable provider

## 8. Agent 专注模式的典型流程

### 8.1 用户说：我有火山 key，想开始做视频

Agent 流程：

1. 调用 runtime/setup status。
2. 发现缺 provider。
3. 打开：

```text
/admin/focus/setup.video.start?provider_kind=volcengine_ark_official
```

Surface 展示：

- 当前任务：配置火山视频创作闭环
- Step：Provider -> Key -> 能力包 -> Preview -> Verify
- 用户输入 API Key
- 用户确认应用“视频创作入门”
- Surface 执行 apply + verify
- 返回状态：文生视频 ready，图生视频 missing public relay

Agent 回到对话：

- 告诉用户已可文生视频。
- 建议下一步配置 TOS。

### 8.1b 免费个人用户说：我买了一个中转站 key

Agent 流程：

1. 调用 setup status。
2. 发现没有个人 provider。
3. 打开：

```text
/admin/focus/relay_provider.key.add
```

Surface 展示：

- 当前任务：接入中转站 key 并启用视频能力
- Step：中转站类型 -> Base URL + Key -> 能力检测 -> 能力包 -> 验证
- 用户输入 Base URL 和 API Key
- Surface 测试 OpenAI 兼容接口
- Surface 根据可用模型映射“视频创作入门”
- Surface 返回：文生视频 ready；如果缺文件/公网素材能力，则图生视频待配置素材中转

Agent 回到对话：

- 告诉用户现在可以做什么。
- 如果图生视频还缺条件，直接打开素材中转 focus 或给出稍后处理动作。

### 8.2 生成失败：图生视频缺公网素材 URL

Agent 流程：

1. 从 job failure 读取原因。
2. 识别 `missing_public_input_url`。
3. 打开：

```text
/admin/focus/storage.public_relay.configure?provider_kind=volcengine_ark_official
```

Surface 展示：

- 当前阻塞：图生视频需要公网 URL
- 需要配置：TOS bucket、region、access key、public base URL
- 验证按钮：上传测试文件并检查可访问

完成后：

- 图生视频状态变为 ready。
- Agent 可继续原生成任务。

### 8.3 任务失败：provider model id 错误

Agent 流程：

1. 打开：

```text
/admin/focus/job.failure.triage?job_id=123
```

Surface 展示：

- 错误摘要
- 相关 route
- provider response
- 推荐动作：打开 route inspector

如果用户选择修复：

```text
/admin/focus/model.route.inspect?public_model_id=video.default
```

## 9. 与 Agent Surface 的边界

Admin v2 和 Agent Surface 都是 Web Surface，但职责不同。

| Surface | 负责 | 不负责 |
| --- | --- | --- |
| Agent Surface | 项目创作、资源审阅、候选确认、任务协作 | 管理 provider key、用户组织、系统设置 |
| Admin v2 | provider、模型、路由、存储、用量、诊断、系统治理 | 项目内容创作和候选审美决策 |

Agent Surface 可以跳转到 Admin Focus：

- 项目生成失败 -> Admin focus job failure
- 图生视频缺中转 -> Admin focus storage relay
- provider 缺 key -> Admin focus provider key

Admin Focus 完成后应回到 Agent Surface 或 Agent thread。

## 10. 与 MCP / Tool Router 的关系

Admin v2 不直接实现 MCP，但要和 MCP Host 协作。

建议 MCP / runtime 层提供：

- `movscript_runtime_status`
- `movscript_admin_surface_open`
- `movscript_admin_setup_status`
- `movscript_admin_setup_preview`
- `movscript_admin_setup_apply`
- `movscript_admin_focus_result`

其中 `movscript_admin_surface_open` 返回：

- URL
- descriptor
- required user action
- expiry / session token

Admin Web 通过普通 HTTP API 完成读写，MCP 只负责 Agent 入口和 surface handoff。

## 11. 当前路由方式和 Agent 专注模式如何共存

同一个页面组件应拆成三层：

1. **Read Model**
   - 页面需要的聚合状态。
   - 标准模式和专注模式共享。

2. **Task Component**
   - 某个任务的主体 UI。
   - 例如 ProviderKeyForm、PresetPreview、RelayConfigPanel。

3. **Shell**
   - StandardAdminShell
   - AgentFocusShell

示例：

```text
SetupPresetPreview
  -> used by /admin/setup
  -> used by /admin/focus/setup.preset.apply
```

这能避免“双模式 = 两套页面”。

## 12. 设计图要求更新

下一轮设计图应增加 Agent 专注模式，而不仅是标准 Admin 页面。

建议出图顺序：

1. 本地标准模式：开始
2. 本地标准模式：设置 Provider
3. 本地标准模式：能力状态
4. 本地标准模式：素材中转
5. 本地标准模式：任务诊断
6. 本地标准模式：高级
7. Agent 专注模式：配置火山视频闭环
8. Agent 专注模式：配置素材中转

Agent 专注模式设计要求：

- 无完整左侧导航，或只保留极简返回。
- 有清晰任务头。
- 有 Agent 计划栏。
- 有证据面板。
- 有用户确认底栏。
- 能看出完成后回到 Agent。

## 13. 第一版验收标准

第一版 Admin v2 Agent-native 完成时，应满足：

1. 现有 Admin route 有明确 v2 映射。
2. 用户可以通过标准路由完成 provider、preset、storage、diagnostic 管理。
3. Agent 可以打开至少 3 个 focus surface：
   - `setup.video.start`
   - `storage.public_relay.configure`
   - `job.failure.triage`
4. Focus Surface 能返回 descriptor 和 completion result。
5. 密钥和高风险动作必须由用户确认。
6. 标准模式和专注模式复用同一套 read model 和 action contract。
