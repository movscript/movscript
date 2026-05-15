# Agent Expertise Discovery Plan

本文记录围绕 `agent-prompt-loading-architecture.md` 的补充设计结论。目标是让 MovScript Agent 在保持 workflow 稳定、profile 暂不改动的前提下，支持用户通过对话发现专业知识、选择专业风格，并让内容单元提案基于情节/scene moment 做分镜化拆解。

本文是后续实现推进用的工作计划，不描述当前已全部实现的状态。

## 1. 核心结论

当前 `agent-prompt-loading-architecture.md` 能作为上下文管理底座：它解决大知识按需加载、Context Ledger、thread compaction、source boundary 和 prompt budget 问题。但要满足“专业技能可发现、可替换、没有也能工作”的产品需求，还需要补一层 `expertise` 和一套对话级发现机制。

最终分层应是：

```text
workflow
  负责如何完成任务：读取 focus、查上下文、创建/更新 draft、validate、preview、输出状态。

expertise
  负责专业判断方法：分镜语言、短剧节奏、镜头偏好、情绪推进、钩子策略、风格取向。

knowledge
  负责可检索的大资料正文：rhythm.md、shot-size.md、hook.md、keyframe.md 等。

schema / DraftDomainModel
  负责提案字段、seed 策略、review route、apply boundary 和写入边界。
```

其中 `workflow` 必须在没有 `expertise` 或 `knowledge` 时仍能工作，只是专业质量较基础。`expertise` 和 `knowledge` 是增强层，不是运行前提。

## 2. 内容单元与情节边界

当前产品语义应收敛为：

```text
Production
  -> Segment
    -> Scene Moment
      -> Content Unit
        -> Media / Keyframe / Generation Plan
```

`production_proposal` 负责 production 层结构：

- segments
- scene moments
- production-local gaps
- 对项目级设定和素材需求的引用

`content_unit_proposal` 本质上是“基于 scene moment 的 storyboard/content-unit proposal”：

- 必须先确认 production、segment 或 scene moment 锚点。
- 应读取 scene moment 的剧情目标、动作、情绪、人物/地点/道具引用。
- 再将该 scene moment 拆解成多个 content units。
- 每个 content unit 应服务于当前情节，不应另起一段未被 scene moment 支撑的新剧情。

因此后续 instruction 应避免把内容单元描述成独立内容生成，而应强调：

```text
读取情节锚点 -> 用专业分镜/节奏知识拆解 -> 写 content_unit_proposal draft
```

## 3. Expertise 分类

建议新增一等 skill 分类：

```ts
export type SkillKind = 'persona' | 'policy' | 'workflow' | 'expertise'
```

`expertise` 的职责：

- 提供专业判断标准。
- 影响拆分策略、镜头偏好、节奏密度、语言风格和验收侧重点。
- 可引用 knowledge collection 或 chunk。
- 可被用户通过对话选择或切换。

`expertise` 不负责：

- 不创建或更新 draft。
- 不拥有工具权限。
- 不定义 schema 字段。
- 不替代 workflow。
- 不把大知识正文常驻 prompt。

建议目录结构：

```text
apps/agent/catalog/skills/movscript/expertise/
  storyboard/
    short-drama/
      skill.expertise.json
      instruction.md
    cinematic/
      skill.expertise.json
      instruction.md
    commercial/
      skill.expertise.json
      instruction.md
  production/
    short-drama-structure/
      skill.expertise.json
      instruction.md
```

示例 manifest：

```json
{
  "id": "movscript.expertise.storyboard.short-drama",
  "kind": "expertise",
  "version": "1.0.0",
  "name": "Short Drama Storyboard Expertise",
  "description": "短剧分镜、强钩子、快节奏信息释放和情绪推进判断。",
  "priority": 720,
  "enabled": true,
  "domains": ["storyboard", "content_unit"],
  "styles": ["short_drama", "vertical_video"],
  "useWhen": ["竖屏短剧", "强钩子", "高频反转", "快速情绪推进"],
  "avoidWhen": ["慢节奏作者电影", "纪实观察", "低干预现场记录"],
  "knowledgeRefs": [
    "knowledge://storyboard/rhythm",
    "knowledge://storyboard/hook",
    "knowledge://storyboard/shot-size"
  ],
  "instructionTemplatePath": "instruction.md"
}
```

第一阶段如果不想改 `SkillKind`，可以用 `metadata.kind = "expertise"` 临时承载，但长期应成为 catalog 的一等类型，方便 linter、inspection、prompt budget 和能力索引处理。

## 4. Knowledge 与 Expertise 的关系

`knowledge` 是资料正文，`expertise` 是使用资料的专业方法。

例如：

```text
knowledge#storyboard.rhythm.basic
  说明镜头节奏、信息释放、情绪转折的通用知识。

expertise#movscript.expertise.storyboard.short-drama
  说明在短剧中如何偏向强钩子、短间隔反转和高密度情绪推进。
```

`expertise` 可以引用 knowledge，但不应直接嵌入大量知识正文。workflow 使用时：

