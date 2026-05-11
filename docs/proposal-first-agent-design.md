# Proposal-first Agent Design

本文定义 Movscript 的提案优先设计方向。它把 proposal 提升为一等公民，让用户可以直接在 AI 对话中获得、比较、修改和应用多个提案，而不是先进入固定工作流。

## 核心判断

Movscript 不应被设计成“很多工作流入口 + 若干 Agent 辅助工具”。更合适的产品心智是：

```text
用户对话
  -> Agent 读取上下文
  -> Agent 产生一个或多个 proposal
  -> 用户审阅、比较、合并、继续修改
  -> 用户确认后 apply 到正式项目数据
```

Workflow 仍然存在，但它不再是用户必须理解的主入口。Workflow 是 proposal 的生成策略、模板或自动化器；proposal 才是用户和 Agent 之间共同操作的核心对象。

## 设计目标

- 任意 Agent 都可以提出 proposal，不需要先绑定到某个页面工作流。
- 一个 thread 可以同时存在多个 proposal。
- 多个 Agent 可以针对同一目标提出互相竞争或互补的 proposal。
- 用户可以在对话中要求“再给一个版本”、“把 A 和 B 合并”、“只保留第二个提案的素材部分”。
- Proposal 默认不修改正式项目数据；所有正式写入都必须经过审阅、预览和用户确认。
- Workflow、页面按钮、批处理和插件都统一变成 proposal producer，而不是各自拥有独立写入语义。

## 产品心智

Movscript 的核心不是“进入工作流”，而是“推进提案”。

```text
Conversation
  包含用户目标、上下文读取、Agent 推理和多轮修改。

Proposal
  对某个项目、制作、实体或交付目标的可审阅候选方案。

Review
  用户比较差异、接受/拒绝节点、编辑字段、处理冲突和缺口。

Apply
  系统重新读取最新正式数据，resolve、diff、validate，然后写入。
```

用户不需要先知道 `project_proposal`、`production_proposal`、`content_unit_proposal`、`asset_proposal`、`content_unit_media_proposal`、`script_split_proposal`、`workflow`、`MCP` 或 `manifest`。产品默认展示的是：

- 提案标题
- 提案目标
- 提案作者或 Agent
- 提案覆盖范围
- 与当前正式数据的差异
- 可应用性、冲突、风险和缺口

## Proposal 作为一等公民

Proposal 是独立于工作流的持久审阅对象。它不属于某个页面，也不被某个工作流私有拥有。

Proposal 至少应包含：

```json
{
  "id": "proposal_123",
  "kind": "project_proposal",
  "title": "整理女主与核心场景素材需求",
  "projectId": 42,
  "target": {
    "type": "project",
    "id": 42
  },
  "source": {
    "threadId": "thread_abc",
    "runId": "run_001",
    "agentId": "movscript.default-agent",
    "producer": "conversation"
  },
  "status": "draft",
  "base": {
    "capturedAt": "2026-05-11T12:00:00.000Z",
    "projectVersion": "project-v31"
  },
  "content": {},
  "review": {
    "decisions": [],
    "notes": []
  },
  "lineage": {
    "parentProposalIds": [],
    "supersedes": []
  }
}
```

字段语义：

- `kind`：提案类型，只保留 6 种核心 proposal：`project_proposal`、`production_proposal`、`content_unit_proposal`、`asset_proposal`、`content_unit_media_proposal`、`script_split_proposal`。
- `target`：提案希望影响的业务目标，可以是 project、production、script、scene_moment、asset_slot、delivery_version 等。
- `source`：记录哪个 thread、run、agent 或 workflow 产生了提案。
- `base`：记录提案生成时看到的正式数据版本，用于 stale check，不作为最终 apply 的唯一依据。
- `content`：类型化提案内容，由对应 schema 约束。
- `review`：用户在审阅过程中的接受、拒绝、编辑和评论。
- `lineage`：支持多提案分支、合并、替代和继续演进。

## 多提案模型

一个对话可以产生多个 proposal。多提案不是异常情况，而是默认能力。

典型场景：

- 同一剧本生成三个拆解方案：快节奏版、情绪版、低成本制作版。
- 一个 Agent 提出项目级设定整理，另一个 Agent 提出制作级编排。
- 用户要求“保留 A 的角色设定，用 B 的场景拆分，再让 AI 生成 C 作为合并版”。
- 对已存在 proposal 做局部修改，产生一个新 revision 或派生 proposal。

