# Entity Ownership Boundary Review

更新日期：2026-04-30

## 背景

这份文档记录一次实体边界梳理，目标是让每类实体只维护自身事实，避免把其他实体的结构化资料复制到自己身上。

当前调整方向：

- 剧本不再保留人物关系、结构化人物档案。
- 人物档案只放在设定中。
- 设定中需要提供人物关系图。
- 实体之间的关系通过引用、关系边、资源绑定表达，而不是把对方的结构化档案内嵌到本实体字段里。

## 目标边界

### Script

Script 应只关注剧本文本和剧本自身分析：

- 标题、描述、正文、类型、版本、分集/场次绑定、排序。
- 剧本自身的摘要、钩子、剧情推演、结构点。
- 可以显示关联设定，但不拥有设定档案本身。

Script 不应拥有：

- `character_profiles` 结构化人物档案。
- `character_relationships` 人物关系图。
- 长期事实源性质的角色、场景、道具、世界规则档案。

允许的关系表达：

- `ScriptSettingRef`：某个设定在某个剧本中的使用上下文，例如角色作用、首次出现、情绪、状态、本集/本场作用、证据。
- `SettingRelationship.scope_script_id`：如果关系只在某个剧本范围内成立，可用作用域字段表达，但关系仍属于设定关系图体系。

### Setting

Setting 是设定事实源：

- 人物、场景、道具、世界规则的名称、别名、描述、正文、标签、重要性、状态。
- 人物档案放入 `profile_json` 或后续更明确的结构化字段。
- 设定详情页应承接人物档案编辑体验。

Setting 关系图应由 `SettingRelationship` 承担：

- source / target 指向两个 Setting。
- type / label / description 表达关系语义。
- 全局关系使用空 `scope_script_id`。
- 剧本局部关系使用 `scope_script_id`，但仍从设定图读取和编辑。

### ScriptAnalysis

ScriptAnalysis 是一次 AI 分析快照：

- 可以保存模型抽取出的原始 JSON，作为可审计、可回放、可确认的数据。
- 不应成为正式实体事实源。
- 确认或同步后，应写入 Setting、ScriptSettingRef、SettingRelationship，而不是长期写回 Script 的人物档案字段。

### Asset

Asset 只关注素材及其变体：

- 资源、视角图、生成提示词、服装/状态/时段等变体信息。
- 可通过 `setting_id` 绑定 Setting。
- 不应重复保存人物/场景/道具的主档案。

### Storyboard / Shot / Scene / Episode

这些实体只保存自身制作信息：

- Storyboard 可以保存本分镜的参与人物列表或引用，但不保存人物档案。
- Shot 只保存镜头描述、提示词、生成结果。
- Scene 只保存拍摄场景自身信息。若是世界观场景设定，应由 Setting 管理。
- Episode 只保存分集自身信息和与场次/剧本的关系。

## 当前不合理点

### 1. Script 仍然保存结构化人物档案和人物关系图

位置：

- `apps/backend/internal/model/script.go`
- `apps/frontend/src/types/index.ts`

问题：

- `Script` 里仍有 `Characters`、`CharacterProfiles`、`CharacterRelationships`、`CoreSettings`、`ScenesDesc`。
- 其中 `CharacterProfiles` 和 `CharacterRelationships` 已经和 `Setting.ProfileJSON`、`SettingRelationship` 形成事实源重复。
- 主剧本编辑人物档案后，设定库可能被同步，但 Script 仍保留一份可继续编辑的副本，后续会产生分叉。

建议：

- 将 `character_profiles`、`character_relationships` 标记为 deprecated。
- 新写入不再接受这两个字段。
- 迁移存量数据到 `settings.profile_json` 和 `setting_relationships`。
- Script 详情只显示/编辑引用设定与本剧本使用上下文。

### 2. Script API 仍允许写入人物档案和人物关系

位置：

- `apps/backend/internal/service/entity_dto.go`

问题：

- `ScriptInput` 仍接受 `character_profiles`、`character_relationships`。
- `scriptPatchFields` 仍允许 PATCH 这两个字段。
- 只改前端不足以收敛边界，第三方调用或 Agent 仍可继续写入 Script。

建议：

- 第一阶段保留读取兼容，但从 create/update/patch 白名单移除。
- 如果需要兼容旧客户端，后端可短期接收但转写到 Setting/SettingRelationship，并在响应或日志中标记 deprecated。
- 最终数据库字段移除或保留只读归档字段。

### 3. AI 分析先写 Script，再同步 Setting，方向反了

位置：

- `apps/backend/internal/handler/script.go`

问题：

- AI prompt 要求输出 `character_profiles` 和 `character_relationships`。
- Analyze 结果先写入 `Script.CharacterProfiles` / `Script.CharacterRelationships`。
- 随后再调用 `syncAnalysisToSettings` 同步到 Setting 和 SettingRelationship。
- 这让 Script 成为临时事实源和正式事实源的混合体。

