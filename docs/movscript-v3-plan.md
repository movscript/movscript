# MovScript V3 Plan

本文档是 V3 讨论稿。它不是立刻推翻 V2，而是把 V2 中“剧本预演”主闭环继续向最终产品形态推进：MovScript 本身成为一个 agentic production system，而不是在产品旁边再放一个聊天机器人。

跨会话推进时，先阅读 `docs/movscript-v3-progress.md`，再阅读本文档。V3 的启动口令是：

```text
继续推进 MovScript V3 重构
```

当前版本已收敛的关键判断：

```text
聪明在客户端/runtime
事实在后端
能力通过网关可替换
```

并行推进约定：

```text
V2 窗口推进产品页面、核心对象、候选保存、正式事实和状态机
V3 窗口推进 Production Runtime、AI 分析、模型调用、工具编排和候选生成
两边通过文档中的 action / candidate / data operation 契约对接
```

## 1. 核心判断

V3 的目标不是“给 MovScript 增加 Agent”，而是：

```text
让 MovScript 的产品对象、界面和运行时共同构成一个可推进影视生产状态的系统。
```

用户不应该主要感知到：

```text
我在和一个 Agent 聊天
```

而应该感知到：

```text
我在操作剧本、分镜、素材、预演和任务，系统会在合适的时候帮我推进下一步。
```

因此，V3 不把 agent 作为一个独立产品人格，而把 agentic 能力内化为产品运行方式。

## 2. V3 产品原则

### 2.1 产品对象优先，不以聊天为中心

核心界面围绕真实创作对象组织：

```text
剧本
剧本节
情境
分镜脚本
内容单元
关键帧
预演时间线
素材需求
制作任务
交付版本
```

聊天可以保留，但只是输入方式之一。它不能成为主产品模型，也不能替代对象编辑、状态确认、版本管理和预演工作台。

### 2.2 用户给目标，系统推进状态

V3 的关键交互不是“问答”，而是“目标驱动动作”：

```text
生成预演草稿
补齐这一场的素材需求
检查这一集还缺什么
把已确认的分镜推进到关键帧
把这组候选图应用到预演时间线
```

每个动作都应该产生可检查的状态变化，而不是只产生一段回答文本。

### 2.3 AI 产出默认是候选，不是事实

AI 生成的内容默认进入候选态：

```text
candidate -> accepted
candidate -> rejected
candidate -> revised -> accepted
```

剧本结构、人物设定、素材事实、制作任务和交付结果都必须有明确的采用边界。AI 不能绕过用户确认直接污染核心事实。

### 2.4 后端不绑定某一种 agent 形态

后端不应该硬编码“导演 agent”“编剧 agent”“制片 agent”这种人格化结构。后端应提供：

```text
核心定义
状态机
权限与审计
文件与资源索引
模型与工具网关
生成任务记录
结果采用、拒绝和回滚
```

具体怎么编排模型、工具、插件和 workflow，应保持可替换。

### 2.5 Runtime 属于客户端，而不是云端 agent 服务

Production Runtime 应该内置在桌面客户端中，贴近用户当前操作、页面上下文、本地文件和插件环境。

它不应该放在 React 页面组件里，也不应该默认成为云后端的一部分。更合适的形态是：

```text
Electron Main / Local Sidecar Runtime
```

前端页面负责发起动作和展示结果，runtime 负责计划、步骤、工具调用和候选结果，后端负责可信状态和共享存储。

## 3. 目标架构

V3 推荐的长期分层：

```text
Frontend Product Surface
  用户操作、编辑、确认、比较、预演、回滚

Embedded Production Runtime
  客户端内置运行时：目标解析、计划生成、步骤执行、审批门禁、工具调用、候选结果生成

Core Domain Definitions
  剧本、情境、内容单元、关键帧、时间线、素材、任务、交付等核心对象与状态机

Backend API Gateway + Canonical State
  鉴权、项目正式状态、文件、模型网关、插件注册、审计、任务记录、多人共享

Models / Plugins / Tools
  可替换的模型供应商、生成服务、本地插件、外部工具
```