多提案需要支持以下关系：

```text
competes_with     A 与 B 是互斥候选
complements       A 与 B 可同时使用
derived_from      B 基于 A 修改
supersedes        B 替代 A
merged_from       C 合并 A 和 B
blocks            A 需要先处理 B 的缺口
```

UI 不应把这些关系藏在 raw JSON 中。用户应该能看到：

- 当前 thread 下有哪些活跃提案。
- 每个提案覆盖哪些对象。
- 哪些提案互斥，哪些可以叠加。
- 哪个提案是当前推荐版本。
- 提案之间的差异和合并结果。

## Agent 行为协议

任何 Agent 都可以提出 proposal，但必须遵守统一边界。

Agent 可以：

- 根据当前对话、页面上下文和工具读取结果创建 proposal。
- 为同一目标创建多个 proposal。
- 修改自己或用户指定的 proposal。
- 派生、合并、比较 proposal。
- 解释 proposal 的依据、假设、风险和缺口。

Agent 不可以：

- 在 proposal 未经用户确认时直接修改正式项目数据。
- 把 workflow 执行结果伪装成已应用的正式数据。
- 在 `production_proposal` 中越权创建项目级 canonical 设定。
- 在 `project_proposal` 中直接写制作级结构。
- 用旧 base 直接 replay patch 写库。
- 忽略用户对某个 proposal 节点的拒绝决定。

Agent 输出必须留下稳定引用：

- `proposalId` 或 `draftId`
- `kind`
- `projectId`
- `target`
- 当前状态
- 主要假设
- 下一步可操作项

## Workflow 的新定位

Workflow 降级为 proposal producer。

```text
Conversation producer
  用户直接聊天，Agent 即时生成 proposal。

Workflow producer
  用户选择模板或页面按钮，系统按固定步骤生成 proposal。

Plugin producer
  插件根据外部能力或领域逻辑生成 proposal。

Batch producer
  系统定期扫描缺口，生成待审阅 proposal。
```

这些 producer 的输出都进入同一个 proposal registry、review UI 和 apply pipeline。差异只在 source metadata 和默认 schema，不在写入规则。

因此，不应再为每个 workflow 单独设计一套“生成、预览、应用、历史记录”机制。统一做法是：

```text
producer -> proposal -> review -> apply preview -> apply
```

## Proposal Registry

需要一个统一的 proposal registry，作为 runtime 和 UI 的共同事实源。

Registry 负责：

- 保存 proposal 元数据、内容、状态和 lineage。
- 按 project、target、kind、status、thread、agent 查询。
- 记录 proposal 之间的竞争、派生、合并和替代关系。
- 标记 stale、blocked、ready、applied、rejected、superseded。
- 为 UI 提供当前 thread 活跃提案和项目级提案历史。

## Schema Contract

Proposal 的内容约束应来自共享的 draft schema registry，而不是分散在 agent、frontend 或某个 skill/tool 定义里。

这层只负责定义：

- `schema id`
- `kind`
- `category`
- `title`

它不负责能力选择、工具调用或 UI 路由。skills 和 tools 可以引用这些 schema，但不应该拥有它们。

建议状态：

```text
draft        Agent 或 producer 已创建，可继续修改
reviewing    用户正在审阅
ready        已通过本地校验和 apply preview
blocked      存在冲突、缺失前置或 schema 错误
applied      已应用到正式数据
rejected     用户拒绝
superseded   被后续 proposal 替代
archived     不再默认展示
```

## Review 和 Apply

Review 是用户控制权的核心。

统一审阅能力：

- 节点级接受、拒绝、编辑。
- before/after diff。
- 冲突和缺口提示。
- 多 proposal 比较。
- 多 proposal 合并。
- apply 前 impact summary。

Apply 必须重新读取最新正式数据：

```text
proposal content
  + latest database context
  + user review decisions
  -> resolve
  -> diff
  -> validate
  -> impact summary
  -> apply operations
```

不能直接信任 proposal 生成时的旧 base，也不能把 revision patch 当成最终落库脚本。Proposal 描述目标状态或语义补丁；正式写入动作由系统在 apply 时生成。

## 与现有双提案设计的关系

