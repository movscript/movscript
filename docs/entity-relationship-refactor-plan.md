# Entity Relationship Refactor Plan

本文档用于先讨论实体关系的重构方向。当前阶段只定义问题、边界和候选方案，不直接要求一次性改库表。

## 背景

当前实体之间的关系主要通过三种方式表达：

1. 明确外键字段，例如 `ScriptVersion.ScriptID`、`Segment.ProductionID`、`ContentUnit.SceneMomentID`。
2. 多态指针字段，例如 `OwnerType/OwnerID`、`ScopeType/ScopeID`、`TargetType/TargetID`。
3. 局部关系表，例如 `CreativeRelationship`、`WorkDependency`、`ResourceBinding`。

问题是这些表达方式混在一起后，业务语义不够清楚：

- 外键只能表达“指向谁”，不能表达“为什么指向”。
- 同一对实体之间可能存在多种关系，但外键通常只能承载一种默认关系。
- 关系本身有状态、来源、证据、顺序、版本、作用域、权重等属性时，外键会变得不够用。
- `OwnerType/OwnerID` 解决了多态问题，但缺少统一的关系类型和约束。
- `CreativeRelationship` 已经说明“关系是一等对象”的方向是对的，但范围还不统一。

## 目标

重构目标不是删除所有外键，而是把“实体生命周期所需的硬归属”和“业务语义关系”分开：

- 硬归属关系继续保留外键，用于数据完整性、常用查询和生命周期管理。
- 业务语义关系统一进入关系模型，用于表达多类型、多状态、多来源、多作用域的复杂关系。
- 新关系模型应能覆盖创意、结构、制作、素材、工作流、交付之间的连接。
- 迁移过程应允许旧字段与新关系表并存，避免一次性大爆炸式重构。

## 核心痛点关系

先把当前最关键的 5 组关系收敛清楚。这里先使用项目内现有实体命名：

- 制作：`production`
- 资料：`creative_reference`
- 素材：`asset_slot`，实际文件是 `raw_resource`
- 片段：`segment`
- 情节：`scene_moment`
- 内容单元：`content_unit`

### 1. 制作使用资料、制作拥有片段

制作和资料之间不是父子生命周期关系，而是业务使用关系。一个制作可以使用多个资料，一个资料也可以被多个制作复用。

| Source | Type | Target | 关系性质 | 建议 |
| --- | --- | --- | --- | --- |
| `production` | `uses` | `creative_reference` | 多对多语义关系 | 进入 `EntityRelation` |
| `production` | `contains` | `segment` | 制作结构归属 | 保留 `Segment.ProductionID`，同时镜像关系 |

说明：

- `production uses creative_reference` 表达“这个制作会用到哪些资料”。
- `production contains segment` 表达“这个制作拆成哪些片段”。
- `Segment.ProductionID` 可以保留，因为制作页面高频按 production 查片段。

### 2. 资料属于项目、素材属于资料

资料属于项目是强归属关系，应继续用外键表达。素材属于资料需要分两层理解：语义素材槽属于资料，实际文件资源被素材槽使用。

| Source | Type | Target | 关系性质 | 建议 |
| --- | --- | --- | --- | --- |
| `project` | `owns` | `creative_reference` | 项目强归属 | 保留 `CreativeReference.ProjectID` |
| `creative_reference` | `has_asset` | `asset_slot` | 资料的素材需求或素材槽 | 进入 `EntityRelation`，可保留 `AssetSlot.CreativeReferenceID` |
| `creative_reference_state` | `has_asset` | `asset_slot` | 某个资料状态的素材槽 | 进入 `EntityRelation`，可保留 `AssetSlot.CreativeReferenceStateID` |
| `asset_slot` | `uses_resource` | `raw_resource` | 素材槽使用实际文件 | 进入 `EntityRelation`，可保留 `AssetSlot.ResourceID` |

说明：

- “资料属于项目”不是复杂关系，`ProjectID` 足够。
- “素材属于资料”建议不要直接理解成文件属于资料，而是：资料拥有素材槽，素材槽再绑定实际资源。
- 这样可以支持一个角色资料拥有头像、半身、全身、表情、动作参考等多个素材槽。

### 3. 片段拥有情节、内容单元

片段是结构容器，情节和内容单元是片段下的制作颗粒。