其中 `Production Runtime` 已由原 `apps/agent` 物理改名为 `apps/production-runtime`。后续重点是继续把 API 和内部概念从 `Agent` 转向：

```text
production runtime
orchestrator
automation runtime
workflow runtime
```

更具体的部署关系：

```text
Electron Renderer
  剧本预演页、ActionRail、CandidateReview、RunTimeline

Electron Main 或本地 sidecar
  Production Runtime

Backend
  API Gateway + Canonical State Server

Shared Packages
  domain schema、action contract、state machine、generated API types
```

最终代码形态建议：

```text
apps/frontend
  Electron + React 产品界面

apps/backend
  API Gateway + Canonical State

apps/production-runtime
  客户端内置的本地 runtime service / sidecar app
  由 Electron Main 管理生命周期
  负责执行 ProductionAction、ProductionRun、ProductionStep

packages/production-contracts
  前端、后端、runtime 共用的 action / run / candidate / approval 类型

packages/domain
  剧本、情境、内容单元、关键帧、时间线、素材、任务、交付等核心对象定义和状态机
```

也就是说：

```text
runtime 本体是 app / service
runtime 契约是 package
```

当前 `apps/production-runtime` 是 runtime 本体，不是共享 package。

## 4. 与 V2 的关系

V2 仍然是必要阶段。V2 解决的是：

```text
剧本 -> 分镜 -> 内容单元 -> 关键帧 -> 预演时间线
```

V3 解决的是：

```text
这些对象如何被系统持续推进、审查、采用、回滚和交付。
```

因此 V3 不应跳过 V2。正确顺序是：

```text
先让 V2 的剧本预演对象、页面和数据动作成立
再让 Production Runtime 生成候选并写回这些稳定边界
最后把运行时能力内化到每个产品页面
```

## 5. 核心能力设计

### 5.1 Production Action

V3 应把“用户要系统帮忙做的事”定义为 `ProductionAction`，而不是聊天消息。

示例：

```text
GeneratePreviewDraft
AnalyzeScriptToSections
ExtractSituations
GenerateStoryboardScript
CompileContentUnits
GenerateKeyframeCandidates
BuildPreviewTimeline
CheckProductionGaps
PrepareAssetRequirements
ApplyCandidateToTimeline
```

每个 action 都应该具备：

```text
输入对象
输出对象
候选结果
审批策略
可回滚边界
审计记录
```

### 5.2 Plan / Step

复杂动作应被拆成 plan 和 step：

```text
Plan
  Step 1: 读取剧本版本
  Step 2: 生成剧本节候选
  Step 3: 提取情境候选
  Step 4: 生成分镜脚本候选
  Step 5: 编译内容单元
  Step 6: 建立预演时间线
  Step 7: 标记待确认项
```

用户看到的是清晰的生产进度，而不是一段“我正在努力处理”的对话。

### 5.3 Candidate / Approval / Apply

V3 的核心安全模型：

```text
generate candidate
preview diff
user approve
apply to canonical object
record history
```

任何会改变核心对象、触发成本、覆盖素材、更新任务或影响交付的动作，都必须有明确审批边界。

### 5.4 Context Pack

运行时不应该自己拼接零散数据库表。每个产品页面应提供面向动作的上下文包：

```text
当前对象
当前版本
相关上游对象
相关下游对象
用户选择
已确认内容
候选内容
缺口和风险
可用动作
```

例如剧本预演页的 context pack：

```text
script_version
script_sections
situations
storyboard_script
content_units
keyframes
preview_timeline
asset_requirements
pending_confirmations
available_actions
```

## 6. 后端边界

V3 后端应尽量像 API gateway，但不能只是无状态转发器。只要 MovScript 存在多人协作、共享项目、云端资产、审计、跨设备同步和生成任务记录，就必须有一个后端承载可信事实。

更准确的定位是：

```text
Backend = API Gateway + Canonical State + Resource/Task Registry + Audit
```

后端负责：

```text
核心对象定义
对象关系和状态机
项目级权限
审计日志
版本历史
资源索引
模型调用网关
生成任务注册
插件和工具注册
候选结果存储
审批与应用记录
多人共享与跨设备同步
```

