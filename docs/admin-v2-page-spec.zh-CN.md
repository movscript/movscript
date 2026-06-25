# MovScript Admin v2 页面级设计规格

本文档细化 Admin v2 的每个页面。目标不是把 Admin v1 的页面逐个换皮，而是重新定义管理体验的信息架构：初级用户按“我能不能开始生产”理解系统，高级用户按“我如何精确控制系统”进入机制层。

Admin v2 同时应是 Agent-native 管理 Surface：同一套页面能力既支持当前 URL 路由方式，也支持 Agent 打开的专注模式。Agent 专注模式的路由、Surface descriptor、确认边界和 MCP handoff 详见 `admin-v2-agent-native-design.zh-CN.md`。

页面规格的第一层必须遵守 Local / Cloud 两个产品形态，而不是先按用户层级拆后台。

```text
Local = 个人 key 接入和视频闭环
Cloud = 团队 / 平台治理后台
```

用户层级只用于决定进入哪个产品形态：

| 用户类型 | 默认 Surface | Admin 可见性 | 页面策略 |
| --- | --- | --- | --- |
| 付费基础用户 | 创作页 / Agent | 默认隐藏 | 不展示 Admin 导航，只在必要时打开 focus surface |
| 免费个人用户 | Local Admin | 默认可见 | 只显示个人 key、视频能力、素材中转、任务诊断 |
| 免费团队用户 | Cloud Admin | 默认可见 | 显示完整治理后台、团队、用量、审计和高级模型路由 |

因此本文档中的“本地模式”就是 Local Admin；“团队/云端模式”就是 Cloud Admin。

## 1. 总体收敛

Admin v1 的复杂感来自三个问题：

1. **内部对象直接成为导航**
   - Provider、Credential、Catalog、Route、Debug、Usage、Audit 各自独立出现。
   - 用户第一次进入时不知道哪个是第一步。

2. **初级和高级混在同一个首屏**
   - 创建 provider 和编辑 route priority 出现在同一心智层级。
   - “能不能开始生成”没有单独答案。

3. **页面之间缺少任务闭环**
   - 配 key 后用户不知道下一步该启用模型。
   - 启用模型后用户不知道是否需要 TOS。
   - 出错后用户不知道去看 job、provider call 还是 route。

Admin v2 的收敛原则：

- 一级导航按用户任务组织，不按数据库对象组织。
- 每个页面只回答一个主要问题。
- 初级页面展示意图、状态和下一步。
- 高级页面展示机制、结构和精确控制。
- v1 的能力不删除，但归并到更少、更清晰的页面中。
- 标准路由模式和 Agent 专注模式复用同一套 read model、task component 和 action contract。

## 2. Admin v2 页面地图

Admin v2 页面地图必须先按 Local / Cloud 收敛。付费基础用户默认不展示 Admin；免费个人进入 Local；免费团队进入 Cloud。

### 2.0 付费基础用户页面策略

付费基础用户没有默认 Admin 页面地图。

默认入口：

```text
项目创作页
Agent thread
素材/视频生成 flow
```

只有当系统需要用户补充设置时，才打开专注模式：

| 场景 | Focus route | 展示内容 |
| --- | --- | --- |
| 额度不足 | `/admin/focus/billing.quota.review` | 当前额度、升级/续费动作、返回创作 |
| 能力不可用 | `/admin/focus/capability.unavailable.explain` | 不可用原因、替代能力、联系/升级动作 |
| 需要授权 | `/admin/focus/provider.authorization.bind` | 授权说明、确认动作、状态回传 |

付费基础用户不应看到：

- Provider Registry
- Model Catalog
- Route Matrix
- Storage credentials
- Audit / Usage admin table

### 2.1 本地模式页面地图

本地模式面向免费个人用户，默认只保留 5+1 个入口：

| 顺序 | 页面 | 页面要回答的问题 | 承接能力 |
| --- | --- | --- | --- |
| 1 | 开始 | 现在能不能开始做视频？ | setup status、overview、health summary |
| 2 | 设置 Provider | 我怎么填 key 并启用推荐能力？ | provider create、credential create、preset apply |
| 3 | 能力状态 | 文本、图片、视频、图生视频是否可用？ | capability summary、model health |
| 4 | 素材中转 | 图生视频和参考素材所需公网 URL 是否可用？ | local storage、TOS、public relay |
| 5 | 任务诊断 | 为什么生成失败或卡住？ | recent jobs、provider calls、runtime health |
| 6 | 高级 | 我需要精细控制模型、路由、参数和系统设置 | catalog、routes、provider registry、logs、system |

