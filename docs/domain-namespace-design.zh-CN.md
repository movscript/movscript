# MovScript Domain Namespace 设计草案

## 背景

MovScript 现在的项目源文件通过目录表达核心层级：

```text
productions/{production}/segments/{segment}/scene_moments/{scene_moment}
settings/{setting}/states/{state}/assets/{asset}
content_units/{content_unit}
```

这套结构让系统可以很稳定地从文件路径推导父子关系、上下文和影响范围。这个优点应该保留：树状 source layout 里的 path 本身就是很好的父子关系声明。

真正的问题不是“path 父子关系不对”，而是当前 path 同时把父子关系、系统类型和用户词汇绑定死了：

- 时间结构只能先叫 `production`，再叫 `segment`。
- 设定结构只能先叫 `setting`，再叫 `state`。
- 用户无法自然表达 `series / season / episode / act / sequence / beat`、`film / chapter / scene`、`ad / hook / proof / cta` 这类项目自己的结构语言。

这会造成一个产品问题：真实影视创作里，层级名称和颗粒度由项目类型决定。电影可能只有一个完整成片；剧集项目天然有多个 episode；短视频、广告、课程又会使用完全不同的结构词。系统不应该把这些 namespace 的命名权固定死。

## 核心判断

MovScript 应该把 namespace 的定义权交给用户，但不能把所有东西退化成普通 tag。

更准确地说：

```text
用户定义 namespace 词汇。
系统定义 namespace 行为。
```

用户可以决定一条时间结构叫 `episode`、`act`、`beat`，也可以决定一个设定结构叫 `character`、`costume`、`state`。但系统仍然要知道这些结构属于哪种行为域：

- 时间结构：有顺序、时长、剪辑、成片和下游生成影响。
- 设定结构：有身份、一致性、状态变化、资产槽和引用影响。
- 系统 primitive：有固定影视制作语义、剪辑聚合语义或资源槽语义，例如 scene moment、expression unit、storyboard、keyframe、audio cue、asset、timeline assembly。
- 生产任务：进入 candidate、selection、stale、regeneration 流程的 `content_unit`。

因此设计目标不是“自定义任意 tag”，而是“用户自定义层级词汇，系统保留生产语义”。

## 根因：缺少系统性抽象层

当前复杂度的根因，不是影视制作层级天然不可控，而是系统没有一个统一的 domain abstraction 来承接这些层级、目标、依赖和生产边界。于是同一件事被分散在很多地方重复解释：

- path parser 在解释父子关系。
- schema kind 在解释对象类型。
- UI node kind 在解释可执行动作。
- content unit adapter 在解释生产目标。
- surface route / runtime focus 在解释当前上下文。
- interpreter / stale graph 在解释影响范围。

这些解释如果没有共同模型，就会自然散落成 `production_id`、`segment_id`、`setting_state_id`、`owner_type`、`target_kind`、`targetPath`、`productionId` 等局部字段。每一层看起来都合理，但合在一起就会变成“只要新增一个层级，所有地方都要补一个分支”。

因此更需要的不是再加一组局部实体，例如 `production_scope` 或 `setting_variant`，而是建立一个系统共享的中间抽象：

```text
Domain Node
  id
  category: timeline_namespace | setting_namespace | system_primitive | content_unit | resource_state
  kind: user/system vocabulary
  title
  order
  path?
  metadata?

Domain Edge
  source
  target
  relation: parent | scope | target | uses | depends_on | produces | selects
  origin: path | explicit_ref | derived

Work Target
  target_category: system_primitive | timeline_assembly | content_unit
  target_kind
  target_ref
```

这样每一层只消费同一套抽象：

- writer 写 node 和 edge，path 继续提供默认 parent edge。
- read model 把旧 `production/segment/setting/state` 投影成 namespace node。
- UI 根据 node category 决定动作，而不是根据 `production` 字符串决定动作。
- content unit 只接受 Work Target，不接受 namespace node。
- stale graph 只消费 Domain Edge，不在各处重新解析路径。
- agent/runtime focus 传 normalized focus，不把用户 namespace 塞进 runtime scope。

这个抽象建立之后，`production`、`segment`、`setting`、`state` 都可以退回到 projection/vocabulary 层；`scene_moment`、`asset`、`keyframe`、`storyboard`、`timeline_assembly` 则保留为系统 primitive。复杂度会从“每个功能都理解一遍层级”下降为“所有功能都读取同一张 domain graph”。

## 非目标

第一阶段不做下面这些事情：

- 不把所有 domain node 都改成 `tag`。
- 不把 `asset`、`keyframe`、`storyboard`、`audio_cue` 变成用户自定义 namespace。
- 不让 namespace node 直接拥有 content unit、content-unit-ref、candidate 或 selection。
- 不立即决定最终磁盘布局是否从目录树改成 flat records。
- 不新增复杂的通用 ontology、graph database 或多父级结构。
- 不取消 path 表达父子关系的能力；树状 source layout 中的 path 仍应是默认 parent edge 来源。

## Path Parent Edge

path 父子关系应该保留，而且应该被视为一等关系来源，不是 legacy fallback。

原因很直接：MovScript 的 source 是人和 agent 都要读写的创作工程。目录树天然适合表达 containment、排序上下文和 Git diff 可读性，例如“这个 scene moment 属于哪个 beat/segment”“这个 asset 属于哪个 setting state”。如果为了抽象 namespace 而立刻把父子关系全部挪到显式 `parent_ref`，会让简单树状结构变得更难读，也会迫使 writer、review、merge 和迁移一次性承担更高复杂度。

推荐决策是：path 继续作为单父级树的 canonical containment source。显式 `parent_ref` / `scope_ref` 不是默认替代 path 的新主树，而是在递归 namespace、跨树引用、assembly scope、迁移兼容或一致性校验时补充 path 表达不了的关系。换句话说，source layout 仍然可以靠目录回答“谁包含谁”，但不能再靠目录名回答“用户必须怎么命名这层”。

所以要保留的是 path 作为树状父子关系的表达能力；要拆掉的是 path segment 名称对系统语义的垄断。`productions/x/segments/y` 可以继续推导出 `y` 在树上属于 `x`，但 `segments` 这个目录名不应该长期决定用户只能叫它 segment，也不应该自动意味着它是可生成的 production unit。

更好的边界是：

- path 表达树状 parent/containment edge。
- schema/category 表达系统行为域，例如 timeline namespace、setting namespace、system primitive、content unit。
- vocabulary 表达用户命名，例如 episode、act、beat、character、costume、state。
- explicit refs 表达 path 不适合表达的关系，例如 `target_ref`、`scope_ref`、cross-tree references、assembly scope、selected dependency。

也就是说，问题不是 path，而是“固定目录名等于唯一语义”。未来的 normalized relation graph 应该把 path-derived parent edge、显式 refs 和派生关系统一成一种边集合：

```text
path edge:        child -> parent        relation = parent
explicit edge:    assembly -> namespace  relation = scope
explicit edge:    content_unit -> target relation = target
derived edge:     primitive -> content_unit / candidate / selection impact
```

当 path parent 和显式 `parent_ref` 同时存在时，validation 应校验二者一致；冲突时报 diagnostic。只有递归 namespace、跨树组合、assembly scope 或迁移兼容需要消除歧义时，writer 才必须补显式 parent/scope refs。

落地时可以按四条规则推进：

1. 旧 source layout 继续可读可写，path-derived parent edge 是默认关系。
2. 新 read model 不再把固定目录名直接暴露成用户 ontology，而是投影成 timeline/setting namespace node。
3. 新 writer 在能用目录树表达单父级关系时仍写树；只有跨树组合、assembly scope 或递归 namespace 需要消歧时才补显式 refs。
4. interpreter/stale 不再到处解析 `productions`、`segments`、`states`，而是统一消费 normalized relation graph。

## Namespace Vocabulary

项目可以声明自己的 namespace vocabulary。下面只是概念形态，不是最终 schema：

```json
{
  "timeline_namespaces": ["series", "season", "episode", "act", "sequence", "beat"],
  "setting_namespaces": ["character", "costume", "state", "voice_state"]
}
```

这些词汇用于 UI、agent planning 和 source/read-model 表达。系统不应假设 `episode` 一定比 `act` 长，也不应假设 `segment` 在所有项目里都是同一种颗粒度。颗粒度、时长和拆分策略应由节点字段或项目规范补充，而不是从名称硬编码推断。

## Timeline Namespace

Timeline namespace 表达影片的时间和叙事组织。它回答：

- 这个项目如何分层？
- 每一层如何排序？
- 哪些节点可以被剪辑、预览、生成或聚合？
- 改变一个上层结构时，哪些下游 system primitive 和 content unit 需要 review？

电影项目可以这样组织：

```text
film
  act
    sequence
      beat
        scene_moment
```

剧集项目可以这样组织：

```text
series
  season
    episode
      act
        scene_moment
```

短视频项目可以这样组织：

```text
video
  hook
  proof
  demo
  cta
```

当前的 `production -> segment` 可以作为 legacy vocabulary 继续解释：

```text
production -> timeline namespace node, default kind = "production"
segment -> timeline namespace node, default kind = "segment"
```

长期看，`production` 不应继续被理解成唯一的影片根层级。它可以是旧模型的兼容名，或者是某个可交付视频单位的默认 kind。

## Setting Namespace

Setting namespace 表达创作对象的一致性组织。它回答：

- 这个实体是谁或是什么？
- 哪些属性是稳定不变量？
- 哪些状态、服装、损伤、声音、材质或视角是变化条件？
- 哪些系统 asset 槽需要挂载、生成、选择和复用？

当前的 `setting -> state -> asset` 可以作为 legacy structure 继续解释：

```text
setting -> setting namespace node, default kind = "setting"
state -> setting namespace node, default kind = "state"
asset -> system primitive under a setting namespace node
```

但产品上可以让用户用更贴近项目的词汇：

```text
character
  base_look
  injured_look
  costume
    formal
    raincoat
  voice
    calm
    angry
```

这里仍然不是普通 tag。Setting namespace 需要表达继承、覆盖、一致性和资产引用。一个 `injured_look` 不是给角色打了一个标签，而是这个角色在特定条件下的可复用状态。

`asset` 不属于用户自定义 namespace。它是系统级资源槽，用来承载某个 setting namespace 状态下需要稳定的证据，例如正面图、侧面图、材质参考、声线、乐器音色或道具细节。用户可以命名 asset 的 slot/role，但系统类型仍应保持 `asset`。

## System Primitives

`scene_moment`、`expression_unit`、`storyboard`、`keyframe`、`audio_cue`、`asset`、`timeline_assembly` 不应被看作和 `episode / act / beat` 同类的 namespace。

它们是系统 primitive：MovScript 用它们理解影视制作和资源证据，构造 prompt，组织候选，追踪依赖，并判断 stale impact。

推荐边界：

| 类型 | 语义 | 是否用户自定义 namespace |
| --- | --- | --- |
| `scene_moment` | 一个可表达、可生产、可审阅的事件/场面锚点 | 否 |
| `expression_unit` | 场面内部的表达单位，例如镜头、台词、动作、声音表达 | 否 |
| `storyboard` | 视觉组织方案或分镜材料 | 否 |
| `keyframe` | 关键画面锚点，例如首帧、尾帧、高潮帧、姿态帧 | 否 |
| `audio_cue` | 声音、音乐、环境声、对白或 foley 锚点 | 否 |
| `asset` | 设定状态下的资源槽和一致性证据，例如正面图、材质、声线 | 否 |
| `timeline_assembly` | 某个 timeline namespace scope 下的剪辑、聚合、导出或成片目标 | 否 |

用户可以自定义这些 primitive 的 role/kind，但不应重命名它们的系统类型。

例如：

```json
{
  "kind": "keyframe",
  "keyframe_role": "first_frame",
  "title": "主角回头的首帧"
}
```

或者：

```json
{
  "kind": "storyboard",
  "storyboard_role": "shot_plan",
  "title": "逃离段落分镜"
}
```

这样用户拥有创作语言，系统仍然知道它是 keyframe/storyboard，可以继续处理 candidate、selection、prompt ref、dependency 和 stale。

## Scene Moment 的位置

`scene_moment` 是 timeline namespace 和 system primitive 之间的边界点。

Timeline namespace 负责组织：

```text
episode -> act -> sequence -> beat
```

`scene_moment` 负责把某个 timeline leaf 变成可生产的影视场面：

```text
beat
  scene_moment
    expression_unit
    storyboard
    keyframe
    audio_cue
```

因此 `scene_moment` 不是用户定义的层级标签，而是系统定义的生产锚点。用户可以在 UI 里看到更自然的名字，例如“场面”“事件”“镜头组”“时刻”，但 source semantic type 仍应保持稳定。

这意味着 `scene_moment` 本身没有大的抽象问题，应该长期保留。它不是 `episode / act / beat` 这种可替换 namespace，也不是 `keyframe / storyboard` 这种证据材料；它是 agent 真正开始组织影片生成、镜头表达、声音表达、上下游引用和 review 边界的最小稳定场面单位。

可以把它理解为：

```text
timeline namespace = 用户如何组织影片
scene_moment = 系统如何抓住一个可生产场面
expression_unit / keyframe / storyboard / audio_cue = 系统如何拆解这个场面
content_unit = 系统要为其中某个对象生产什么
```

所以即使不同项目把 UI 名字显示为“scene”“moment”“段落”“事件”或“镜头组”，也只是 alias，不应影响 `scene_moment_ref`、prompt ref、stale graph 和 generation adapter。

## Content Unit

`content_unit` 仍然是唯一进入生产流程的任务单位。

Namespace node 不应直接成为 content unit 的 target。只有 system primitive 可以进入 content unit，例如 `scene_moment`、`expression_unit`、`keyframe`、`storyboard`、`asset` 或 `timeline_assembly`。

原因是 namespace node 只回答“如何组织、如何命名、如何排序、如何继承上下文”。它不是要被模型生成、剪辑导出或人工选择的对象。如果允许 namespace node 直接拥有 content unit ref，`episode`、`act`、`beat` 这些结构节点会重新变成隐性生产单位，candidate、selection 和 stale 边界会再次变混。

更严格地说，namespace source record 里也不应该保存 `content_unit_ref`、`content_unit_refs`、`main_content_unit_id` 这类字段。即使产品上需要展示“这个 episode 有哪些生成任务/导出版/预览”，也应该由 read model 从 system primitive 和 content unit 的正向关系反查出来，而不是把生产任务反向挂回 namespace 节点。

当一个 namespace scope 需要产出聚合视频、预览、主剪、导出版或整集成片时，应在该 scope 下挂一个系统 primitive，例如 `timeline_assembly`，再让 content unit 指向这个 primitive。

示例：

```json
{
  "kind": "content_unit",
  "content_unit_type": "timeline_assembly_ref",
  "output_kind": "video",
  "target_kind": "timeline_assembly",
  "target_ref": "episode_01_main_cut"
}
```

```json
{
  "kind": "content_unit",
  "content_unit_type": "keyframe_ref",
  "output_kind": "image",
  "target_kind": "keyframe",
  "target_ref": "opening_first_frame"
}
```

```json
{
  "kind": "content_unit",
  "content_unit_type": "asset_ref",
  "output_kind": "image",
  "target_kind": "asset",
  "target_ref": "hero_injured_front_view"
}
```

这保持了一个清楚边界：

- namespace 描述“如何组织和命名”。
- system primitive 描述“什么对象可以被生产、审阅、引用或聚合”。
- content unit 描述“要为它生产什么产物”。
- candidate / selection 描述“产出了哪些版本，哪个稳定生效”。

## Domain Abstraction Package

这次改造的最终目标不应该是让各个 package 分别学会一套 namespace 规则，而是建立一个统一的领域抽象 package，然后把 language、workspace、interpreter、engine、core、surface、MCP、CLI 和 agent skills 都调整到这个抽象上。

推荐新增 package：

```text
packages/domain
name: @movscript/domain
```

这个 package 的职责是定义 MovScript 的稳定领域语言。它不读写文件、不访问服务、不渲染 UI，也不决定具体 source layout。它只回答这些底层问题：

- 一个节点属于哪种系统行为分类：timeline namespace、setting namespace、system primitive、content unit、candidate/resource。
- path-derived parent edge、显式 parent/scope/target refs 和 legacy refs 如何规范化。
- `production/segment/setting/state` 这类旧词如何投影到 namespace node。
- `production_ref/segment_ref` 如何投影为 implicit `timeline_assembly`。
- 哪些 target 可以进入 content unit，哪些 target 必须被拒绝。
- normalized focus 如何表达当前对象，而不是继续到处传 `productionId`。
- normalized relation graph 的 edge vocabulary 是什么。

可以把它理解为“领域语义内核”，而不是又一个 repository、service 或 UI model。

### Package 边界

`@movscript/domain` 应保持纯 TypeScript、无运行时副作用、无文件系统依赖。它可以被所有 package 引用，因此必须避免反向依赖：

```text
@movscript/domain
  -> no dependency on language/workspace/interpreter/core/surface

@movscript/language
@movscript/workspace
@movscript/interpreter
@movscript/engine
@movscript/core
@movscript/project
surface/*
apps/*
services/*
  -> consume @movscript/domain
```

`@movscript/language` 仍然负责 JSON schema、schema registry 和 editable model description；`@movscript/workspace` 仍然负责 source layout、indexer 和 writer；`@movscript/interpreter` 仍然负责 validation、artifact 和 stale report。区别是这些包不再各自硬编码 production/segment 语义，而是消费 `@movscript/domain` 的分类、ref normalizer 和 invariant。

### 建议模块

第一版不需要做大。建议先放这些模块：

