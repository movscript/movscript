# Content Canvas 关系表达设计方案

## 背景

当前 `content-canvas` 对应的是 `/project/content-orchestration/canvas` 这类内容编排场景。它要表达的不是单一生成流程，而是一个由剧本结构、设定资产、内容单元、候选结果、选择状态和下游影响组成的复杂关系网络。

现有代码里，关系信息已经存在，但分散在不同 UI 片段中：

- `packages/core/src/content/sourceWorkspaceTypes.ts` 定义了内容工作台的节点、候选、上下游、状态和 work item 类型。
- `packages/core/src/content/sourceWorkspaceData.ts` 从 workspace snapshot 归一化出 `ContentSourceWorkspaceData`。
- `apps/frontend/src/features/content-workbench/application/sourceWorkspacePresentationModel.ts` 已经能从选中节点推导 setting scope、asset downstream、shot workspace impact 等关系。
- `apps/frontend/src/features/content-workbench/components/ContentSourceWorkspacePage.tsx` 当前把这些关系拆成左侧树、中心预览、右侧编辑/依赖卡片展示。

问题不在于缺少数据，而在于这些关系没有形成一套统一的视觉语言。用户只能看到局部卡片，很难回答几个关键问题：

- 当前节点在整个 production 结构中的位置是什么？
- 它依赖哪些上游设定、资产或中间产物？
- 它会影响哪些下游 keyframe、storyboard、content unit 或 candidate？
- 哪些链路是 ready、selected、stale、missing 或 needs candidate？
- 哪些节点需要人处理，哪些适合交给 agent/workflow？

因此，`content-canvas` 应该从通用画布升级为“内容关系地图”。

## 核心结论

`content-canvas` 不应该直接套用现有 workflow canvas 的自由节点图。现有 workflow canvas 更适合表达 AI generation pipeline，核心关系是 node-to-node execution edge；内容编排场景的核心关系是多层业务语义：

1. 结构归属：Production、Segment、SceneMoment、Shot、Storyboard、Keyframe 的层级。
2. 时序关系：Segment、SceneMoment、Shot、Storyboard frame 的顺序。
3. 约束引用：Setting、State、Asset、ExpressionUnit、AudioCue 对 Shot/Keyframe/Storyboard/ContentUnit 的影响。
4. 生成链路：ContentUnit 生成 Candidate，Candidate 绑定 Resource，Selection 指向已采纳候选。
5. 状态传播：上游变化让下游进入 stale、needs_candidate、missing 或 ready。
6. 工作项：ProductionWorkPlan 指向需要处理的节点和推荐执行者。

正确方向是新增一层内容关系图 adapter，将 `ContentSourceWorkspaceData` 转换为专用的 graph view model。React Flow 可以继续作为渲染引擎，但 graph 的节点、边、布局和交互语义应由 content domain 决定，而不是复用 generic canvas 的保存协议。

## 关系节点模型

### 结构节点

结构节点负责回答“内容在哪里”。

| 节点 | 来源 | 作用 |
| --- | --- | --- |
| Production | `HierarchyNode.type = production` | 项目内某个制作单元的根 |
| Segment | `segment` | 剧情段落或章节 |
| SceneMoment | `scene_moment` | 可独立生成/审阅的情节时刻 |
| Shot | `shot` | 具体镜头，是多数内容单元的工作入口 |
| Group | `group` | 只作为组织节点，不表示真实生产对象 |

### 约束节点

约束节点负责回答“谁影响它”。

| 节点 | 来源 | 作用 |
| --- | --- | --- |
| Setting | `setting` | 世界观、空间、角色、规则等全局或局部设定 |
| State | `state` | 某个 setting 的状态变体，如天气、光线、情绪状态 |
| Asset | `asset` | 可确认的参考资产标识，通常会绑定 `asset_ref` 内容单元 |
| ExpressionUnit | `expression_unit` | 表演、潜台词、关系变化等叙事约束 |
| AudioCue | `audio_cue` | 声音、音乐、对白、环境音提示 |

### 制作节点

制作节点负责回答“它要产出什么”。