| Source | Type | Target | 关系性质 | 建议 |
| --- | --- | --- | --- | --- |
| `segment` | `contains` | `scene_moment` | 结构归属 | 保留 `SceneMoment.SegmentID`，同时镜像关系 |
| `segment` | `contains` | `content_unit` | 结构归属 | 保留 `ContentUnit.SegmentID`，同时镜像关系 |

说明：

- 情节负责“发生了什么、谁在什么条件下做什么”。
- 内容单元负责“最终要生成或剪辑的一段画面、字幕、旁白、转场、音乐点等”。
- 一个片段可以有多个情节，也可以有多个内容单元。

### 4. 片段使用资料、素材

片段使用资料是创意语义关系；片段使用素材要区分“需要素材”和“已经选定素材”。

| Source | Type | Target | 关系性质 | 建议 |
| --- | --- | --- | --- | --- |
| `segment` | `uses` | `creative_reference` | 创意使用关系 | 进入 `EntityRelation` |
| `segment` | `needs_asset` | `asset_slot` | 素材需求关系 | 进入 `EntityRelation` |
| `segment` | `uses_asset` | `asset_slot` | 已选素材关系 | 进入 `EntityRelation` |

说明：

- `uses creative_reference` 回答“这个片段涉及哪些人物、地点、道具、风格、规则”。
- `needs_asset asset_slot` 回答“这个片段缺哪些素材”。
- `uses_asset asset_slot` 回答“这个片段最终选用了哪些素材”。
- 现有 `CreativeReferenceUsage` 和 `AssetSlot.OwnerType/OwnerID` 可以先镜像成这些关系。

### 5. 内容单元使用情节、素材、资料

内容单元是更细的执行颗粒，它通常来源于某个情节，同时也会使用资料和素材。

| Source | Type | Target | 关系性质 | 建议 |
| --- | --- | --- | --- | --- |
| `content_unit` | `based_on` | `scene_moment` | 内容来源关系 | 保留 `ContentUnit.SceneMomentID`，同时镜像关系 |
| `content_unit` | `uses` | `creative_reference` | 创意使用关系 | 进入 `EntityRelation` |
| `content_unit` | `needs_asset` | `asset_slot` | 素材需求关系 | 进入 `EntityRelation` |
| `content_unit` | `uses_asset` | `asset_slot` | 已选素材关系 | 进入 `EntityRelation` |

说明：

- 用户语义里的“内容单元使用情节”，在关系类型上建议叫 `based_on`，因为内容单元不是消耗情节，而是基于情节生成。
- 如果后续想统一所有读取口径，也可以把 `based_on` 归入 `uses` 大类，在 `MetadataJSON` 里标记 `role = scene_context`。
- `ContentUnit.SceneMomentID` 可以保留，因为内容单元按情节回查是高频路径。

### 核心关系闭环

用一句话描述这组关系：

`project` 拥有 `creative_reference`；`creative_reference` 拥有 `asset_slot`；`production` 使用 `creative_reference` 并包含 `segment`；`segment` 包含 `scene_moment` 和 `content_unit`，同时使用 `creative_reference` 和 `asset_slot`；`content_unit` 基于 `scene_moment`，并使用 `creative_reference` 和 `asset_slot`。

对应最小关系类型：

- `owns`：强归属，通常保留外键。
- `contains`：结构包含，通常保留外键并镜像。
- `uses`：使用资料。
- `has_asset`：资料拥有素材槽。
- `needs_asset`：需要素材但未必选定。
- `uses_asset`：已经选定或实际使用素材。
- `uses_resource`：素材槽绑定实际资源。
- `based_on`：内容单元基于情节。

## 关系建模原则

### 1. 外键只表达强结构关系

建议保留外键的场景：

- 父子生命周期明确：删除父对象时子对象通常失去意义。
- 高频加载路径稳定：页面或接口经常直接按父级查询子级。
- 关系类型唯一且不需要扩展属性。

示例：

- `Project -> Script`
- `Project -> Production`
- `StoryboardScript -> StoryboardVersion`
- `PreviewTimeline -> PreviewTimelineItem`
- `DeliveryVersion -> DeliveryTimelineItem`
- `Canvas -> CanvasNode/CanvasEdge/CanvasRun`

### 2. 业务关系进入关系表

建议迁移或镜像到关系表的场景：