| 模块 | 内容 | 谁消费 |
| --- | --- | --- |
| `vocabulary` | namespace vocabulary、timeline templates、setting namespace rule、scene_moment alias | language、project、surface、agent planning |
| `categories` | `timeline_namespace`、`setting_namespace`、`system_primitive`、`content_unit`、`candidate_resource` 等行为分类 | workspace、interpreter、surface |
| `targets` | content unit target allowlist、legacy target warning、`timeline_assembly` target 规则 | language、workspace、interpreter、core、MCP |
| `refs` | `production_ref/segment_ref` -> assembly alias、primitive refs、prompt ref kind 边界 | interpreter、prompt、engine、CLI |
| `path-edges` | 从 source path 规范化 parent edge，但不把固定目录名当用户 vocabulary | workspace、interpreter、content canvas |
| `relation-graph` | normalized edge 类型：parent、scope、target、contains、uses、selected_resource、stales | interpreter、core、surface |
| `focus` | normalized focus：namespace path、timeline assembly、primitive ref、content unit、legacy productionId | MCP host、desktop、local/web host、agent chat |
| `invariants` | namespace 不可作为 content unit target、namespace 不可含 content-unit-ref、path/ref 一致性 | language、workspace、interpreter、tests |
| `legacy` | production/segment/setting/state 的兼容投影和 deprecation messages | all migration surfaces |

### 最小 API 形态

概念上可以先定义这些纯函数和类型：

```ts
type MovScriptNodeCategory =
  | 'timeline_namespace'
  | 'setting_namespace'
  | 'system_primitive'
  | 'content_unit'
  | 'candidate_resource'

type MovScriptSystemPrimitiveKind =
  | 'scene_moment'
  | 'expression_unit'
  | 'storyboard'
  | 'keyframe'
  | 'audio_cue'
  | 'asset'
  | 'timeline_assembly'

type MovScriptRelationKind =
  | 'parent'
  | 'scope'
  | 'target'
  | 'contains'
  | 'uses'
  | 'selected_resource'
  | 'stales'

type MovScriptNormalizedFocus =
  | { kind: 'project'; projectId: string | number }
  | { kind: 'timeline_namespace'; namespacePath: string }
  | { kind: 'timeline_assembly'; assemblyId: string | number }
  | { kind: 'system_primitive'; primitiveKind: MovScriptSystemPrimitiveKind; id: string | number }
  | { kind: 'content_unit'; contentUnitId: string | number }
  | { kind: 'legacy_production'; productionId: string | number }

function classifySourceEntity(input: SourceEntityLike): MovScriptNodeCategory
function normalizePathParentEdge(input: SourcePathLike): MovScriptRelationEdge[]
function normalizeContentUnitTarget(input: ContentUnitLike): NormalizedContentUnitTarget
function normalizeLegacyProductionRef(input: ContentUnitLike): NormalizedContentUnitTarget
function assertNamespaceCannotOwnContentUnitRef(input: SourceEntityLike): Diagnostic[]
function assertContentUnitTargetIsAllowed(input: ContentUnitLike): Diagnostic[]
```

真正落代码时，类型名可以调整，但职责不要漂移：它是“语义规范化层”，不是“新 workspace service”。

### 收敛路径

有了 `@movscript/domain` 后，其他 package 的改造顺序可以变成：

1. `language` 使用它定义 schema description、target allowlist 和 legacy warning。
2. `workspace` 使用它做 path parent edge、legacy projection 和 writer invariant。
3. `interpreter` 使用它构建 normalized relation graph 和 stale impact。
4. `engine/core` 使用它做 content unit target normalization、focus normalization 和 assembly projection。
5. `surface/project/resource/canvas` 使用它决定 node category、action、layout 和 candidate boundary。
6. `mcp-host/agent-chat/desktop/local-web host` 使用它传递 normalized focus，不再自己解释 `productionId`。
7. `CLI/skills/docs/tests` 使用它的术语和 fixture 作为唯一来源。

这样最终系统不是“每层都兼容一遍 production/segment”，而是：

```text
legacy source/API/UI term
  -> @movscript/domain normalize
  -> normalized category / target / focus / relation
  -> package-specific behavior
```

## 当前实现影响

当前代码中很多地方把目录结构当作语义来源。后续改造需要特别注意：

- `packages/workspace/src/layout/policy.ts` 定义 source collection 和 source entity file。
- `packages/workspace/src/indexer/domainIndex.ts` 通过 path segment 查询 production、segment、setting、state。
- `packages/interpreter/src/sourceValidation/index.ts` 通过正则校验固定路径结构。
- `packages/core/src/content/sourceWorkspaceData.ts` 通过路径拼 UI hierarchy tree。
- `packages/workspace/src/repository/production.ts` 按 `productions/{production}/segments/{segment}` 写入生产结构。
- `packages/workspace/src/repository/entities.ts` 按 `settings/{setting}/states/{state}/assets/{asset}` 写入设定结构。

因此第一阶段不建议直接重写存储布局。更稳的做法是先在 read model 和 domain model 中引入 namespace vocabulary 的抽象，让现有 path 父子关系可以映射成新的语义，同时不再要求目录名等于用户 vocabulary。

## 改造难度

这次改造可以拆成三档。难点不是“把 production 改名为 episode”，而是系统里很多流程已经把固定目录层级当成了 domain contract。

### 轻量兼容：低到中等难度

目标是先把用户可见和 agent 可理解的 namespace 词汇放出来，但不改变当前源文件布局。

这一档需要做：

- 在 project 级别增加 namespace vocabulary 声明，例如 `timeline_namespaces` 和 `setting_namespaces`。
- 在 read model 中把旧的 `production / segment / setting / state` 映射为 namespace node。
- UI 展示层使用 vocabulary alias，而不是固定显示 Productions、Segments、Settings、States。
- Agent planning 使用 vocabulary 组织结构，但写入时仍落回现有 path layout。
- 文档和 MCP tool description 更新，避免继续把 production 解释成唯一影片根层级。

这档的价值是最大、风险最低：可以先解决产品语言问题，让用户拥有 namespace 命名权，同时不破坏现有 interpreter、candidate、selection 和 stale 流程。

### 语义抽象：中到高难度

目标是让系统内部真的理解 timeline namespace 和 setting namespace，而不是只做 UI rename。

这一档需要做：

- 在 domain model 中引入 `timeline_namespace_node` 和 `setting_namespace_node` 的概念，或给旧 entity 增加等价 read-model projection。
- indexer 不再只通过 `productions`、`segments`、`settings`、`states` 这些固定 path segment 判断系统语义；path 仍可贡献树状 parent edge。
- hierarchy tree 支持递归 namespace，而不是固定 `production -> segment -> scene_moment` 和 `setting -> state -> asset`。
- content unit ref adapter 支持明确的 assembly primitive，例如 `timeline_assembly_ref`，并兼容旧 `production_ref`、`segment_ref`。
- validation 从“固定路径正则即全部语义”升级为“path parent edge + schema/category + 显式 ref 一致性校验”。
- relation graph 和 stale impact 能识别 namespace node 对下游 primitive、assembly 和相关 content unit 的间接影响。

这档是系统语义真正转向的核心。完成后，`episode / act / sequence / beat` 不只是别名，而是可以稳定参与查询、规划、排序、聚合和影响分析的结构节点。

### 存储布局演进：高难度

目标不是一定脱离目录层级，而是决定现有目录树是否足够表达递归 namespace，或者是否需要更通用的 source layout。

可能形态包括：

```text
timeline/{node}/node.json
setting_graph/{node}/node.json
```

或者继续保留目录树，但允许递归层级和自定义 kind。只要项目结构仍是树，path 父子关系就应继续保留。

这一档需要处理：

- 旧项目迁移、回滚和混合读取。
- writer 从固定路径生成改成 parent-aware 写入。
- source validation 不再依赖固定正则。
- Project Service resource view 从 `productions / segments / settings / assets` 升级为 namespace-aware view。
- UI 创建节点时不再通过固定 child type 推导路径。
- 测试夹具、示例项目、文档、agent skill、MCP 工具参数一起迁移。

这档的风险最高，因为它改变了 Git 中的 source shape，也会影响人直接阅读项目目录的方式。建议等前两档跑通后，再根据真实使用压力决定是否值得做。

## 涉及层面

下面是改造会碰到的主要层面。

| 层面 | 当前状态 | 改造方向 | 难度 |
| --- | --- | --- | --- |
| Domain abstraction package | 目前没有统一 package；各层分散理解 production/segment、path、target、focus | 新增 `@movscript/domain`，先统一 category、target、ref、path edge、focus 和 invariant | 中 |
| Source layout | 固定 `productions/{production}/segments/{segment}` 和 `settings/{setting}/states/{state}` | 第一阶段保留；后续再评估通用布局 | 高 |
| Domain schema | `production`、`segment`、`setting_state` 是固定 entity kind | 增加 namespace vocabulary 和 namespace node projection | 中 |
| Workspace policy | source collection 固定为 `settings / scripts / content_units / productions` | 兼容旧 collection，必要时增加新 collection | 中 |
| Indexer/query | 通过固定 path segment 推导 production、segment、setting、state | 改成 parent/ref-aware 查询；path 继续提供树状 parent edge，但不再硬编码 vocabulary | 中高 |
| Validation | 固定路径正则和目录归属校验 | 改为 path parent edge + schema/category + ref 一致性校验 | 高 |
| Writers | production tree 和 setting tree 都写固定目录 | 增加 namespace-aware writer，旧 writer 作为兼容入口 | 中高 |
| UI hierarchy | 固定两棵树：Settings 和 Productions | 改为 timeline namespace tree、setting namespace tree、system primitive children | 中高 |
| Content unit | 已经是独立生产任务，但 adapter 只认固定 ref type | 增加 `timeline_assembly_ref` 这类 assembly primitive/ref，同时保留 primitive ref | 中 |
| Candidate/selection | 主要挂在 content unit 上，方向正确 | 不需要大改，重点是 ref adapter 和 stale graph | 中 |
| Stale/relation graph | 已经处理 primitive 和 content unit 依赖，但 namespace 影响有限 | 让 namespace parent/child 关系通过 primitive/assembly 参与影响传播 | 高 |
| MCP tools | 工具名和参数仍是 production/segment/setting/state 语言 | 新增 namespace 工具或给旧工具加 projection 语义 | 中高 |
| Agent skills/docs | 当前技能仍教 agent 使用固定结构 | 更新技能语言：用户定义 namespace，系统保留 primitive | 中 |

一个比较现实的判断：

- 如果只做到“用户能配置 namespace 词汇，UI/agent 按词汇展示和规划”，是低到中等难度。
- 如果做到“timeline/setting namespace 可以递归，并能通过 assembly primitive 稳定进入生产流程”，是中到高难度。
- 如果最终证明现有目录树不够用，做到“更换 source layout，旧 production/segment/setting/state 只作为 legacy projection”，才是高难度，且需要专门 migration 设计。

## 全仓扫描后的耦合点

下面这些位置是实际改造会碰到的代码层面。总体结论是：当前系统不只是 UI 文案写死了 `production / segment / setting / state`，而是 schema、路径、indexer、writer、MCP、stale graph、content canvas 都把这套固定层级当成了 contract。