免费个人用户的默认第一任务是：

```text
我买了一个中转站 / 聚合站 key，想拿来生成视频。
```

所以“设置 Provider”页面必须把 OpenAI 兼容中转站作为一级推荐，不应只把它放在高级 Base URL 里。

本地模式导航：

```text
开始
设置 Provider
能力状态
素材中转
任务诊断
高级
```

本地模式默认隐藏：

- 用户与组织
- 用量与审计
- 项目与工作区的管理后台形态
- 云部署设置
- 全量 Provider Registry 视图
- 全量 route/cost/debug 表格

这些隐藏项进入“高级”，或在 profile 切到团队/云端时出现。

### 2.2 免费团队 / 云端模式页面地图

免费团队或云端模式才使用完整后台导航：

| 顺序 | 页面 | 目标用户 | 页面要回答的问题 | 承接 v1 能力 |
| --- | --- | --- | --- | --- |
| 1 | 启动中心 | 所有人 | 现在能不能开始做视频？ | Overview、metrics、health summary |
| 2 | 快速设置 | 初级/首次用户 | 我如何接 provider 并一键启用能力？ | Provider create、credential create、combo enable |
| 3 | 生产能力 | 初级到中级 | 系统现在具备哪些生成能力？ | model capability summary、health |
| 4 | Provider | 中级到高级 | 上游服务、密钥、素材库如何管理？ | providers、credentials、provider instances |
| 5 | 模型与路由 | 高级 | 模型身份和线路策略如何控制？ | catalog、routes、route matrix、params |
| 6 | 资源与存储 | 初级到高级 | 文件、对象存储、公网中转是否正常？ | storage、cloud files、TOS、asset library |
| 7 | 任务与诊断 | 中级到高级 | 为什么任务失败或变慢？ | debug jobs、provider calls、runtime health |
| 8 | 项目与工作区 | 管理员 | 项目、owner、资源归属如何管理？ | projects、project owner management |
| 9 | 用量与审计 | 管理员/团队 | 成本、调用、审计记录如何追踪？ | usage logs、audit logs |
| 10 | 用户与组织 | 团队/云端 | 用户、组织、权限如何管理？ | users、orgs |
| 11 | 系统设置 | 管理员/运维 | Runtime/profile/feature flags 如何配置？ | settings、advanced system config |

页面分组建议：

- **开始**：启动中心、快速设置、生产能力
- **生产配置**：Provider、模型与路由、资源与存储
- **运行观测**：任务与诊断、项目与工作区、用量与审计
- **治理**：用户与组织、系统设置

这样导航会显得更有秩序，同时不会减少功能。

### 2.3 为什么本地模式必须更少

本地用户通常只有一个 owner、一个 workspace、一组 provider key。他需要的是：

- 填 key
- 启用推荐能力
- 看是否能生成
- 修复 TOS / storage / worker 问题
- 偶尔进入高级模型路由

他不需要每天面对：

- 组织、邀请、角色
- 审计与多用户追踪
- 多 provider lane 治理
- 成本排行和租户分析
- 平台级部署控制

因此 Admin v2 默认不应像 SaaS 控制台，而应像本地创作 runtime 的设置中心。

## 3. 全局 Shell 设计

### 3.1 布局

- 左侧固定导航，宽度约 240px。
- 顶部内容区状态条，不做全局复杂顶栏。
- 主内容最大宽度根据页面类型变化：
  - 启动/设置类：`max-w-7xl`
  - 表格/矩阵类：可全宽
  - 表单设置类：`max-w-5xl`

### 3.2 左侧导航

左侧导航按 profile 切换。

本地模式：

```text
开始
设置 Provider
能力状态
素材中转
任务诊断
高级
```

团队/云端模式：

```text
开始
  启动中心
  快速设置
  生产能力

生产配置
  Provider
  模型与路由
  资源与存储

运行观测
  任务与诊断
  项目与工作区
  用量与审计

治理
  用户与组织
  系统设置
```