| 节点 | 来源 | 作用 |
| --- | --- | --- |
| Keyframe | `keyframe` / `ShotWorkspaceDetails.keyframes` | 镜头关键视觉帧 |
| Storyboard | `storyboard` / `ShotWorkspaceDetails.storyboards` | 镜头分镜或 storyboard timeline |
| ContentUnit | `PreviewContentUnit` / `PreviewAssetReferenceUnit` | 真实生成任务与 prompt 编辑对象 |
| Candidate | `PreviewCandidate` / `PreviewAssetCandidate` | 生成候选 |
| Resource | candidate output / resource id | 最终可复用资源 |
| Selection | selection record | 当前采纳或锁定的候选选择 |

### 工作节点

工作节点负责回答“下一步处理什么”。

| 节点 | 来源 | 作用 |
| --- | --- | --- |
| WorkItem | `ProductionWorkPlanView.items` | 待处理任务、阻塞项或建议项 |
| Actor | `recommendedActor` | human、agent、workflow 推荐处理者 |

WorkItem 不一定常驻主图。默认可以作为右上角问题层 overlay；进入“问题地图”后再展开。

## 边类型模型

关系边必须显式分类，否则复杂图会失去可读性。

| 边类型 | 示例 | 语义 | 默认视觉 |
| --- | --- | --- | --- |
| `contains` | Production -> Segment -> SceneMoment -> Shot | 层级归属 | 细实线，低对比 |
| `sequence` | Shot A -> Shot B | 时间顺序 | 浅色箭头线 |
| `constrains` | Setting/Asset/Expression -> Shot | 上游约束 | 虚线 |
| `depends_on` | ContentUnit -> Asset/Keyframe | 输入依赖 | 带箭头实线 |
| `generates` | ContentUnit -> Candidate | 生成结果 | 蓝色实线 |
| `selected_from` | Selection -> Candidate | 当前采纳 | 绿色强调线 |
| `invalidates` | Changed Asset -> stale Storyboard | 上游变化导致下游失效 | 橙/红警示线 |
| `affects` | Setting -> downstream refs | 影响但未必失效 | 琥珀色虚线 |
| `work_item_targets` | WorkItem -> target node | 工作项指向 | 紫色或中性强调线 |

边需要保存以下最小字段：

```ts
interface ContentCanvasEdgeView {
  id: string
  source: string
  target: string
  type:
    | 'contains'
    | 'sequence'
    | 'constrains'
    | 'depends_on'
    | 'generates'
    | 'selected_from'
    | 'invalidates'
    | 'affects'
    | 'work_item_targets'
  state?: 'selected' | 'ready' | 'stale' | 'needs_candidate' | 'missing' | 'changed' | 'locked'
  label?: string
  evidence?: string
  action?: string
}
```

`evidence` 用于解释关系来源，例如 `dependencyHash`、`inputHash`、`setting_refs`、`asset_refs`、`promptRefs` 或 selection record。`action` 用于 inspector 中展示“打开内容单元”“重新生成候选”“确认参考图”等动作。

## 画布布局

主画布建议采用固定语义分区，而不是完全自由布局。

### 默认布局

从左到右分为四个区：

1. 上游约束区：Setting、State、Asset、ExpressionUnit、AudioCue。
2. 故事主干区：Production、Segment、SceneMoment、Shot。
3. 制作产物区：Keyframe、Storyboard、ContentUnit。
4. 候选资源区：Candidate、Selection、Resource。

这样用户可以自然地从左到右理解：

约束输入 -> 故事位置 -> 制作任务 -> 候选/资源结果。

### 层级布局规则

- Production、Segment、SceneMoment、Shot 形成主干。
- SceneMoment 内的 Shot 按时间顺序排列。
- Shot 的 Keyframe、Storyboard、ContentUnit 放在同一横向工作带。
- Setting、Asset 等上游节点根据影响范围靠近对应 SceneMoment 或 Shot。
- Candidate/Resource 默认折叠，只在选中 ContentUnit 或 Asset 时展开。
- WorkItem 默认不进主干，只作为问题层标记；进入问题模式后展开为节点。

### 缩放层级

画布需要支持三档信息密度：