| 层面 | 主要文件 | 当前耦合 | 改造含义 |
| --- | --- | --- | --- |
| Domain abstraction | `packages/domain`（新增） | 当前不存在统一抽象，language/workspace/interpreter/core/surface 各自硬编码 target、path、legacy ref 和 focus 规则 | 先建立纯 TS 语义内核：分类、target allowlist、legacy projection、path edge、relation edge、normalized focus 和 invariant |
| Language schema | `packages/language/src/domain/schemaTypes.ts`, `packages/language/src/domain/schemas.ts` | `SemanticEntityKind` 和 `WorkspaceKind` 是闭合集合；`content_unit.target_kind` 仍包含 `production / segment / setting`；`production` schema 文案仍说它是 makeable video unit | 需要引入 namespace vocabulary/project 配置、namespace projection、`timeline_assembly` target，并把旧 production/segment target 解释成 legacy assembly |
| Workspace model | `packages/workspace/src/domain/models.ts` | editable/context path pattern 固定为 `productions/{production}/segments/{segment}/...` 和 `settings/{setting}/states/{state}/...` | 第一阶段只能做 projection；如果直接递归 namespace，会影响所有 domain model path pattern |
| Source layout policy | `packages/workspace/src/layout/policy.ts` | source collection 固定为 `settings / scripts / content_units / productions / project_standards`，entity files 固定为 production、segment、setting_state 等 | 新 collection 或递归布局要先有兼容层，不能让 layout policy 先变成破坏性迁移 |
| Repository writers | `packages/workspace/src/repository/production.ts`, `packages/workspace/src/repository/entities.ts`, `packages/workspace/src/repository/contentUnits.ts` | production tree writer 和 setting tree writer 生成固定路径；asset 需要 setting_id + setting_state_id；content unit writer 识别 production_ref/segment_ref | 新写入路径要 parent-aware；旧 writer 保持为兼容 API；禁止 writer 给 namespace source record 反向挂 content-unit-ref |
| Indexer/query | `packages/workspace/src/indexer/domainIndex.ts` | query 通过 path segment 匹配 productionId、segmentId、settingId、settingStateId、sceneMomentId | 需要 normalized parent/ref 索引；路径继续提供 layout parent edge，但查询语义不能只认固定目录名 |
| Interpreter validation | `packages/interpreter/src/sourceValidation/index.ts` | 用固定正则校验每种 entity 路径；setting state/asset 归属通过目录前缀验证 | 需要从“路径正则即语义”升级到“path parent edge + schema/category + ref 一致性校验” |
| Entity change id | `packages/interpreter/src/entityChanges/index.ts` | `sourceEntityKindFromRelativePath` 按文件名识别 kind，`stableDirectoryIdForSourceEntity` 按固定 path index 取 id | 递归 namespace 或新 layout 会先撞到这里；必须让 stable id 来自显式 id/ref，而不是目录位置 |
| Derived parent graph | `packages/interpreter/src/artifacts/derivedArtifactHelpers.ts`, `packages/interpreter/src/artifacts/relationGraph.ts` | parent relation 先由最近父目录推导；content unit relation 再由 specialized adapter 补 refs | normalized relation graph 应把 path-derived tree parent 和 explicit refs 合并成统一 edge；path parent 不是 legacy-only |
| Stale/impact | `packages/interpreter/src/artifacts/impactReport.ts`, `packages/interpreter/src/node/regeneration.ts` | impact 类型和 preview timeline 仍把 production/segment/scene_moment 当 timeline entity；production id 从 `productions/{id}` 路径推导 | namespace 影响需要通过 namespace -> primitive/assembly -> content unit 传播；legacy production/segment impact 映射到 implicit assembly |
| Content unit adapters | `packages/interpreter/src/artifacts/contentProductionAdapters.ts`, `packages/interpreter/src/artifacts/contentProductionHelpers.ts`, `packages/workspace/src/previewTimeline.ts` | adapter 只认 `production_ref / segment_ref / asset_ref / keyframe_ref / storyboard_ref / scene_moment_ref / expression_unit_ref` | 增加 `timeline_assembly_ref`；`production_ref / segment_ref` 保留为 assembly alias；不新增 `episode_ref / act_ref / timeline_namespace_ref` |
| Core read model | `packages/core/src/content/sourceWorkspaceData.ts`, `packages/core/src/content/sourceWorkspaceTypes.ts` | snapshot 和 hierarchy tree 是固定数组：settings、settingStates、assets、productions、segments、sceneMoments 等 | 需要增加 namespace projection tree，同时保留旧数组给兼容 UI 和工具 |
| UI tree/create | `packages/core/src/content/sourceWorkspaceTree.ts`, `surface/project/src/features/content/...` | Add child 逻辑固定：production -> segment、segment -> scene_moment、setting -> state、state -> asset；generation command 直接 ensure `scene_moment_ref` / `asset_ref` | UI 需要区分 namespace node 和 system primitive；namespace node 不出现“生成内容”主命令，只有 primitive/assembly 出现 |
| Content Canvas graph/actions | `surface/project/src/features/content/domain/contentCanvasTypes.ts`, `contentCanvasWorkspaceSnapshot.ts`, `contentCanvasGraphReferences.ts`, `contentCreativeCanvasActions.ts`, `contentCanvasCreateNodeCommands.ts`, `contentCanvasContentUnitCreateNodeCommands.ts` | canvas node kind、layout column、create action、parent lookup 和 default create flow 全都写死 production/segment/scene_moment；还能自动创建 `canvas_production`、`canvas_segment` 再挂 scene_moment/content unit | 需要把 canvas model 改成 normalized node category：namespace node、system primitive、content unit、candidate/resource；namespace 只创建子 namespace/primitive/assembly，不直接生成候选 |
| Core workbench/orchestration legacy model | `packages/core/src/production/orchestration.ts`, `packages/core/src/content/workbenchWriteModel.ts`, `sourceWorkspaceEngine.ts`, `sourceWorkspaceData.ts` | 老 content workbench 仍以 productionId、segmentId、sceneMomentId、preview_timeline.production_id 和 `targetKind = "production"` 组织拖拽、timeline item、progress 和 editing timeline | 标成 legacy table/workbench compatibility；新 timeline namespace/assembly 不应复用 production orchestration helper |
| MCP/domain tools | `packages/core/src/mcp/tools/domain/definitions.ts`, `packages/core/src/mcp/node/tools/domain/actions.ts` | 工具名和参数是 `domain_upsert_production_tree`、`domain_upsert_segment`、`domain_upsert_setting_tree`；tree upsert 会自动创建 `production_ref / segment_ref / scene_moment_ref` | 新增 namespace-aware 工具或给旧工具加 projection 语义；自动 content unit 创建必须避免挂到 namespace |
| Project Service resource view | `services/project-service/src/server.mjs`, `packages/core/src/mcp/node/tools/project/resources.ts` | project resources 把 `episodes/productions` 映射为 production，把 `scenes/segments` 映射为 segment | resource view 需要能展示用户 vocabulary，同时把 legacy resource kind 投影到 namespace/system primitive |
| Engine/source commands | `packages/engine/src/index.ts` | source command 和默认 output kind 仍按 production/segment/scene_moment/asset/keyframe/storyboard 分支 | engine 层要吃 normalized target；否则 UI/MCP 即使变了，执行层仍会写回旧语义 |
| Prompt compiler | `packages/prompt/src/index.ts` | prompt ref kind 是固定 union：`production / segment / asset / keyframe / storyboard / scene_moment / expression_unit / content_unit / candidate / resource`；`production_ref / segment_ref` 仍被当成 primary ref | 需要决定 prompt 是否允许引用 namespace；推荐不允许 namespace 作为稳定资源依赖，只新增 `timeline_assembly` 或继续通过 primitive/content_unit/candidate/resource 引用 |
| Editing model/service | `packages/editing/src/movscript-edit-plan.ts`, `packages/editing/src/media-project.ts`, `services/editing-service/src/server.mjs` | edit plan 需要 `productionId / productionPath / sceneMomentId / sceneMomentPath`；production timeline builder 硬编码 `targetKind = "production"` | assembly 进入剪辑后，editing API 要能接受 `timeline_assembly` 或 scope-centric target；旧 production timeline 作为 assembly alias 保留 |
| Runtime workspace scope | `packages/workspace/src/root.ts`, `packages/workspace/src/node/paths.ts` | workspace scope 是 `global / project / production`，production scope 决定 provider session cwd 和 interpret base dir | 这属于 runtime context，不等同于用户 timeline namespace；若要扩展，不应把 episode/season 直接塞进 scope union |
| Shared/Desktop semantic entities | `packages/shared/src/surfaceSemanticEntities.ts`, `apps/desktop/src/shared/infrastructure/api/semanticEntityConfigs.ts`, `packages/core/src/production/*` | 仍有 `segments / sceneMoments / assetSlots / production_id / owner_type` 等旧表格式 surface 配置和 production analysis/orchestration helper | 先标为 legacy/table-surface projection，不反推新 source domain；需要 UI 迁移时再映射到 namespace/primitive |
| CLI | `apps/cli/src/commands/lang.ts`, `apps/cli/README.md` | CLI 暴露 `production add`、`segment add`、`scene-moment add`、`content-unit --production/--segment`；interactive help 也写死旧路径语言 | 新增 namespace/assembly 命令或标注旧命令为 legacy；content-unit CLI 要支持 `timeline_assembly_ref`，并拒绝 namespace target |
| Data Service decisions | `services/data-service/internal/app/contentcandidate/*`, `services/data-service/internal/app/decision/*`, `services/data-service/internal/domain/job/helpers.go`, `services/data-service/internal/infra/persistence/model/decision.go` | decision 表是通用 `target_kind/target_ref`，但 content-candidate generation、job sync、reconcile 固定写 `target_kind = "content_unit"` | 这是正确边界：后端 candidate/selection 继续只服务 content unit，不扩展到 namespace；assembly 也通过 assembly content unit 进入 |
| Project client/contracts | `packages/project/src/index.ts`, `packages/mcp-contracts/src/index.ts`, `packages/agent-protocol/src/*` | resource view kind 暴露 `episodes / productions / scenes / segments`；context snapshot 仍带 `productionId` | 这些是 surface/API compatibility terms；新增 namespace scope 时要并行引入 `timeline_scope`/`namespace_path` 一类语义，不直接复用 productionId |
| MCP host/runtime status | `packages/mcp-host/src/stdio.ts`, `packages/runtime-contracts/src/index.ts` | `movscript_runtime_status` 入参和 Local Surface URL 仍支持 `productionId`；project source detection 硬编码 `settings/content_units/productions/scripts` | runtime status 是 agent 入口，必须把 `productionId` 标为 legacy focus；source detection 应走 layout policy/project metadata，而不是固定目录名 |
| Agent browser surfaces | `packages/core/src/agent/surfaces.ts`, `surface/project/src/components/AgentPreviewTimelineSurface.tsx`, `ProjectOverviewSurface.tsx`, `ProjectSurfaceRouteView.tsx` | preview timeline surface 必须有 `productionId`，页面标题/缺失态/usage 都写 production preview；project status 也把 productionId 作为 query/entity | surface entity 应支持 `timelineScopeId/namespacePath/timelineAssemblyId`；productionId 只作为 legacy query |
| Agent chat/protocol | `packages/agent-chat/src/chat/agentChatServerRequests.ts`, `packages/agent-protocol/src/*` | workspace scope 仍有 `production`；workspace kind 仍有 `production_workspace`；decision request 展示 `targetKind/targetPath/contentUnitId` | `contentUnitId` 是正确稳定目标；`targetKind` 必须继续拒绝 namespace target；新增 timeline/assembly focus 时旧 production workspace 只做 legacy alias |
| Desktop Agent workspace/handoff | `apps/desktop/src/shared/contracts/workspaceChangeHandoff.ts`, `apps/desktop/src/features/agent/domain/workspaceDomainModel.ts`, `AgentRuntimeChatShell.tsx`, `agentCommandInput.ts` | review path 和 command input 会从 `production_workspace`、`productionId` 推导脚本工作台上下文；`content_unit_workspace` 也会在 production target 下回到 scripts workbench | 新增 namespace/assembly focus 后，handoff 不能只靠 productionId；旧路由保留为 legacy focus，新入口应使用 normalized target 或 `timelineScopeId/namespacePath/timelineAssemblyId/contentUnitId` |
| Desktop Electron runtime bridge | `apps/desktop/src/electron/ElectronMCPContextBridge.tsx`, `apps/desktop/src/shared/contracts/electronApiWorkspaceContext.ts`, `apps/desktop/electron/services/projectEngineRegistry.ts`, `apps/desktop/electron/ipc/movscriptEngineIpc.ts` | Electron MCP context 和 workspace context 仍有 `scope = "production"` / `productionId`；engine IPC 仍暴露 production/segment create 和 production snapshot；registry 从 `production_ref/segment_ref` 还原 runtime fields | 这是 runtime/source bridge，不应直接改成用户 namespace；新增 normalized focus 和 assembly target 后再逐步替换旧字段 |
| Local/Web surface host | `services/local-surface-host/src/project/*`, `services/web-surface-host/src/main.tsx` | 路由和 read-model snapshot 继续传 `productionId`，并合成 `movscript.production_status_summary.v1` | host context 要把 production status summary 标成 legacy projection；未来改成 project timeline/namespace status，避免 agent 只围绕 production 工作 |
| Local Surface semantic adapter | `services/local-surface-host/src/host-runtime/infrastructure/api/semanticEntities.ts` | host runtime 里还有 `segments -> segment`、`productions -> production`、`settingStates -> setting_state`、`contentUnits -> content_unit` 等固定映射 | 这层应改为消费 Project Service/read model projection；不要让 host runtime 自己定义 domain vocabulary |
| Desktop semantic entity API | `apps/desktop/src/shared/infrastructure/api/semanticEntityWorkspace.ts`, `semanticEntityConfigs.ts` | UI writable semantic entity 仍可直接创建 `productions / segments / sceneMoments`，并要求 `production_id / segment_id` | 这是高风险写入口；namespace-aware writer 出现后要先接管这里，否则桌面 UI 会持续写旧结构 |
| Project entry registry/overview | `surface/project/src/features/project/domain/projectEntryRegistry.tsx`, `projectOverviewModel.ts`, `projectEntryDeckModel.ts` | 项目入口 id/stage 仍是 `orchestration_production`，primary selection 是 `productionId`，首页进度以 productions/segments/sceneMoments 计数 | entry id 可兼容保留，但 purpose/owns/reads/selection/progress 应转向 timeline namespace + scene_moment/assembly |
| Admin/workspace history surface | `surface/admin/src/types/index.ts`, `surface/admin/src/i18n/locales/*.json` | admin 类型和文案里仍有 `asset_slot`、`segment`、`scene_moment`、`production_workspace`、`content_unit_workspace`，还有 `Project.total_episodes` 等历史字段 | 这层先作为显示/历史兼容；后续标签应来自 read model/vocabulary，不能反向定义 source schema |
| Canvas surface | `surface/canvas/src/types.ts`, `surface/canvas/src/features/presentation/useWorkbenchCanvasLauncher.ts` | Canvas 仍有 `asset_slot / segment / scene_moment / content_unit` 等 semantic kind 和 `assets / production` workbench stage | Canvas 应保持 workflow/resource surface，不直接写 namespace；如果绑定 domain，只绑定 system primitive/content unit/assembly |
| Resource surface candidates | `surface/resource/src/resourceCandidateAttachPanel.tsx`, `surface/resource/src/resourceCandidateBinding.ts`, `packages/shared/src/workspaceCandidates.ts` | 资源库仍可把资源加入 `asset_slot` 或 `keyframe` 候选，payload 带 `production_id / scene_moment_id / content_unit_id` | 这是 legacy inline candidate/asset-slot 流程；新资源选择应优先进入 `asset_ref / keyframe_ref` content unit candidate，不扩展到 namespace |
| Inline candidate/decision helpers | `packages/decision/src/index.ts`, `packages/workspace/src/repository/inlineCandidates.ts`, `packages/workspace/src/repository/candidates.ts`, `surface/project/src/features/content/domain/contentCanvasGraphReferences.ts` | legacy target kind 仍包含 `asset / storyboard / keyframe / content_unit`，workspace candidates 可直接写 asset/keyframe inline candidate | 这些是迁移兼容入口；不得新增 namespace target，长期收敛到 asset/keyframe/storyboard content unit candidate |
| Shot Library | `packages/shot-library/src/index.ts`, `surface/shot-library/src/features/domain/*` | Shot library 使用 `shot`、`production_facets`、story beat 等检索词，但不是 source domain 的 production/segment | 作为参考镜头库保留；导入到项目时映射到 `expression_unit(role=shot)`、storyboard/keyframe 或 content unit，不恢复 `shot_ref` |
| Docs/README/examples | `apps/plugin/README.md`, `plugins/movscript/README.md`, `apps/cli/README.md`, `docs/movscript-agent-runtime-architecture.zh-CN.md`, `docs/TODO.md` | 文档仍把 source paths 写成 `settings/**`、`content_units/**`、`productions/**`，并把 planning upserts 描述为 production/segment/scene_moment/shot | schema 确定后要同步更新说明和示例；在此之前标注为 legacy projection，避免 agent/用户继续学习旧层级 |
| Plugin bundle/release artifacts | `apps/plugin/bin/movscript-agent-mcp.mjs`, `plugins/movscript/bin/movscript-agent-mcp.mjs`, `plugins/movscript/runtime/**` | 打包后的 agent MCP runtime 内嵌旧 content-unit adapter、preview timeline 和 source layout 逻辑 | 不能手改 bundle；源代码改造后必须重新构建插件、刷新 cache/release，并加 drift 检查 |
| Agent plugin skills | `plugins/movscript/skills/*`, `apps/plugin/skills/*` | planning/generation/editing 技能仍教 agent 使用 `production -> segment -> scene_moment`、`production_ref / segment_ref`，content-unit recipe 还建议 production/segment target | 源语义确定后必须同步更新技能；否则 agent 会持续生成旧结构，或误把 namespace 当成 content unit target |
| Tests/fixtures | `surface/project/src/features/content/application/contentCanvasArchitecture.test.ts` 等 | 大量 fixture 写死 `productions/prod/segments/seg/scene_moments/...` 和 `settings/hero/states/day/assets/...` | 第一阶段只需新增 projection 测试；布局迁移阶段才大规模改 fixture |

## 扫描覆盖地图

本轮扫描按“是否会影响 namespace/source/candidate/agent 行为”来分层，不把所有同名词都当成 domain 风险。

二次扫描使用旧层级/生产词汇命中来做覆盖校验，重点词包括 `production`、`segment`、`setting_state`、`asset_slot`、`scene_moment`、`content_unit`、`productionId`、`segmentId`。扫描时排除了 `node_modules`、`dist/build`、vendor、打包后的 agent bundle 和 runtime dist；随后又单独检查了 `apps/desktop/out/**`、`services/data-service/bin/**`、`test-results/**`，确认这些属于生成产物或测试输出，不作为手工迁移入口。

高密度命中主要集中在 `surface/project`、`apps/desktop`、`packages/core`、`packages/interpreter`、`packages/workspace`、`apps/plugin`、`plugins/movscript` 和 `services/data-service`。低风险命中主要来自 HLS/media segment、CSS class、marketing copy、release notes 和 shot-reference search vocabulary。

| 区域 | 覆盖结论 | 文档处理 |
| --- | --- | --- |
| `packages/language`, `packages/workspace`, `packages/interpreter`, `packages/engine` | source schema、path layout、writer、indexer、stale graph 的核心耦合 | 必改核心路径 |
| `packages/core`, `surface/project`, `apps/desktop` | read model、content canvas、semantic entity writer 会直接影响用户创建和生成入口 | 必改 UI/write boundary |
| `surface/project/src/features/content`, `packages/core/src/content` | content canvas graph/action/layout 和旧 content workbench 以 production/segment 为结构骨架 | normalized canvas model + legacy workbench compatibility |
| `packages/prompt`, `packages/editing`, `services/editing-service` | prompt dependency gate 和剪辑目标仍受 production/segment 影响 | 改为 primitive/content unit/assembly 目标 |
| `services/project-service`, `packages/project` | Project API/resource view 暴露 `episodes / productions / scenes / segments` | 做 vocabulary-aware projection |
| `services/data-service`, `packages/data-client`, `packages/decision` | backend decision/candidate 主要绑定 `content_unit`，方向正确 | 保持边界，不扩展到 namespace |
| `packages/mcp-host`, `packages/mcp-contracts`, `packages/agent-protocol`, `packages/agent-chat` | agent 入口、runtime status、decision request 仍携带 `productionId/targetKind` | `productionId` legacy focus；decision target 走 normalized target |
| `packages/core/src/agent`, `surface/project/src/components/Agent*Surface.tsx` | agent browser surface 的 preview/status 页面仍以 `productionId` 为 focus | 新增 timeline/assembly surface focus |
| `apps/desktop/src/features/agent`, `apps/desktop/src/shared/contracts` | agent workspace review path、handoff 和 command input 会从 `production_workspace/productionId` 推导上下文 | legacy workspace alias + namespace/assembly/content-unit focus |
| `apps/desktop/electron`, `apps/desktop/src/electron` | Electron MCP context、workspace scope、engine IPC 和 project registry 仍保留 production/segment bridge | runtime bridge legacy fields + normalized focus |
| `apps/plugin`, `plugins/movscript` | 技能和打包 MCP runtime 会固化旧语义 | 源码改造后重建 bundle，增加 drift check |
| `services/local-surface-host`, `services/web-surface-host` | surface URL/read-model snapshot 仍传 `productionId`；local host runtime 还有固定 semantic entity 映射 | legacy focus + namespace focus projection；semantic adapter 消费 read model |
| `surface/admin` | workspace history、admin types 和 i18n 仍展示 `segment/asset_slot/production_workspace` 等旧词 | 显示兼容，不作为 source schema |
| `docs/**`, `README.md`, `apps/*/README.md` | 示例和架构文档仍教固定路径和 production/segment upsert | schema 决策后同步 docs/examples |
| `surface/resource`, `packages/shared` workspace candidates | 资源挂载仍有 `asset_slot/keyframe` 旧候选入口 | 收敛到 `asset_ref/keyframe_ref` content unit candidate |
| `surface/canvas`, `services/canvas-service` | Canvas 是 workflow/resource surface，当前不直接 push domain entity | 保持不直接写 namespace，只通过 content unit/resource 进入 |
| `surface/shot-library`, `packages/shot-library` | `shot` 和 `production_facets` 是检索/参考库词汇 | 导入时映射到 expression/storyboard/keyframe/content unit |
| `services/media-pipeline` | `segment` 是 HLS/media segment | 排除出 domain namespace 改造 |
| `packages/ui`, `README.md`, `site`, `.github/release-workspace-notes.md`, `scripts/release` | `production`/`segment` 命中是 CSS class、marketing copy、release wording 或 path segment 变量 | 不作为 source/domain 风险，只在产品文案统一时再改 |
| `services/auth-service`, admin provider/model 配置 | 用户、组织、provider、模型参数，不定义 domain source hierarchy | 不纳入 namespace schema |
| `apps/desktop/out/**`, `services/data-service/bin/**`, `dist/**`, `runtime/**/dist`, generated bundle, `test-results/**` | 生成产物或测试输出可能包含旧词，但不应手改 | 通过构建、清理输出和 drift check 更新 |

## 核心 source/interpreter 细化扫描

这一轮更细地看了 `packages/workspace`、`packages/interpreter` 和 `packages/prompt`，结论是：path 父子关系本身不是问题，真正高风险的是多处代码把固定 path index 或固定 path segment 当成 semantic contract。