- 同一对实体可能有多种关系。
- 关系需要 `status/source/evidence/metadata/order/weight`。
- 关系可能由 AI 提议、用户确认、后续修正。
- 关系需要跨类型连接，例如 `content_unit -> asset_slot`、`canvas_output -> keyframe`。
- 关系不是实体生命周期归属，而是生产语义、创意语义或流程语义。

### 3. 关系必须有方向

统一关系应明确 `source` 和 `target`，不要只用“关联”。如果业务上是无向关系，也应通过 `direction = undirected` 或关系类型约定表达。

例如：

- `segment contains scene_moment`
- `scene_moment uses creative_reference`
- `asset_slot candidate_for asset_slot`
- `production derived_from script_version`
- `work_item blocks work_item`

## 候选统一模型

建议新增一个通用关系表，先命名为 `EntityRelation`。名称可以再讨论。

```go
type EntityRelation struct {
    gorm.Model
    ProjectID uint `gorm:"not null;index" json:"project_id"`

    SourceType string `gorm:"not null;index:idx_entity_relation_source" json:"source_type"`
    SourceID   uint   `gorm:"not null;index:idx_entity_relation_source" json:"source_id"`
    TargetType string `gorm:"not null;index:idx_entity_relation_target" json:"target_type"`
    TargetID   uint   `gorm:"not null;index:idx_entity_relation_target" json:"target_id"`

    Category string `gorm:"not null;index" json:"category"`
    Type     string `gorm:"not null;index" json:"type"`
    Label    string `json:"label"`

    ScopeType string `gorm:"index" json:"scope_type"`
    ScopeID   *uint  `gorm:"index" json:"scope_id,omitempty"`

    Direction string `gorm:"not null;default:'directed';index" json:"direction"`
    Order     int    `gorm:"not null;default:0;index" json:"order"`
    Weight    float64 `gorm:"not null;default:1" json:"weight"`

    Status string `gorm:"not null;default:'draft';index" json:"status"`
    Source string `gorm:"not null;default:'manual';index" json:"source"`

    Evidence     string `gorm:"type:text" json:"evidence"`
    MetadataJSON string `gorm:"type:text" json:"metadata_json"`
    CreatedByID  *uint  `gorm:"index" json:"created_by_id,omitempty"`
}
```

### 字段含义

- `SourceType/SourceID`：关系起点实体。
- `TargetType/TargetID`：关系终点实体。
- `Category`：粗分类，例如 `structure`、`creative`、`asset`、`workflow`、`delivery`。
- `Type`：具体关系类型，例如 `contains`、`uses`、`derived_from`、`candidate_for`。
- `ScopeType/ScopeID`：关系生效范围，例如项目、剧本、片段、情节点。
- `Direction`：`directed`、`reverse_queryable`、`undirected`。
- `Order`：同类关系排序。
- `Weight`：强度、置信度、优先级或占比。
- `Status`：`draft`、`confirmed`、`corrected`、`ignored`、`archived`。
- `Source`：`manual`、`ai`、`import`、`runtime`、`migration`。
- `Evidence`：AI 抽取依据、人类备注或来源文本片段。
- `MetadataJSON`：关系类型专属扩展信息。

## 关系类型草案

### 结构关系

结构关系描述内容从文本到可制作颗粒度的拆解。

| Source                  | Type           | Target                  | 说明                   |
| ----------------------- | -------------- | ----------------------- | ---------------------- |
| `script`                | `has_version`  | `script_version`        | 剧本版本               |
| `script_version`        | `derived_from` | `script_version`        | 版本派生               |
| `production`            | `derived_from` | `script_version`        | 制作来源               |
| `production`            | `uses_preview` | `preview_timeline`      | 制作采用某个预览时间线 |
| `production`            | `contains`     | `production_text_block` | 制作内文本块           |
| `production_text_block` | `contains`     | `segment`               | 文本块拆成片段         |
| `segment`               | `contains`     | `scene_moment`          | 片段包含情节点         |
| `scene_moment`          | `contains`     | `content_unit`          | 情节点生成内容单元     |
| `segment`               | `contains`     | `content_unit`          | 片段直接生成内容单元   |
| `content_unit`          | `has_keyframe` | `keyframe`              | 内容单元的关键帧       |
| `scene_moment`          | `has_keyframe` | `keyframe`              | 情节点的视觉锚点       |

保留外键建议：`ProductionTextBlock.ProductionID`、`SceneMoment.SegmentID`、`ContentUnit.SegmentID` 等可暂时保留，因为它们是高频查询路径。新关系表先作为语义索引和复杂关系来源。

