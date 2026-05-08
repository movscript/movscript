# Agent 编排功能设计文档

> 本文档记录 MovScript agent 与前端制作编排功能的对接设计，供后续会话直接执行。

---

## 一、背景与目标

用户通过 agent 对话，将剧本、brief、参考图、产品资料、已有素材或 prompt 种子分析成制作所需的结构化实体，然后在前端确认、修改、应用。

底层架构边界见 [Creative Source and Production Graph Architecture](script-production-graph-architecture.md)：创作来源层负责保留输入事实，故事意图层负责结构化故事、卖点、受众、视觉目标和连续性，编排层负责把这些事实转成可执行的分镜、素材绑定、生成任务和交付版本。

核心流程：

```
创作来源 → agent 分析 → 提案（draft）→ 用户确认 → 写入后端
```

项目编排和制作编排拆成两条提案通道：

- `project_proposal`：项目级治理提案，只应用 `creative_reference` 和 `asset_slot`。它负责创建设定资料、修改设定资料、删除/合并重复设定、创建或锁定项目级素材需求。用户确认后走 `POST /projects/:id/entities/project-proposals/apply`。
- `production_proposal`：制作级结构提案，只应用制作结构和制作使用关系。它负责 `segment`、`scene_moment`，以及在情景下提出设定引用和素材需求使用；内容单元、关键帧、台词定稿、运镜表和 prompt 仍属于下游制作工作台。用户确认后走 `POST /projects/:id/entities/production-proposals/apply`。
- 制作侧可以读取项目侧的设定资料和素材需求用于复用、去重和引用，但不直接拥有这些实体；项目侧是它们的最终 owner。

分析产出的实体层级：

```
Production（制作）
├── Segment（编排段）        — 本集内部的情绪 / 节奏 / 戏剧功能段
│   └── SceneMoment（情景）  — 具体时空、条件、动作和局部情绪
│       ├── CreativeReferenceUsage — 这个情节用到哪些人物/场景，各自什么状态
│       └── AssetSlot（素材需求）   — 需要准备什么素材、用于哪个情节、优先级如何
├── CreativeReference（设定资料）— 项目级：人物/场景/道具/品牌（跨制作共享）
│   └── CreativeReferenceState（设定状态）— 某个情节里该设定资料的具体表现（服装/情绪/道具）
└── 制作工作台（下游）       — 基于 SceneMoment 再生成 ContentUnit / Keyframe / 运镜表 / 台词定稿
```

编排工作台的核心作用是定上游约束：情节结构、情绪节奏、人物状态、设定引用、连续性和素材诉求。它不负责把情节拆成最终镜头，不负责定稿台词、运镜表、关键帧或 prompt。`ContentUnit` 和 `Keyframe` 是制作工作台的产物，编排提案只允许保留少量 `production_notes` / `directing_intent` 作为下游参考。

---

## 二、当前系统状态

### 已有能力

**Agent 工具（`apps/agent/catalog/tools/*.json`）：**
- `movscript.read_production_context` — 读取完整制作编排上下文
- `movscript.check_proposal_is_available` — 检查提案是否可提交并返回归一化建议
- `movscript.create_production_proposal` / `movscript.upsert_proposal_*` — 写入可审阅的草稿提案

**Draft 系统（`apps/agent/src/runtime/store/draftStore.ts`）：**
- `AgentDraftKind`: `script | asset_slot | storyboard_line | content_unit | prompt | note | pipeline | segment | scene_moment | project_proposal | production_proposal`
- `AgentDraftStatus`: `draft | accepted | rejected | applied | superseded`
- `BackendApplyClient` 支持字段级 PATCH，也支持提案级 POST：`project_proposal` 走项目提案 apply，`production_proposal` 走制作提案 apply

**后端数据模型（`apps/backend/internal/domain/model/`）：**
- `CreativeReference` — 项目级，`ProjectID` 无 `ProductionID`，天然跨制作共享
- `CreativeReferenceState` — 情节级状态快照（服装/情绪/道具）
- `CreativeReferenceUsage` — 记录哪个情节用了哪个材料、用哪个状态
- `AssetSlot.LockedAssetSlotID` — 素材复用机制，指向已锁定的素材槽
- `CandidateDecision.Status` 含 `superseded` — 支持版本替换

### 已知缺口