| 文件 | 当前行为 | 改造判断 |
| --- | --- | --- |
| `packages/workspace/src/domain/models.ts` | workspace 的 `editablePathPatterns/contextPathPatterns` 固定为 `productions/{production}/segments/{segment}/...`、`settings/{setting}/states/{state}/...` | 第一阶段保留旧 pattern，同时新增 namespace vocabulary/read-model 说明；不要直接把所有 workspace kind 迁成递归 namespace，否则 MCP/domain_get_model 会大面积破坏 |
| `packages/workspace/src/layout/policy.ts` | editable source root 固定为 `settings/scripts/content_units/productions/project_standards`，entity file 白名单固定为 `production.json/segment.json/setting_state.json/...` | layout policy 是兼容门卫；先允许 projection/assembly 的新 entity file 或 derived view，再评估 source layout migration |
| `packages/workspace/src/indexer/domainIndex.ts` | `queryMovScriptWorkspaceProductionContext` 使用固定 include：`productions/segments/scene_moments/...`；filter 通过 `pathSegmentAfter(path, "productions" | "segments" | "states")` 判断归属 | 需要新增 parent/ref-aware index；旧 `productionId/segmentId/settingStateId` query 保留为 legacy focus，不再作为新语义入口 |
| `packages/workspace/src/repository/production.ts` | production tree writer 固定写 `productions/{production}/segments/{segment}/scene_moments/{moment}`；keyframe/storyboard 用 path owner 写 `scene_moment_ref`、`expression_unit_ref` | 这个 writer 可作为 legacy tree writer 保留；新 namespace writer 应使用 parent-aware path builder，并把 path parent 与显式 scope/ref 校验放到 interpreter |
| `packages/workspace/src/repository/entities.ts` | setting state/asset writer 从 path 取 `settings`、`states`，并强制 asset 有 `setting_id + setting_state_id` | 这是可复用的正确模式：path 提供父子归属，record ref 提供显式一致性；未来 setting namespace 也应沿用这种单父级校验 |
| `packages/workspace/src/repository/contentUnits.ts` | content unit writer/validator 仍把 `production_ref/segment_ref` 作为 primary ref，并允许 `target_kind = production/segment` | 加 `timeline_assembly_ref`，把 `production_ref/segment_ref` 解释成 implicit assembly alias；不要增加 `episode_ref/beat_ref/timeline_namespace_ref` |
| `packages/interpreter/src/entityChanges/index.ts` | `stableDirectoryIdForSourceEntity` 通过固定 path index 取 id，例如 setting state 是 `parts[3]`、scene moment 是 `parts[5]` | 递归 namespace 或新 layout 会先撞这里；stable id 应优先来自 record id，path id 只作为兼容校验 |
| `packages/interpreter/src/sourceValidation/index.ts` | `sourcePathMatchesEntityKind` 用固定正则校验 production/segment/scene_moment/keyframe/storyboard/audio/expression 路径；asset ownership 已经校验 path 与 record ref 一致 | 正则校验要升级为 category + parent edge 校验；asset ownership 这类“path parent 与显式 ref 一致”的模式应该推广 |
| `packages/interpreter/src/artifacts/relationGraph.ts` | 已经从 nearest parent directory 推导 parent relation，再从 content unit target/prompt refs 推导 uses/references | 这是最接近目标的位置；应把 path-derived tree parent、namespace scope、assembly target 和 prompt refs 合并成 normalized relation graph |
| `packages/interpreter/src/artifacts/contentProductionHelpers.ts` / `contentProductionAdapters.ts` | specialized adapter 只认 `production_ref/segment_ref/asset_ref/keyframe_ref/storyboard_ref/scene_moment_ref/expression_unit_ref`；prompt input 会要求 upstream content unit selection | adapter 边界应保持系统 primitive/assembly 级别；namespace 只展开上下文，不进入 selection gate |
| `packages/interpreter/src/artifacts/impactReport.ts` | impact 通过 relation graph 查 affected content units，但 `contains` 只对 scene_moment/keyframe/storyboard/expression/audio 等 primitive 生效 | namespace 影响应先传到 descendant primitive 或 timeline assembly，再影响 content unit；namespace 自己不生成 candidate/selection |
| `packages/prompt/src/index.ts` | prompt ref kind union 包含 `production/segment/...`，`contentUnitTypesForPromptRefKind` 会把 kind 映射到 `${kind}_ref` | 不新增用户 namespace prompt ref；`{{episode::id}}` 这类写法应被禁止或作为普通文本上下文处理，稳定资源依赖继续走 primitive/content_unit/candidate/resource/assembly |

## Schema/API 写入入口细化扫描

如果只改 read model 和 UI，旧写入入口仍会把新语义压回 `production -> segment`。这一层要按“schema 允许什么、engine 实际写什么、MCP 教 agent 怎么写、Project Service 暴露什么 view”来拆。

| 文件 | 当前行为 | 改造判断 |
| --- | --- | --- |
| `packages/language/src/domain/schemaTypes.ts` | `SemanticEntityKind` / `WorkspaceKind` 是闭合集合，只包含 `production/segment/setting_state/...`，没有 namespace node 或 assembly primitive | 第一阶段可不破坏闭合集合，但要新增 projection 类型或扩展 schema；若新增真实 source entity，必须从这里开始 |
| `packages/language/src/domain/schemas.ts` | `production` promptSummary 仍是 “makeable video unit”；`segment` 被定义为 production 内 rhythm section；`content_unit.target_kind` enum 还允许 `production/segment/setting/metadata` | 需要把 production/segment 文案改成 legacy timeline namespace projection；`setting` 不应继续作为 content unit target；`timeline_assembly` 要进入 target 语义或 adapter projection |
| `packages/language/src/domain/schemas.ts` | `asset` schema 仍有 `asset_ref_content_unit_id`，它是 source record 反向指向 content unit 的字段 | 需要评估迁移：namespace 禁止 content-unit-ref 的原则也应影响 asset 这类 source prerequisite；更稳的是由 read model 反查 asset_ref content unit |
| `packages/engine/src/index.ts` | `MovScriptEngine*Input`、`PlanningEntityKind`、`planningQuery` 全部围绕 `productionId/segmentId/sceneMomentId` | engine 是旧 API facade；新增 namespace/assembly flow 时应新建 neutral input，不要把 `episodeId/beatId` 继续塞进这些字段 |
| `packages/engine/src/index.ts` | `writeHierarchyNode` / `updateEntityBasics` 从 `targetPath` 里的 `productions/segments/scene_moments` 推导上下文，再调用 legacy writer | 新 UI/agent 不能复用这个入口写 namespace；应改为 normalized target + parent edge，旧入口只作为 legacy path writer |
| `packages/engine/src/index.ts` | `saveProduction/saveSegment/saveSceneMoment/...` 都走 `saveProductionSnapshot`，并默认 `productionId = "main"` | 这是 production tree compatibility writer；namespace-aware writer 应避免默认 main production，以免空项目被隐式写成电影结构 |
| `packages/engine/src/index.ts` | `saveContentUnit` 仍直写 `production_ref/segment_ref`；`defaultContentUnitOutputKind` 把 `production_ref/segment_ref` 视为 video | 增加 `timeline_assembly_ref` 后，production/segment 只作为 legacy alias；output kind 和 primary ref helper 都应收敛到 assembly |
| `packages/core/src/mcp/tools/domain/definitions.ts` | `domain_upsert_production_tree`、`domain_upsert_segment`、`domain_upsert_scene_moment` 的 description 和 input schema 都围绕 production/segment | 新增 namespace-aware tool 前，这些工具描述必须标注 legacy/projection；否则 agent 会继续创建旧层级 |
| `packages/core/src/mcp/node/tools/domain/actions.ts` | `domain_upsert_production_tree` 会自动为 segment-level content unit 写 `segment_ref/targetKind=segment`，production-level 写 `production_ref/targetKind=production` | tree tool 的自动 content unit 创建是高风险点；新模型下 namespace tree upsert 不应自动给 namespace scope 创建 content unit，除非显式创建 timeline assembly |
| `packages/core/src/mcp/node/tools/domain/actions.ts` | `domainProductionStatusSummary` 返回 `movscript.production_status_summary.v1`，按 `productionId` 聚合，并只读取 `targetKind === "production"` 的 editing timeline | 应新增 `project_timeline_status` 或 assembly/status summary；旧 production summary 保留 alias，不再作为 agent 唯一状态入口 |
| `packages/project/src/index.ts` | `ProjectSourceCommandName` 只有 `createProduction/createSegment/createSceneMoment`，resource view kind 有 `episodes/productions/scenes/segments` | Project client 要新增 namespace/assembly command 或 projection query；旧 resource kind 仅做 compatibility label |
| `services/project-service/src/server.mjs` | `projectResourceEntityKind` 把 `episodes/productions -> production`，`scenes/segments -> segment` | Resource view 要改成 vocabulary-aware projection，不能让 API 层继续定义用户 ontology |
| `packages/mcp-contracts/src/index.ts` | `MCPContextSnapshot` 顶层仍有 `productionId` | 该字段保留为 legacy focus；新增 `timelineScopeId/namespacePath/timelineAssemblyId/focusedPrimitiveRef` 一类 neutral focus |

## Surface/runtime focus 细化扫描

这层不一定直接写 source，但会决定 agent 认为“当前对象”是什么。若这里继续只传 `productionId`，agent planning、review surface、status summary 和 provider session 都会回到旧 production focus。

| 文件 | 当前行为 | 改造判断 |
| --- | --- | --- |
| `services/local-surface-host/src/routes/localRouteLinks.ts` | `projectRouteContext` 只从 query 取 `productionId`；`projectSurfaceHrefForLocalProject` 会把 params 直接拼到 URL | route context 需要支持 neutral focus 参数，例如 `timelineScopeId`、`namespacePath`、`timelineAssemblyId`、`contentUnitId`；`productionId` 仅作为 legacy query |
| `services/local-surface-host/src/project/localProjectSurfaceRuntime.ts` | runtime input 和 navigator href 都携带 `productionId`，并在路由跳转时继续写回 query | local runtime 不解释 namespace，但要完整转发 normalized focus，避免 surface 内部只能看到 production |
| `services/local-surface-host/src/project/LocalProjectSurfaceHostRoute.tsx` | `useProjectReadModel` 接收 `productionId`，并把 read model 合成 `movscript.production_status_summary.v1`；没有 focus 时会从第一个 production 推导 `default` | 这里应改成 project timeline/status projection；旧 production summary 可以作为 alias，但不应自动选择第一个 production 当唯一状态目标 |
| `services/web-surface-host/src/main.tsx` | Web host 只把 `productionId` 传给 `ProjectSurfaceRouteView` | Web/local host 要共享同一套 normalized focus 解析，不能出现 web 只支持 production、local 支持 namespace 的分叉 |
| `packages/core/src/agent/surfaces.ts` | `createPreviewTimelineSurface` 必须传 `productionId`，title/query/entity 都是 production；`createProjectStatusSurface` 也只支持可选 production focus | Agent surface entity 应增加 timeline scope / assembly / primitive / content unit focus；preview timeline 长期应打开 assembly preview，而非 production preview |
| `apps/desktop/src/pages/agent/AgentPreviewTimelinePage.tsx` / `AgentProjectStatusPage.tsx` | 页面从 URL 读取 `productionId`；preview timeline query 没有 productionId 就不启用 | `Missing productionId` 不应阻塞 namespace/assembly 项目；页面应先读 normalized focus，再决定 preview/status loader |
| `surface/project/src/components/AgentPreviewTimelineSurface.tsx` / `AgentProjectStatusSurface.tsx` | UI 文案和 chips 都写 Production；status surface 从 `summary.productions[0]` 取 content units | surface 应显示 vocabulary label 或 assembly title；status data 不应固定为 `productions[]` 结构 |
| `surface/project/src/components/AgentImpactSurface.tsx` | impact item 会从 `targetPath` 正则解析 `productions/{id}`，再生成 `Open preview` 链接 | impact surface 应优先使用 normalized target/assembly/content unit；path 解析只作为 legacy fallback |
| `apps/desktop/src/electron/ElectronMCPContextBridge.tsx` | 只在 scripts route 解析 query `productionId` 并写入 MCP context | context bridge 应传 normalized focus；scripts route 上的 productionId 只做 legacy route hint |
| `apps/desktop/src/shared/contracts/electronApiWorkspaceContext.ts` / `apps/desktop/electron/services/workspaceRealm.ts` | workspace scope union 是 `global/project/production`，`scope = production` 会进入 workspace path/context | 不把用户 namespace 塞进 scope union；新增 focus payload 与 runtime scope 分离 |
| `packages/mcp-host/src/stdio.ts` | `movscript_runtime_status` 入参和 Local Surface URL common query 支持 `productionId` | runtime status 是只读路由入口，应支持转发 namespace/assembly focus，但解释仍交给 Project Service/read model |
| `apps/desktop/src/shared/contracts/workspaceChangeHandoff.ts` / `workspaceDomainModel.ts` | `production_workspace` review path 跳到 scripts workbench + `productionId`；`content_unit_workspace` 指向 production 时也回退到 production workbench | workspace review path 应先按 content unit / scene moment / assembly / namespace focus 分流；production workspace 只作为 legacy alias |
| `apps/desktop/src/features/agent/domain/agentCommandInput.ts` / `AgentRuntimeChatShell.tsx` | command input 和 runtime workspace context 从 URL `productionId` 推断 `pageEntityType = production` 和 `scope = production` | agent command context 应优先消费 normalized focus/read model；不要仅凭 productionId 判定当前对象 |
| `apps/desktop/src/shared/infrastructure/api/semanticEntityConfigs.ts` / `semanticEntityWorkspace.ts` | Desktop semantic entity writer 暴露 productions/segments/sceneMoments，并要求 `production_id/segment_id` 后调用 `saveProductionSnapshot` | 这是 UI 直接写旧 source 的高风险入口；namespace-aware writer 出现后应优先替换这里 |
| `packages/agent-chat/src/chat/agentChatServerRequests.ts` | decision metadata 透传 `targetKind/targetPath`，但生成结果卡使用 `targetKind = content_unit` | 生成结果的 content unit 边界是正确的；需要在通用 decision request 入口拒绝 namespace target |

## Content Canvas / Project Entry 细化扫描

Content Canvas 不是单纯展示层。它会创建 source 节点、确保 content unit、发起候选生成、选择 candidate，并把 project entry/overview 的状态反馈给用户。因此这一层要特别小心：保留已经正确的 content-unit candidate 边界，同时替换会写回旧 production/segment 的结构入口。

| 文件 | 当前行为 | 改造判断 |
| --- | --- | --- |
| `surface/project/src/features/content/domain/contentCanvasTypes.ts` | `ContentCanvasNodeKind` 直接包含 `production / segment / scene_moment / setting / state / asset / content_unit`，没有 category 字段区分 namespace node 与 system primitive | 保留 legacy kind 作为 projection，但新增 normalized category，例如 `timeline_namespace`、`setting_namespace`、`system_primitive`、`content_unit`；UI action 以 category 决定 |
| `surface/project/src/features/content/domain/contentCanvasGraphNodes.ts` | label 固定把 `production` 显示为“制作”、`segment` 为“段落”、`state` 为“状态” | label 应从 project vocabulary/read model 来；旧 kind label 只作为 fallback，避免 UI 把用户自定义 namespace 又翻回固定 production/segment |
| `surface/project/src/features/content/domain/contentCanvasWorkspaceSnapshot.ts` | `sourceEntities` 直接拼 `productions/segments/sceneMoments/...`；parent lookup 通过 `pathSegmentAfter(..., "productions" | "segments" | "scene_moments")` 推导 | snapshot 应消费 normalized relation graph；path-derived parent edge 仍保留，但不要在 canvas 内自建固定层级解释器 |
| `surface/project/src/features/content/domain/contentCanvasWorkspaceSnapshot.ts` | `buildGenerationTaskIndex` 只把 `asset/keyframe/storyboard/scene_moment/expression_unit` 识别为 content unit target，没有 production/segment generation task | 这是好边界：namespace 不应该有 generation task；后续只需增加 `timeline_assembly`，不要把 namespace target 加进来 |
| `surface/project/src/features/content/domain/contentCanvasGraphReferences.ts` | content unit reference edge 支持 scene_moment、asset、keyframe、storyboard、resource 等 primitive/resource target | 继续保持 primitive/resource/content-unit 依赖边；增加 assembly edge；不要支持 `episode/act/timeline_namespace` reference edge 进入 selection gate |
| `surface/project/src/features/content/application/contentCanvasCreateNodeCommands.ts` | root create 支持 `production`，child create 支持 `production -> segment -> scene_moment`；默认 id 包含 `canvas_production`、`canvas_segment` | 高风险写入口；新结构应创建 timeline namespace node、scene_moment 或 timeline_assembly，旧 production/segment create 只作为 legacy command |
| `surface/project/src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts` | 直接创建 scene moment 时要求显式 production + segment，且可自动创建 production/segment，再创建 `scene_moment_ref` content unit | 需要改成先选择/创建 timeline namespace path，再挂 `scene_moment`；自动创建旧 production/segment 只能保留在 legacy wizard |
| `surface/project/src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts` | `createAssetCanvasNode` / `createAssetFromSettingState` 会创建 setting/state/asset，并确保 `asset_ref` content unit | 方向基本正确：asset 是 system resource slot，候选通过 `asset_ref` content unit；要调整的是 setting/state label 与 namespace vocabulary，而不是 candidate 边界 |
| `surface/project/src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts` | expression/keyframe/storyboard 创建依赖 `requiredSceneMomentRefs`，仍从 production/segment path 推导 parent | 这些 primitive 保留，但 parent 解析要从 normalized parent edge 获取；不能要求 scene_moment 必须在 segment 下才能创建视觉证据 |
| `surface/project/src/features/content/application/contentCanvasContentUnitCommands.ts` | `ensureContentUnitForRef` 只接受 `asset/scene_moment/expression_unit/keyframe/storyboard` target | 这是正确边界；增加 `timeline_assembly` 后仍排除 namespace |
| `surface/project/src/features/content/application/contentCanvasCandidateCommands.ts` | generate/upload/select 全部要求 `content_unit` node，后端请求也按 `contentUnitId` 走 | 这是最应该保留的生产边界；namespace node 不应拥有 generate/upload/select candidate 主动作 |
| `surface/project/src/features/content/application/contentCreativeCanvasActions.ts` | production node 显示“添加段落”，segment node 显示“添加情节”；scene_moment、expression_unit、asset 等节点可发起生成/上传/选择候选 | action model 要升级为 category-driven：timeline namespace 只能新增子 namespace、scene_moment、assembly；system primitive/assembly/content_unit 才能生成或选择候选 |
| `surface/project/src/features/content/application/contentCreativeCanvasDependencies.ts` | “命名空间依赖”只覆盖 `scene_moment -> expression_unit -> keyframe/storyboard`，并没有 timeline namespace | 命名要调整：这里实际是 primitive containment/dependency，不是用户 timeline namespace；未来 timeline namespace 依赖要从 normalized graph 输入 |
| `surface/project/src/features/content/application/contentCanvasLayout.ts` | layout 固定列为 `project -> production -> segment -> scene_moment -> content_unit -> candidate/resource` | 布局应按 category/role 排列：timeline namespace lane、system primitive lane、content unit/candidate lane；旧 production/segment 列只作为 legacy projection |
| `surface/project/src/features/content/application/loadContentCanvasProject.ts` | 并行 query `production`、`segment`、`scene_moment` 等固定 entity；editing timeline 只在 `scene_moment` 和 `production` targets 间切换 | loader 应读取 Project Service/read model 的 namespace/assembly projection；editing timeline 增加 `timeline_assembly` target，legacy production target 映射为 assembly |
| `packages/core/src/content/sourceWorkspaceEngine.ts` | 读取所有 productions，再为每个 production 读 preview timeline；production preview 被转成 `targetKind: "production"` editing timeline | production editing timeline 应变成 legacy assembly projection；新 assembly preview 不写回 `preview_timeline.production_id` |
| `packages/core/src/content/sourceWorkspaceData.ts` | `ContentSourceWorkspaceEditingTimeline.targetKind` 只有 `scene_moment | production`；`sourceParentRefs` 从 path 推导 `production_id/segment_id/scene_moment_id` | 加 `timeline_assembly` target；parent refs 改成 normalized parent/scope refs，旧字段保留兼容 |
| `packages/core/src/content/workbenchWriteModel.ts` | 拖动 content unit 到 timeline 时从 `unit.production_id` 或 row.productionIds[0] 取 production，并创建 `preview_timeline.production_id` / item.production_id | 旧 table/workbench flow 保留兼容；新 assembly timeline 不应通过 production_id 创建 preview timeline |
| `packages/core/src/production/orchestration.ts` | `productionOrchestrationEntityKinds` 和 defaults 仍包含 productions、segments、assetSlots、contentUnits，创建 defaults 会写 `production_id/segment_id` | 这是 legacy orchestration/table helper；不能继续承接新 namespace 字段 |
| `surface/project/src/features/content/components/useContentCanvasWorkspaceCreationCommands.ts` / `useContentCanvasWorkspaceController.ts` | UI dialog 仍有 createProduction、production 下建 segment、segment 下建 scene_moment 的操作链 | 新 UI 要从 template/vocabulary 初始化 namespace path；旧 production dialog 进入 compatibility 分组 |
| `surface/project/src/features/content/application/contentCanvasProjectEntrySession.ts` | project entry session 用 `canvasNode/node/kind` 保存焦点，默认 selectionKind 是 `scene_moment` | 这层可继续用 node id，但 selection kind 要能表达 namespace/assembly/content_unit；默认不应假设当前焦点是 scene_moment |
| `surface/project/src/features/project/domain/projectEntryRegistry.tsx` | `orchestration_production` entry 的 purpose/owns/reads/primarySelection 都以 production 为中心，`productionId` 是 primary selection | entry id 可以保留兼容；文案、owns/reads、selection 要转为 timeline namespace + scene_moment + assembly/content unit |
| `surface/project/src/features/project/presentation/projectOverviewModel.ts` | content canvas lane 在 `data.productions.length === 0` 时 blocked；script progress 也用 productions/segments/sceneMoments 计数 | 新项目不应因为没有 production entity 被阻塞；progress 应使用 namespace template、scene_moment、timeline_assembly/content_unit readiness |
| `surface/project/src/features/project/presentation/projectEntryDeckModel.ts` | deck restore 把旧 `scripts` snapshot 映射到 `orchestration_production`，并恢复 `productionId` search | 保留 legacy restore；新 snapshot/search 要支持 namespace/assembly focus，避免恢复时又落回 production route |

