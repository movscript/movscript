# MovScript Admin v2 设计文档

## 1. 背景

当前 Admin 已经具备完整的高级管理能力：Provider 接入、Credential、Provider Registry、Model Catalog、Route Binding、Combo Template、Provider Health、Debug、Usage、Storage、Audit 等模块都已存在。但这些能力暴露方式偏“系统内部结构”，对首次配置用户尤其是本地用户来说，心智成本过高。

典型用户不是来学习 `catalog entry`、`provider model id`、`route binding`、`route group`、`capacity weight` 的。他的第一目标通常是：

> 我有一个火山 Ark / OpenAI 兼容 / 其他 provider 的 key，我想马上开始做视频。

更常见的免费个人场景甚至更窄：

> 我买了一个中转站 / 聚合站的 key，我想填进去，马上生成视频。

因此 Admin v2 的核心目标不是减少能力，而是重排能力：让初级路径只暴露意图和状态，让高级路径保留机制和控制。

后续计划删除 Admin v1，所以 Admin v2 不应只是 v1 的轻量入口，而应成为新的唯一管理界面。

## 1.0 产品架构结论

Admin v2 第一层只分两个产品形态：

```text
Local = 个人 key 接入和视频闭环
Cloud = 团队 / 平台治理后台
```

用户分层不作为 Admin v2 的第一层结构。它只用于解释谁进入 Local、谁进入 Cloud、谁默认不看 Admin：

- 本地用户、免费个人用户、自己带 key 的用户进入 Local。
- 团队管理员、平台管理员、运维用户进入 Cloud。
- 付费基础用户默认不看 Admin，主要在创作 Surface 和 Agent 中使用托管能力。

Agent Focus 也不是第三套 Admin，而是 Local 和 Cloud 内部的任务辅助层。

完整产品架构详见 `admin-v2-product-architecture.zh-CN.md`。

## 1.1 用户分层架构

用户分层用于辅助 Local / Cloud 的产品边界，不作为导航或页面结构的第一层。

| 用户类型 | 是否默认看 Admin | Admin 角色 | 默认入口 | 主要任务 |
| --- | --- | --- | --- | --- |
| 付费用户 / 基础版 | 否 | 被托管的系统能力，不是用户日常入口 | 项目创作页 / Agent | 直接创作视频，必要时由 Agent 引导补充少量设置 |
| 免费个人用户 | 是，但只看基本 Admin | 本地或个人 key 的最小配置中心 | 设置 Provider | 填中转站 key，启用视频能力，检查是否能生成 |
| 免费团队用户 | 是，且需要高级 Admin | 团队共享 runtime 的治理后台 | 启动中心 / 高级后台 | 管 provider、模型、路由、存储、成员、用量、审计 |

这个分层的核心判断：

1. **付费用户不应该被迫理解 Admin**
   - 平台已经托管 provider、模型、存储和额度。
   - 用户只在创作流里感知“额度不足、能力不可用、需要授权”等少量状态。
   - 需要设置时，也应由 Agent 打开专注 Surface，而不是让用户进入完整 Admin。

2. **免费个人用户只需要基本 Admin**
   - 他通常自己买了一个中转站 / 聚合站 / provider key。
   - 他只关心：key 能不能用、文生视频能不能跑、图生视频是否还缺公网素材中转。
   - 默认不应看到组织、审计、成本治理、route matrix、provider registry 全景。

3. **免费团队用户才需要高级 Admin**
   - 多人共享 key、额度、provider、storage 时，治理问题才出现。
   - 这时才需要用户组织、权限、用量、审计、模型路由策略和高级诊断。

因此 Admin v2 应有三种产品入口：

```text
付费基础用户：创作 Surface 为主，Admin 隐藏；Agent 必要时打开 focus surface
免费个人用户：Basic Admin 为主，默认路径是“填中转站 key -> 启用视频 -> 验证”
免费团队用户：Advanced Admin 为主，完整治理后台默认可见
```