1. Overview：只显示 Production、Segment、SceneMoment、Shot 和关键状态计数。
2. Workband：展开选中 SceneMoment 下的 Shot、Keyframe、Storyboard、ContentUnit。
3. Trace：围绕选中节点展开 upstream、current、downstream、candidate、resource。

这比一次性展示全量图更适合当前内容复杂度。

## 视觉语言

### 节点外观

节点不应只靠颜色区分类型，应同时使用图标、短码、分区和形态。

| 类型 | 建议视觉 |
| --- | --- |
| Production / Segment / SceneMoment | 较宽结构块，显示标题、数量和整体状态 |
| Shot | 中等卡片，显示镜头标题、时长、状态、impact 数 |
| Setting / State | 小型约束卡，显示 SET/STATE 短码 |
| Asset | 带缩略图或占位图的小型资源卡 |
| ExpressionUnit | 文本约束卡，显示 EXP |
| AudioCue | 声音提示卡，显示 AUD |
| Keyframe | 视觉产物卡，显示 KEY 和 selected/stale 状态 |
| Storyboard | 分镜产物卡，显示 STB 和帧数/状态 |
| ContentUnit | 任务卡，显示 output kind、candidate 数、selection state |
| Candidate | 紧凑候选 chip/card，显示模型、input hash、selected 标记 |
| Resource | 缩略图资源卡，显示 resource id/type |
| WorkItem | 问题标记卡，显示 severity、recommended actor、动作 |

### 状态视觉

状态需要统一：

| 状态 | 语义 | 视觉 |
| --- | --- | --- |
| selected | 已采纳/当前有效 | 绿色描边或左侧状态条 |
| ready | 可执行或输入完整 | 蓝色或中性正向状态 |
| stale | 上游已变更，下游需复核 | 橙色警示 |
| needs_candidate | 缺少候选 | 红/橙警示 |
| missing | 依赖缺失 | 红色警示 |
| changed | 引用发生变化 | 琥珀色 |
| locked | 锁定不自动更新 | 灰色锁定标记 |

状态不建议大面积铺色。复杂图里大面积颜色会抢走结构信息，最好用细状态条、badge、边颜色和选中高亮表达。

## 交互模式

### 1. 结构地图

默认模式。目标是回答“项目怎么组织”。

展示内容：

- Production -> Segment -> SceneMoment -> Shot。
- 每个 SceneMoment/Shot 的 ready、stale、needs_candidate 汇总。
- 可折叠展开 Shot 下的 Keyframe/Storyboard。

隐藏内容：

- 大量 Candidate 和 Resource。
- 非关键上游约束边。
- WorkItem 详情。

### 2. 依赖地图

选中节点后进入。目标是回答“谁影响谁”。

选中 Asset 时：

- 左侧显示它的 upstream，例如 Setting/State/Shot。
- 中间显示 Asset 及其 `asset_ref` ContentUnit。
- 右侧显示 downstream：Keyframe、Storyboard、Shot ContentUnit。
- stale/needs_candidate 的边优先高亮。

选中 Shot 时：

- 左侧显示 settings/assets/expression/audio constraints。
- 中间显示 Shot。
- 右侧显示 keyframes、storyboards、shot content unit、candidate selection。
- 下方或 inspector 显示 impacts。

选中 ContentUnit 时：

- 左侧显示输入依赖。
- 中间显示 ContentUnit prompt/task。
- 右侧显示 Candidate、Selection、Resource。
- 如果 selected candidate 的 input hash 与当前依赖不一致，则展示 stale 链路。

### 3. 问题地图

目标是回答“下一步做什么”。

展示内容：

- `ProductionWorkPlanView.items`。
- stale、needs_candidate、missing 的节点和边。
- recommended actor：human、agent、workflow。
- blocking/warning/suggestion 优先级。

交互：

- 点击 WorkItem 定位目标节点。
- 点击警示边展示证据和建议动作。
- 支持按 actor、severity、target kind 过滤。

## Inspector 设计

右侧 inspector 应从“节点详情面板”升级为“关系账本”。

每次选中节点，固定展示四段：

### 上游输入

列出当前节点依赖的 setting、state、asset、keyframe、storyboard、expression、audio cue。

每条输入显示：

- 标题和类型。
- 当前状态。
- 引用来源。
- 是否 stale/missing。