每个导航项可以有一个小状态点：

- 绿色：ready
- 琥珀：partial / warning
- 红色：blocked
- 灰色：not configured

状态点只在对用户有帮助时出现，不要让导航变成告警墙。

### 3.3 顶部状态条

每个页面顶部共享一个轻量状态条：

- Profile：Local / Desktop / Plugin / Cloud
- Backend：Running / Restart required / Error
- Worker：Ready / Busy / Offline
- Provider：Ready / Partial / Missing
- Storage：Ready / Local only / Missing relay

状态条点击后进入相关页面，不在原地展开复杂详情。

### 3.4 页面标题区

页面标题区统一结构：

- 页面名称
- 一句任务导向说明
- 右侧最多两个主操作
- 可选高级开关或“查看高级详情”

禁止在页面标题区放大量指标卡。

## 4. 本地页面 1：开始

### 4.1 页面目标

回答：

> 这个系统现在离“开始做视频”还差什么？

开始页不是统计首页，而是本地创作 readiness cockpit。

### 4.2 首屏结构

首屏由四块组成：

1. **最小闭环主卡**
   - 标题：开始做视频
   - 状态文案：
     - 未配置：尚未接入 Provider
     - 部分可用：文生视频可用，图生视频待配置中转
     - 完整可用：视频创作链路已就绪
   - 主操作：
     - 开始快速设置
     - 补齐缺失项
     - 测试生成

2. **Readiness Pipeline**
   - Provider Key
   - Model Combos
   - Public Input URL
   - Storage
   - Worker
   - Test Generation

3. **下一步**
   - 最多 3 个动作。
   - 每个动作必须能跳转到明确页面。

4. **能力摘要**
   - 文本与脚本
   - 图片与角色
   - 文生视频
   - 图生视频

### 4.3 页面下半部分

- 最近任务：只展示最近 5 条，状态和失败原因。
- 最近 Provider 错误：只展示当前阻塞相关错误。
- 高级入口：高级 / 模型与路由、任务诊断、素材中转。

### 4.4 空状态

空系统时不要展示空表格。

文案结构：

- 标题：还没有接入生成 Provider
- 说明：先添加一个 provider key，然后应用推荐能力包。
- 主按钮：开始快速设置
- 次按钮：进入高级手动配置

### 4.5 页面数据

优先需要聚合接口：

- `GET /admin/setup/status`
- `GET /admin/overview`
- `GET /admin/debug/model-runtime-health`

### 4.6 不在本页展示

- Catalog entry 列表
- Route binding 表格
- Provider credential 明文编辑
- Usage 明细
- Audit 明细

## 5. 本地页面 2：设置 Provider

### 5.1 页面目标

回答：

> 我如何用最少步骤把系统配置到可生成状态？

设置 Provider 是本地模式最重要的配置页。它把 Provider Key、推荐能力包、连接测试合并成一个流程，不让用户分别理解 Provider、Catalog、Route。

### 5.2 步骤结构

固定 6 步：

1. 目标
2. Provider
3. 密钥
4. 能力包
5. 预览
6. 验证

步骤可横向显示在页面顶部。完成的步骤用绿色状态，当前步骤用主色，未完成步骤用灰色。

### 5.3 Step 1：目标

选项：

- 我想直接做视频
- 我想先生成图片和角色图
- 我只需要文本模型
- 我已有 OpenAI 兼容聚合站
- 我是高级用户，手动配置

默认推荐：

- 我想直接做视频

### 5.4 Step 2：Provider

Provider 卡片展示：

- 显示名
- 适合场景
- 能力图标：文本、图片、视频、图生视频、素材库
- 是否推荐
- 是否需要公网素材中转

火山卡片应清楚写：

- “适合直接开始中文视频创作”
- “图生视频需要公网素材 URL”

### 5.5 Step 3：密钥

默认只显示：

- API Key
- 连接测试按钮

折叠高级项：

- Base URL
- Provider 名称
- Files API
- credential key

### 5.6 Step 4：能力包

能力包是 Admin v2 的初级抽象，替代 Combo Template 暴露。

火山默认展示：

- 视频创作入门
- 完整多模态创作
- 仅视频模型

能力包卡片展示：