### 分镜和预览关系

| Source                  | Type           | Target                  | 说明                   |
| ----------------------- | -------------- | ----------------------- | ---------------------- |
| `storyboard_script`     | `has_version`  | `storyboard_version`    | 分镜脚本版本           |
| `storyboard_version`    | `derived_from` | `storyboard_version`    | 分镜版本派生           |
| `storyboard_script`     | `contains`     | `storyboard_line`       | 分镜行                 |
| `storyboard_line`       | `based_on`     | `segment`               | 分镜行来源片段         |
| `storyboard_line`       | `based_on`     | `scene_moment`          | 分镜行来源情节点       |
| `storyboard_line`       | `compiles_to`  | `content_unit`          | 分镜行编译成内容单元   |
| `preview_timeline`      | `contains`     | `preview_timeline_item` | 预览时间线条目         |
| `preview_timeline_item` | `represents`   | `segment`               | 时间线条目代表片段     |
| `preview_timeline_item` | `represents`   | `content_unit`          | 时间线条目代表内容单元 |
| `preview_timeline_item` | `uses`         | `keyframe`              | 时间线条目使用关键帧   |

### 创意关系

现有 `CreativeRelationship` 可视为统一关系模型的专用版本。

| Source               | Type             | Target                     | 说明                                 |
| -------------------- | ---------------- | -------------------------- | ------------------------------------ |
| `creative_reference` | `has_state`      | `creative_reference_state` | 角色、地点、风格等在特定范围内的状态 |
| `segment`            | `uses`           | `creative_reference`       | 片段使用创意资料                     |
| `scene_moment`       | `uses`           | `creative_reference`       | 情节点使用创意资料                   |
| `content_unit`       | `uses`           | `creative_reference`       | 内容单元使用创意资料                 |
| `keyframe`           | `uses`           | `creative_reference`       | 关键帧使用创意资料                   |
| `creative_reference` | `related_to`     | `creative_reference`       | 泛关系                               |
| `creative_reference` | `same_as`        | `creative_reference`       | 合并、别名或重复                     |
| `creative_reference` | `located_in`     | `creative_reference`       | 人物或物体位于地点                   |
| `creative_reference` | `owns`           | `creative_reference`       | 拥有关系                             |
| `creative_reference` | `conflicts_with` | `creative_reference`       | 冲突关系                             |
| `creative_reference` | `requires`       | `creative_reference`       | 依赖关系                             |

建议：`CreativeReferenceUsage` 可以迁移为 `uses` 类关系，保留 `Role/Order/Evidence/Status` 等信息到关系字段或 `MetadataJSON`。

### 资产关系

资产关系描述素材需求、候选素材、锁定素材和原始资源之间的连接。

| Source                     | Type            | Target         | 说明                     |
| -------------------------- | --------------- | -------------- | ------------------------ |
| `segment`                  | `needs_asset`   | `asset_slot`   | 片段需要素材             |
| `scene_moment`             | `needs_asset`   | `asset_slot`   | 情节点需要素材           |
| `content_unit`             | `needs_asset`   | `asset_slot`   | 内容单元需要素材         |
| `keyframe`                 | `needs_asset`   | `asset_slot`   | 关键帧需要素材           |
| `creative_reference_state` | `needs_asset`   | `asset_slot`   | 某个状态需要素材         |
| `asset_slot`               | `candidate_for` | `asset_slot`   | 候选素材槽属于目标素材槽 |
| `asset_slot`               | `locks`         | `asset_slot`   | 目标槽锁定某个候选槽     |
| `asset_slot`               | `uses_resource` | `raw_resource` | 素材槽使用原始资源       |
| `raw_resource`             | `bound_to`      | `asset_slot`   | 资源绑定到素材槽         |
| `job`                      | `produces`      | `raw_resource` | AI 任务产出资源          |
| `canvas_output`            | `produces`      | `asset_slot`   | 画布输出素材             |
| `canvas_output`            | `produces`      | `keyframe`     | 画布输出关键帧           |

现有 `ResourceBinding` 很接近关系表，但它专注于资源用途；可继续作为资源域专用表，也可以后续统一到 `EntityRelation`。

### 工作流和审核关系