### 当前产物

根据节点类型展示核心内容：

- Shot：镜头描述、时长、camera、expression、content unit 状态。
- Asset：asset_ref unit、候选、确认策略。
- ContentUnit：edit prompt、output kind、candidate 数、selected candidate。
- Keyframe/Storyboard：当前选择和 input hash。

### 下游影响

列出 downstream：

- 受影响节点。
- 关系类型。
- dependency hash。
- 当前状态。
- 推荐动作。

### 可执行动作

动作应来自现有流程，不在第一版新增复杂 mutation：

- 打开内容单元。
- 进入候选选择。
- 重新生成候选。
- 确认参考图。
- 定位上游节点。
- 定位下游节点。

第一版可以只做导航和只读解释，后续再接入写操作。

## 数据适配方案

新增一个 adapter，把 `ContentSourceWorkspaceData` 转换成 graph view model。

建议位置：

```text
apps/frontend/src/features/content-workbench/application/contentCanvasGraph.ts
```

核心接口：

```ts
interface ContentCanvasGraph {
  nodes: ContentCanvasNodeView[]
  edges: ContentCanvasEdgeView[]
  indexes: {
    nodeById: Map<string, ContentCanvasNodeView>
    upstreamByNodeId: Map<string, ContentCanvasEdgeView[]>
    downstreamByNodeId: Map<string, ContentCanvasEdgeView[]>
    workItemsByTargetId: Map<string, ProductionWorkItemView[]>
  }
  summary: {
    productionCount: number
    shotCount: number
    staleCount: number
    needsCandidateCount: number
    openWorkItemCount: number
  }
}
```

构建顺序：

1. 从 `hierarchyTree` 生成结构节点和 `contains` 边。
2. 从 `previewMoments[].shots` 生成 Shot、ContentUnit 和 `sequence` 边。
3. 从 `shotWorkspaceDetails` 生成 setting/asset refs、keyframes、storyboards、impacts。
4. 从 `assetReferenceUnits` 生成 asset_ref unit、candidate、downstream。
5. 从 `productionWorkPlan` 生成 WorkItem overlay。
6. 去重节点和边，并补充状态汇总。

## 技术架构方案

### 基本原则

`content-canvas` 的技术架构要优先解决大图稳定性，而不是先追求自动排版效果。这里的图可能包含大量业务节点、派生边、候选结果和状态传播，如果每次 workspace 数据变化都重新生成 React Flow 的全量 `nodes` / `edges` 数组并传入渲染层，会造成大规模 DOM 更新。

因此架构上需要遵守几个原则：

1. 业务真相和画布表现分离：workspace canonical data 是业务真相，canvas layout 只是表现层状态。
2. 拓扑关系和节点详情分离：边、邻接表、节点摘要、节点详情不要绑在一个大对象里。
3. 可见范围和完整图分离：完整图存在 store/index 中，React 只渲染 viewport 内的节点和必要边。
4. 自动布局和手工布局分离：不默认整理，不在数据刷新时重排用户已经摆好的节点。
5. 更新走 patch，不走全量替换：节点位置、选中态、折叠态、hover 态都应局部更新。

### 分层结构

建议把技术层拆成五层：

| 层 | 责任 | 说明 |
| --- | --- | --- |
| Domain Adapter | 从 `ContentSourceWorkspaceData` 派生语义节点和边 | 纯函数，可测试，不处理 React 状态 |
| Graph Store | 保存 normalized graph、邻接索引、layout、selection、viewport | 外部 store，支持按 node id 订阅 |
| Viewport Engine | 计算可见节点、可见边、LOD、cluster | 不直接渲染，只输出 render ids |
| Canvas Renderer | React Flow 或自定义层渲染可见节点和边 | 只消费 render ids 和轻量 props |
| Interaction Controller | 处理右键拖动、创建节点、拖拽、选择、快捷键 | 产生 command/patch，不直接改业务数据 |

推荐文件拆分：

