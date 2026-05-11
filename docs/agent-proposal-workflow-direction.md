# Agent Proposal Workflow Direction

本文记录 MovScript Agent 提案工作流的最终设计方向。

> 更新：更上层的产品与 Agent 设计以 [Proposal-first Agent Design](proposal-first-agent-design.md) 为准。本文继续保留 `project_proposal` 和 `production_proposal` 的语义边界，但这两个 proposal kind 不再要求用户先进入固定工作流；任意 Agent、workflow、插件或批处理都可以作为 producer 生成一个或多个 proposal，再进入统一审阅和 apply 流程。

## 总原则

Agent 的能力不应该被机械地缩窄，但它的写入边界必须被清晰分阶段。

正确的做法不是“只让 Agent 会一点点”，而是让它知道完整流程，然后由系统控制它在每个阶段能写什么、写到哪里、怎么校验、怎么复用 UI。

## 目标形态

提案工作流分成两个连续阶段：

1. `project_proposal`
2. `production_proposal`

它们共享同一套审阅壳、草稿生命周期和确认流程，但承担不同语义。

### 1. Project Proposal

项目级提案只负责：

- `creative_references`
- `asset_slots`
- 重复项合并
- 项目级设定资料与素材需求的新增、局部修改和归属调整

它的职责是把项目中的设定资料和素材库整理成一个可复用的项目索引。

Project proposal 是局部语义补丁，不是全量 snapshot，也不是 operation log。它内部按两层组织，但不需要拆成两个独立 draft：

1. 先提案 `creative_references`
2. 再提案依附于这些设定资料的 `asset_slots`

`creative_reference` 负责描述“这个设定是什么”，例如人物、场景、道具、品牌的 canonical 资料、别名、简介、关键属性和关系。

`asset_slot` 负责描述“这个设定需要哪些可复用素材或视图”，例如人物主视图、侧视图、全身图、表情组、服装状态图、道具图、场景参考图等。

因此，主视图、侧视图之类不应该被建成新的设定资料本体；它们应该作为某个 `creative_reference` 下面的素材需求 / 视图需求。这样可以避免把“角色本体”和“角色素材视图”混成重复设定。

推荐的提案顺序也要跟着这个语义层次走：

1. 先把项目里的 canonical `creative_references` 提案清楚。
2. 再补这些设定资料对应的 `asset_slots`，包括主视图、侧视图、全身图、表情组等。

Draft 里没有提到的正式实体不变；节点 `fields` 里没有提到的字段不变。Project proposal 不输出 `operations`、`action`、`entity`、`target_id`、`source_ids` 或 `payload`。设定合并写在保留方 `creative_reference` 节点的 `merge_candidates` 上；素材需求归属写在 `owner { type: "creative_reference", id/client_id }` 或 `fields.creative_reference_id` 上。

### 2. Production Proposal

制作级提案只负责：

- `segments`
- `scene_moments`
- `creative_reference_usages`
- `creative_reference_states`
- `asset_slot_usages`
- `unresolved_reference_requirements`
- `unresolved_asset_requirements`

它的职责是把当前制作拆成可执行的编排结构，并明确引用了哪些项目级设定和素材。

Production proposal 不应该直接创建项目级设定资料本体，也不应该替代 project proposal 去做全局查重决策。

## 推荐工作顺序

对于剧本增量或制作增量，推荐顺序是：

1. 先完成项目级分析
2. 再完成制作级编排
3. 最后进入用户审阅和 apply

这样做的原因很直接：

- 项目级设定和素材需要全局复用判断。
- 制作级编排只应该消费已经整理好的项目级索引。
- 先做项目级，再做制作级，前端能够复用同一套审阅 UI。

## 为什么要分阶段

如果把项目级设定、制作级结构、引用关系都塞进一个大 draft，语义会混。

更稳的划分方式是：

- 项目级 draft 负责“设定库怎么整理”
- 制作级 draft 负责“本制作怎么拆”
- 关系和缺口由系统 resolver / validator 补全和约束

这样模型每次修改时知道自己处在什么阶段，不会把“新建人物设定”和“情景里引用人物”混为一谈。

## Draft 的定位

Draft 不是最终结果，而是可审阅的阶段性方案。对 `project_proposal` 来说，它是局部语义补丁；对 `production_proposal` 来说，它仍然可以是制作结构方案。

Draft 的权威状态不应该面向落库 operation log。用户和下一轮 Agent 都应该看到“当前方案长什么样”；修改历史、审计记录和最终落库动作由系统生成或记录。

推荐的操作方式是：

- Agent 通过 tool 修改 draft
- 系统把修改应用到当前草稿状态
- 草稿保存当前快照和必要的修改历史
- 下一轮继续基于当前草稿修改

这比让模型直接输出最终 JSON 更稳，也更便于多轮增量修改。

## UI 复用方式

前端不需要为两个阶段各做一套完全不同的审阅系统。

可以复用同一套审阅壳，只替换：

- draft schema
- validator
- node renderer
- apply target

也就是说，用户看到的始终是“可审阅的提案草稿”，只是阶段不同、语义不同。

### Project Workspace UI

项目编排不再作为独立弹出的右侧编排面板存在。它应该是一个单页工作台，直接在项目页完成：

- 查看项目级设定资料。
- 查看并维护素材需求。
- 看清每个素材需求依附于哪个设定资料。
- 发起 AI 项目提案。
- 在同一页审阅、修改、dry-run 和 apply 草稿。

提案审阅必须按语义层级组织，而不是按模型输出顺序平铺：

1. 先审阅 `creative_references`，解决命名、边界、重复合并和 canonical 设定问题。
2. 再审阅依附于设定资料的 `asset_slots`，解决主视图、侧视图、表情组、道具图、场景图等交付需求。
3. 如果设定资料未审完，素材需求区域可以可见，但必须标记为等待 / 阻塞，不允许直接 apply。
4. 未绑定设定的素材需求单独列出，作为关系缺口处理。

AI 生成之后的审阅体验要接近 Git diff：

- 每条设定和素材需求都显示原值与当前提案值。
- 新增、局部修改、归属调整、合并建议要有可扫描的差异标记。
- 用户的接受 / 拒绝 / 编辑决策直接作用在 draft 上。
- apply 前必须基于当前决策生成写入预览；预览不应隐藏被跳过、被阻塞或已拒绝的项。

`merge_candidates` 是设定层的局部信息，不应该成为项目编排页的独立主卡片。它可以作为设定审阅里的标记、计数或局部操作出现。

## 写入边界

写入边界由系统控制，不由模型自己猜：

- `project_proposal` 只写项目级设定和素材
- `production_proposal` 只写制作级结构、引用和缺口
- Project proposal 完成前必须先本地 validate，再进行后端 dry-run apply；失败时把 validation/backendError 反馈给 Agent 修改 draft
- 最终 apply 前重新读取最新数据库，再做 resolve / validate

这保证了：

- Agent 可以完整工作
- 前端可以复用
- 项目级复用不会丢
- 制作级编排不会越权

## 一句话总结

**让 Agent 知道完整流程，但把写入权限按阶段切开。**

**先 project，再 production；先整理设定，再拆编排；同一套 UI，两个语义域。**