1. **`AgentDraftKind` 缺少 `segment` 和 `scene_moment`** — agent 无法提案新建这两类实体
2. **`BackendApplyClient` 只做 PATCH** — 无法批量新建实体树（Segment → SceneMoment → CreativeReferenceUsage / AssetSlot）
3. **`check_entity_conflicts` 只检查当前制作** — 无法发现跨制作的 CreativeReference 复用机会
4. **没有批量提案的结构化格式** — 现在一个 draft 对应一个字段，无法表达整棵实体树
5. **前端没有提案审阅 UI** — 用户看不到 agent 提出的树形结构，无法逐节点确认/拒绝

---

## 三、核心设计问题

### 3.1 提案粒度：字段级 vs 实体树级

**现状**：一个 draft = 一个 target entity + 一个 field（字段级）

**需要**：一个 draft = 一棵编排约束树（树级），包含：
```json
{
  "kind": "pipeline",
  "proposal": {
    "segments": [
      {
        "action": "create",
        "title": "开场",
        "kind": "scene",
        "scene_moments": [
          {
            "action": "create",
            "title": "小明出场",
            "time_text": "清晨",
            "location_text": "公寓门口",
            "creative_references": [
              { "action": "reuse", "id": 42, "role": "protagonist", "state": { "costume": "红色外套" } }
            ],
            "asset_slots": [
              { "action": "create", "name": "主角半身参考图", "kind": "image", "priority": "high" }
            ]
          }
        ]
      }
    ]
  }
}
```

`action` 字段区分三种情况：
- `"create"` — 新建实体
- `"reuse"` — 复用已有实体（附 `id`）
- `"update"` — 修改已有实体（附 `id` 和变更字段）

编排阶段禁止把镜头、台词定稿、运镜、关键帧、prompt 当作正式提案节点写入。需要给制作工作台的表达建议时，只写在 `rationale`、`directing_intent` 或 `production_notes` 一类的说明字段中，不能生成 `content_units` 或 `keyframes`。

### 3.2 重新推演：增量 diff 而非全量覆盖

用户可能在确认部分提案后，发现某个情节分析有误（如漏了人物），要求重新分析。

**处理规则：**

| 实体当前状态 | 重新分析时的处理 |
|---|---|
| `draft`（未确认） | 自动标记为 `superseded`，生成新 draft |
| `confirmed`（已确认） | **保守策略**：只允许补充，不允许覆盖。Agent 只能新增缺失内容 |
| `confirmed` 且用户明确要求修改 | 生成 `action: "update"` 提案，需要二次确认 |

**重新分析的最小单元**：SceneMoment（情节）。用户可以指定"重新分析第二个情节"，agent 只替换该情节下的 draft，不影响其他情节。

**Agent 在重新分析时必须携带的上下文：**
- 当前制作内已 `confirmed` 的实体列表（作为约束，不能删）
- 当前制作内已 `draft` 的实体列表（将被 supersede）
- 项目级 CreativeReference 列表（避免重复创建人物）

### 3.3 跨制作复用：CreativeReference 查重

**问题**：一个项目有多个制作（如短视频版、直播版），人物"小明"在两个制作里都出现，agent 分析时不能新建两个 CreativeReference，必须复用同一个。

**解决方案**：在制作提案工具里直接做业务语义归一化和复用判断，不再暴露通用实体搜索接口；agent 只读取当前 production context 和 proposal context，然后把 `reuse/create/update` 交给提案校验工具裁定。

**AssetSlot 复用**：已锁定的素材（如人物参考图）通过 `LockedAssetSlotID` 引用，agent 提案时应检查是否已有可复用的锁定素材。

**前端展示要求**：复用的实体需要标注"来自制作A"或"项目共享"，让用户知道修改会影响其他制作。

---

## 四、需要实现的工作

### 4.1 Agent 工具扩展

**扩展 `check_entity_conflicts`（或新增工具）**：
- 增加 `scope: "project"` 参数，支持项目级 CreativeReference 查重
- 返回格式增加 `reuse_candidates`：匹配到的已有实体列表

**扩展 `propose_production_entities`**：
- 支持树形提案格式（见 3.1）
- 支持 `action: "reuse" | "create" | "update"`
- 创建本地客户端审阅用的 `production_proposal` draft，不直接写后端正式实体
- 在创建新 draft 前，自动将同 scope 下的旧 draft 标记为 `superseded`