```text
apps/frontend/src/features/content-workbench/application/contentCanvasGraph.ts
apps/frontend/src/features/content-workbench/application/contentCanvasLayout.ts
apps/frontend/src/features/content-workbench/application/contentCanvasStore.ts
apps/frontend/src/features/content-workbench/application/contentCanvasViewport.ts
apps/frontend/src/features/content-workbench/components/content-canvas/ContentCanvasRelationshipView.tsx
apps/frontend/src/features/content-workbench/components/content-canvas/ContentCanvasNode.tsx
apps/frontend/src/features/content-workbench/components/content-canvas/ContentCanvasEdgeLayer.tsx
apps/frontend/src/features/content-workbench/components/content-canvas/contentCanvasInteractions.ts
```

### Normalized Store

不要把完整节点数据直接塞进 React Flow node 的 `data` 字段。React Flow 的 `nodes` 数组一旦引用变化，会让大量 node component 重新计算。更稳妥的做法是：React Flow 只拿轻量 render shell，节点组件内部按 id 订阅具体数据。

建议 store 结构：

```ts
interface ContentCanvasStoreState {
  graphVersion: number
  nodesById: Record<string, ContentCanvasNodeRecord>
  edgesById: Record<string, ContentCanvasEdgeRecord>
  outgoingEdgeIdsByNodeId: Record<string, string[]>
  incomingEdgeIdsByNodeId: Record<string, string[]>
  layoutByNodeId: Record<string, ContentCanvasNodeLayout>
  visibleNodeIds: string[]
  visibleEdgeIds: string[]
  selectedNodeIds: string[]
  focusedNodeId?: string
  hoveredNodeId?: string
  viewport: ContentCanvasViewport
}

interface ContentCanvasNodeRecord {
  id: string
  kind: ContentCanvasNodeKind
  title: string
  subtitle?: string
  state?: ContentCanvasState
  summaryHash: string
  detailRef: {
    source: 'hierarchy' | 'previewMoment' | 'shotWorkspace' | 'assetReferenceUnit' | 'workPlan'
    id: string
  }
}

interface ContentCanvasNodeLayout {
  x: number
  y: number
  width: number
  height: number
  z?: number
  collapsed?: boolean
  pinned?: boolean
  manual?: boolean
  updatedAt?: string
}
```

`summaryHash` 用于判断节点摘要是否真的变化。只有 hash 变化的节点才更新 `nodesById[id]` 引用，其他节点保持 structural sharing。

### React 数据绑定

节点组件不要接收完整 graph，也不要接收频繁变化的全局对象。

推荐方式：

```tsx
const node = useContentCanvasStore(
  useCallback((state) => state.nodesById[nodeId], [nodeId]),
  shallow,
)
const layout = useContentCanvasStore(
  useCallback((state) => state.layoutByNodeId[nodeId], [nodeId]),
  shallow,
)
```

节点组件只订阅自己的 `nodeId`。全局 selection、hover、viewport 不应让所有节点重渲染，可以拆成：

- `selectedNodeIds` 存为 Set-like index，节点只订阅 `selectedByNodeId[id]`。
- `hoveredNodeId` 变化时，只让上一个 hover 和新的 hover 节点更新。
- viewport 变化只更新 `visibleNodeIds`，已可见节点不重新读取 viewport。

React Flow 的 `Node.data` 建议只放：

```ts
{
  nodeId: string
  renderKind: ContentCanvasNodeKind
}
```

具体标题、状态、计数、详情通过 store selector 读取。

### Viewport Culling

大图不能依赖 DOM 全量挂载。需要 viewport culling：

1. layout 层维护节点矩形。
2. viewport 变化时，根据矩形和 buffer 计算 `visibleNodeIds`。
3. 只把可见节点转成 React Flow nodes。
4. 边只渲染两端至少一端可见、或与可见区域相交的边。
5. 远距离关系用聚合标记，不画完整边。

可见范围要带 buffer，避免拖动画布时节点频繁挂载卸载：

```ts
const cullingRect = expandRect(viewportRect, {
  x: viewportRect.width * 0.5,
  y: viewportRect.height * 0.5,
})
```

当节点数量超过阈值时，LOD 规则应逐级降级：