## 2. 设计目标

### 2.1 产品目标

1. **首次设置最小闭环**
   - 用户能从空系统开始，在一个引导流程里完成 provider key、推荐模型组合、素材中转、健康检查。
   - 对火山 Ark 用户，默认目标是 3-5 分钟内具备文本、图片、视频、图生视频的基础可用能力。

2. **初级和高级清晰分层**
   - 初级只回答“现在能不能用、还缺什么、下一步是什么”。
   - 高级才暴露 catalog、route、模型参数、并发、成本、调试等内部机制。

3. **不制造两套业务逻辑**
   - Admin v2 可以是新页面和新体验，但底层仍复用 provider template、combo template、model catalog、route binding 等现有数据结构。
   - 所有快速配置最终都落到可审计、可编辑、可回滚的正式配置上。

4. **免费个人 / 本地用户优先**
   - 本地默认不应要求用户理解团队、租户、计费、复杂部署。
   - 本地路径应优先展示 provider key、视频能力、素材中转、runtime health、生成测试。
   - 默认假设用户拿到的是一个中转站 / 聚合站 key，而不是完整 provider 管理背景。

5. **为云端和团队模式保留扩展位**
   - 用户、组织、审计、usage、billing、deployment 等仍是 Admin v2 的正式区域，但不压在首次设置路径里。

### 2.2 体验目标

1. 首页像“启动中心”，不是模块目录。
2. 配置流程像“任务闭环”，不是表单集合。
3. 状态可视化直接告诉用户：Provider、模型、素材、Worker、Storage、生成链路哪里通、哪里缺。
4. 高级编辑器保持密度，但入口更明确，避免初级用户误入。

## 3. 核心原则

### 3.1 初级 admin 只暴露意图和状态

初级用户看到：

- 接入哪个 provider
- 填什么 key
- 想启用什么能力
- 系统推荐应用哪些配置
- 现在是否可生成
- 缺什么才能图生视频或完整生产

初级用户不直接看到：

- Catalog Entry
- Public Model ID
- Provider Model ID
- Route Binding
- Route Group
- Priority
- Capacity Weight
- Max Concurrency
- Pricing Mode
- Supported Params JSON
- Provider Instance Activation 细节

### 3.2 高级 admin 暴露机制和结构

高级用户可以看到和编辑：

- Provider Registry
- Provider Credentials
- Provider Asset Library
- Model Catalog
- Route Matrix
- Combo Templates
- Runtime Health
- Debug Sandbox
- Usage、Audit、Storage、Users、Orgs

### 3.3 快速配置必须可预览、可重复、可审计

Preset / Combo 应支持：

- Preview：应用前展示将创建或更新哪些配置。
- Apply：幂等应用，重复点击不制造重复配置。
- Diff：展示 created / updated / skipped / warning。
- Advanced Link：每个自动生成项都可以跳到高级编辑。

## 4. Admin v2 信息架构

Admin v2 必须同时按 user tier 和 runtime profile 改变信息架构。本地和免费个人用户默认只看到个人创作闭环；免费团队、云端和运维用户才看到完整治理后台；付费基础用户默认不进入 Admin。

### 4.1 付费基础用户：Admin 隐藏

付费基础用户的默认体验是“直接创作”，不是“先配置系统”。

默认不展示 Admin 导航。用户只在这些情况下看到 Admin Focus：

- 额度或订阅状态需要确认
- 需要绑定个人授权
- 某个付费能力暂不可用
- Agent 判断必须补充一个用户侧设置

此时打开的也不是完整 Admin，而是 Agent 专注 Surface，例如：

```text
/admin/focus/billing.quota.review
/admin/focus/provider.authorization.bind
/admin/focus/capability.unavailable.explain
```

### 4.2 免费个人 / 本地模式默认导航

免费个人和本地模式面向“我自己用”的用户。默认导航应极度收敛：