后端不应该负责：

```text
固定某一种 agent 人格
把自然语言聊天作为唯一入口
把长流程逻辑散落在 CRUD handler 中
让 AI 直接写核心事实
直接执行 AI 分析、模型提示词编排或多步骤 agent planning
决定某个 production workflow 必须如何思考
承担产品的主要智能编排
把自身变成云端 agent 服务
```

一个更清晰的职责边界：

```text
Production Runtime 生成 candidate
后端保存 candidate

用户 approve
后端 apply candidate 到 canonical object

用户 reject
后端记录 reject，不污染正式对象

生成任务开始
后端记录 task，模型网关执行或转发

生成结果回来
后端保存 artifact
前端/runtime 决定它是否进入候选工作流
```

因此 V3 runtime 调用 V2 后端时，应调用数据动作，而不是期待 V2 后端完成 AI 分析：

```text
runtime: AnalyzeScriptToSections action
  -> 调模型 / 工具 / 插件
  -> 得到 ScriptSection candidate
  -> 调 V2 UpsertScriptSectionCandidates

runtime: GenerateKeyframeCandidates action
  -> 调模型 / 生成服务 / 本地工具
  -> 得到 Keyframe candidate
  -> 调 V2 UpsertKeyframeCandidates
```

后端的价值不是“聪明”，而是“可信”：

```text
哪些状态是正式事实
谁有权限改
改了什么
文件在哪里
任务是否存在
结果是否被采用
多端/多人看到的状态是否一致
```

## 7. 前端产品形态

### 7.1 剧本预演页

V3 中，剧本预演页应成为第一个 agentic 页面。

页面上的动作不是“问 AI”，而是：

```text
解析剧本
生成分镜脚本
生成预演草稿
检查缺口
补齐素材需求
应用候选结果
回滚到上一版
```

每个动作都有明确的输入、输出、状态和确认区域。

### 7.2 Action Rail

可以保留一个右侧动作栏，但它不是聊天窗口。它显示：

```text
当前对象状态
建议下一步
待确认项
可执行动作
运行中的计划
历史操作
风险和缺口
```

用户可以从这里发起动作，也可以从页面主体按钮发起动作。

### 7.3 Conversation as Escape Hatch

自由对话只作为兜底入口：

```text
用户不知道该点哪个按钮
用户想描述一个复杂目标
用户想询问为什么系统这样判断
```

对话最终也应该转化为可执行 action，而不是停留在回答文本。

## 8. 代码迁移方向

### 8.1 当前 `apps/production-runtime`

当前 `apps/production-runtime` 已有有价值的能力：

```text
thread / run lifecycle
tool registry
manifest policy
approval gates
memory
draft
MCP-shaped context
model planner fallback
```

这些不应删除，但应逐步去聊天机器人化。

当前 `apps/production-runtime` 的实际身份是一个独立 app / 本地 HTTP runtime 服务，而不是普通共享 package。它有自己的 `package.json`、dev/start 脚本和 server 入口。

同时把前端、后端、runtime 都要共享的类型和契约抽到 packages：

```text
packages/production-contracts
packages/domain
```

后续继续在包内改名：

```text
AgentRun -> ProductionRun
AgentToolCall -> ProductionToolCall
AgentManifest -> RuntimeManifest
AgentDraft -> ProductionCandidate
```

物理目录已经改名，后续应继续推进内部类型和 API 的语义改造。

部署上，runtime 应作为桌面客户端内置能力存在：

```text
开发期：Electron 启动本地 runtime dev server
打包后：Electron Main 启动本地 sidecar 或 node runtime
远期：允许企业部署替换 runtime，但默认不是云端 agent
```

推荐迁移顺序：