| 规模 | 策略 |
| --- | --- |
| 0-300 节点 | 可直接渲染可见节点和可见边 |
| 300-2000 节点 | 默认折叠 Candidate/Resource，边按类型过滤 |
| 2000+ 节点 | SceneMoment/Shot cluster，只有聚焦区域展开 |
| 5000+ 节点 | 强制使用问题地图/trace 模式，不展示全量边 |

### Edge Rendering

边比节点更容易拖垮渲染。SVG path 数量过大时，hover、selection、viewport 都会变慢。

建议分三层：

1. 高频普通边：使用 canvas layer 绘制，随 viewport transform 一次性重绘。
2. 交互边：只有 selected/focused/hovered 的少量边用 SVG/React 渲染，支持点击和 tooltip。
3. 聚合边：远距离或大量同类关系显示为 bundle/计数，不逐条画线。

如果第一版继续使用 React Flow edge，也必须限制：

- 默认只渲染 selected node 的一跳/二跳边。
- Overview 不渲染 Candidate/Resource 边。
- 问题地图只渲染 stale/needs_candidate/missing/work item 边。
- 非聚焦边不挂载 label。

### 不默认整理

内容关系图不能在每次数据变化后自动整理布局。自动整理会破坏用户空间记忆，尤其大图中用户已经手工排布过节点时，重排会让页面不可用。

布局策略：

1. 首次进入且没有 layout 时，执行一次 initial placement。
2. 新增派生节点时，放在父节点或关联节点附近，不触发全局 layout。
3. workspace 数据刷新时，已有节点保持原位置。
4. 删除或消失的节点 layout 先保留一段时间，避免短暂数据缺失导致位置丢失。
5. 只有用户点击“整理当前视图”或“整理选中范围”时才执行 layout。

节点 layout 需要标记来源：

```ts
type ContentCanvasLayoutSource = 'initial' | 'manual' | 'suggested' | 'imported'
```

一旦节点被用户拖动，`manual = true`，后续自动 placement 不得覆盖。

### 节点信息存储

存储要区分三类数据：

| 数据 | 是否持久化 | 原因 |
| --- | --- | --- |
| 业务节点和业务边 | 不作为 canvas layout 持久化 | 来自 workspace canonical data，可重算 |
| 节点位置、尺寸、折叠、pin、分组显示 | 持久化 | 属于用户画布表现偏好 |
| selection、hover、临时过滤、viewport | 本地临时或 session 级 | 不应污染项目数据 |

建议持久化结构：

```ts
interface ContentCanvasLayoutDocument {
  schema: 'movscript.content_canvas_layout.v1'
  projectId: string | number
  graphScope: {
    productionId?: string
    mode?: 'structure' | 'dependency' | 'issues'
  }
  updatedAt: string
  nodes: Record<string, ContentCanvasNodeLayout>
  groups?: Record<string, ContentCanvasGroupLayout>
  preferences?: {
    hiddenKinds?: ContentCanvasNodeKind[]
    edgeFilters?: ContentCanvasEdgeType[]
  }
}
```

存储位置可以先用前端本地持久化，后续再纳入 workspace：

- 第一版：localStorage 或 IndexedDB，key 包含 `projectId` 和 graph scope。
- 升级版：写入 `.movscript/data/.../content_canvas_layout.json` 或 workspace presentation namespace。

大图位置更新不能每次拖动都写存储。拖动时只更新内存，松手后 debounced 写入 patch：

```ts
updateNodeLayout(nodeId, { x, y, manual: true })
scheduleLayoutPersist({ nodeIds: [nodeId] })
```

### 空白右键拖动和创建节点

空白区域右键交互需要同时支持平移和创建节点。

规则：

1. `pointerdown` 发生在空白 pane，且 `button === 2` 时，进入 `rightPointerCandidate` 状态。
2. 记录起点屏幕坐标和起点 graph 坐标。
3. 移动距离超过阈值后，切换为 `rightDragPan`，执行画布拖动。
4. 如果 `pointerup` 时移动距离没有超过阈值，则在起点 graph 坐标创建新节点或打开创建节点浮层。
5. 整个过程中阻止浏览器默认 `contextmenu`。

阈值建议：

```ts
const RIGHT_DRAG_THRESHOLD_PX = 5
```

状态机：