## CLI / skills / docs / tests 细化扫描

这一层决定 agent 和用户实际会怎样使用系统。即使 schema/read model 改对了，如果 CLI help、skill recipes、README 和 fixtures 仍持续推荐 `production -> segment -> scene_moment`，新项目还是会被写回旧模型。

| 文件/区域 | 当前行为 | 改造判断 |
| --- | --- | --- |
| `apps/cli/src/commands/lang.ts` | CLI 暴露 `production add`、`segment add`、`scene-moment add`；`segment add` 默认 `--production main`；`scene-moment`、storyboard、keyframe、audio cue、expression unit 和 content unit 都大量使用 `--production / --segment / --scene-moment` 定位 | 旧命令保留为 legacy convenience；新增 namespace-aware 命令应使用 `--scope`、`--namespace-path`、`--timeline-parent` 或等价 parent edge，不继续扩展成 `--episode/--act/--beat` |
| `apps/cli/src/commands/lang.ts` | parent parser 依赖 `parseSegmentRefOption`、`parseSceneMomentRefOption`、`parseStoryboardRefOption`，并在缺少 segment/scene moment 时直接报错 | 第一阶段可以继续接受旧 path；新 writer 应让 path parent 和显式 parent/scope refs 进入同一 normalized parent 解析，而不是在每个命令里硬编码 segments |
| `apps/cli/src/commands/lang.ts` | `content-unit add` 的 type help 推荐 `asset_ref/keyframe_ref/storyboard_ref/scence_moment_ref/expression_unit_ref`，但仍有 `--production`、`--segment` 和旧 `production_ref/segment_ref` 兼容 | 新增 `timeline_assembly_ref` 和 `--timeline-assembly`；`production_ref/segment_ref` 只在 help 中标注为 legacy assembly alias；不新增 `episode_ref/beat_ref` |
| `apps/cli/src/commands/lang.ts` | interactive slash help 仍把 `/production add`、`/segment add`、`/scene-moment add` 列为标准路径 | slash help 要加 namespace/template 初始化和 assembly 示例；旧 production/segment help 移到 compatibility 段 |
| `apps/cli/README.md` | 示例从 `production add`、`segment add`、`scene-moment add` 开始，教用户固定层级 | schema 决策后改成 namespace vocabulary/template + scene_moment + content unit/assembly 示例；迁移期先标 legacy |
| `plugins/movscript/skills/planning/SKILL.md` / `apps/plugin/skills/planning/SKILL.md` | planning skill 让 agent “decide production granularity”，并把 production/segment/scene_moment 作为规划层级 | 改成先决定 timeline namespace path 和输出中心；`scene_moment` 保持系统生产单位；production/segment 只作为旧 vocabulary 示例 |
| `plugins/movscript/skills/planning/references/entity-mapping.md` | 把 `production / episode / film unit` 直接映射到 `production`，把 `segment / rhythm section` 映射到 `segment`，并声明 canonical ownership 是 `production -> segment -> scene_moment` | 改成 timeline namespace vocabulary + path parent edge；不要把 episode 固定折叠成 production |
| `plugins/movscript/skills/planning/references/content-unit-recipes.md` | 推荐 `production_ref` 用 `target_kind: production`，`segment_ref` 用 `target_kind: segment` | 改成 `timeline_assembly_ref` 推荐路径；`production_ref/segment_ref` 标成 legacy assembly alias |
| `plugins/movscript/skills/domain/SKILL.md` / `domain-story.md` | domain story 把 `production`、`segment` 和 `scene_moment` 并列为 production structure；specialized adapters 列出 `production_ref/segment_ref` | 改成 namespace structure + system primitive；adapter 列表增加 `timeline_assembly_ref`，旧 ref 标 legacy |
| `plugins/movscript/skills/generation/SKILL.md` | generation skill 已经以 `scene_moment` / `expression_unit` 为中心，方向基本正确，但 status/focus 仍会引用 production readiness | 只需把 status/focus 语言升级到 project timeline scope / assembly；不要动摇 `scene_moment` production center |
| `plugins/movscript/skills/editing/SKILL.md` | production timeline composition 仍是主要聚合说法 | 改成 timeline assembly composition；production timeline 只是 legacy assembly bundle |
| `apps/plugin/skills/**`、`plugins/movscript/skills/**`、`apps/desktop/.codex/.claude/.mova/.agents/plugins/**` | 同一套技能存在 source、plugin copy、desktop bundled/catalog copy 多份 | 不手改各处副本；源 skill 改完后通过 plugin build/install 流程同步，并增加 drift check |
| `apps/plugin/bin/movscript-agent-mcp.mjs` / `plugins/movscript/bin/movscript-agent-mcp.mjs` | 打包 bundle 中仍内嵌 `domain_upsert_production_tree`、`productionTimelineBundle`、`productionId`、`production_ref/segment_ref` 等逻辑 | 这是构建产物，不手工 patch；源代码改完后重建，并用 grep/drift check 证明 bundle 语义已同步 |
| `packages/prompt/tests/content-unit-prompt.test.mjs` | 有测试明确验证 `{{segment:opening}}` 通过 `segment_ref` content unit 解析到 selected video resource | 保留为 legacy prompt-ref 兼容测试；新增测试证明 `{{episode::id}}` 不进入 selection gate，assembly 通过 `timeline_assembly_ref` 或 `{{content_unit::id}}` 进入 |
| `packages/interpreter/tests/integration/source-validation.test.mjs` / `artifacts.test.mjs` | 明确验证 `production_ref` 和 `segment_ref` 是合法 video primary refs、能生成 runtime panel/artifact | 保留为 legacy alias 测试；新增 `timeline_assembly_ref` artifact/stale/runtime panel 测试 |
| `packages/editing/tests/media-project.test.mjs` / `services/editing-service/tests/server.test.mjs` | `productionTimelineBundle` 和 media editing provenance 把 target 标为 production，project id 也拼 `production` | 新增 assembly target 测试；旧 production bundle 测试改成 legacy alias 断言 |
| `apps/desktop/src/features/agent/domain/workspaceDomainModel.test.ts` / `AgentRuntimeChatShell.test.ts` | workspace/handoff 测试断言 `production_workspace`、`productionId`、`scope = production` | 保留 legacy route 测试；新增 normalized focus 测试，证明 namespace/assembly/content unit focus 不被强行转成 production |
| `services/local-surface-host/src/routes/localRouteLinks.test.ts` | route test 只验证 URL path segment 和 project id segment，不验证 domain namespace focus | 新增 `timelineScopeId/namespacePath/timelineAssemblyId/focusedPrimitiveRef` query round-trip，并明确区分 URL segment 与 domain segment |

## 包级改造清单

### `packages/domain`（新增）

这是这次任务最终要建立的系统抽象中心。第一版目标不是包办所有 domain 逻辑，而是提供其他包必须共同消费的纯语义层：

- 新增 package `@movscript/domain`，保持无文件系统、无服务、无 UI 依赖。
- 导出 node category、system primitive kind、content unit target kind、relation edge kind、normalized focus 等稳定类型。
- 导出 namespace vocabulary/template helper，包含 `film / series / short_video / course / custom` 的默认模板。
- 导出 legacy projection helper：`production/segment -> timeline_namespace`，`setting/state -> setting_namespace`，`production_ref/segment_ref -> timeline_assembly`。
- 导出 content unit target normalizer 和 allowlist：namespace target 返回 diagnostic，system primitive / `timeline_assembly` 才允许进入生产。
- 导出 path parent edge normalizer：path 提供 containment edge，但固定目录名不再等同用户 vocabulary。
- 导出 invariant helper：namespace 不可拥有 content-unit-ref、candidate、selection；path parent 和显式 parent/scope refs 冲突时报 diagnostic。
- 导出 normalized focus helper：project、namespace path、timeline assembly、system primitive、content unit、legacy production focus 统一表达。
- 增加 package-level tests，作为所有下游 package 的迁移哨兵。

依赖方向必须守住：`@movscript/domain` 不依赖 `language/workspace/interpreter/core/surface`；这些包反过来消费它。

### `packages/language`

要先改这里，否则其他包只能继续绕旧 schema 做兼容：

- `project` schema 增加 `namespace_vocabulary`。
- 新增或投影 `timeline_namespace_node` / `setting_namespace_node` 的 read-model 类型。
- 增加 `timeline_assembly` system primitive schema，或者先定义为 derived/projection primitive。
- `content_unit.target_kind` 从语义上禁止 namespace target；旧 `production / segment / setting` target 进入 compatibility warning。
- `production` 和 `segment` 的 schema description 改成 legacy timeline namespace projection，不再说 production 一定是 makeable video unit。
- `asset_ref_content_unit_id` 这类 source record 反向指针要评估迁移，原则上由 read model 反查 content unit，避免 source prerequisite 承担 candidate/selection ownership。
- `SEMANTIC_ENTITY_KIND_VALUES` / `WORKSPACE_KIND_VALUES` 如果新增真实 entity，必须同步测试 schema registry、workspace model、MCP `domain_get_model`。

### `packages/workspace`

这一层是目录和 source 写入的核心风险：

- `domain/models.ts` 的 workspace model 先加 namespace vocabulary/context 说明，不急着改所有 path pattern。
- `layout/policy.ts` 保持旧 collection，但为未来 `timeline_assembly` 或 namespace projection 留出 entity kind。
- `repository/production.ts` 和 `repository/entities.ts` 保留 legacy writer；新增 namespace-aware writer 时要显式 parent/scope refs。
- `repository/contentUnits.ts` 增加 `timeline_assembly_ref` helper；`production_ref / segment_ref` 只作为 legacy alias。
- `indexer/domainIndex.ts` 从固定 path segment filter 升级为 normalized parent/ref query；旧 `productionId / segmentId / settingStateId` 查询保留为兼容入口。
- `root.ts` / `node/paths.ts` 的 `production` scope 不应被扩展成用户 namespace；它只是 runtime workspace scope。

### `packages/interpreter`

Interpreter 是 stale 正确性的核心，不能只做 UI rename：

- `entityChanges/index.ts` 的 stable id 不应依赖固定 path index。
- `sourceValidation/index.ts` 保留 path parent 校验，同时支持显式 parent/scope refs；固定目录名不再等同于唯一语义。
- `derivedArtifactHelpers.ts` / `relationGraph.ts` 建立 normalized relation graph：path-derived tree parent 和 explicit refs 统一成 parent/scope/target edges。
- `contentProductionAdapters.ts` / `contentProductionHelpers.ts` 增加 `timeline_assembly_ref`，并把 legacy `production_ref / segment_ref` 规范化到 assembly。
- `impactReport.ts` / `node/regeneration.ts` 只消费 normalized graph；namespace 影响通过 descendant primitive/assembly 传播。
- 需要新增回归测试证明：改 namespace title/order/intent 会影响对应 assembly 或 descendant primitive，但不会让 namespace 自己变成 content unit。

### `packages/core` 和 `surface/project`

这层决定用户会不会误以为 namespace 可以直接生成：

- `sourceWorkspaceData.ts` 增加 namespace projection tree，保留旧 arrays 给兼容功能。
- `sourceWorkspaceTypes.ts` / `contentCanvasTypes.ts` 区分 `namespace_node`、`system_primitive`、`content_unit`、`candidate/selection/resource`。
- `sourceWorkspaceTree.ts` 和 content canvas create commands 不再写死 `production -> segment -> scene_moment`；改为 namespace child rules + system primitive child rules。
- UI command model 对 namespace node 只显示“新增子 namespace / 新增 scene_moment / 新增 assembly / 编辑上下文”，不显示直接生成候选的主命令。
- 旧 surface semantic entity configs 和 production analysis/orchestration helper 标成 legacy/table-surface，不作为新 domain 依据。
- `contentCanvasTypes.ts` 的 node kind 不应把 `production/segment` 当唯一结构层；应增加 `namespace_node` 或 normalized category 字段，同时保留 legacy kind 投影。
- `contentCanvasWorkspaceSnapshot.ts` / `contentCanvasGraphReferences.ts` 的 parent/ref 查找不能继续只靠 `pathSegmentAfter(..., "productions" | "segments" | "scene_moments")`；应消费 normalized relation graph。
- `contentCanvasCreateNodeCommands.ts` 和 `contentCanvasContentUnitCreateNodeCommands.ts` 不应再默认自动创建 `canvas_production` / `canvas_segment`；应先创建 namespace path、scene_moment 或 timeline_assembly。
- `contentCreativeCanvasActions.ts` 的 `production -> segment -> scene_moment` action model 要升级为 namespace child rules；namespace node 不能出现 generate/upload/select candidate 主动作。
- `contentCanvasCandidateCommands.ts` 当前只对 `content_unit` 生成/上传/选择候选，这个边界应保留；不要为了 namespace node 增加直接 candidate action。
- `contentCanvasLayout.ts` 的固定列应从 kind-based 改成 category/role-based，避免新 vocabulary 被强行摆回 production/segment 列。
- `contentCanvasProjectEntrySession.ts` 可以继续保存 `nodeId`，但 `selectionKind` 要支持 namespace/assembly/content_unit，不默认把缺省焦点当成 scene_moment。
- `AgentPreviewTimelineSurface.tsx`、`ProjectOverviewSurface.tsx` 和 `ProjectSurfaceRouteView.tsx` 要把 `productionId` 改成 legacy focus，新增 assembly/timeline scope focus。
- `projectEntryRegistry.tsx` 的 `orchestration_production` id 可以作为 legacy route id 保留，但 entry purpose、owns/reads、primary selection 和 review query 应转向 timeline namespace + scene_moment/assembly。
- `projectOverviewModel.ts` 的 progress/blocking 不应以 `data.productions.length === 0` 作为新项目是否可推进的唯一条件；应以 namespace template、scene_moment、assembly/content unit readiness 计算。

`packages/core/src/production/orchestration.ts`、`workbenchWriteModel.ts`、`sourceWorkspaceData.ts` 和 `sourceWorkspaceEngine.ts` 要单独处理：它们是旧 content workbench/table flow，仍会创建 `preview_timeline.production_id`、`preview_timeline_item.production_id`，并把 editing timeline 标成 `targetKind = "production"`。这些入口短期可作为 legacy compatibility，但新 namespace/assembly 不应继续往这里扩展字段；新 flow 应走 normalized read model 和 Editing Service assembly target。

### `packages/engine` 和 Project Service

这层是 API/write boundary：

- `ProjectSourceCommandName` 需要新增 namespace-aware command，旧 `createProduction/createSegment` 保留兼容。
- `MovScriptEngine*Input` 的 `productionId/segmentId` 是 legacy facade；新 flow 使用 `timelineScopeId/namespacePath/timelineAssemblyId/focusedPrimitiveRef`。
- `writeHierarchyNode` / `updateEntityBasics` 不能继续只通过 `targetPath` 里的 `productions/segments/scene_moments` 推导上下文。
- `saveProduction/saveSegment/saveSceneMoment` 的默认 `productionId = "main"` 要限制在 legacy writer；namespace-aware 空项目不能被隐式写成 main production。
- `ensureContentUnitForEntity` 当前只支持 primitive target，这是好方向；需要增加 `timeline_assembly`，但继续排除 namespace。
- `saveContentUnit` / `defaultContentUnitOutputKind` 增加 `timeline_assembly_ref`，并把 `production_ref/segment_ref` 迁到 alias path。
- `readProjectResourceView` 的 `episodes -> production`、`scenes -> segment` 需要改成 vocabulary-aware projection。
- Project Service 的 candidate/prompt endpoint 已经要求 `contentUnitId`，这是正确边界，避免扩展成 namespace candidate endpoint。
- MCP tool descriptions 要把 production/segment 解释为 legacy namespace，不再教 agent 把 namespace 当作 content unit target。

### `packages/prompt` 和 generation

Prompt compiler 直接影响 dependency gate：