```text
1. 在 apps/production-runtime 中新增 src/production/
2. 在 src/production/ 中建立 ProductionAction / ProductionRun / ProductionCandidate 概念层
3. 在现有 server.ts 中新增 /production/* API
4. 将 /chat、/threads、/agent-manifest 等标记为 legacy/debug
5. 新增 packages/production-contracts，沉淀共享类型
6. 新增或整理 packages/domain，沉淀核心对象 schema 和状态机
7. Electron 启动逻辑已从 agent 命名迁移到 production-runtime 命名
8. movcli 已移除调用 agent/runtime 的能力，runtime 调试回到前端 debug 页面
9. 后续继续清理 legacy agent/chat 命名
```

物理目录已经一步到位改名。后续清理仍需注意这些引用：

```text
pnpm workspace
package scripts
Makefile
Electron 启动路径
README 和文档引用
构建产物和 CI
```

下一步是建立新 API 和新概念层，并逐步删除 legacy chat/thread/message 产品模型。

### 8.2 当前前端 Agent Panel

当前 `AIAgentPanel` 已不再适合作为产品主界面。V3 的目标是逐步删除前端聊天面板相关产品代码，只保留 runtime debug / inspect 能力。

当前已完成的第一步：

```text
从全局 App layout 移除 AIAgentPanel 挂载
保留 /agent/debug 调试页
保留 localAgentClient 作为 runtime 调试和后续 production runtime 接入基础
```

后续迁移方向：

```text
AIAgentPanel
  -> 不再作为默认产品入口
  -> 短期可作为代码参考
  -> 中期拆出有用逻辑
  -> 长期删除聊天 UI 和会话 UI

AgentDebugPage
  -> 保留
  -> 逐步改名为 RuntimeDebugPage 或 ProductionRuntimeDebugPage
  -> 继续承载 health、inspect、tools、capabilities、preview run 等调试能力

localAgentClient
  -> 保留
  -> 后续按 production runtime API 重命名或新增 client
```

需要保留或迁出的能力：

```text
runtime health
inspect
capabilities
tool registry debug
approval preview
draft/candidate preview
run / step 调试
context pack 调试
```

应该逐步删除的能力：

```text
全局浮动聊天入口
面向用户的 chat conversation UI
聊天消息本地 store
以 assistant 为中心的文案和交互
附件驱动的聊天输入框
把 runtime 不可用提示包装成聊天回复
```

后续应新增：

```text
ActionRail
RunTimeline
CandidateReview
ApplyPreview
ProductionHistory
```

并逐步让剧本预演页直接调用 production actions。

### 8.3 当前 V2 数据动作 API

V2 后端应继续补产品数据动作 API，而不是让 runtime 直接操作底层 CRUD。V3 runtime 负责 AI 分析和候选生成；V2 后端负责保存候选、正式事实和采用状态。

```text
ImportScript
CreateScriptVersion
UpsertScriptSectionCandidates
UpsertSituationCandidates
UpsertStoryboardSuggestions
CompileStoryboardToContentUnits
UpsertKeyframeCandidates
UpsertAssetRequirementCandidates
BuildPreviewTimeline
AcceptCandidate
RejectCandidate
```

Production Runtime 只调用这些数据动作写回候选或应用用户确认，不绕过这些边界，也不直接写数据库核心表。

V3 action 与 V2 数据动作的对应关系应显式记录：

```text
V3 AnalyzeScriptToSections -> V2 UpsertScriptSectionCandidates
V3 ExtractSituations -> V2 UpsertSituationCandidates
V3 GenerateStoryboardScript -> V2 UpsertStoryboardSuggestions
V3 GenerateKeyframeCandidates -> V2 UpsertKeyframeCandidates
V3 PrepareAssetRequirements -> V2 UpsertAssetRequirementCandidates
V3 BuildPreviewTimelineProposal -> V2 BuildPreviewTimeline / SavePreviewProposal
```

第一批 action 的最小输入、runtime steps、candidate output、approval policy、V2 data operation target 和 failure/retry boundary 维护在：

```text
docs/movscript-v3-action-contract.md
```

如果 V3 新增 action，需要先在该契约文档登记输入、输出和候选类型；如果 V2 新增或改名数据动作，需要在 `docs/movscript-v2-roadmap.md` 或 `docs/movscript-v2-progress.md` 记录契约变化，并同步更新 V3 action contract。

## 9. 分阶段路线