```ts
type RightPanePointerState =
  | { type: 'idle' }
  | { type: 'candidate'; screenStart: Point; graphStart: Point }
  | { type: 'panning'; screenStart: Point; viewportStart: Viewport }
```

交互细节：

- 如果右键按下命中节点或边，不创建节点，保留节点/边 context menu。
- 如果空白右键没有拖动，`pointerup` 创建节点的位置应使用 graph 坐标，不使用屏幕坐标。
- 如果创建节点需要选择类型，先打开小型 create palette；palette 确认后再写入节点。
- 创建节点必须生成 stable id，并立即写入 layout，避免下一次 graph rebuild 丢失位置。
- 如果用户取消创建，不能留下临时节点。

### 新节点创建命令

创建节点不应直接在 React component 中拼业务对象。使用 command：

```ts
interface CreateContentCanvasNodeCommand {
  kind: ContentCanvasNodeKind
  title?: string
  graphPosition: { x: number; y: number }
  parentId?: string
  source: 'blank-right-click' | 'palette' | 'inspector-action'
}
```

命令处理分两类：

- Presentation-only node：例如便签、分组、手工标注，写入 canvas layout/document。
- Business node：例如 Shot、Asset、ContentUnit，必须走 workspace runtime 创建真实业务对象，再由 adapter 重算进入图。

第一版建议只支持 presentation-only node 或打开创建业务对象的现有表单，不在画布里直接写复杂业务结构。

### 更新调度

大图更新要按优先级调度：

| 更新 | 策略 |
| --- | --- |
| pointer move / pan / drag | requestAnimationFrame 内更新 transform 或 layout |
| hover | 只更新前后两个节点和少量边 |
| selection | 局部更新 selected index 和 focused edges |
| workspace data refresh | 后台 build graph，完成后 structural merge |
| layout persist | debounce，空闲时写入 |
| edge path recompute | viewport 或相关节点位置变化后批量计算 |

workspace 数据刷新流程：

1. adapter 生成 next graph。
2. graph store 按 id merge。
3. 未变化节点保持对象引用。
4. 新节点使用 anchor placement。
5. 消失节点进入 tombstone 缓存。
6. viewport engine 重算 visible ids。
7. renderer 只更新可见差异。

### 测试重点

技术方案需要专门测试，不只测 UI snapshot。

建议测试：

- graph adapter 对 fixture 的节点/边数量和关键关系。
- structural merge 后未变化节点引用保持不变。
- viewport culling 只返回范围内节点。
- 右键空白小移动创建节点，大移动平移画布。
- 手动移动节点后，workspace refresh 不覆盖位置。
- 删除后短暂恢复的节点能复用旧 layout。
- 大量节点下，过滤和选中只改变少量 store slice。

## 与现有 Canvas 的关系

现有 `features/canvas` 和 `@movscript/core/canvas` 仍然适合以下场景：

- 用户手动创建 inspiration canvas。
- workflow canvas 执行 AI generation pipeline。
- node/edge 保存、运行、结果面板、资源 shelf。

`content-canvas` 不建议直接复用它的持久化结构，原因是：

- 内容关系主要来自 workspace canonical data，不应由用户拖拽画布保存为真相。
- 同一条业务关系可能来自 prompt refs、selection record、asset refs、work plan 等多个证据源。
- 关系图需要随 workspace 数据实时重算，保存手工布局只应作为 presentation preference。

可以复用的部分：

- React Flow 基础渲染。
- 画布 shell、缩放、mini map、选中态、context menu 的 UI 能力。
- resource shelf 或 candidate 选择入口。
- 状态 badge、节点卡片基础样式。

不应复用的部分：

- generic canvas node data 作为内容关系真相。
- workflow IO node、final output node 等执行流概念。
- 现有 canvas save payload 作为 content graph 的主协议。

## 实施计划

### 阶段一：图模型与渲染底座

目标：先保证大图可承载，不先追求完整视觉效果。

任务：

- 新增 `contentCanvasGraph.ts`。
- 新增 `contentCanvasStore.ts`，使用 normalized graph store，不把完整节点详情塞进 React Flow `data`。
- 新增 `contentCanvasViewport.ts`，实现 viewport culling、visible node/edge 计算和基础 LOD。
- 新增 `contentCanvasLayout.ts`，实现 initial placement、manual layout merge 和 layout persistence。
- 为 fixture data 写 adapter 单元测试。
- 为 structural merge、viewport culling、手工布局不被覆盖写单元测试。