- 不建议支持 `{{episode::id}}`、`{{act::id}}`、`{{timeline_namespace::id}}` 作为稳定生成依赖。
- 如果 prompt 需要引用 namespace 上下文，应由 prompt builder 展开为文本上下文，而不是要求该 namespace 有 selected candidate。
- 稳定资源依赖继续走 `{{asset::id}}`、`{{storyboard::id}}`、`{{keyframe::id}}`、`{{scene_moment::id}}`、`{{expression_unit::id}}`、`{{content_unit::id}}`、`{{candidate::id}}`、`{{resource::id}}`。
- 若 assembly output 需要作为上游资源，新增 `{{timeline_assembly::id}}` 或通过 `{{content_unit::id}}` 引用它对应的 content unit；两者择一，避免双轨。
- generation payload 层主要消费 compiled prompt 和 resource ids，改动较小；风险集中在 prompt compiler 和 content unit adapter。

### `packages/editing` 和 Editing Service

`timeline_assembly` 会落到剪辑/合成边界：

- edit plan artifact 不应长期要求 `productionId/productionPath`；应有 `target_kind = "timeline_assembly"`、`target_ref`、`scope_ref`。
- production timeline bundle 可以先作为 legacy assembly bundle。
- scene moment timeline bundle 保持稳定，因为 `scene_moment` 仍是系统生产单位。
- media editing project provenance 需要能记录 assembly target，避免继续把所有聚合视频都标成 `targetKind: production`。

### `apps/cli`

CLI 是迁移时最容易继续制造旧项目结构的入口：

- `production add` / `segment add` / `scene-moment add` 第一阶段保留为 legacy convenience command。
- `segment add` 目前默认 `--production main`，新 namespace writer 不应复制这个默认值，否则空项目会被隐式塑造成电影 production。
- `parsePlanningParentOptions`、`parseStoryboardParentOptions`、`parseAudioCueParentOptions`、`parseExpressionUnitParentOptions` 等 helper 现在都围绕 `productionId/segmentId/sceneMomentId`；应新增 normalized parent 解析层，避免每个命令单独理解 `segments` 路径。
- 新增 namespace-aware 命令时，不应直接叫 `episode_ref` 或 `act_ref`；应创建 namespace node、scene moment 或 timeline assembly。
- `content-unit add` 当前支持 `--production`、`--segment`，后续应将 `production_ref / segment_ref` 标为 legacy assembly alias。
- `content-unit add` 要新增 `--timeline-assembly <id-or-path>`，对应 `content_unit_type = "timeline_assembly_ref"`。
- `content-unit add` 可以继续用 `--scene-moment`、`--expression-unit`、`--storyboard`、`--keyframe`、`--asset`，因为这些是 system primitive 或资源槽；不能新增 `--episode` 这类 namespace production target。
- interactive help 和 README 示例要标注 `production/segment` 是 legacy vocabulary，推荐新项目从 project vocabulary/template 初始化。

### `services/data-service`

Data Service 不应该成为 namespace source schema 的一部分。它的职责是存后端候选、selection、job 和 RawResource。

当前扫描结论：

- `DecisionContext` / `ProjectDataDecisionContext` 是通用 `target_kind/target_ref` 表。
- `contentcandidate.Service.Generate` 创建 job 时写入 `ContentUnitCandidateBinding`。
- `ContentUnitCandidateBinding.TargetKind` 固定为 `content_unit`。
- candidate reconcile 只查询 `target_kind = "content_unit"`。
- job 成功/失败同步候选时也只通过 content unit candidate binding 回写。
- `packages/decision/src/index.ts` 仍定义 `asset / storyboard / keyframe / content_unit` target kind；这是旧 inline candidate helper 的共享类型，不代表后端 content-candidate 要扩展到 namespace。

这说明 namespace 改造不需要让后端支持 `target_kind = "episode"`、`"act"` 或 `"timeline_namespace"`。相反，应保持：

```text
namespace -> system primitive / timeline_assembly -> content_unit -> backend candidate/selection
```

如果未来 `timeline_assembly` 需要生成、导入或选择成片，也应创建 `timeline_assembly_ref` content unit，再由 Data Service 存这个 content unit 的候选和 selection。

旧 `asset / storyboard / keyframe` inline decision helper 可以保留兼容，但不能继续扩展。后续如果要让这些输出拥有完整 stale/selection gate，应优先通过 `asset_ref / storyboard_ref / keyframe_ref` content unit 表达，而不是在 decision target kind 里加入更多 namespace。

### `packages/project`、MCP contracts 和 agent protocol

这些包主要是 API contract 和 host context，不应该反推 source schema。

当前扫描结论：

- `packages/project/src/index.ts` 的 `ProjectResourceViewKind` 仍包含 `episodes / productions / scenes / segments`。
- `ProjectSourceCommandName` 仍只有 `createProduction / createSegment / createSceneMoment`，缺少 namespace/assembly command。
- `packages/mcp-contracts/src/index.ts` 的 context snapshot 仍有 `productionId`。
- `packages/agent-protocol/src/agentConversationProtocol.ts` 仍允许传 `productionId`。
- `packages/agent-chat/src/chat/agentChatServerRequests.ts` 会把 `contentUnitId`、`targetKind` 等参数展示给 agent/user。

推荐策略：

- 第一阶段保留这些字段作为 compatibility context。
- 新增 namespace-aware 上下文时，不要把 `productionId` 改名成 `episodeId`；应增加更中性的 `timeline_scope`、`namespace_path`、`timeline_assembly_id` 或 `focused_primitive_ref`。
- Source command 也要新增 neutral command，例如 `createTimelineNamespaceNode`、`createTimelineAssembly` 或等价 projection command；旧 `createProduction/createSegment` 不继续扩展自定义层级。
- Resource view 的 `episodes / productions / scenes / segments` 可以继续作为旧入口，但返回内容要能带用户 vocabulary label。
- Agent-facing summary 应逐步从 `production_status_summary` 迁移到 `project_timeline_status` 或等价 schema；旧 schema 作为 alias 保留。

### `packages/mcp-host` 和 runtime status

MCP host 是 agent 进入 MovScript 的第一层入口，因此它的 legacy focus 语言会明显影响 agent 后续行为。

当前扫描结论：

- `movscript_runtime_status` 入参支持 `projectId` 和 `productionId`。
- runtime status 会把 `productionId` 拼进 Local Surface Host URL query。
- `inspectProjectSource` 用 `settings / content_units / productions / scripts` 判断项目是否是 MovScript project。
- Local Surface URL 固定生成 overview/content/timeline 路由，并把 common query 传给 surface。
- 目前它只负责 query 拼接，无法传递 `namespacePath/timelineAssemblyId/focusedPrimitiveRef`。

推荐策略：

- `productionId` 保留为 legacy focus，但 tool description 应说明它不是用户 timeline namespace。
- 新增 namespace focus 时，runtime status 应支持 `timelineScopeId`、`namespacePath` 或 `timelineAssemblyId`，并把它们传给 surface URL。
- 项目识别应逐步从固定目录名转向 workspace layout policy、`project.json` metadata 和 source collection 组合判断。
- runtime status 是只读入口，不应承担 namespace 解释；它只传递 focus，真正解释发生在 Project Service/read model。

### Agent Chat、provider protocol 和 decision request

Agent/protocol 层的正确边界是“展示和转发上下文”，不是定义 domain target。

当前扫描结论：

- `AgentConversationWorkspaceScope` 仍是 `global | project | production`。
- `AgentConversationWorkspaceContext` 仍包含 `productionId`。
- `AgentRuntimeChatShell.tsx` 从 route/query 推导 `scope = production`，`agentConversationNormalize.ts` 只接受 `scope = production` 时携带 `productionId`。
- `agentCommandInput.ts` 会从 `productionId` 推断 `pageEntityType = production`。
- `MovScriptWorkspaceKind` 仍有 `production_workspace` 和 `content_unit_workspace`。
- `AgentAttachment.generated` 可以携带 `contentUnitId`、`candidateId`、`resourceId`。
- `agentChatMovScriptDecisionResponse` 会把 `projectId/contentUnitId/candidateId/resourceId/targetKind/targetPath` 放进 decision metadata。

推荐策略：

- `contentUnitId/candidateId/resourceId` 是正确稳定边界，应保留。
- `production` workspace scope 和 `production_workspace` 标为 legacy；新增 `timeline_scope_workspace`、`timeline_assembly_workspace` 或更中性的 project timeline workspace。
- runtime workspace scope 不扩展 episode/act；新增 normalized focus 字段和 page context 字段。
- command input 先消费 normalized focus/read model，再回退 productionId legacy route hint。
- decision request 可以展示 namespace label，但实际 decision metadata 不应把 namespace 作为 `targetKind`。
- `targetKind` 进入 user-facing request 前要经过 normalized target 校验，避免 agent 请求用户对 `episode`、`act` 这类 namespace 做 adopt/reject。
- 生成附件如果来自 namespace scope 输出，也应归属到 `timeline_assembly_ref` content unit，再携带 `contentUnitId/candidateId/resourceId`。

### Agent Browser Surfaces 和 Project Entry

Agent surface 是 agent 给用户打开 review/inspect 页面时的正式入口，不能继续只围绕 production focus。

当前扫描结论：

- `packages/core/src/agent/surfaces.ts` 的 `createPreviewTimelineSurface` 入参必须是 `productionId`，surface title、entity 和 query 都写 `production_id/productionId`。
- `createProjectStatusSurface` 也把 `productionId` 作为可选 entity/query，并在 usage 中写 production readiness。
- `apps/desktop/src/pages/agent/AgentPreviewTimelinePage.tsx` 没有 productionId 就不会 fetch snapshot。
- `surface/project/src/components/AgentPreviewTimelineSurface.tsx` 在没有 `productionId` 时直接显示 `Missing productionId`，标题是 `Production preview`。
- `surface/project/src/components/AgentProjectStatusSurface.tsx` 从 `summary.productions[0]` 取 content units，并显示 `Productions` 计数。
- `surface/project/src/components/AgentImpactSurface.tsx` 会从 `targetPath` 的 `productions/{id}` 解析 productionId，再生成 preview link。
- `surface/project/src/features/project/domain/projectEntryRegistry.tsx` 的入口 id/stage 仍是 `orchestration_production`，primary selection 是 `productionId`，`owns/reads` 包含 production/segment/scene_moment。
- `projectOverviewModel.ts` 用 `data.productions.length`、`data.segments.length`、`data.sceneMoments.length` 计算项目入口进度，并把没有 production 视为 content canvas blocked。

推荐策略：

- Agent surface entity/query 增加 `timelineScopeId`、`namespacePath`、`timelineAssemblyId`、`contentUnitId`；`productionId` 只作为 legacy focus。
- Preview timeline surface 的长期目标应是 assembly preview，而不是 production preview；没有 assembly 时可以从 namespace scope 反查可用 assembly 或提示创建 assembly。
- Project status surface 的数据结构从 `productions[]` 升级到 timeline namespace/assembly/readiness projection。
- Impact surface 的 preview link 从 normalized target/assembly/content unit 生成；path regex 只做 legacy fallback。
- Project entry id 可以保留 `orchestration_production` 做路由兼容，但 UI title/purpose/selection 应按 project vocabulary 展示，不把 production 当唯一蓝图入口。
- Project overview 的 progress/blocking 应以 namespace template、scene_moment/system primitive、assembly/content unit readiness 计算；不能再用 `productions.length === 0` 阻塞新项目。

### Local/Web Surface Host 和 Desktop Semantic API

这层风险比普通展示层高，因为它会把 UI 操作写回 workspace。

当前扫描结论：

- `services/local-surface-host/src/project/LocalProjectSurfaceHostRoute.tsx` 会从 query 中读取 `productionId`，并合成 `movscript.production_status_summary.v1`。
- `services/local-surface-host/src/project/localProjectSurfaceRuntime.ts` navigator 会把 productionId 继续写回每个 project surface URL。
- `services/local-surface-host/src/routes/localRouteLinks.ts` 的 `projectRouteContext` 只解析 productionId，没有 neutral focus。
- `services/web-surface-host/src/main.tsx` 也把 `productionId` 传给 `ProjectSurfaceRouteView`。
- `services/local-surface-host/src/host-runtime/infrastructure/api/semanticEntities.ts` 还有一套 host runtime semantic entity adapter，把 `segments` 映射到 `segment`、`productions` 映射到 `production`、`settingStates` 映射到 `setting_state`。
- `apps/desktop/src/shared/infrastructure/api/semanticEntityWorkspace.ts` 的 writable kinds 包含 `productions / segments / sceneMoments`。
- Desktop writer 创建 segment 和 scene moment 时强制要求 `production_id / segment_id`，并调用 `saveProductionSnapshot` 写回旧目录树。

推荐策略：

- Host route 的 `productionId` 保留为 legacy focus，不应继续代表唯一 timeline namespace。
- 新增 namespace focus 时，路由层应接受 `timelineScopeId` 或 `namespacePath`，并在 read model 中投影到当前 vocabulary。
- Local/Web host runtime 应原样转发 normalized focus，避免只有 Desktop 能打开 namespace-aware surface。
- `movscript.production_status_summary.v1` 在 host 内部作为 legacy alias；新 status snapshot 应来自 Project Service/read model 的 timeline projection。
- Local Surface Host 的 semantic adapter 应改为消费 Project Service/read model projection，不要在 host runtime 里维护第二套 fixed vocabulary。
- Desktop semantic entity writer 是优先改造点：namespace-aware writer 出现后，这里要先接入，否则用户在 UI 里创建结构时仍会落回旧 production/segment 语义。
- `sceneMoment` writer 可以保留，但 parent 参数应从 `production_id + segment_id` 逐步升级为 `timeline_parent_ref` 或 normalized parent edge。

### Desktop Agent workspace 和 Admin history

这层不直接定义 source schema，但会影响 agent 如何理解“当前用户正在看的对象”。

当前扫描结论：

- `apps/desktop/src/shared/contracts/workspaceChangeHandoff.ts` 会把 `production_workspace` 路由到 scripts workbench，并用 `productionId` 作为 review focus。
- `apps/desktop/src/features/agent/domain/workspaceDomainModel.ts` 在 `content_unit_workspace` 指向 production 时也会回退到 production scripts workbench。
- `AgentRuntimeChatShell.tsx` 会从 URL query 中提取 `productionId`，`agentCommandInput.ts` 会据此推断 `pageEntityType = production`。
- `workspaceChangeHandoff.ts` 的 `content_unit_workspace` 已能落到 content preview，这是正确方向，但 production target 会绕回 scripts workbench。
- `agentSessionGenerationProjection.ts` 和相关测试仍把 `production_workspace` 显示为“制作工作区”。
- `surface/admin/src/types/index.ts` 和 `surface/admin/src/i18n/locales/*.json` 仍保留 `asset_slot`、`segment`、`scene_moment`、`production_workspace`、`content_unit_workspace` 等历史类型和标签。

推荐策略：

- `production_workspace` 和 `content_unit_workspace` 第一阶段作为 legacy workspace alias 保留，避免打断已有 review/handoff。
- 新增 focus payload 时使用中性字段，例如 `timelineScopeId`、`namespacePath`、`timelineAssemblyId`、`contentUnitId` 或 `focusedPrimitiveRef`。
- Agent command input 不应仅凭 `productionId` 推断当前对象是 production；应优先消费 read model 返回的 normalized focus。
- content unit / scene moment review path 优先进入 content preview；namespace scope output 进入 assembly/content unit review。
- Admin/workspace history 可以继续保存原始 legacy kind，但展示标签应逐步来自 project vocabulary/read model，而不是硬编码成 schema 事实。
- 如果历史记录指向 namespace scope 输出，review path 应落到 `timeline_assembly_ref` content unit 或 content preview，而不是让 namespace 自己成为 review target。

### Desktop Electron runtime bridge

Electron 这一层更像 runtime/context bridge。它不应该定义用户 namespace，但如果继续只传 `productionId`，agent 和 provider session 仍会被拉回旧 focus。

当前扫描结论：

- `apps/desktop/src/electron/ElectronMCPContextBridge.tsx` 只在 scripts route 上解析 `productionId`，再写入 MCP context。
- `apps/desktop/src/shared/contracts/electronApiWorkspaceContext.ts` 和 `providerConfigModel.ts` 的 workspace scope 仍是 `global | project | production`。
- `apps/desktop/electron/services/workspaceRealm.ts` 看到 `scope = production` 时仍把 workspace 归到 project dir/provider session cwd，不单独解释 production source。
- `apps/desktop/electron/services/projectEngineRegistry.ts` 会把 content unit 的 `production_ref / segment_ref / scene_moment_ref` 还原成 runtime fields。
- `apps/desktop/electron/ipc/movscriptEngineIpc.ts` 和 preload API 仍暴露 `createProduction`、`createSegment`、`saveProductionSnapshot`。
- `apps/desktop/electron/services/mediaPipeline/**` 中的 `segment` 主要是 HLS/timeline media segment，不属于 domain namespace 改造。

推荐策略：

- Electron workspace scope 的 `production` 保留为 legacy runtime scope，短期不直接替换成 episode/act。
- MCP context bridge 新增 normalized focus payload，例如 `timelineScopeId`、`namespacePath`、`timelineAssemblyId`、`focusedPrimitiveRef`。
- workspace realm 继续负责 cwd/realm，不负责解释 namespace；namespace 解释在 Project Service/read model。
- Project engine registry 应把 `production_ref / segment_ref` 规范化成 assembly alias，再交给 runtime snapshot。
- Engine IPC 的旧 create production/segment API 保留兼容，但 namespace-aware writer 出现后应新增中性 create namespace/assembly API。
- 媒体管线里的 HLS segment、timeline segment 不进入 domain namespace 改造。

### Canvas、Resource 和 Shot Library

这些 surface 更像工作台和资源入口，不应该变成新的 domain source schema。

当前扫描结论：