| 一级区域 | 主要问题 |
| --- | --- |
| 开始 | 现在能不能开始做视频？ |
| 设置 Provider | 我怎么填 key 并启用推荐能力？ |
| 能力状态 | 文本、图片、视频、图生视频现在能不能用？ |
| 素材中转 | 图生视频所需的公网素材 URL 是否配置好？ |
| 任务诊断 | 为什么刚才那次生成失败？ |
| 高级 | 模型、路由、参数、日志等高级控制 |

免费个人用户的首要路径不再是泛化的“快速设置”，而是：

```text
填中转站 / 聚合站 key
-> 选择“视频创作入门”能力包
-> 系统自动映射文本、图片、视频能力
-> 验证文生视频
-> 如需图生视频，再配置素材中转
```

本地模式默认不展示：

- 用户管理
- 组织管理
- 审计日志
- 用量治理
- 多租户权限
- 云部署设置
- 复杂 Provider Registry 全景

这些能力不是删除，而是进入：

- 高级模式
- 云端/团队 profile
- Debug/Dev profile

### 4.3 免费团队 / 云端模式导航

免费团队或云端模式才采用完整管理结构：

| 一级区域 | 面向人群 | 主要问题 |
| --- | --- | --- |
| 启动中心 | 所有人，尤其首次用户 | 现在能不能开始做视频？ |
| 快速设置 | 初级用户 | 我怎么接 provider 并一键启用能力？ |
| 生产能力 | 初级到中级 | 文本、图片、视频、素材中转、Worker 是否可用？ |
| 模型与路由 | 高级用户 | 模型身份和 provider route 如何精确控制？ |
| 资源与存储 | 初级到高级 | 本地文件、对象存储、公网中转是否正常？ |
| 观测与诊断 | 高级用户 | 任务、调用、成本、错误、provider debug 怎么查？ |
| 用户与组织 | 团队/云端 | 用户、组织、权限如何管理？ |
| 系统设置 | 管理员 | runtime、profile、feature flags、deployment 配置 |

### 4.4 Tier-aware + Profile-aware 导航原则

1. 付费基础用户默认不进入 Admin。
2. 免费个人 / 本地模式默认只展示“个人创作能不能跑通”相关页面。
3. 免费团队 / 云端模式展示治理和组织页面。
4. 高级开关可以在个人模式显示隐藏项，但默认关闭。
5. Agent 专注模式不使用完整导航，只显示当前任务。

## 5. 页面设计

### 5.1 启动中心

启动中心是 Admin v2 首页，替代当前“指标卡 + 模块入口”的目录式首页。

#### 首屏结构

1. **顶部运行状态条**
   - Runtime profile：Local / Desktop / Plugin / Cloud
   - Backend：Running / Restart required / Error
   - Worker：Idle / Busy / Offline
   - Storage：Local / Object Storage / Missing
   - Provider：Ready / Partial / Missing

2. **最小闭环卡片**
   - 标题：开始做视频
   - 状态：未配置 / 可文生图 / 可文生视频 / 可图生视频 / 完整可用
   - 主按钮：
     - 未配置：开始快速设置
     - 部分可用：补齐缺失项
     - 完整可用：测试生成

3. **能力闭环可视化**
   - 使用横向 pipeline 或环形 readiness map：
     - Provider Key
     - Model Combos
     - Public Input URL / TOS
     - Storage
     - Worker
     - Test Generation
   - 每个节点有状态：ready / missing / warning / skipped。

4. **建议下一步**
   - 最多 3 个动作，避免变成任务列表。
   - 例如：
     - 配置火山 Ark API Key
     - 启用火山视频创作模板
     - 配置 TOS 中转以支持图生视频

#### 首页下方结构

- 最近任务状态
- 最近 provider 调用错误
- 当前启用能力摘要
- 高级入口：模型与路由、诊断、资源与存储

### 5.2 快速设置