**扩展 `read_production_context`**：
- 增加 `include_project_references: true` 参数
- 返回项目内所有制作的 CreativeReference 列表，供 agent 做跨制作查重

### 4.2 Draft 系统扩展

这里的 Draft 是 Agent runtime 和客户端之间的审阅协议对象，用来承载 AI 生成的候选结构、上下文引用和生命周期状态。它不是后端正式领域实体；后端写入应由用户确认后的 apply 流程触发。

**`AgentDraftKind` 增加**：
- `segment` — 编排段提案（本集内部的情绪 / 节奏 / 戏剧功能段）
- `scene_moment` — 情景提案
- `project_proposal` — 项目级治理提案（设定资料与素材需求）
- `production_proposal` — 完整编排树提案（包含上述所有层级）

**`BackendApplyClient` 增加批量创建能力**：
- 新增 `POST` 路由支持（当前只有 PATCH）
- 项目提案应用：`ProjectProposal → CreativeReference / AssetSlot`
- 按拓扑顺序创建：Segment → SceneMoment → CreativeReferenceUsage → AssetSlot
- 创建 CreativeReferenceUsage 绑定

### 4.3 前端提案审阅 UI

在 `ProductionOrchestratePage` 中增加"Agent 提案"面板：

**展示内容**：
- 树形结构：编排段 → 情景 → 设定引用 + 素材需求
- 每个节点标注 `action`（新建/复用/修改）
- 复用节点标注来源制作
- 修改节点显示 before/after diff

**操作**：
- 整体接受 / 整体拒绝
- 逐节点接受 / 拒绝 / 编辑
- 批量提交（按拓扑顺序写入后端）

**重新分析入口**：
- 每个情节节点旁有"重新分析"按钮
- 触发后 agent 只替换该情节的 draft，已确认的实体保持不变

---

## 五、执行优先级

按依赖顺序：

1. **扩展 `check_entity_conflicts` 支持项目级查重**（agent 侧，影响提案质量）
2. **扩展 `propose_production_entities` 支持树形提案 + supersede 旧 draft**（agent 侧，核心流程）
3. **扩展 `AgentDraftKind` 增加 `segment` / `scene_moment` / `production_proposal`**（agent 侧）
4. **后端增加批量创建接口**（backend 侧，解锁写入能力）
5. **前端提案审阅 UI**（frontend 侧，用户确认流程）

可以先用 mock 数据打通前端 UI（步骤5），再接真实 agent 数据（步骤1-3），最后接后端写入（步骤4）。

---

## 六、关键约束

- **保守策略**：已 `confirmed` 的实体不能被 agent 直接覆盖，只能补充或提议修改（需二次确认）
- **项目级共享**：`CreativeReference` 是项目级实体，跨制作必须复用，不能重复创建
- **拓扑顺序**：批量创建时必须按 Segment → SceneMoment → CreativeReferenceUsage → AssetSlot 顺序，因为子实体依赖父实体的 ID
- **编排边界**：编排 proposal 不生成 `content_unit`、`keyframe`、台词终稿、运镜表或 prompt；这些必须在制作工作台根据已确认的 `scene_moment` 再展开。
- **Supersede 语义**：重新分析时，同 scope 下的旧 draft 必须先标记为 `superseded`，不能让两个版本并存

---

## 七、相关文件索引

| 文件 | 说明 |
|---|---|
| `apps/agent/catalog/tools/movscript-mcp-tools.json` | Agent 工具定义 |
| `apps/agent/catalog/skills/movscript-platform.json` | Agent 技能定义 |
| `apps/agent/src/runtime/agentRuntime.ts` | Agent 运行时主入口 |
| `apps/agent/src/runtime/store/draftStore.ts` | Draft 存储，含 AgentDraftKind |
| `apps/agent/src/runtime/store/backendApplyClient.ts` | 后端写入客户端，含 FIELD_ALLOWLIST |
| `apps/agent/src/runtime/store/draftApply.ts` | Draft 应用逻辑 |
| `apps/backend/internal/domain/model/semantic_creative.go` | CreativeReference / State / Usage 模型 |
| `apps/backend/internal/domain/model/semantic_production.go` | AssetSlot / CandidateDecision 模型 |
| `apps/backend/internal/domain/model/semantic_structure.go` | Segment / SceneMoment / ContentUnit 模型 |
| `apps/frontend/src/pages/production/ProductionOrchestratePage.tsx` | 前端制作编排页面 |