- `surface/canvas/src/types.ts` 仍声明 `SemanticEntityKind = script | segment | scene_moment | setting | asset_slot | content_unit`。
- Canvas 已经有测试确保不暴露 entity push action，这对 namespace 改造是好信号。
- `surface/canvas/src/features/presentation/useWorkbenchCanvasLauncher.ts` 只有 `assets / production` 两类 workbench kind。
- `surface/resource/src/resourceCandidateAttachPanel.tsx` 仍支持把资源加入 `asset_slot` 或 `keyframe` candidate。
- `packages/shared/src/workspaceCandidates.ts` 仍是 asset slot/keyframe candidate client。
- `packages/decision/src/index.ts`、`packages/workspace/src/repository/inlineCandidates.ts` 和 `packages/workspace/src/repository/candidates.ts` 仍支持 legacy `asset / storyboard / keyframe` inline candidate target。
- `surface/project/src/features/content/domain/contentCanvasGraphReferences.ts` 会把 asset、keyframe、storyboard 作为候选/引用 target 进入 canvas graph。
- Shot Library 的 `production_facets` 是检索分类，不等同于 source domain 的 production。

推荐策略：

- Canvas 保持 workflow/resource surface；如果某个 canvas 输出要进入生产流程，应注册为 content unit candidate 或 RawResource，再由 selection 稳定化。
- Canvas 的 `production` workbench 文案可以改成 `content_generation` 或按 project vocabulary 显示，但不要让 canvas 直接把 namespace 作为 content unit target。
- Resource surface 的旧 `asset_slot` 候选入口应逐步收敛到 `asset_ref` content unit candidate；`keyframe` 候选同理收敛到 `keyframe_ref` content unit candidate。
- Inline candidate/decision helper 只能作为 legacy 入口保留；不要新增 `episode / act / timeline_namespace / setting_namespace` target kind。
- Storyboard/asset/keyframe 的直接候选 target 应逐步变成对应 content unit candidate，或者明确标成未完全纳入 stale/selection gate 的 legacy path。
- Shot Library 可以继续叫 shot/reference shot；导入 MovScript source 时映射成 `expression_unit(role=shot)`、storyboard、keyframe 或 content unit，不恢复 `shot_ref`。

### Plugin bundle 和 release artifact

`apps/plugin` 和 `plugins/movscript` 里有大量生成/打包产物，它们会把当前 domain 语义固化到 agent 实际运行环境。

当前扫描结论：

- `apps/plugin/bin/movscript-agent-mcp.mjs` 和 `plugins/movscript/bin/movscript-agent-mcp.mjs` 是打包后的 agent MCP runtime。
- 这些 bundle 内嵌 content unit adapter、preview timeline、Data Service decision target、source layout、Project Service proxy 等逻辑。
- `plugins/movscript/runtime/services/local-surface-host/dist/**` 是打包后的 surface host 前端资源。
- 技能文档位于 `apps/plugin/skills/**` 和 `plugins/movscript/skills/**` 两套位置，存在 drift 风险。
- Desktop 内还有 `.codex/.claude/.mova/.agents/plugins/**` 下的 bundled/catalog skill 副本，这些也是构建/安装结果，不应手工分叉维护。

推荐策略：

- 不手工 patch bundle；先改 source package，再通过构建流程生成 `apps/plugin` 和 `plugins/movscript` 产物。
- 每次 domain schema/adapter/tool description 改动后，都要同步重建 agent MCP bundle 和 plugin release。
- 增加一个轻量 drift check：plugin skills、desktop bundled skill、bundled MCP、source package version 或 manifest runtime version 必须能证明来自同一轮构建。
- release notes 要明确旧 `production/segment` 是 legacy projection，避免用户安装旧插件后 agent 继续写旧语义。

### Agent plugin / docs / tests

这层要在源语义稳定后一起迁移：

- `plugins/movscript/skills/*` 和 `apps/plugin/skills/*` 里的 production/segment/setting/state 语言要换成 namespace + primitive。
- `README`、CLI 示例、runtime architecture 文档中的固定路径说明要标注 legacy。
- 测试分两批：第一批覆盖 projection/compatibility；第二批在 source layout 变化时再大规模改路径 fixture。

技能文档里优先要改这些位置：

- `planning/references/entity-mapping.md`: `production / episode / film unit -> production` 要改成 timeline namespace vocabulary。
- `planning/references/content-unit-recipes.md`: `production_ref` / `segment_ref` 改成 legacy assembly alias，新推荐是 `timeline_assembly_ref`。
- `planning/references/planning-workflows.md`: “Create production, segment, scene moments” 改成 “choose timeline namespace path, then create scene moments”。
- `domain/references/domain-story.md`: “production granularity decision” 改成 “timeline scope / production center decision”，避免把 granularity 和固定 production entity 绑定。
- `generation/SKILL.md`: `system_focus_get` 和 status summary 中的 production 语言要改成 legacy/project timeline scope。
- `editing/SKILL.md`: production timeline composition 改成 timeline assembly composition。

文档和示例入口也要一起改，否则用户和 agent 仍会学习旧模型：

- `apps/plugin/README.md` 和 `plugins/movscript/README.md`: source paths 里的 `productions/**`、planning upserts 里的 production/segment/shot 需要标注 legacy，并引导到 namespace + primitive。
- `apps/cli/README.md`: `production add`、`segment add`、`scene-moment add` 示例要改成 legacy command 或新增 namespace/assembly 示例。
- `docs/movscript-agent-runtime-architecture.zh-CN.md`: Project Service source command、resource view、Editing Service timeline view、Surface status page 中的 production/segment 语言需要同步为 projection/assembly 语义。
- `docs/TODO.md`: prompt ref、content unit ref 和 scene moment 相关 TODO 要和“namespace 不作为 selected resource dependency”保持一致。

### 测试迁移策略

测试不能一次性全部重写，否则会同时失去 legacy compatibility 保护。建议分三类：

| 测试类别 | 保留/新增 | 目的 |
| --- | --- | --- |
| Legacy compatibility fixtures | 保留 `productions/{id}/segments/{id}`、`settings/{id}/states/{id}` 路径 | 证明旧项目仍能读取、解释、生成 stale report |
| Namespace projection fixtures | 新增 `project.json.namespace_vocabulary` + legacy source projection | 证明 UI/read model/agent context 能显示用户 vocabulary，但 source layout 不必先变 |
| New semantic fixtures | 新增 explicit parent/scope refs、`timeline_assembly_ref`、namespace node 不含 content-unit-ref | 证明新语义成立，且 namespace 不进入 candidate/selection |

第一阶段最值得新增的测试：

- `packages/domain`: category/target/ref/path/focus/invariant 的纯函数测试；证明 namespace target 被拒绝、legacy production/segment ref 投影为 assembly、path parent edge 保留但不决定用户 vocabulary。
- `packages/language`: project schema 接受 `namespace_vocabulary`。
- `packages/core`: read model 能把 legacy production/segment 投影成 timeline namespace。
- `packages/interpreter`: legacy `production_ref/segment_ref` 在 normalized graph 中投影为 implicit assembly。
- `packages/interpreter`: `timeline_assembly_ref` content unit 能进入 artifact/stale/prompt adapter。
- `surface/project`: namespace node 无直接 generation command，assembly/primitive 有 generation command。
- `surface/project`: content canvas create/layout/navigation 不再把 production/segment 固定成唯一结构列和唯一 parent chain。
- `surface/project`: content canvas candidate generation/upload/select 仍只对 `content_unit` 生效；namespace node 没有 direct candidate action。
- `surface/project`: direct scene-moment creation 不再必须先创建/选择 production + segment；它应选择 timeline namespace path 或 normalized parent edge。
- `surface/project`: project entry/overview 能以 namespace vocabulary、scene_moment 和 assembly readiness 计算进度，不再以 `productions.length === 0` 阻塞内容入口。
- `packages/core`: old content workbench write model 只作为 legacy compatibility；新 assembly preview 不写入 `preview_timeline.production_id`。
- `packages/core`: `ContentSourceWorkspaceEditingTimeline.targetKind` 支持 `timeline_assembly`，legacy production timeline 投影到 assembly。
- `packages/core/src/agent`: preview/status browser surface 支持 `timelineScopeId/namespacePath/timelineAssemblyId`，`productionId` 只是 legacy query。
- `packages/prompt`: `{{episode::id}}` 不作为 selected resource dependency；`{{content_unit::id}}` 或 `{{timeline_assembly::id}}` 才进入 selection gate。
- `services/data-service`: content candidate generation/reconcile 继续只写 `target_kind = "content_unit"`。
- `services/local-surface-host` / `services/web-surface-host`: `productionId` 仍可作为 legacy focus，但 namespace focus 能投影到 status summary。
- `apps/desktop`: semantic entity writer 不再把新 namespace 创建强制写成 production/segment。
- `surface/resource`: 新资源挂载优先创建 content-unit candidate，不把 namespace 当候选目标。
- `surface/shot-library`: reference shot 导入不产生 `shot_ref`，只产生 expression/storyboard/keyframe/content-unit 映射。
- `packages/mcp-host`: runtime status 能传递 namespace/assembly focus，project source detection 不只依赖 `productions` 目录。
- `packages/agent-protocol` / `packages/agent-chat`: decision metadata 不允许 namespace target；`production_workspace` 只作为 legacy alias。
- `apps/plugin` / `plugins/movscript`: domain source 改动后 bundle/skills 通过 drift check，证明已同步构建。

现有测试里优先要当迁移哨兵的文件：

- `packages/interpreter/tests/integration/source-validation.test.mjs`、`artifacts.test.mjs`、`service-flows.test.mjs`、`service-writers.test.mjs`、`workspace-api.test.mjs`: 覆盖 legacy path、normalized graph、writer 和 service flow。
- `packages/interpreter/tests/integration/source-validation.test.mjs` 中 `production_ref/segment_ref` 合法性的断言不要删除，应改名为 legacy assembly alias 兼容测试；旁边新增 `timeline_assembly_ref` 的规范路径测试。
- `packages/interpreter/tests/integration/artifacts.test.mjs` 中 `production_ref/segment_ref` runtime panel/artifact 测试应继续证明旧项目能解释，同时新增 assembly runtime panel、stale impact 和 dependency report。
- `packages/core/tests/mcp*.test.mjs`、`packages/core/tests/content/*.test.mjs`: 覆盖 MCP tool contract、source workspace read model 和 content unit 入口。
- `packages/core/tests/content.test.mjs`、`packages/core/tests/production.test.mjs`、`packages/core/src/content/workbenchWriteModel.ts` 对应测试：覆盖 legacy production orchestration/workbench 不被新 namespace 继续扩展。
- `surface/project/src/features/content/application/contentCanvasArchitecture.test.ts`、`contentCanvasWorkspaceCommandModel.test.ts`、`projectEntryRegistry.test.ts`、`projectOverviewModel` 相关测试：覆盖 canvas graph/action/layout/create command/candidate action 和 project entry/overview 的 namespace projection。
- `surface/project/src/features/content/integrations/contentSourceWorkspaceElectron.test.ts`、`packages/core/src/content/sourceWorkspaceData.ts` 对应测试：覆盖 source workspace parent refs 不再只从 `productions/segments` 推导。
- `surface/project/src/components/AgentPreviewTimelineSurface.tsx` 和 `packages/core/src/agent/surfaces.ts` 对应测试：覆盖 preview/status surfaces 可用 assembly/timeline focus，不再强制 `productionId`。
- `packages/prompt/tests/content-unit-prompt.test.mjs`: 保留 `{{segment:opening}}` 解析到 legacy `segment_ref` selected resource 的测试，同时新增 prompt ref 不直接把 namespace 作为 selected resource dependency 的测试。
- `packages/editing/tests/media-project.test.mjs`、`packages/editing/tests/service-client.test.mjs`、`services/editing-service/tests/server.test.mjs`: 覆盖 `productionTimelineBundle` 作为 legacy assembly alias，以及新 assembly target 的 MediaEditingProject provenance。
- `packages/project/tests/client.test.mjs`、`services/project-service/tests/server.test.mjs`: 覆盖 resource view/read model 的 vocabulary projection。
- `apps/desktop/src/shared/contracts/workspaceChangeHandoff.test.ts`、`apps/desktop/src/features/agent/domain/workspaceDomainModel.test.ts`、`AgentRuntimeChatShell.test.ts`、`agentSessionGenerationProjection.test.ts`: 覆盖 workspace/handoff 不再只靠 `productionId`。
- `apps/desktop/electron/services/projectEngineRegistry.test.ts`、`apps/desktop/electron/services/movscriptWorkspaceRoot.test.ts`、`apps/desktop/src/electron/ElectronMCPContextBridge.tsx` 对应测试：覆盖 runtime bridge 把 legacy production focus 投影成 normalized focus。
- `services/local-surface-host/src/routes/localRouteLinks.test.ts` 和 local host semantic entity adapter 的新增测试：覆盖 URL route segment 与 domain namespace segment 的区分。
- `apps/desktop/src/features/agent/domain/agentGeneratedResourceBinding.test.ts`、`agentGenerationUiContract.test.tsx`: 覆盖资源挂载收敛到 content unit candidate，不扩展到 namespace。
- `packages/workspace` inline candidate tests、`packages/decision` helper tests、`surface/project` content canvas graph tests：覆盖 legacy inline target kind 不扩展到 namespace。
- `packages/shot-library/tests/shot-library.test.mjs`: 覆盖 shot reference 只作为检索/参考词，不恢复 `shot_ref`。

## 不需要立即改的东西

有些旧词看起来相关，但不应在第一阶段一起重构：

- Data Service 的 `DecisionContext.target_kind` 表结构：它可以保持通用，应用层只要继续把候选绑定到 content unit。
- RawResource、provider asset certification、provider-generated artifact trust：这些是资源和供应商 provenance，不是 namespace source schema。
- `.interpret/**` debug artifact 路径：先当作 derived artifact，等 normalized graph 稳定后再调整输出形态。
- Runtime workspace scope 的 `production`：这是 agent/provider session 的运行上下文，不等同于用户 timeline namespace。
- 旧 surface semantic entity / asset_slot 表格式配置：先作为 legacy UI/API 投影，等 source workspace 语义稳定后再决定是否废弃。
- Project client、MCP context、agent protocol 里的 `productionId`：第一阶段作为 legacy focus/context 保留，新增 namespace focus 不应破坏旧调用。
- Agent protocol 里的 `production_workspace` 和 `scope = "production"`：第一阶段作为 legacy workspace scope 保留，不立即重命名破坏 provider session。
- MCP host 的 Local Surface URL 中 `productionId` query：保留兼容，但新增 namespace focus 时不能复用它表达 episode/act。
- Shot Library 里的 `shot` 和 `production_facets`：这是检索/参考库 vocabulary，不等同于 source domain 的 `shot_ref` 或 production entity。
- Media Pipeline/HLS 里的 `segment`：这是媒体切片术语，不属于 domain namespace 改造范围。
- Desktop Electron media pipeline 里的 timeline segment、HLS segment、`segmentPaths`：这些是剪辑/编码执行细节，不是 timeline namespace。
- `packages/ui` 里的 `.production-*` CSS class、README/site/release notes 里的泛化 “production” 文案：不定义 source schema；可等产品文案统一时再改。
- `apps/desktop/out/**`、`services/data-service/bin/**`、`plugins/movscript/runtime/**/dist`、agent MCP bundle 和 `test-results/**`：这些是生成产物或测试输出，不手工修；等 source 语义稳定后通过构建流程重产或清理。

## 验收口径

这次抽象改造是否完成，不能只看 UI 能否改名。至少要满足下面这些证据：

- 新增 `@movscript/domain` package，且 language、workspace、interpreter、core、surface、MCP/agent 相关入口开始消费它的 category、target、ref、path edge、focus 和 invariant，而不是各自复制规则。
- `project.json` 能声明 namespace vocabulary，并被 read model、UI、MCP/agent planning 读取。
- language schema / registry 能表达 namespace vocabulary、timeline assembly 和 legacy projection，且 `production` 不再被描述为唯一 makeable video unit。
- 新写入的 namespace node 不包含 `content_unit_ref/content_unit_refs/main_content_unit_id` 这类字段。
- 新建 content unit 时不能把 `target_kind` 设为 timeline namespace 或 setting namespace。
- `scene_moment` 仍能作为固定 system primitive 被创建、查询、生成、进入 stale graph。
- 需要 namespace scope 输出时，通过 `timeline_assembly_ref` content unit 进入生产流程。
- 旧 `production_ref / segment_ref` 在 normalized graph 中等价于 implicit `timeline_assembly_ref`，并有测试覆盖。
- relation/stale graph 消费 normalized edge；树状父子关系可以来自 path，target/scope/cross-tree 关系来自显式 refs。
- UI 中 namespace node 没有直接“生成候选/选择候选”的主流程；assembly 和 system primitive 才有。
- Content Canvas 的 node kind、layout、create action 和 candidate action 能区分 namespace node 与 system primitive；不会默认创建 `canvas_production/canvas_segment` 作为新结构前置。
- Project Entry/Overview 不再把 `orchestration_production`、`productionId` 或 `productions.length` 当成唯一项目进度和 review 入口。
- prompt compiler 不把任意 namespace ref 当成必须 selected candidate 的资源依赖。
- Editing Service 能接收 assembly target 或明确把 legacy production timeline bundle 投影为 assembly。
- Agent Browser preview/status surfaces 支持 timeline scope 或 assembly focus；`Missing productionId` 不再阻塞新模型路径。
- Agent surface snapshot/status 不再固定输出 `movscript.production_status_summary.v1` 和 `productions[]`，或明确把它们标为 legacy alias。
- Core legacy content workbench 的 production orchestration/write model 被明确隔离为 compatibility，不接收新 namespace 语义扩展。
- CLI、MCP 和 agent skills 不再推荐新建 `production_ref / segment_ref` 作为普通 production unit；只作为 legacy assembly alias。
- Engine/MCP tree upsert 不会自动给 namespace scope 创建 `production_ref/segment_ref` content unit；只有显式 assembly 才进入 content unit。
- Project Service resource view 不再把 `episodes/scenes` 直接硬映射为 production/segment ontology，而是返回 vocabulary-aware projection。
- Data Service content-candidate generation/reconcile 仍只绑定 `target_kind = "content_unit"`。
- Desktop semantic entity writer、local/web surface host、Project client 能把旧 `productionId` 当 legacy focus 处理，同时支持 namespace-aware focus/projection。
- Desktop Agent workspace/handoff 和 command input 能消费 normalized focus；`productionId` 只作为 legacy route hint。
- Desktop Electron MCP context、workspace scope、project engine registry 和 engine IPC 能把旧 production/segment 字段投影到 normalized focus/assembly，不把用户 namespace 塞进 runtime scope。
- Local/Web project route context、navigator 和 agent pages 能原样传递 `timelineScopeId/namespacePath/timelineAssemblyId/focusedPrimitiveRef`。
- Agent impact surface 从 normalized target 生成 preview/review link，path regex 只是 legacy fallback。
- Local Surface Host semantic entity adapter 不再维护固定 production/segment vocabulary，而是消费 Project Service/read model projection。
- Admin/workspace history 的标签来自 read model/vocabulary 或明确标注 legacy，不反向定义 source schema。
- Canvas、Resource、Shot Library 不会直接把 namespace node 写成 candidate 或 content unit target。
- Inline candidate/decision helper 不新增 namespace target；legacy `asset/storyboard/keyframe` direct target 有迁移说明或收敛到 content unit candidate。
- MCP host/runtime status 能传递 namespace/assembly focus，但不负责解释 namespace。
- Agent decision request 的 adopt/reject/defer 只落到 content unit candidate/resource 或明确的 system primitive/assembly target，不落到 namespace node。
- Plugin 技能和打包 MCP runtime 与 source package 语义同步，没有旧 bundle 继续发布新旧混合行为。
- README、CLI 示例、runtime architecture 文档和 TODO 不再把 production/segment 当成唯一推荐层级；旧说法必须标注为 legacy projection。