快速设置是 Admin v2 的核心流程页面。

#### Step 1：选择目标

用户先选“我想做什么”，而不是先选 provider 内部结构。

推荐选项：

- 我想直接做视频
- 我想先生成图片和角色图
- 我只需要文本模型
- 我已有 OpenAI 兼容聚合站
- 我是高级用户，手动配置

默认推荐：“我想直接做视频”。

#### Step 2：选择 Provider

Provider 用面向用户的名称展示：

- 火山方舟官方 API
- OpenAI 兼容聚合站
- 火山方舟代理/聚合
- 本地 OpenAI 兼容端点
- 后续：可灵、Vidu、DashScope、Gemini、ElevenLabs

Provider 卡片只展示：

- 能力：文本 / 图片 / 视频 / 图生视频 / 素材库
- 适合场景
- 是否需要公网素材中转

#### Step 3：填写 Key

只展示必要字段：

- API Key
- Base URL（高级展开）
- 名称（可选）

火山官方 API 可展示提示：

- “Seedance 图生视频需要公网可访问的参考图/视频 URL。稍后可以配置 TOS 中转。”

#### Step 4：选择配置包

这是 Admin v2 的核心抽象，建议命名为 **能力包** 或 **启动模板**，避免“Combo Template”暴露给初级用户。

火山默认能力包：

1. **视频创作入门**
   - 文本规划
   - 图片生成
   - 文生视频
   - 图生视频 route 预置，但如果未配置中转则标记为待补齐

2. **完整多模态创作**
   - 文本
   - 图片
   - 图像编辑
   - 文生视频
   - 图生视频
   - 视频参考
   - 素材资产库

3. **仅视频模型**
   - 只启用视频相关 combo
   - 适合已经有其他文本/图片 provider 的用户

#### Step 5：预览并应用

应用前展示简化 diff：

- 将启用 4 个能力
- 将创建 4 个模型入口
- 将创建 4 条 provider 线路
- 需要补充 1 个可选配置：TOS 中转

展开后才展示高级对象：

- Catalog Entry
- Route Binding
- Provider Model ID

#### Step 6：验证

验证应分层：

- 连接测试：API key 是否可用
- 模型路由测试：route 是否可解析
- 轻量生成测试：文本或低成本请求
- 视频能力检查：如果无法低成本真实生成，则用 provider endpoint / task capability 检查
- 图生视频前置检查：公网 URL / TOS 是否可用

完成后给出清晰状态：

- 可以开始：文生视频已可用
- 建议补齐：配置 TOS 后可启用图生视频
- 高级查看：打开模型与路由

### 5.3 生产能力

生产能力页面面向初中级用户，展示系统能做什么，而不是底层怎么做。

能力分组：

- 文本与脚本
- 图片与角色
- 视频生成
- 图生视频 / 视频参考
- 音频与字幕
- 素材资产与可信来源

每个能力卡片展示：

- 状态：可用 / 部分可用 / 缺 provider / 缺 storage / 配置错误
- 当前 provider
- 当前默认模型
- 最近一次健康检查
- 操作：测试、切换默认、高级编辑

### 5.4 模型与路由

这是高级页面，保留现有能力，但重新组织。

建议分三层：

1. **总览**
   - Public capability map
   - route coverage
   - provider lanes
   - fallback 状态

2. **模型身份**
   - Model Catalog 编辑
   - Public Model ID
   - 能力、输入约束、参数

3. **线路策略**
   - Route Matrix
   - Provider Lane
   - Provider Model ID
   - Priority、Weight、Concurrency

高级页面不需要隐藏复杂度，但需要更强的结构感和“从快速设置生成”的来源标记。

### 5.5 资源与存储

面向初级时展示：

- 本地存储位置
- 当前资源数量和容量
- 是否配置公网中转
- 火山 TOS 状态

面向高级时展开：

- Cloud file config
- Provider asset library
- Object storage credentials
- Public base URL
- signing secret
- provider-specific asset settings