| Source               | Type          | Target          | 说明             |
| -------------------- | ------------- | --------------- | ---------------- |
| `work_item`          | `targets`     | 任意实体        | 任务操作目标     |
| `work_item`          | `blocks`      | `work_item`     | 阻塞依赖         |
| `work_item`          | `depends_on`  | `work_item`     | 普通依赖         |
| `work_item`          | `produces`    | 任意实体        | 任务产出         |
| `candidate_decision` | `decides`     | 任意候选实体    | 候选决策         |
| `candidate_decision` | `applies_to`  | 任意目标实体    | 决策应用结果     |
| `review_event`       | `reviews`     | 任意实体        | 审核事件目标     |
| `canvas`             | `attached_to` | 任意实体        | 画布关联业务实体 |
| `canvas_run`         | `produces`    | `canvas_output` | 画布运行产出     |

`WorkDependency` 可作为 `work_item -> work_item` 的专用关系表保留，也可以迁移到统一关系表。

### 交付关系

| Source                   | Type            | Target                   | 说明             |
| ------------------------ | --------------- | ------------------------ | ---------------- |
| `delivery_version`       | `derived_from`  | `production`             | 交付版本来源制作 |
| `delivery_version`       | `derived_from`  | `preview_timeline`       | 交付版本来源预览 |
| `delivery_version`       | `contains`      | `delivery_timeline_item` | 交付条目         |
| `delivery_timeline_item` | `uses`          | `content_unit`           | 条目使用内容单元 |
| `delivery_timeline_item` | `uses`          | `asset_slot`             | 条目使用素材槽   |
| `delivery_timeline_item` | `uses_resource` | `raw_resource`           | 条目使用资源     |
| `export_record`          | `exports`       | `delivery_version`       | 导出记录对应版本 |
| `export_record`          | `produces`      | `raw_resource`           | 导出产物         |

### 组织和权限关系

组织、成员、权限这类关系可以暂不纳入统一业务关系模型，因为它们更像权限系统的强约束数据。

建议保留专用表：

- `OrganizationMember`
- `UserGroupMember`
- `ProjectMember`
- `ResourceFolderPermission`

## 当前字段归类建议

### 继续保留为外键

- `ProjectID`：绝大多数业务实体的租户/项目边界。
- `OrgID`：组织边界。
- `OwnerID`、`AuthorID`、`AssigneeID`：用户归属或操作人。
- `CanvasID`、`CanvasRunID`、`CanvasNodeID`：画布内部结构。
- `DeliveryVersionID`、`PreviewTimelineID`：列表子项归属。

### 先镜像到关系表，再决定是否删除

- `Script.ParentScriptID`
- `ScriptVersion.ParentVersionID`
- `StoryboardVersion.ParentVersionID`
- `Production.ScriptVersionID`
- `Production.PreviewTimelineID`
- `Segment.ProductionID`
- `Segment.TextBlockID`
- `Segment.ParentSegmentID`
- `SceneMoment.SegmentID`
- `StoryboardLine.SegmentID`
- `StoryboardLine.SceneMomentID`
- `ContentUnit.ProductionID`
- `ContentUnit.SegmentID`
- `ContentUnit.SceneMomentID`
- `Keyframe.SceneMomentID`
- `Keyframe.ContentUnitID`
- `Keyframe.ResourceID`
- `PreviewTimelineItem.SegmentID`
- `PreviewTimelineItem.SceneMomentID`
- `PreviewTimelineItem.ContentUnitID`
- `PreviewTimelineItem.KeyframeID`
- `AssetSlot.OwnerType/OwnerID`
- `AssetSlot.ResourceID`
- `AssetSlot.LockedAssetSlotID`
- `AssetSlotCandidate.AssetSlotID`
- `AssetSlotCandidate.CandidateAssetSlotID`
- `WorkItem.TargetType/TargetID`
- `CandidateDecision.CandidateType/CandidateID`
- `CandidateDecision.TargetType/TargetID`
- `ReviewEvent.SubjectType/SubjectID`
- `Canvas.RefType/RefID`
- `CanvasOutput.OwnerType/OwnerID`
- `ResourceBinding.OwnerType/OwnerID`

### 可能被统一关系表替代

- `CreativeRelationship`
- `CreativeReferenceUsage`
- `WorkDependency`
- `ResourceBinding`
- `AssetSlotCandidate`

是否替代取决于后续实现复杂度。第一阶段不建议删除这些专用表，可以先把它们作为关系表的来源或视图。

## 迁移策略