- 将启用哪些能力
- 是否推荐
- 是否有可选前置条件
- 预计创建多少项配置

### 5.7 Step 5：预览

预览必须分两层。

初级摘要：

- 将启用 4 个能力
- 将创建 4 个模型入口
- 将创建 4 条 Provider 线路
- TOS 中转可稍后配置

高级展开：

- Model template key
- Combo template key
- Public Model ID
- Provider model id
- Route group
- Priority

### 5.8 Step 6：验证

验证结果按链路展示：

- Provider key：通过 / 失败
- 模型组合：通过 / 冲突 / 跳过
- 路由解析：通过 / 缺 provider / 缺 model
- Storage：本地可用 / 中转缺失
- 生成测试：通过 / 跳过 / 失败

完成页给三个动作：

- 返回启动中心
- 测试生成
- 查看高级配置

### 5.9 页面数据

需要：

- `GET /admin/provider-templates`
- `GET /admin/setup/presets`
- `POST /admin/providers`
- `POST /admin/setup/presets/:key/preview`
- `POST /admin/setup/presets/:key/apply`
- `POST /admin/setup/verify`

### 5.10 不在本页展示

- Route matrix
- Provider registry 全量列表
- 多 key 管理
- usage / audit / job history

## 6. 本地页面 3：能力状态

### 6.1 页面目标

回答：

> 当前系统具体能生产什么？

这个页面介于开始页和高级模型路由之间。它不编辑底层 route，但可以测试能力、补齐缺失项、跳到高级。

### 6.2 页面结构

首屏：

- 能力总览状态
- 能力分组列表
- 阻塞项提示

能力分组：

- 文本与脚本
- 图片与角色
- 图像编辑
- 文生视频
- 图生视频
- 视频参考
- 音频与字幕
- 素材资产与可信来源

每个能力行展示：

- 能力名称
- 状态
- 当前 provider
- 当前默认模型
- 最近检查时间
- 操作：测试 / 设为默认 / 高级编辑

### 6.3 交互

- 点击能力行打开右侧详情抽屉。
- 详情抽屉展示：
  - 该能力当前 route
  - 最近失败原因
  - 缺失前置条件
  - 推荐动作

### 6.4 页面数据

需要：

- `GET /admin/setup/status`
- `GET /admin/model-catalog`
- `GET /admin/debug/model-runtime-health`

### 6.5 不在本页展示

- Route priority 编辑
- supported params JSON
- credential 编辑

## 7. 本地页面 4：素材中转

### 7.1 页面目标

回答：

> 本地素材能不能被 provider 使用？

本地用户最常遇到的不是对象存储治理，而是图生视频需要公网 URL。因此本地模式把“素材中转”提升为独立页面，而不是藏在 Storage 里。

### 7.2 页面结构

顶部：

- 当前状态：未配置 / 可用 / 验证失败
- 影响能力：图生视频、视频参考、Provider 素材库
- 主操作：配置 TOS / 验证中转

主体：

1. **阻塞说明**
   - “火山 Seedance 图生视频需要公网可访问的参考图/视频 URL。”
   - “配置后 Worker 会自动把本地素材上传到中转存储。”

2. **中转配置**
   - TOS bucket
   - region
   - access key id
   - secret access key
   - public base URL
   - signing secret

3. **验证步骤**
   - 上传测试文件
   - 检查公网访问
   - 检查 Provider 前置条件

4. **受影响能力**
   - 图生视频
   - 视频参考
   - Provider asset library

### 7.3 不在本页展示

- 全量资源列表
- 审计
- 用量
- provider route matrix

## 8. 本地页面 5：任务诊断

### 8.1 页面目标

回答：

> 为什么刚才生成失败？

本地用户不需要一个完整 Debug 控制台，他需要最近失败任务的可理解解释和修复入口。

### 8.2 页面结构

首屏：

- 最近失败
- 当前运行任务
- 阻塞项

主体：

- 最近任务列表，默认只显示最近 20 条。
- 右侧诊断面板：
  - 错误摘要
  - 可能原因
  - 证据检查
  - 修复动作

常见修复动作：

- 配置 Provider Key
- 应用推荐能力包
- 配置素材中转
- 查看高级线路
- 重试任务

### 8.3 高级展开