### 5.6 观测与诊断

保留高级特性，但按问题组织：

- 为什么生成失败？
- 哪个 provider 慢？
- 哪条 route 被选中？
- 成本和调用量如何？
- Worker 是否卡住？

页面模块：

- Job monitor
- Provider calls
- Runtime health
- Cost / usage
- Debug sandbox
- Audit trail

## 6. 火山 Ark 最小闭环

火山是 Admin v2 的首个重点路径。

### 6.1 用户路径

1. 打开 Admin v2 首页。
2. 首页显示“视频创作尚未配置”。
3. 点击“开始快速设置”。
4. 选择“我想直接做视频”。
5. 选择“火山方舟官方 API”。
6. 填写 API Key。
7. 选择“视频创作入门”能力包。
8. 预览：
   - 创建文本模型入口
   - 创建图片模型入口
   - 创建文生视频入口
   - 创建图生视频入口
   - 提示 TOS 中转可稍后补齐
9. 应用。
10. 运行连接和路由检查。
11. 返回首页，状态变为“文生视频可用，图生视频待配置中转”。

### 6.2 默认能力包内容

能力包不直接写死 UI，应由后端 preset/combo 数据提供。

示例：

| 能力 | Public ID 建议 | 来源 |
| --- | --- | --- |
| 文本规划 | `text.default` | 火山豆包文本 |
| 图片生成 | `image.default` | Seedream |
| 文生视频 | `video.default` | Seedance T2V |
| 图生视频 | `video.i2v` | Seedance I2V |

如果现有 catalog template 已有更稳定命名，应优先沿用现有命名；Admin v2 只做用户可读别名展示。

### 6.3 TOS / 公网中转处理

火山 Seedance 对参考图/视频要求公网 URL，因此 TOS 中转是火山路径的关键状态。

设计策略：

- 不把 TOS 配置作为阻塞项。
- 文生视频可先闭环。
- 图生视频能力显示为“待补齐素材中转”。
- 首页和快速设置完成页都给出“配置 TOS 中转”动作。

## 7. 状态模型

Admin v2 需要一个聚合状态，而不是让前端到处猜。

建议新增一个后端聚合接口：

`GET /admin/setup/status`

返回概念：

```json
{
  "profile": "local",
  "overall_status": "partial",
  "primary_goal": "video_creation",
  "capabilities": [
    {
      "key": "text",
      "status": "ready",
      "provider_label": "火山方舟官方 API",
      "public_model_id": "text.default"
    },
    {
      "key": "video_i2v",
      "status": "blocked",
      "reason": "missing_public_input_url"
    }
  ],
  "checks": [
    { "key": "provider_key", "status": "ready" },
    { "key": "model_combos", "status": "ready" },
    { "key": "public_input_url", "status": "missing" },
    { "key": "worker", "status": "ready" }
  ],
  "next_actions": [
    {
      "key": "configure_tos",
      "label": "配置 TOS 中转",
      "href": "/storage/public-relay"
    }
  ]
}
```

状态枚举：

- `ready`
- `missing`
- `partial`
- `blocked`
- `warning`
- `checking`
- `disabled`

## 8. Preset / 能力包模型

现有 Combo Template 已经描述了 Model + Provider + Route 的组合。Admin v2 需要在其上增加用户级能力包。

建议新增：

### 8.1 Setup Preset

字段概念：

- `preset_key`
- `display_name`
- `description`
- `provider_kind`
- `goal`
- `recommended`
- `combo_template_keys`
- `optional_requirements`
- `warnings`
- `version`

示例：

```json
{
  "preset_key": "volcengine.video_starter",
  "display_name": "视频创作入门",
  "provider_kind": "volcengine_ark_official",
  "goal": "video_creation",
  "recommended": true,
  "combo_template_keys": [
    "volcengine:text-default@volcengine_ark_official",
    "volcengine:seedream-default@volcengine_ark_official",
    "volcengine:seedance-t2v@volcengine_ark_official",
    "volcengine:seedance-i2v@volcengine_ark_official"
  ],
  "optional_requirements": [
    "public_input_url"
  ]
}
```