1. 先检查当前 run/thread 是否已有 active expertise。
2. 如果有，则注入对应 expertise 的短 instruction。
3. 如果专业判断需要更多依据，再调用 `movscript_search_knowledge`。
4. 摘要不足时才调用 `movscript_get_knowledge`。
5. 使用 knowledge 后在 ledger 中记录 id、title、hash、source。

## 5. 对话级选择，不先改 Profile

profile 继续控制基础可用面：enabled packs、persona、policy、tool grants、workflow 候选等。用户通过对话选择的专业风格，不应立即写入 profile。

建议把对话选择记录为 run/thread context：

```json
{
  "activeExpertise": [
    {
      "id": "movscript.expertise.storyboard.short-drama",
      "scope": {
        "projectId": 12,
        "productionId": 301,
        "sceneMomentId": 88
      },
      "source": "user_input",
      "selectedAt": "2026-05-15T00:00:00.000Z"
    }
  ]
}
```

范围规则：

- 用户说“这一段”时，优先绑定当前 selected scene moment 或 content unit。
- 用户说“后面这一集/这个 production”时，绑定 production。
- 用户说“这个项目都用”时，可以绑定 project，但仍是 thread/project preference，不是 profile。
- 用户说“换成电影感”时，在相同 scope 下替换或降级旧 expertise。

这能支持同一项目中不同 scene moment 使用不同专业风格。

## 6. Agent 如何知道可以发现技能

当前机制是 runtime 替 agent 激活技能：

```text
profile.enabledWorkflows
  -> runtime trigger
  -> active workflows
  -> prompt only includes active skills
```

这意味着 agent 默认只知道本轮 active skills 和 visible tools，不天然知道未激活的专业技能。虽然已有 `movscript_inspect_agent_catalog`，但如果 prompt 没有给出发现策略，agent 不会主动想到去查。

因此需要一个短小、默认可见的 capability index。

### 6.1 Capability Index

每轮 prompt 可注入一个很短的能力发现摘要，不注入 skill 正文：

```text
Capability discovery:
- Current run may inspect enabled catalog capabilities with movscript_inspect_agent_catalog.
- Use catalog inspection when the user asks what skills, workflows, expertise, styles, or knowledge are available.
- Available categories may include workflows, expertise, knowledge domains, tools, and packs.
- Do not assume unavailable capabilities; inspect first when capability choice matters.
```

`inspect_agent_catalog summary` 建议扩展返回：

```json
{
  "capabilityIndex": [
    {
      "id": "movscript.workflow.content-unit-proposal",
      "kind": "workflow",
      "name": "Content Unit Proposal",
      "description": "基于 scene moment 起草内容单元结构。",
      "domains": ["content_unit", "storyboard"],
      "triggers": ["内容单元", "分镜", "镜头节拍"]
    },
    {
      "id": "movscript.expertise.storyboard.short-drama",
      "kind": "expertise",
      "name": "Short Drama Storyboard Expertise",
      "description": "短剧强钩子和快节奏分镜判断。",
      "domains": ["storyboard", "content_unit"],
      "styles": ["short_drama", "vertical_video"]
    }
  ]
}
```

这个 index 只放 id、kind、name、description、domains、styles、triggers/useWhen，不放 instructionTemplate 和知识正文。

### 6.2 Knowledge Discovery Workflow

新增轻 workflow：

```text
movscript.workflow.knowledge-discovery
```

触发场景：

- “有哪些技能/专业技能”
- “有哪些分镜知识”
- “我可以用什么风格”
- “这个情节适合什么方法”
- “帮我找钩子相关知识”
- “换成电影感/广告感/纪实感”

职责：

- 调用 catalog inspection 或 knowledge search。
- 向用户解释可选 workflow、expertise、knowledge domain。
- 推荐合适的 expertise。
- 在用户确认或明确表达选择后，记录 active expertise。
- 不创建 production/content-unit draft。
- 不正式修改 profile。

## 7. ContextManager 需要补充的数据结构

在 `ContextRef.type` 中增加：

```ts
| 'expertise'
| 'knowledge_collection'
```

在 `RunContext` 中增加：

```ts
activeExpertiseIds: string[]
expertiseItems: ContextItem[]
capabilityIndexItems: ContextItem[]
```

在 `ThreadContextSummary` 中增加：

```ts
activeExpertiseSelections: Array<{
  id: string
  scope: {
    projectId?: number
    productionId?: number
    segmentId?: number
    sceneMomentId?: number
    contentUnitId?: number
  }
  source: 'user_input' | 'memory' | 'draft' | 'runtime_state'
  updatedAt: string
}>
```

`expertise` 的 evidence 应为 `advisory`。它可以指导创作判断，但不能覆盖 backend/MCP tool result、draft schema、policy 或用户明确约束。

## 8. Content Unit Proposal 的目标流程

目标流程：

```text
1. 读取 focus。
2. 确认 production / segment / scene moment 锚点。
3. 调用 DraftDomainModel 获取 content_unit_proposal 契约。
4. 调用 production context 读取 scene moment、已有 content units、相关引用和素材需求。
5. 检查 run/thread active expertise。
6. 如用户正在询问方法或风格，先进入 knowledge-discovery。
7. 如需要专业依据，search/get storyboard knowledge。
8. 创建或更新 content_unit_proposal draft。
9. validate；支持时 preview apply。
10. 输出 draftId、sceneMomentId、productionId、使用的 expertise/knowledge refs、缺口和下一步。
```