高级展开后才显示：

- provider request/response redacted detail
- provider task id
- route selection detail
- runtime health detail

## 9. 本地页面 6：高级

### 9.1 页面目标

回答：

> 我确实需要精细控制时，去哪里改？

高级页面是本地模式对 v1 复杂能力的收纳区。默认导航只出现一个“高级”，里面再按标签组织。

### 9.2 高级标签

建议标签：

1. Provider 详情
2. 模型与路由
3. 参数与成本
4. 存储详情
5. 日志与调用
6. 系统设置

### 9.3 展示原则

- 高级页可以展示 internal terms。
- 每个高级项都要说明“通常不需要修改”。
- 从 Agent 专注模式或任务诊断跳入时，应定位到具体 entity。

### 9.4 承接 v1

高级页承接：

- provider registry
- credentials
- model catalog
- route binding
- combo templates
- runtime health
- debug sandbox
- usage detail
- system settings

## 10. 团队/云端完整后台页面

以下页面只在团队/云端 profile 默认显示。本地模式下，它们被收纳进“高级”页面或通过 Agent 专注模式按需打开。

## 11. 团队/云端页面：Provider

### 11.1 页面目标

回答：

> 我接入了哪些上游服务？密钥、素材库、provider 状态是否正常？

Provider 页面是中高级配置页，但首屏仍要可读。

### 11.2 页面结构

顶部：

- Provider 总数
- Active Provider
- Missing Key
- Asset Library Ready

主体分三栏或三段：

1. **Provider 列表**
   - 火山方舟官方 API
   - OpenAI 兼容聚合站
   - 本地 OpenAI 兼容端点
   - 代理/聚合类 provider

2. **选中 Provider 详情**
   - 基本信息
   - key 状态
   - base URL
   - health
   - asset library state

3. **操作区**
   - 添加 key
   - 设置 primary key
   - 禁用 provider
   - 测试连接
   - 配置素材库

### 11.3 初级/高级分层

默认展示：

- provider 名称
- 是否可用
- key 是否存在
- 最近检查状态

高级展开展示：

- provider id
- provider kind
- provider category
- adapter key
- credential key
- masked secrets
- asset library JSON 状态

### 11.4 页面数据

复用：

- `GET /admin/providers`
- `GET /admin/provider-templates`
- `GET /admin/provider-instances`
- `POST /admin/providers`
- `POST /admin/providers/:providerID/credentials`
- `PATCH /admin/providers/:providerID/credentials/:credentialKey`

### 11.5 不在本页展示

- Model catalog 编辑
- route binding 编辑
- job logs

## 12. 团队/云端页面：模型与路由

### 12.1 页面目标

回答：

> MovScript 对外暴露哪些模型身份？每个身份最终走哪条 provider 线路？

这是高级页。它应该专业、紧凑、结构化，不再照顾完全初级用户。

### 12.2 页面子标签

建议四个标签：

1. 总览
2. 模型身份
3. 线路策略
4. 参数与成本

### 12.3 总览

展示：

- 能力覆盖图
- route coverage
- provider lanes
- fallback / warning
- 从快速设置生成的配置来源

### 12.4 模型身份

承接 v1 Model Catalog。

表格列：

- Public ID
- 显示名
- 能力
- 输入约束
- 参数状态
- 来源
- 状态
- 操作

右侧 inspector：

- 基础字段
- capabilities
- accepted inputs
- supported params
- advanced JSON

### 12.5 线路策略

承接 v1 Route Binding。

矩阵列：

- 能力
- Public ID
- Provider
- Provider Model ID
- Route Group
- Priority
- Capacity
- Concurrency
- 状态
- 来源
- 操作

右侧 inspector：

- provider lane
- route group
- fallback priority
- max concurrency
- 最近调用结果
- 相关 health

### 12.6 参数与成本

把当前散落在 catalog param builder 和 pricing 的能力集中。

展示：

- 参数 schema
- 默认值
- 条件参数
- 成本估算字段
- pricing mode

### 12.7 页面数据

复用：

- `GET /admin/model-catalog`
- `GET /admin/model-catalog/templates`
- `POST /admin/model-catalog`
- `POST /admin/model-catalog/:id/route-bindings`
- `GET /admin/debug/model-runtime-health`