`project_proposal` 和 `production_proposal` 仍然保留，但它们不再代表“必须先进入某个固定工作流”的两条入口，而是 6 种 proposal kind 里的前两种。

`project_proposal`：

- 面向项目级 canonical 设定和素材需求。
- 只处理 `creative_references`、`asset_slots`、重复项合并、归属调整。
- 是局部语义补丁，不是全量 snapshot。

`production_proposal`：

- 面向某个 production 的制作结构。
- 处理 `segments`、`scene_moments`、引用关系、状态和素材缺口。
- 可以引用项目级设定和素材，但不直接替代项目级治理。

推荐默认顺序仍是：

```text
先整理项目级设定与素材需求
  -> 再拆制作结构
  -> 再进入内容生成、画布和交付
```

但这只是推荐路径，不是 Agent 创建 proposal 的硬前置。Agent 可以先提出 production proposal，并把缺失的项目级设定标记为 unresolved requirement；用户也可以要求 Agent 同时生成一个 project proposal 来补齐这些缺口。

## UI 信息架构

默认产品入口应围绕这 6 种 proposal，而不是围绕实体表和工作流列表。

建议主入口：

- 项目首页：显示项目状态、推荐下一步、活跃 proposal。
- 对话面板：显示当前 thread 中的 proposal cards。
- Proposal Center：跨 thread、跨 Agent、跨 workflow 的提案库。
- Review Drawer / Review Page：统一审阅壳，根据 kind 渲染不同节点。

实体页如 `segments`、`scene-moments`、`creative-references`、`asset-slots` 应作为详情和诊断入口，不应是普通用户推进生产的默认路线。

对话面板中，每个 proposal card 至少显示：

- 标题
- kind
- target
- 状态
- 覆盖对象计数
- 冲突/缺口数量
- `打开审阅`
- `继续修改`
- `生成变体`
- `与另一个提案比较`

## 数据和权限边界

Proposal 是本地/应用层审阅对象，不等同于正式领域实体。

权限建议：

- `proposal.read`：读取 proposal。
- `proposal.create`：创建 proposal。
- `proposal.update`：修改 proposal 内容或 review decision。
- `proposal.compare`：比较 proposal。
- `proposal.applyPreview`：生成 apply 预览。
- `proposal.apply`：应用到正式数据，必须用户确认。

Agent 默认可拥有 `proposal.create` 和 `proposal.update`，但不默认拥有 `proposal.apply`。`proposal.apply` 是 UI/application 决策，除非未来明确设计“可审批的自动应用 Agent”。

## 迁移方向

### M0：文档和命名收束

- 把 proposal-first 作为 Agent 和产品体验的中心原则。
- 把 workflow 文档改为 producer 视角。
- 在文档索引中把本文件置于 proposal 相关文档之前。
- 统一使用 proposal、review、apply、producer、registry、lineage 等术语。

### M1：Runtime 提案注册表

- 在 Agent runtime 中把现有 `AgentDraft` 演进为 proposal registry 的兼容实现。
- 支持一个 thread 多个 proposal。
- 支持 proposal source、target、lineage、status 查询。
- 保留现有 draft API 的兼容层。

### M2：对话内多提案体验

- AI 面板展示当前 thread 活跃 proposal cards。
- Agent 最终回复必须引用具体 proposal。
- 用户可以要求继续修改指定 proposal。
- 支持生成 variant proposal。

### M3：统一审阅和 apply pipeline

- 6 种 proposal 统一进入 review shell。
- Apply preview 统一表达 semantic changes、warnings、blocked items。
- Apply 前统一 stale check、resolve、diff、validate。

### M4：Workflow 降级为 Producer

- 页面按钮、workflow、插件和批处理都输出 proposal。
- 移除各 workflow 私有的历史、审阅和 apply 机制。
- 导航从 workflow-first 收敛为 proposal-first。

## 设计原则

- Proposal 是用户和 AI 协作的核心对象。
- 多提案是默认能力，不是异常状态。
- Workflow 是生成 proposal 的方式，不是产品主线。
- Agent 可以自由提出方案，但不能越过 review/apply 边界。
- Apply 永远基于最新正式数据重新计算。
- 用户看到的是可理解的方案、差异和风险，不是工具调用日志。

一句话总结：

**Movscript 应该成为一个让多个 Agent 在对话中持续提出、比较、合并和推进生产提案的创作系统。**