建议：

- AI 分析结果写入 `ScriptAnalysis` 作为快照。
- 同步正式数据时直接写入 `Setting`、`ScriptSettingRef`、`SettingRelationship`。
- Script 只更新自身字段，例如 `summary`、`hook`、`plot_summary`、`script_points`，以及必要的 `analysis_status`。
- `characters` 可改为分析快照或引用列表的展示结果，不再作为可编辑档案字段。

### 4. 手动编辑 Script 会反向同步设定

位置：

- `apps/backend/internal/handler/script.go`
- `syncScriptFieldsToSettings`
- `scriptFieldsToSettingResult`

问题：

- 当前创建、更新、PATCH Script 后，会把 Script 字段里的 `character_profiles`、`character_relationships` 同步到 Setting。
- 这意味着用户在剧本里改人物档案时，会影响设定事实源。
- 该行为违背“实体只专注自身”：Script 不应是 Setting 的编辑入口。

建议：

- 停止从 Script 字段反向同步 Setting。
- 如果保留旧数据兼容，只在迁移任务中执行一次性 backfill。
- 后续设定编辑必须走 Setting / SettingRelationship 接口。

### 5. 语义 schema 把 Script 的人物档案暴露为可写端口

位置：

- `apps/backend/internal/workflow/entity_schema.go`

问题：

- `EntitySemanticSchemas` 中 script schema 仍定义 `characters`、`character_profiles`、`character_relationships` 为 writable JSON fields。
- Canvas / workflow / Agent 可通过实体端口继续写入这些字段。
- `core_settings` 还通过 workflow port `settings` 映射到 Script 字段，容易误导“设定”写在剧本上。

建议：

- 将 `character_profiles`、`character_relationships` 从 Script schema 的 writable fields 中移除。
- 短期可作为 readonly deprecated fields 暴露，帮助旧数据查看。
- 新增或强化 Setting / SettingRelationship 的 workflow 能力，让自动化流程写入设定域。
- `settings` 端口不应映射到 Script 的 `core_settings`，应改为创建/引用 `world_rule` Setting。

### 6. 主剧本前端仍是人物档案和关系图的主编辑入口

位置：

- `apps/frontend/src/components/forms/ScriptForm.tsx`
- `CharacterStructureEditor`

问题：

- 主剧本详情中直接编辑 `character_profiles`。
- 主剧本详情中直接编辑 `character_relationships` 并渲染 ReactFlow 图。
- 这与“人物档案只放设定里，设定里增加人物关系图”的目标冲突。

建议：

- 从 ScriptForm 移除 `CharacterStructureEditor`。
- 主剧本详情改为展示 Setting 引用面板：角色、场景、道具、世界规则。
- 人物关系图迁移到 Setting 页面或专门的设定图页面。
- Script 中保留“本剧本使用上下文”的编辑能力，例如角色在本集的状态、目的、情绪，这些写入 `ScriptSettingRef`。

### 7. Setting 详情页没有真正承接人物关系图

位置：

- `apps/frontend/src/pages/work/workspaces/SettingWorkspace.tsx`
- `apps/frontend/src/pages/scripts/ScriptsPage.tsx`

问题：

- Setting 详情目前主要由 `EntitySemanticForm` 渲染基础字段和 `profile_json`。
- `SettingRelationship` 已有后端模型和 API，但前端只在 Script 的引用面板中做简单列表展示。
- 人物关系图的主要编辑体验仍在 Script。

建议：

- 在设定域新增关系图 UI，数据源为 `SettingRelationship`。
- 图节点来自 `type=character` 的 Setting。
- 图边来自 `SettingRelationship`。
- 支持全局图和按 `scope_script_id` 过滤的局部图。
- 人物 Setting 详情页可显示该人物的一阶关系；设定列表页可提供全局关系图。

### 8. Setting 与 Script 的关系字段语义不够收敛

位置：

- `apps/backend/internal/model/setting.go`
- `apps/backend/internal/model/script_setting_ref.go`

问题：

- `Setting.ScriptID`、`Setting.SourceScriptID`、`ScriptSettingRef.ScriptID` 同时存在。
- `ScriptID` 容易被理解为 Setting 属于某个 Script，这与“设定是项目级事实源”冲突。
- `SourceScriptID` 更像来源追踪，`ScriptSettingRef` 才是使用关系。

建议：

- 明确 Setting 是 Project-owned。
- 弱化或废弃 `Setting.ScriptID`。
- 来源追踪只保留 `SourceScriptID` / `SourceAnalysisID`。
- 剧本引用一律通过 `ScriptSettingRef`。

### 9. SettingRelationship API 缺少关系边界校验

位置：

- `apps/backend/internal/handler/setting.go`

问题：

- 创建/更新关系时没有明显校验 source/target 是否属于同一 project。
- 没有阻止非人物设定被纳入“人物关系图”。
- 没有防止 source 和 target 相同。
- 没有唯一约束或规范化策略，容易生成重复边。