### 12.8 不在本页展示

- Provider key 明文更新
- Storage credential 配置
- job 全量日志

## 13. 团队/云端页面：资源与存储

### 13.1 页面目标

回答：

> 生成资源存在哪里？哪些资源可以被 provider 公网访问？

资源与存储页面需要同时服务初级和高级。

### 13.2 页面子标签

1. 总览
2. 本地资源
3. 公网中转
4. Provider 素材库
5. 高级存储

### 13.3 总览

展示：

- 本地资源数量
- 存储占用
- 当前 storage backend
- Public relay 状态
- TOS 状态
- Provider asset library 状态

### 13.4 公网中转

这是火山路径的关键页面。

默认展示：

- 是否已配置公网 base URL
- 是否可上传参考图
- 是否可被火山访问
- 最近一次验证结果

配置项：

- TOS bucket
- region
- access key id
- secret access key
- public base URL
- signing secret

### 13.5 Provider 素材库

展示：

- provider asset library 支持状态
- 自动创建素材组
- provider trusted resource state
- certify / sync 结果

### 13.6 页面数据

复用/新增：

- `GET /admin/storage`
- `GET /admin/settings/provider-assets`
- `PUT /admin/settings/provider-assets`
- `GET /admin/providers/:providerID/asset-library`
- `PUT /admin/providers/:providerID/asset-library`

## 14. 团队/云端页面：任务与诊断

### 14.1 页面目标

回答：

> 任务为什么失败、卡住、变慢，或者没有按预期走 provider？

任务与诊断是问题导向页面，不是 debug 杂货铺。

### 14.2 页面子标签

1. 任务队列
2. Provider 调用
3. Runtime Health
4. Sandbox
5. 错误分析

### 14.3 任务队列

展示：

- pending / running / failed
- job type
- project
- model
- provider task id
- duration
- error summary
- retry / cancel / view detail

### 14.4 Provider 调用

展示：

- provider
- credential
- model
- latency
- status
- cost estimate
- request/response redacted detail

### 14.5 Runtime Health

展示：

- backend
- worker
- provider runtime
- model runtime
- storage
- object relay

### 14.6 Sandbox

保留高级 provider sandbox，但放在最后一个标签。

### 14.7 错误分析

面向用户的问题解释：

- 缺 provider key
- route 未启用
- provider model id 错误
- 缺 TOS 中转
- provider rate limit
- worker offline

每个问题给出跳转动作。

## 15. 团队/云端页面：项目与工作区

### 15.1 页面目标

回答：

> 当前有哪些项目，归属和资源状态如何？

### 15.2 页面结构

顶部：

- project count
- active projects
- orphan resources
- recent updated

主体：

- 项目表格
- owner / org
- scripts count
- resources count
- jobs count
- last activity
- actions

右侧 inspector：

- project metadata
- members
- resource summary
- recent jobs

### 15.3 页面数据

复用：

- `/admin/projects`
- project owner management 相关接口

## 16. 团队/云端页面：用量与审计

### 16.1 页面目标

回答：

> 谁用了什么、花了多少、发生过哪些管理动作？

把 usage logs 和 audit logs 放在同一个治理观测页，但用标签区分。

### 16.2 页面子标签

1. 用量总览
2. 调用明细
3. 成本排行
4. 审计日志

### 16.3 用量总览

展示：

- 7d cost
- 30d cost
- top providers
- top models
- top users / orgs

### 16.4 调用明细

表格列：

- time
- user
- org
- provider
- model
- operation
- tokens / seconds / images
- cost
- project

### 16.5 审计日志

表格列：

- time
- actor
- action
- target
- org/project
- ip
- metadata

## 17. 团队/云端页面：用户与组织

### 17.1 页面目标

回答：

> 谁可以访问系统？他们属于哪个组织，有什么权限？

### 17.2 页面子标签

1. 用户
2. 组织
3. 成员与邀请
4. 权限策略

### 17.3 本地模式

本地模式下，用户与组织页面应降低存在感。

展示：

- 当前 profile 使用 local owner
- 本地模式默认不需要团队账号
- 如需团队共享，启用 managed-local / cloud profile

不要在本地默认场景强推组织管理。

## 18. 团队/云端页面：系统设置

### 18.1 页面目标