### Phase 1: 继续完成 V2 剧本预演薄切片

目标：

```text
用户能从剧本或分镜脚本进入一个可编辑、可保存、可预演的页面。
```

重点：

```text
剧本版本
分镜脚本编辑
内容单元
预演时间线占位
待确认项
素材缺口
```

本阶段不强调 agent UI。

### Phase 2: 引入 Production Action 契约

目标：

```text
把“生成预演草稿”等动作从页面逻辑中抽象成稳定 action。
```

重点：

```text
action input
action output
candidate result
approval policy
apply preview
history record
```

### Phase 3: Runtime 生成候选并写回 V2

目标：

```text
让 runtime 能编排模型、工具和插件，生成候选结果，并通过 V2 数据动作写回可审查状态。
```

重点：

```text
ProductionRun
ProductionStep
ProductionCandidate
approval gate
tool policy
model gateway
V2 data operation client
```

### Phase 4: 剧本预演页 agentic 化

目标：

```text
剧本预演页不依赖聊天，也能根据当前状态给出下一步动作。
```

重点：

```text
ActionRail
pending confirmations
suggested next actions
candidate review
apply / reject / revise
run history
```

### Phase 4.5: 删除前端聊天产品代码

目标：

```text
前端不再包含面向用户的全局 AI 聊天产品入口，只保留 runtime debug 和 action-first 产品组件。
```

重点：

```text
删除 AIAgentPanel 的产品挂载和聊天 UI
迁移可复用的 run / approval / draft 展示逻辑
保留或改造 AgentDebugPage
清理 agentStore 中的 conversation/chat 状态
清理 i18n 中面向聊天助手的产品文案
将 localAgentClient 的生产用途迁移到 production runtime client
```

完成标准：

```text
普通用户不会在主产品中看到全局聊天助手
调试人员仍可通过 debug 页面检查 runtime 状态
剧本预演等页面通过 ActionRail / CandidateReview / RunTimeline 使用 runtime 能力
```

### Phase 5: 扩展到素材、生产和交付

目标：

```text
同一套 action / runtime / candidate / approval 模型覆盖后续生产环节。
```

重点：

```text
素材准备
关键帧生成
视频生成任务
制作任务拆解
交付版本
质量检查
```

## 10. 暂不做

V3 初期不做：

```text
多人格 agent 市场
复杂自治 agent
全自动生成整部片
无审批写入项目数据
把聊天面板包装成主产品
让 runtime 直接写数据库核心表
```

这些能力不是永远不能做，而是在核心对象、动作、候选、审批和历史没有稳定之前，过早做会把产品带回“聊天壳”。

## 11. 已收敛判断

当前已经形成倾向的判断：

```text
Production Runtime 最好内置在客户端，而不是放进云后端
Production Runtime 不应该塞进 React 页面组件
后端应是 API Gateway + Canonical State，不是 Agent Server
聊天只是 escape hatch，不是主产品模型
前端应逐步删除聊天产品代码，只保留 runtime debug 能力
V3 不应跳过 V2，runtime 应生成候选并调用稳定的 V2 数据动作 API
V2 和 V3 可并行推进，但只能通过文档化契约对接，不能互相隐式侵入职责
```

## 12. 讨论问题

后续需要继续讨论的问题：

```text
Production Runtime 在客户端内应采用 Electron Main 进程、sidecar 进程，还是两者兼容？
ProductionAction 的 schema 应该放在后端、前端还是共享包？
候选结果应该如何存储，是否独立 candidate 表？
V2 数据动作 API 的最小集合是什么？
ActionRail 第一版应该放在剧本预演页，还是先做成通用页面组件？
AIAgentPanel 中哪些 run / approval / draft 展示逻辑值得迁移到新组件？
哪些动作可以自动执行，哪些必须人工确认？
插件提供的是 tool、action，还是完整 workflow？
V3 action 输出和 V2 candidate DTO 是否需要放进共享 contracts package？
```

## 13. 一句话版本

V3 的方向是：

```text
MovScript 不是带 Agent 的影视工具，而是一个以影视生产对象为核心的 agentic 工作台。
```