验收标准：

- workspace data refresh 后，未变化节点对象引用保持不变。
- 只渲染 viewport 内节点和必要边。
- 手动移动节点后，再次刷新数据不会自动整理或覆盖位置。
- layout 写入是 debounce/patch 级别，不在拖动过程中持续持久化。

### 阶段二：只读关系图

目标：让用户能看懂关系，不引入写操作风险。

任务：

- 新增 `ContentCanvasRelationshipView` 组件。
- 在 `/project/content-orchestration/canvas` 中展示关系图。
- 保留左侧树作为导航，右侧 inspector 展示关系账本。

验收标准：

- 选中 Shot 能看到 upstream constraints、keyframes、storyboards、content unit 和 impacts。
- 选中 Asset 能看到 asset_ref unit、candidate、downstream。
- stale/needs_candidate/missing 能被明显识别。
- 图中节点和边数量可控，不因 fixture 数据变大而不可读。

### 阶段三：模式、过滤与右键交互

目标：降低复杂度，提高定位效率，并建立基础画布交互。

任务：

- 增加结构地图、依赖地图、问题地图三种模式。
- 增加状态过滤：selected、ready、stale、needs_candidate、missing。
- 增加类型过滤：setting、asset、shot、content unit、candidate。
- 增加一跳/二跳关系聚焦。
- 实现空白右键状态机：小移动松开创建节点或打开 create palette，大移动执行 pan。
- 创建节点走 command，不在组件中直接拼业务对象。

验收标准：

- 默认 overview 不展示候选噪声。
- Trace 模式能围绕选中节点解释 upstream/current/downstream。
- 问题地图能按 severity 和 recommended actor 找到下一步处理对象。
- 空白右键不拖动会在 graph 坐标创建节点入口。
- 空白右键拖动超过阈值只平移画布，不触发创建。

### 阶段四：操作接入

目标：从关系理解进入工作流执行。

任务：

- inspector 动作接入现有候选选择、资源确认、内容单元编辑。
- 点击关系边展示证据来源。
- stale 边支持跳转到下游复核位置。
- WorkItem 支持定位和触发推荐操作。

验收标准：

- 用户能从 stale asset 直接定位受影响 storyboard/content unit。
- 用户能从 content unit 打开候选选择并回到关系图。
- 操作后图状态通过 workspace data 重新计算，而不是局部硬改。

## 风险与约束

### 图过载

风险：全量节点和边一次展示会不可读。

处理：

- 默认只展示结构主干。
- Candidate/Resource 按选中节点懒展开。
- 一跳高亮、二跳弱化、三跳隐藏。

### 关系来源不一致

风险：同一个依赖可能来自 prompt、record refs、selection、fixture 或 work plan。

处理：

- 边必须带 `evidence`。
- adapter 内集中处理优先级和去重。
- inspector 显示证据，避免用户认为关系是凭空推断。

### 写操作与真实数据冲突

风险：如果允许在图上直接拖边或改节点，可能和 workspace canonical data 冲突。

处理：

- 第一版只读。
- 后续写操作走现有 runtime/workspace mutation。
- 图只重算，不作为业务真相来源。

### 与 generic canvas 概念混淆

风险：用户混淆 content relationship canvas 和 AI workflow canvas。

处理：

- UI 文案使用“关系地图”“依赖地图”“问题地图”。
- 不出现 final output、workflow IO 等执行流术语。
- 路由和页面标题明确是 Content Orchestration。

## 推荐优先级

最高优先级是 `Shot` 和 `Asset` 两条 trace：

1. Shot trace：因为它是制作工作最常用入口，能串起 setting、asset、keyframe、storyboard、content unit、candidate。
2. Asset trace：因为 asset 变化会触发 downstream stale，是用户最容易困惑的关系。

第一版不需要把所有节点都做漂亮。只要这两条 trace 能解释清楚，`content-canvas` 就能明显强于当前分散卡片式展示。