回答：

> 当前 runtime profile、服务、feature flags 和高级系统参数是什么？

### 18.2 页面子标签

1. Runtime Profile
2. 服务状态
3. Feature Flags
4. 安全
5. 高级

### 18.3 Runtime Profile

展示：

- local / desktop / plugin / cloud
- auth mode
- data service endpoint
- admin web endpoint
- worker mode

### 18.4 服务状态

展示：

- backend
- worker
- media pipeline
- storage
- auth provider
- mcp host

### 18.5 安全

展示：

- encryption key 状态
- secret redaction
- local access boundary
- public endpoint warning

## 19. 页面之间的关键跳转

### 19.1 从本地「开始」

- 开始设置 -> 设置 Provider
- 补齐 TOS -> 素材中转
- 测试生成 -> 能力状态 / selected capability
- 查看失败任务 -> 任务诊断
- 高级模型配置 -> 高级 / 模型与路由

### 19.2 从本地「设置 Provider」完成页

- 返回开始
- 测试生成
- 配置素材中转
- 查看高级

### 19.3 从本地「能力状态」

- 测试能力 -> 任务诊断 / Test
- 高级编辑 -> 高级 / 模型与路由
- 补齐 provider -> 设置 Provider
- 补齐 storage -> 素材中转

### 19.4 从本地「任务诊断」

- provider key 错误 -> 设置 Provider
- route 错误 -> 高级 / 模型与路由
- storage relay 错误 -> 素材中转
- usage 异常 -> 高级 / 用量明细

## 20. 页面级视觉规则

### 20.1 启动/设置页面

- 更大留白。
- 状态卡和 pipeline 为主。
- 操作明确，最多两个主要按钮。
- 不展示大表格。

### 20.2 生产/能力页面

- 以列表和状态行组织。
- 卡片只用于能力分组，不做装饰性卡片堆叠。
- 右侧 inspector 用于详情。

### 20.3 高级配置页面

- 表格、矩阵、inspector 三件套。
- 默认全宽。
- 高密度但保持行高和列宽稳定。
- 来源、状态、操作必须固定可见。

### 20.4 观测页面

- 问题导向。
- 错误摘要优先于原始日志。
- 原始 request/response 默认折叠。
- 所有敏感字段必须 redacted。

## 21. 与现有 v1 路由的迁移映射

| v1 路由/页面 | Admin v2 页面 | 处理方式 |
| --- | --- | --- |
| `/` AdminPage | 本地「开始」 | 重写 |
| `/models/providers` | 本地「设置 Provider」或「高级 / Provider 详情」 | 本地默认进入设置 Provider，高级模式保留详情 |
| `/models/catalog` | 本地「高级 / 模型与路由 / 模型身份」 | 高级标签 |
| `/models/routes` | 本地「高级 / 模型与路由 / 线路策略」 | 高级标签 |
| `/storage` | 本地「素材中转」或「高级 / 存储详情」 | 本地默认进入素材中转 |
| `/cloud-files` | 本地「素材中转」 | 归并 |
| `/debug` | 本地「任务诊断」 | 拆成问题导向入口 |
| `/projects` | 团队/云端「项目与工作区」或高级 | 本地默认隐藏 |
| `/usage-logs` | 高级 / 用量明细；团队/云端「用量与审计」 | 本地默认隐藏 |
| `/audit-logs` | 团队/云端「用量与审计 / 审计日志」 | 本地默认隐藏 |
| `/user-management` | 团队/云端「用户与组织 / 用户」 | 本地默认隐藏 |
| `/orgs` | 团队/云端「用户与组织 / 组织」 | 本地默认隐藏 |
| `/settings` | 本地「高级 / 系统设置」 | 重排 |
| `/shot-vectors` | 高级开发入口 | 默认隐藏 |

## 22. 设计图下一步

下一轮设计图应先按本地模式 5+1 出图，而不是完整平台后台：

1. 本地「开始」
2. 本地「设置 Provider」
3. 本地「能力状态」
4. 本地「素材中转」
5. 本地「任务诊断」
6. 本地「高级」
7. Agent 专注模式「配置火山视频闭环」
8. Agent 专注模式「配置素材中转」

每张图必须遵守同一套 shell、导航、状态条和视觉 token。