## 推荐改造路径

### Phase 0：锁定语义约束

先把文档和 schema intent 定住：

- 用户拥有 namespace vocabulary。
- 系统拥有 behavior category 和 system primitive。
- Namespace node 不能成为 content unit target。
- Namespace source record 不能保存 content-unit-ref 反向指针。
- `scene_moment`、`asset`、`keyframe`、`storyboard`、`expression_unit`、`audio_cue`、`timeline_assembly` 是稳定 system primitive。
- 旧 `production_ref / segment_ref` 是 implicit `timeline_assembly` 的兼容投影。

### Phase 1：建立 `@movscript/domain`

先建立纯领域抽象 package，让后续迁移都有同一个语义中心：

- 新增 `packages/domain` / `@movscript/domain`。
- 定义 category、system primitive、content unit target、relation edge、normalized focus。
- 实现 legacy projection：`production/segment/setting/state` 投影到 namespace；`production_ref/segment_ref` 投影到 assembly。
- 实现 invariant：namespace 不作为 content unit target，不拥有 content-unit-ref，不拥有 candidate/selection。
- 实现 path parent edge normalizer：path 是 containment source，不是用户 vocabulary source。
- 增加 package-level tests，作为下游迁移的哨兵。

这一阶段完成后，后续 package 只接入 `@movscript/domain`，不再复制 namespace/target/ref 判断。

### Phase 2：project.json vocabulary + read-model projection

先不改 source layout，只做用户可见和 agent 可理解的抽象：

- 在 `project.json` 增加 `namespace_vocabulary`。
- legacy `production / segment / setting_state` 投影成 namespace node。
- UI 展示 vocabulary alias。
- agent planning 使用 vocabulary，但写入仍落回 legacy writer。
- `scene_moment` 仍作为固定生产单位显示在 timeline leaf 下。

这一阶段的目标是验证产品语言，而不是迁移存储。

### Phase 3：normalized domain graph

引入内部规范化模型，但继续读取旧路径：

- 建立 `timeline_namespace_node` / `setting_namespace_node` 的 read-model projection，或等价的 normalized node 类型。
- 建立 `timeline_assembly` primitive projection。
- content unit adapter 增加 `timeline_assembly_ref`。
- `production_ref / segment_ref` 在 normalized graph 中解释为 assembly alias。
- namespace 的影响通过 descendant primitive 和 assembly 传给 content unit。

### Phase 4：normalized relation graph

Interpreter 不应在每个模块里各自解析目录，也不应抛弃目录父子关系。推荐做法是先建立统一的 normalized relation graph：

- path-derived tree parent 继续作为 parent edge，例如 `productions/x/segments/y` 推导出 `segment -> production`。
- 新写入节点在需要消除歧义时补 `parent_ref`、`scope_ref`、`target_ref` 等显式关系。
- relation graph 统一消费 normalized edges，而不是让 stale、prompt、preview timeline 各自解析目录。
- source validation 校验 path parent 与显式 parent/ref 是否冲突；缺失显式 refs 先 warning，不立即 error。
- impact/stale 只看 normalized graph，不再各自解析目录。

### Phase 5：namespace-aware writer/API/UI

当 projection 稳定后，再改写入入口：

- 新增 namespace-aware create/update API。
- UI 支持递归 timeline namespace 和 setting namespace。
- namespace node 的主要操作是“新增子 namespace / 新增 scene_moment / 新增 assembly / 编辑上下文”，不是“生成内容”。
- Content Canvas 改成 category-driven action model，不再用 production/segment 固定列和固定 parent chain。
- Agent Browser surfaces、Project Entry、Project Overview 同步支持 namespace/assembly focus。
- Legacy content workbench/production orchestration helper 冻结为 compatibility，不继续承接新 namespace 字段。
- `domain_upsert_production_tree`、`domain_upsert_segment`、`domain_upsert_setting_tree` 继续保留为 legacy convenience API。

### Phase 6：评估 source layout migration

最后才决定是否迁移磁盘结构：

- 如果 directory path + explicit refs 已经足够，可以不迁移。
- 如果递归 namespace 让旧路径过于别扭，再设计 `timeline/**`、`setting_graph/**` 或 flat records。
- 迁移必须包含旧项目升级、回滚策略、diff 可读性、测试夹具和 agent skill 更新。

## 主要风险和缓解

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 没有统一 domain package，各层重复实现 namespace/target/ref 规则并逐渐分叉 | 高 | 先建立 `@movscript/domain`，所有 package 只消费它的 category、normalizer、focus 和 invariant |
| 直接把 namespace 加进 `content_unit.target_kind` 导致 adapter 无限扩张 | 高 | 只允许 system primitive target；namespace scope 通过 `timeline_assembly` 进入生产 |
| 先迁移目录布局导致 interpreter、UI、MCP 同时断裂 | 高 | 先做 projection 和 normalized graph，布局最后决定 |
| path-derived stale graph 在递归 namespace 下误判影响范围 | 高 | normalized relation graph：path 保留 parent edge，显式 refs 补 scope/target/cross-tree edge |
| `scene_moment` 被误改成用户 tag，导致 generation center 消失 | 高 | 保留 `scene_moment` semantic type，仅允许 UI alias |
| setting namespace 多父级导致继承、覆盖和 asset ownership 混乱 | 中高 | 第一阶段保持单父级树，用 refs 表示组合 |
| 旧 `production_ref / segment_ref` 语义不清 | 中高 | 明确定义为 implicit `timeline_assembly` alias |
| Project Service/MCP resource kind 与新 vocabulary 不一致 | 中 | resource view 做 projection，旧工具保留兼容语义 |
| MCP host/runtime status 继续把 `productionId` 当唯一 focus，导致 agent planning 回到旧结构 | 中 | `productionId` 标为 legacy focus；新增 namespace/assembly focus，只在 Project Service/read model 解释 |
| Desktop Agent workspace/handoff 继续只从 URL `productionId` 推断当前对象 | 中 | command input 和 review path 消费 normalized focus；旧 `production_workspace` 只作为 route alias |
| Electron runtime bridge 把用户 namespace 误塞进 `scope = production` | 中 | runtime scope 保留 legacy；新增 normalized focus payload，Project Service/read model 负责解释 |
| Local/Web Surface route 只传 `productionId`，导致 namespace/assembly surface 无法打开 | 中 | project route context 和 navigator 透传 normalized focus；productionId 仅 legacy |
| Local Surface Host semantic adapter 继续维护固定 vocabulary，和 Project Service read model 分叉 | 中 | host adapter 消费 read model projection，不再自建 production/segment/setting_state 词汇映射 |
| Agent Browser preview/status surface 强制 `productionId`，新 namespace/assembly 项目无法进入 review | 中 | surface entity/query 支持 timeline scope 和 assembly focus；productionId 只做 legacy query |
| Agent surface status 继续合成 `production_status_summary.v1`，让 agent 以为 production 是唯一状态单位 | 中 | 新增 project timeline/status schema；production summary 作为 alias |
| Agent decision request 允许 namespace target，被用户 adopt/reject 后形成伪稳定状态 | 中高 | decision metadata 只允许 content unit candidate/resource 或 system primitive/assembly target |
| inline candidate helper 被继续扩展，出现 `episode/act` 这类 legacy direct target | 中高 | 冻结 inline target kind；新增生成/选择流统一进入 content unit candidate |
| content canvas 命令误给 namespace node 创建生成任务，或自动创建 `canvas_production/canvas_segment` | 中 | UI command model 按 node category 控制；namespace 只反查相关 work items，新创建走 namespace/primitive/assembly |
| Project overview 用 `productions.length === 0` 阻塞内容入口 | 中 | progress/blocking 基于 namespace template、scene_moment、assembly/content unit readiness |
| legacy content workbench write model 继续扩展 production timeline 字段 | 中 | 标为 compatibility；新 assembly preview 走 normalized read model 和 Editing Service |
| generated plugin bundle/agent skill 与源代码语义漂移 | 中 | 源语义稳定后重新构建 bundle、更新技能和 manifest，并加 drift check |
| README/架构文档/CLI 示例继续教旧 production/segment 层级 | 中 | schema 决策后同步更新 docs/examples；迁移期统一标注 legacy projection |

## 设计原则

1. 用户拥有 namespace 命名权。
2. 系统保留 namespace 行为分类。
3. System primitives 保持系统类型稳定。
4. Content unit 保持唯一生产任务入口。
5. Namespace node 不能直接成为 content unit target。
6. Namespace source record 不保存 content-unit-ref 反向指针。
7. Candidate 和 selection 不写回 namespace node。
8. `scene_moment` 保持固定系统生产单位，只允许 UI alias。
9. Stale impact 追踪语义依赖，而不是只追踪路径。
10. Path 父子关系是默认 parent edge 来源；先抽象 read model，再评估是否真的需要迁移 source layout。

## 建议决策

### Namespace vocabulary 放在 project.json

Namespace vocabulary 应放在 `project.json`，不放在 `project_standards.json`，第一阶段也不单独拆文件。

原因是 namespace vocabulary 是项目结构配置，不是创作风格标准。它决定 UI、agent planning、read model、writer 和 interpreter 如何理解项目层级，应该在读取项目根信息时就能拿到。

推荐概念形态：

```json
{
  "namespace_vocabulary": {
    "timeline": {
      "template": "series",
      "kinds": ["series", "season", "episode", "act", "sequence", "beat"],
      "scene_moment_alias": "scene"
    },
    "setting": {
      "kinds": ["character", "costume", "state", "voice_state"]
    }
  }
}
```

`project_standards.json` 仍然只放风格、镜头、画面、负面提示词、生成偏好等创作标准。后续如果 namespace 配置变得很大，可以再迁移到独立文件，例如 `namespace_vocabulary.json`，但第一阶段不建议过早拆分。

### Timeline namespace 需要默认模板

Timeline namespace 需要 project-level 默认模板，但模板只能是起步脚手架，不应成为硬编码 ontology。

推荐提供这些内置模板：

- `film`: `film / act / sequence / beat`
- `series`: `series / season / episode / act / sequence / beat`
- `short_video`: `video / hook / proof / demo / cta`
- `course`: `course / lesson / section / point`
- `custom`: 用户完全自定义

模板的作用是降低空项目启动成本，并帮助 agent 选择合理的初始规划语言。模板不应该决定系统行为；系统行为仍来自 domain 分类：timeline namespace、setting namespace、system primitive、content unit。

### Setting namespace 第一阶段保持单父级树

Setting namespace 第一阶段应保持单父级树，不做多父级组合。

原因是 setting namespace 承担 identity、inheritance、override、consistency 和 asset ownership。多父级会让“谁继承谁”“谁覆盖谁”“asset 属于谁”“stale 影响传给谁”变得过早复杂。

需要复用或组合时，先用显式 refs 表达关系，而不是让一个节点拥有多个 parent。例如：

```text
character/laozhang
  state/base
  state/injured

costume/police_uniform
  state/clean
  state/damaged
```

某个 scene moment 或 expression unit 可以同时引用 `character/laozhang.state/injured` 和 `costume/police_uniform.state/damaged`。如果一个 costume 真的是可复用实体，它就应该是独立 setting namespace root，而不是挂在多个 character 下面。

长期可以支持 composition refs，例如 `uses_setting_refs`、`applies_to_refs`、`variant_of_ref`，但不要把它们等同于 parent。

### scene_moment 需要 UI alias，但 semantic type 固定

`scene_moment` 在不同项目里需要 UI alias，但 source semantic type 应保持 `scene_moment`。

不同项目里用户说法会不同：

- 电影：场、场面、事件
- 剧集：scene、moment
- 短视频：段落、hook moment、demo moment
- 音乐视频：情绪段、视觉段

但系统仍需要稳定知道它是 `scene_moment`，因为它是 timeline namespace 和系统生产 primitive 的边界点。UI alias 只影响展示、按钮文案、agent 面向用户的表达，不改变 schema、content unit adapter、prompt ref 和 stale graph。

### content_unit.target_kind 不指向 namespace，旧 ref 作为 assembly 兼容投影

`content_unit` 应引入规范化 target 语义，同时兼容现有 `production_ref`、`segment_ref`、`scene_moment_ref`、`asset_ref`。

关键约束是：namespace node 不能直接成为 content unit target。

推荐兼容规则：

| 旧 content unit | 规范化 target | 说明 |
| --- | --- | --- |
| `production_ref` | `target_kind = "timeline_assembly"` | 旧 production_ref 兼容为 production scope 下的隐式 assembly target |
| `segment_ref` | `target_kind = "timeline_assembly"` | 旧 segment_ref 兼容为 segment scope 下的隐式 assembly target |
| `scene_moment_ref` / `scence_moment_ref` | `target_kind = "scene_moment"` | scene moment 是 system primitive |
| `asset_ref` | `target_kind = "asset"` | asset 是 system primitive/resource slot |
| `keyframe_ref` | `target_kind = "keyframe"` | keyframe 是 system primitive |
| `storyboard_ref` | `target_kind = "storyboard"` | storyboard 是 system primitive |
| `expression_unit_ref` | `target_kind = "expression_unit"` | expression unit 是 system primitive |

新结构下的 content unit 不建议生成 `episode_ref`、`act_ref`、`beat_ref` 这种无限扩展的 adapter，也不建议生成 `timeline_namespace_ref`。更稳的做法是为需要产出的 namespace scope 创建一个系统级 assembly primitive：

```json
{
  "kind": "timeline_assembly",
  "id": "episode_01_main_cut",
  "scope_kind": "timeline_namespace",
  "scope_namespace_kind": "episode",
  "scope_ref": "episode_01",
  "assembly_kind": "main_cut",
  "title": "Episode 01 Main Cut"
}
```

然后让 content unit 指向这个 assembly：

```json
{
  "kind": "content_unit",
  "content_unit_type": "timeline_assembly_ref",
  "output_kind": "video",
  "target_kind": "timeline_assembly",
  "target_ref": "episode_01_main_cut"
}
```

也就是说，自定义的是 namespace scope 的 kind，不是 content unit target 的 kind。`content_unit_type` 仍然代表系统知道如何做依赖、prompt、output kind 和 stale tracking 的 adapter。

### Prompt ref 不直接引用 namespace

Prompt ref 也应遵守同一条边界：namespace 可以提供上下文，但不提供稳定 selected resource。

因此不建议支持下面这类 ref 作为生产依赖：

```text
{{episode::episode_01}}
{{act::act_02}}
{{timeline_namespace::beat_03}}
```

原因是 prompt compiler 现在会把语义 ref 解析到 upstream content unit，并要求它有 selected candidate/resource。如果 namespace ref 进入这套 selection gate，就等于再次要求 namespace 自己拥有 content unit 或候选输出。

推荐规则：

- namespace context 由 prompt builder 展开为文本、顺序、intent、约束和 descendant primitive 摘要。
- 稳定资源依赖继续引用 system primitive、content unit、candidate 或 resource。
- assembly output 如果需要作为上游资源，可以引用 `timeline_assembly` 的 content unit，或者新增 `{{timeline_assembly::id}}`，但不要同时保留两套等价语法。

### Editing target 从 production 升级到 assembly

剪辑和合成层也不应长期把 `production` 当作唯一聚合目标。

当前 production timeline / production edit plan 可以兼容解释为 legacy assembly：

```text
production timeline bundle -> timeline_assembly(scope = legacy production)
segment timeline bundle -> timeline_assembly(scope = legacy segment)
scene moment timeline bundle -> scene_moment
```

长期形态应是 editing artifact 接收 `target_kind = "timeline_assembly"`、`target_ref`、`scope_ref`，而不是必须携带 `productionId / productionPath`。`scene_moment` timeline bundle 可以保持稳定，因为它本来就是系统生产单位。

### Stale graph 使用 normalized relation graph

Interpreter 的 stale graph 不应该直接散落地解析路径，也不应该丢掉路径父子关系。更稳的边界是：path 和 explicit refs 都进入 normalized relation graph，stale graph 只消费 normalized edges。

推荐顺序：

1. 先建立 normalized relation graph。
2. 对树状 source，从路径推导 parent relation，例如 `productions/x/segments/y` 推导出 `segment -> production`。
3. 显式 refs 表达 path 不适合表达的关系，例如 `target_ref`、`scope_ref`、`scene_moment_ref`、`asset_ref`、`setting_state_ref`。
4. 如果同一个 parent 同时来自 path 和 `parent_ref`，validation 要校验二者一致；冲突时应报 diagnostic。
5. stale graph 只消费 normalized relation graph，不再直接解析路径。
6. writer 只有在递归 namespace、跨树组合、assembly scope 或迁移兼容需要消除歧义时，才必须补显式 parent/scope refs。

这样可以避免一次性迁移所有项目，同时保留目录树的 Git 可读性和父子关系表达能力。系统要摆脱的是“固定目录名即唯一语义”，不是摆脱 path 本身。