### Phase 1: 建立关系字典和统一表

新增：

- `EntityRelation`
- 可选 `EntityRelationType`，用于管理类型枚举、方向、允许的 source/target 类型、是否唯一。

先不删除任何旧字段。

### Phase 2: 从现有字段回填关系

写迁移或后台脚本，把现有外键、多态字段和专用关系表回填到 `EntityRelation`：

- 每条外键生成一条对应关系。
- 旧关系表生成同语义关系。
- `Source` 统一标记为 `migration`。
- `Status` 对旧有确定关系标记为 `confirmed`，候选类标记为 `draft` 或沿用原状态。

### Phase 3: 读路径先支持关系表

业务查询分两类：

- 强结构查询继续用外键。
- 复杂语义查询优先用 `EntityRelation`。

例如：

- 查询某个 `SceneMoment` 用到哪些角色、地点、风格：走 `EntityRelation`。
- 查询某个 `Production` 下的所有 `Segment`：初期仍可走 `Segment.ProductionID`。

### Phase 4: 写路径双写

新增或修改关系时：

- 旧字段仍更新，保证现有页面不坏。
- 同步写入 `EntityRelation`。

双写稳定后，再决定某些字段是否降级为缓存字段或彻底移除。

### Phase 5: 收敛专用关系表

按风险逐步收敛：

1. `CreativeReferenceUsage` 合并为 `uses` 关系。
2. `AssetSlotCandidate` 合并为 `candidate_for` 关系，或保留专用表用于候选评分。
3. `ResourceBinding` 如果资源业务继续复杂，保留专用表；如果只是关系用途，合并进 `EntityRelation`。

## 关键设计问题

这些问题需要在动手前确认：

1. 统一关系表是否只服务语义实体，还是覆盖项目、组织、资源、任务、画布等所有对象？
2. `ProjectID` 是否必须非空？跨项目引用是否允许？
3. 是否需要 `EntityRelationType` 表来约束允许的关系类型，还是先用代码常量？
4. 对同一对实体的同一关系类型，是否允许多条？例如同一角色在同一情节点下可以有多个 `uses` 状态吗？
5. `ScopeType/ScopeID` 与 `SourceType/SourceID` 的边界如何定义？例如 `scene_moment uses creative_reference scoped_to production` 是否有必要？
6. `Order` 是关系内排序，还是目标实体自己的排序？
7. `Weight` 表示置信度、重要度、强度，还是需要拆成多个字段？
8. AI 候选关系和用户确认关系是否存在同表，用 `status` 区分，还是候选进入单独表？
9. 是否需要关系版本历史？如果需要，使用软删除/审计日志，还是 append-only 关系事件？
10. 旧外键最终是删除、保留、还是作为缓存字段？

## 建议先定下的最小集合

第一轮实现建议只覆盖语义制作主链路，不碰权限和组织：

- `EntityRelation`
- `structure` 类关系
- `creative` 类关系
- `asset` 类关系
- 从 `CreativeReferenceUsage`、`CreativeRelationship`、`ResourceBinding`、`AssetSlotCandidate` 做镜像

最小关系类型：

- `contains`
- `derived_from`
- `uses`
- `has_asset`
- `needs_asset`
- `uses_asset`
- `candidate_for`
- `locks`
- `uses_resource`
- `produces`
- `targets`
- `blocks`

这样可以先解决“关系不清楚”和“多种关系无法表达”的核心问题，同时把迁移风险控制在可回滚范围内。

## 下一轮讨论顺序

建议下一轮按以下顺序确认，不直接从字段开始改：

1. 先确认实体类型命名，例如统一使用 `scene_moment`、`content_unit`、`creative_reference` 这种 snake_case。
2. 再确认关系类型命名，尤其是 `contains`、`uses`、`derived_from`、`represents`、`based_on` 的边界。
3. 然后确认哪些关系必须保留外键作为主查询路径。
4. 最后确认第一批要镜像进 `EntityRelation` 的旧表和旧字段。

第一批最适合从创意和资产开始：

- `CreativeRelationship -> EntityRelation`
- `CreativeReferenceUsage -> EntityRelation`
- `AssetSlot.OwnerType/OwnerID -> EntityRelation`
- `AssetSlotCandidate -> EntityRelation`
- `ResourceBinding -> EntityRelation`

原因是这些关系本身已经带有多态、状态、来源或用途属性，最能体现统一关系模型的价值。
