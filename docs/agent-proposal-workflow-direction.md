# Agent Proposal Workflow Direction

本文记录 MovScript Agent 提案工作流的最终设计方向。

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
- 项目级设定资料与素材需求的创建、修改、删除、锁定

它的职责是把项目中的设定资料和素材库整理成一个可复用的项目索引。

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

Draft 不是最终结果，而是可审阅的阶段性快照。

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

## 写入边界

写入边界由系统控制，不由模型自己猜：

- `project_proposal` 只写项目级设定和素材
- `production_proposal` 只写制作级结构、引用和缺口
- 最终 apply 前重新读取最新数据库，再做 resolve / diff / validate

这保证了：

- Agent 可以完整工作
- 前端可以复用
- 项目级复用不会丢
- 制作级编排不会越权

## 一句话总结

**让 Agent 知道完整流程，但把写入权限按阶段切开。**

**先 project，再 production；先整理设定，再拆编排；同一套 UI，两个语义域。**