建议：

- 对关系图接口补充校验：
  - source/target 必须存在且属于同一 project。
  - 人物关系图只允许 `type=character` 的 Setting。
  - source 和 target 不能相同。
  - 同 project、同 source、同 target、同 relationship type、同 scope 下唯一。
- 如果关系图后续支持场景/道具关系，使用不同 graph type 或 relationship category 区分。

### 10. Storyboard.characters 仍有潜在重复风险

位置：

- `apps/backend/internal/model/storyboard.go`
- `apps/frontend/src/components/forms/StoryboardForm.tsx`

问题：

- `Storyboard.Characters` 注释为 JSON array of asset IDs or names。
- 如果该字段只表示本分镜出现了哪些人物，问题较小。
- 如果未来塞入人物档案、角色状态、关系说明，就会重复 Setting / ScriptSettingRef 的职责。

建议：

- 保留为本分镜参与者引用列表，或迁移为对 Setting/Asset 的引用。
- 不允许保存人物档案正文。
- 若需要本分镜局部状态，使用独立引用表或 resource/entity binding，而不是扩展成档案字段。

## 建议改造顺序

### Phase 1：冻结错误写入口

- 从前端 ScriptForm 移除主剧本人物档案编辑和关系图编辑。
- Script 详情只展示“引用设定”和“剧本自身分析字段”。
- 后端停止在 Script update/patch 中接受 `character_profiles`、`character_relationships` 的新写入。
- workflow script schema 将这两个字段标记为 readonly/deprecated，或直接从 writable projection 移除。

### Phase 2：让设定域承接完整体验

- 在 Setting 页面增加人物档案结构化编辑器，读写 `profile_json`。
- 在 Setting 页面增加人物关系图，读写 `SettingRelationship`。
- 支持全局关系图和按剧本过滤的局部关系图。
- 补齐 SettingRelationship 的后端校验和去重。

### Phase 3：调整 AI 分析落点

- AI prompt 可以继续抽取人物、场景、道具、关系，但正式落点改为：
  - `ScriptAnalysis` 保存分析快照。
  - `Setting` 保存人物/场景/道具/世界规则档案。
  - `ScriptSettingRef` 保存该剧本里的引用和上下文。
  - `SettingRelationship` 保存人物关系。
  - `Script` 只保存摘要、剧情结构等自身字段。
- 移除 `syncScriptFieldsToSettings` 的常规调用。
- 保留一次性迁移或后台修复任务处理旧 Script 字段。

### Phase 4：迁移存量数据

- 扫描所有 Script 的 `character_profiles`：
  - 按 project + character name upsert 到 Setting。
  - 原 JSON 写入 `Setting.profile_json`。
  - 建立 `ScriptSettingRef`。
- 扫描所有 Script 的 `character_relationships`：
  - 通过旧 local id / name 匹配 Setting。
  - 写入 `SettingRelationship`。
  - 主剧本关系写为全局关系；分集/场景剧本关系写入 `scope_script_id`。
- 迁移后将 Script 旧字段置空、归档，或保留只读直到下一次破坏性迁移。

### Phase 5：清理模型和 API

- 从 `Script` 模型移除或永久废弃：
  - `Characters`
  - `CharacterProfiles`
  - `CharacterRelationships`
  - 可选：`CoreSettings`、`ScenesDesc` 中事实源性质的部分
- 从 `ScriptInput` 和 PATCH 白名单移除对应字段。
- 从前端 `Script` 类型中移除对应字段。
- 从 i18n 和 UI 中清理“Script 内人物档案”相关文案。
- 更新 docs/api 与语义 schema 兼容说明。

## 判断标准

后续每次新增字段或功能时，用以下问题判断是否放错实体：

- 这个字段描述的是本实体自身，还是另一个实体的档案？
- 如果另一个页面修改同一事实，会不会出现两份来源？
- 这个字段是“引用上下文”，还是“被引用实体的长期事实”？
- 这个信息是否需要跨剧本、跨分集、跨镜头复用？
- AI 或 workflow 写入这个字段后，是否会绕过正式事实源？

如果答案指向复用、长期事实、跨实体一致性，应放入被描述实体或关系表；当前实体只保存引用和局部上下文。

## 优先处理清单

1. 移除 ScriptForm 中主剧本的 `CharacterStructureEditor`。
2. 给 Setting 页面增加人物档案结构化编辑器。
3. 给 Setting 页面增加基于 `SettingRelationship` 的人物关系图。
4. 后端禁止 Script 新写入 `character_profiles` 和 `character_relationships`。
5. 调整 AI 分析：不再把人物档案/关系写回 Script。
6. 调整 entity semantic schema：Script 不再暴露人物档案 writable ports。
7. 编写数据迁移，把旧 Script 人物档案和关系迁入 Setting / SettingRelationship。
8. 清理类型、文案、测试和 API 文档。