缺少 scene moment 时：

- 如果 production 结构也缺，回退 `production_proposal`。
- 如果只是用户没选范围，询问一个窄问题。
- 不应凭空创建 content units。

## 9. Production Proposal 的未来拆分

production 提案也应按同一原则拆分：

```text
movscript.workflow.production-proposal
  如何写 production proposal。

movscript.expertise.production.short-drama-structure
  短剧情节结构、情绪段、反转节奏、scene moment 切分判断。

movscript.knowledge.short-drama
  开场、反转、人物关系推进、爽点结构等资料正文。
```

这样 production proposal 不再承担专业影视教材职责，只负责读取事实、组织 draft、维护边界和校验。

## 10. 与现有 agent-prompt-loading-architecture 的关系

本文不是替代 `agent-prompt-loading-architecture.md`，而是补齐其中未展开的能力发现和专业技能层。

对应关系：

| 现有架构 | 本文补充 |
| --- | --- |
| Skill 是行为，不是知识库 | 增加 Expertise：专业判断不是 workflow，也不是大知识正文 |
| Knowledge search/get | 用户可通过 knowledge-discovery 主动找知识 |
| Context Ledger | 记录 expertise refs、knowledge refs 和用户选择 |
| Thread Summary | 保存 active expertise selection，不保存知识正文 |
| Prompt Budget | expertise instruction 短注入，knowledge 正文按需读取 |
| Source Boundary | expertise/knowledge 均为 advisory，不是项目事实 |

## 11. 分阶段落地计划

### Phase A: 文档和 prompt 约束

1. 在 core policy 中补充能力发现规则。
2. 在 `agent-prompt-loading-architecture.md` 中增加 expertise/discovery 概念引用。
3. 在 content-unit workflow 文案中明确必须基于 scene moment。

验收：

- Agent 知道用户问“有哪些技能/方法/风格”时应检查 catalog。
- Content unit proposal 不再被描述成脱离情节的内容生成。

### Phase B: Capability Index

1. 扩展 `inspect_agent_catalog summary`，返回 capability index。
2. 支持按 kind/domain/style 过滤。
3. catalog inspection 不返回 instruction 正文，除非显式 `includeInstruction=true`。

验收：

- Agent 能列出可用 workflow/expertise/knowledge domain 摘要。
- 不会把所有 skill 正文注入 prompt。

### Phase C: Knowledge Discovery Workflow

1. 新增 `movscript.workflow.knowledge-discovery`。
2. 加触发词：技能、专业技能、知识、风格、方法、分镜知识、钩子方法等。
3. workflow 只读 catalog/knowledge，不写 draft。

验收：

- 用户可通过对话询问可用专业方法。
- Agent 能推荐专业风格，并解释适用/不适用场景。

### Phase D: Expertise 最小实现

1. 先用 `metadata.kind = "expertise"` 或正式扩展 `SkillKind`。
2. 新增 1-2 个 storyboard expertise。
3. 将用户选择记录到 run/thread metadata。
4. content-unit workflow 读取 active expertise。

验收：

- 同一个 scene moment 可选择短剧/电影感等不同风格。
- 未选择 expertise 时，content-unit workflow 仍可执行。

### Phase E: Knowledge layer 接入

1. 实现 knowledge loader/store/search/get。
2. 添加 storyboard knowledge collection。
3. content-unit/storyboard workflow 按需 search/get。
4. ledger 记录 knowledge id/title/hash。

验收：

- 默认 prompt 不包含知识正文。
- 用户询问或 workflow 需要时才读取知识。
- 下一 run 默认只保留 knowledge ref，不保留正文。

### Phase F: 正式 catalog 类型和 pack 集成

1. `SkillKind` 正式加入 `expertise`。
2. `CapabilityPack.resources` 支持 expertise/knowledge。
3. linter 校验 expertise refs、knowledge refs。
4. catalog inspection 支持 expertise view。

验收：

- pack 能注册专业技能和知识集合。
- profile 不需要预先写死用户每次要用的专业风格。

## 12. 关键验收清单

- [ ] Agent 能在用户询问能力、知识、方法、风格时主动查看 capability index。
- [ ] 未触发专业需求时，不注入 expertise 正文和 knowledge 正文。
- [ ] 没有 expertise 时，workflow 仍能完成基础 proposal。
- [ ] 用户可通过对话选择、替换或限定 expertise scope。
- [ ] expertise 不拥有写工具权限，不创建 draft。
- [ ] knowledge 正文只通过 search/get 进入当前 run。
- [ ] Context Ledger 记录 expertise refs 和 knowledge refs。
- [ ] Thread summary 只保存 expertise selection 和 refs，不保存大正文。
- [ ] content_unit_proposal 必须基于 scene moment 或明确询问范围。
- [ ] production_proposal 和 content_unit_proposal 的边界保持稳定。