### 8.2 接口建议

- `GET /admin/setup/presets`
- `POST /admin/setup/presets/:key/preview`
- `POST /admin/setup/presets/:key/apply`

Preview 返回：

- will_create
- will_update
- will_skip
- warnings
- optional_missing

Apply 返回：

- created
- updated
- skipped
- diagnostics
- next_actions

## 9. 视觉设计方向

Admin v2 是生产工具，不是营销页。视觉上应克制、清晰、密度适中。

### 9.1 关键词

- calm operations
- setup cockpit
- production readiness
- local-first
- clear hierarchy
- dense but breathable
- no decorative hero

### 9.2 布局风格

- 左侧主导航，右侧内容区。
- 首页首屏采用“状态驾驶舱”布局：
  - 左侧：最小闭环主卡片
  - 右侧：readiness pipeline / health map
  - 下方：能力摘要和下一步
- 高级页面使用表格、矩阵、分栏编辑器，不使用营销式大卡片堆叠。

### 9.3 色彩

避免单一蓝紫或深色大面积风格。建议：

- 背景：近白或极浅灰
- 主文字：中性深灰
- 主强调：清晰蓝绿或青色
- 成功：绿色
- 警告：琥珀
- 错误：红色
- 高级/系统态：中性灰蓝

### 9.4 组件原则

- 状态节点用图标 + 短文本 + 状态色。
- 操作按钮只保留下一步主动作和少量次动作。
- 高级入口统一用“高级编辑”或“查看详情”，不要把高级字段直接铺在初级页。
- 表格和矩阵保持紧凑，但每行要有来源、状态、操作。

## 10. 设计图范围

第一轮设计图建议出 3 张：

1. **Admin v2 启动中心**
   - 展示空系统或 partial 状态。
   - 重点是“开始做视频”的最小闭环和 readiness pipeline。

2. **快速设置：火山 Ark**
   - 展示 provider key、能力包选择、preview diff。
   - 重点是低心智路径。

3. **模型与路由高级页**
   - 展示高级编辑器如何承接自动生成配置。
   - 重点是 v2 不是弱化能力，而是分层呈现。

## 11. 迁移策略

因为后续会删除 Admin v1，Admin v2 应按以下策略迁移：

1. 先新增 v2 路由和页面壳，不替换 v1。
2. 将 v1 中可复用的高级组件逐步迁入 v2 的高级区域。
3. 新增 setup status / preset preview / preset apply 接口。
4. 将首页默认入口切到 v2。
5. 保留 v1 路由一段时间作为 hidden fallback。
6. 完成 parity 后删除 v1 页面和旧导航。

## 12. 开放问题

1. Public Model ID 是否要统一成 `text.default`、`image.default`、`video.default` 这类用户级抽象？
2. 火山默认能力包中，是否应该默认启用图生视频 route，还是只有 TOS 完成后再启用？
3. 快速设置是否允许用户跳过真实 provider 连接测试？
4. 本地用户是否需要一个“完全离线/local mock”能力包用于试用？
5. Admin v2 是否应该作为 Desktop 设置页的一部分嵌入，还是仍然保持独立 Web Admin？

## 13. 第一版验收标准

Admin v2 第一版完成时，至少满足：

1. 空系统首页能明确告诉用户下一步。
2. 用户可以通过快速设置创建一个 provider。
3. 用户可以一键应用一个 provider 的推荐能力包。
4. 首页能显示文本、图片、视频、图生视频的可用状态。
5. 火山用户能看到 TOS 中转缺失对图生视频的影响。
6. 高级用户仍然能进入模型和路由编辑。
7. 所有自动生成配置都可追溯到 preset/combo/template 来源。
