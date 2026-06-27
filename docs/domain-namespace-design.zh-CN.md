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

### 避免两个结构信息源

自定义 namespace 加上 path，确实容易让系统出现两个结构信息源。这个风险必须通过职责分离来消掉。

系统不变量是：实例父子关系只有一个 canonical source，默认来自 path。namespace vocabulary / profile 只定义允许使用和展示的结构词汇，例如 `episode / act / beat`，不定义“某个 episode 下面有哪些 act”这类实例树。实例树仍然由 source path 表达。

更关键的是：project 本身不应该携带一个唯一 timeline 结构。一个 project 可以同时包含短视频、电影、剧集单集或课程小节等多个“制作”，所以业务形态应在创建 production 时选择，并记录为 production type。`film / video / episode / lesson / custom` 是 production 的类型模板，不是 timeline 实例层级。`project.json` 最多保存可选的 vocabulary registry、setting namespace 默认值或兼容旧项目的 `namespace_vocabulary`，不应在新建 project 时写入一个 selected timeline template。

即使某个制作选择了 `film`、`episode`、`lesson` 这类默认类型，也只能作为内部时间命名空间的推荐、UI alias 和 agent planning hint，不能成为第二棵实例树。模板可以回答“这个 production 推荐使用 act / sequence / beat”，但不能回答“这个具体 beat 的父节点是谁”。后者必须来自 path，或来自被 validation 证明和 path 不冲突的显式 parent/scope ref。

也就是说：

```text
production root production_type / timeline_namespaces / optional vocabulary registry
  -> 定义 production 类型、推荐内部 vocabulary / alias
  -> 不定义具体 node parent
  -> 可以建议内部层级顺序，但不自动实例化父子关系

source path
  -> 定义具体 node 的 parent / containment
  -> 不独占用户 vocabulary

record.kind / namespace_kind
  -> 说明这个 node 使用哪个 vocabulary kind
  -> 不重复声明 parent

explicit refs
  -> 只表达 path 不适合表达的关系
  -> scope / target / cross-tree / assembly / migration disambiguation
```

所以一个 timeline namespace node 的最小信息应更像：

```json
{
  "id": "beat_01",
  "kind": "beat",
  "title": "Opening discovery",
  "order": 1,
  "intent": "establish the mystery"
}
```

它属于哪个 episode/act，默认从 path 得到，而不是再写一个 `parent_scope_id`。只有当项目进入递归 namespace、flat layout、跨树组合或迁移兼容时，才允许补 `parent_ref` / `scope_ref`，并且 validation 必须校验它和 path parent 一致。

实现层面，显式结构 ref 和 path parent 同时存在时，冲突应报 `path_parent_ref_conflict`。例如一个 `segment.json` 放在 `timeline/episode_01/...` 下，却写 `parent_ref: "episode_02"` 或 `scope_ref: "episode_02"`，应被视为结构冲突，而不是让系统同时相信两套父子关系。同理，`storyboard` / `keyframe` 的 `scene_moment_ref`、`expression_unit_ref` 也必须和它们所在的 path owner 一致；`audio_cue.expression_unit_ref` 可以细化声音 cue 所属表达单元，但不能跨出 owning scene moment。

换句话说，系统可以有多个 edge origin，但不能有多个同等权威的 parent truth：

| 信息 | canonical source | 说明 |
| --- | --- | --- |
| 允许哪些层级词 | 制作 root `production_type` / `timeline_namespaces` / optional vocabulary registry | 词汇表和模板；project 不选定唯一 timeline |
| 某个节点的树状父级 | path | 默认唯一 parent truth |
| 某个节点的用户层级名 | node `kind` / vocabulary kind | 例如 episode、act、beat |
| 生产目标 | content unit `target_ref` | 只能指向 system primitive / assembly |
| 聚合范围 | assembly `scope_ref` | 指向 namespace scope，但 namespace 自己不生产 |
| 跨树依赖 | explicit refs / prompt refs | 不适合用 path 表达 |

`@movscript/domain` 的一个重要职责就是把这些 origin normalize 成一张 relation graph，并在出现冲突时给 diagnostic，而不是让 workspace、interpreter、UI 各自选一个 source 当真。

## Namespace Vocabulary

项目可以声明可选的 namespace vocabulary registry，但它不等于“这个 project 的 timeline”。timeline vocabulary 的有效选择发生在创建制作时；setting vocabulary 可以作为 project 级默认，因为角色、服装、状态等设定结构往往跨多个制作复用。asset / asset slot 是 setting state 下的系统 primitive，不应作为默认 setting namespace 层级。

下面只是概念形态，不是最终 schema：

```json
{
  "namespace_profiles": {
    "production_type": {
      "video": {
        "timeline_namespaces": ["hook", "proof", "demo", "cta"]
      },
      "film": {
        "timeline_namespaces": ["act", "sequence", "beat"]
      },
      "episode": {
        "timeline_namespaces": ["act", "sequence", "beat"]
      },
      "lesson": {
        "timeline_namespaces": ["segment"]
      },
      "custom": {
        "production_type": "<user-defined>",
        "timeline_namespaces": []
      }
    },
    "setting": {
      "default": ["character", "costume", "state"]
    }
  }
}
```

制作 root timeline namespace 持有实际 profile：

```json
{
  "kind": "production",
  "id": "promo_01",
  "namespace_kind": "production",
  "production_type": "video",
  "timeline_namespaces": ["hook", "proof", "demo", "cta"],
  "title": "Launch Promo"
}
```

这些词汇用于 UI、agent planning 和 source/read-model 表达。系统不应假设 `episode` 一定比 `act` 长，也不应假设 `segment` 在所有制作里都是同一种颗粒度。颗粒度、时长和拆分策略应由节点字段、制作 profile 或项目规范补充，而不是从名称硬编码推断。

模板不自动创建 production 内部实例树。创建 production 只写一个 production root；`timeline_namespaces` 只是后续“添加内部层级”时的推荐顺序。电视剧的 series / season 更适合作为 production tag、筛选条件或用户自定义字段；真正要生产的一集是一个 `production_type = "episode"` 的 production。

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

同理，namespace source record 也不应该保存 `candidates`、`selection`、`selected_candidate_id`、`selected_resource_id`、`resource_id` 这类生产状态字段。Candidate 和 selection 属于 content unit 的候选/决策流，或属于 system primitive 的迁移兼容入口；一旦写回 namespace node，namespace 就会重新变成隐性生产单位。

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

当前已新增 package：

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
| `vocabulary` | namespace vocabulary、timeline templates、fallback/default order、root/child namespace kind 推导、setting namespace rule、scene_moment alias | language、project、surface、agent planning |
| `categories` | `timeline_namespace`、`setting_namespace`、`system_primitive`、`content_unit`、`candidate_resource` 等行为分类 | workspace、interpreter、surface |
| `targets` | content unit target allowlist、legacy target warning、`timeline_assembly` target 规则 | language、workspace、interpreter、core、MCP |
| `refs` | `production_ref/segment_ref` -> assembly alias、primitive refs、prompt ref kind 边界 | interpreter、prompt、engine、CLI |
| `path-edges` | 从 source path 规范化 parent edge，但不把固定目录名当用户 vocabulary | workspace、interpreter、content canvas |
| `path-semantics` | 统一声明 path 是实例树 canonical source，namespace vocabulary 只是 labels/templates/aliases | workspace model、MCP、agent skills |
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
function assertNamespaceCannotOwnProductionState(input: SourceEntityLike): Diagnostic[]
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

- project 创建保持干净，不写 selected timeline template。
- 创建制作时选择 production type，例如 `video / film / episode / lesson / custom`，并把推荐内部时间层级写到 root production 的 `timeline_namespaces`。
- 在 project 级别只保留可选 vocabulary registry、setting namespace 默认值或 legacy `namespace_vocabulary` 兼容读取。
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
| Domain abstraction package | 已新增 `@movscript/domain`；category、target/ref、path edge、path semantics、focus、namespace invariant、vocabulary fallback/next-kind 已进入纯 TS package，仍需继续迁移剩余 UI/host/workbench 逻辑 | 各层继续消费 `@movscript/domain`，停止复制 production/segment、path、target、focus 和 vocabulary 顺序规则 | 中 |
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
| Domain abstraction | `packages/domain` | 已建立纯 TS 语义内核：分类、target allowlist、legacy projection、path edge、path semantics、normalized focus、namespace invariant、namespace vocabulary fallback 和 child-kind 推导；normalized focus 已接受 `timelineAssemblyRef` / `timeline_assembly_ref` URL alias；language/workspace/interpreter/core/surface 已开始消费 | 继续把剩余 package-specific production/segment/path/focus 判断迁到 `@movscript/domain`，尤其是 host runtime、legacy workbench、editing target 和更细的 surface label/summary |
| Language schema | `packages/language/src/domain/schemaTypes.ts`, `packages/language/src/domain/schemas.ts` | project schema 已声明 namespace vocabulary/template；production/segment 文案已改成 legacy timeline namespace projection；content unit schema 已加入 `timeline_assembly` target，并把 production/segment 标成 legacy alias | 继续保留 schema-level compatibility；强约束由 `@movscript/domain` target normalizer 和 interpreter validation 执行 |
| Workspace model | `packages/workspace/src/domain/models.ts` | editable/context path pattern 固定为 `productions/{production}/segments/{segment}/...` 和 `settings/{setting}/states/{state}/...` | 第一阶段只能做 projection；如果直接递归 namespace，会影响所有 domain model path pattern |
| Source layout policy | `packages/workspace/src/layout/policy.ts` | source collection 固定为 `settings / scripts / content_units / productions / project_standards`，entity files 固定为 production、segment、setting_state 等 | 新 collection 或递归布局要先有兼容层，不能让 layout policy 先变成破坏性迁移 |
| Repository writers | `packages/workspace/src/repository/production.ts`, `packages/workspace/src/repository/entities.ts`, `packages/workspace/src/repository/contentUnits.ts` | production tree writer 和 setting tree writer 生成固定路径；asset 需要 setting_id + setting_state_id；content unit writer 识别 production_ref/segment_ref | 新写入路径要 parent-aware；旧 writer 保持为兼容 API；禁止 writer 给 namespace source record 反向挂 content-unit-ref、candidate、selection 或 resource 状态 |
| Indexer/query | `packages/workspace/src/indexer/domainIndex.ts` | query 通过 path segment 匹配 productionId、segmentId、settingId、settingStateId、sceneMomentId | 需要 normalized parent/ref 索引；路径继续提供 layout parent edge，但查询语义不能只认固定目录名 |
| Interpreter validation | `packages/interpreter/src/sourceValidation/index.ts` | 用固定正则校验每种 entity 路径；setting state/asset 归属通过目录前缀验证 | 需要从“路径正则即语义”升级到“path parent edge + schema/category + ref 一致性校验” |
| Entity change id | `packages/interpreter/src/entityChanges/index.ts` | `sourceEntityKindFromRelativePath` 按文件名识别 kind，`stableDirectoryIdForSourceEntity` 按固定 path index 取 id | 递归 namespace 或新 layout 会先撞到这里；必须让 stable id 来自显式 id/ref，而不是目录位置 |
| Derived parent graph | `packages/interpreter/src/artifacts/derivedArtifactHelpers.ts`, `packages/interpreter/src/artifacts/relationGraph.ts` | parent relation 先由最近父目录推导；content unit relation 再由 specialized adapter 补 refs | normalized relation graph 应把 path-derived tree parent 和 explicit refs 合并成统一 edge；path parent 不是 legacy-only |
| Stale/impact | `packages/interpreter/src/artifacts/impactReport.ts`, `packages/interpreter/src/node/regeneration.ts` | impact 已通过 relation graph 追踪 namespace context：上层 timeline namespace / setting namespace 变更可沿 path parent edge 影响 descendant primitive、assembly content unit 和 asset_ref content unit；legacy production/segment impact 映射到 implicit assembly；regeneration plan 已优先读取 latest impact report artifact | 继续让 status/read model 直接消费 normalized impact，而不是重新按 production/segment 解析路径 |
| Content unit adapters | `packages/interpreter/src/artifacts/contentProductionAdapters.ts`, `packages/interpreter/src/artifacts/contentProductionHelpers.ts`, `packages/workspace/src/previewTimeline.ts` | adapter 只认 `production_ref / segment_ref / asset_ref / keyframe_ref / storyboard_ref / scene_moment_ref / expression_unit_ref` | 增加 `timeline_assembly_ref`；`production_ref / segment_ref` 保留为 assembly alias；不新增 `episode_ref / act_ref / timeline_namespace_ref` |
| Core read model | `packages/core/src/content/sourceWorkspaceData.ts`, `packages/core/src/content/sourceWorkspaceEngine.ts`, `packages/core/src/content/sourceWorkspaceTypes.ts` | snapshot 已携带 namespace vocabulary/domain graph；`sourceWorkspaceEngine` 已从 `timeline_assembly_ref` content unit scope 读取 scope-aware preview timeline，并生成 `targetKind = "timeline_assembly"` 的 MediaEditingProject timeline；旧 production preview timeline 继续作为 legacy editing timeline | 继续让剩余 workbench/table caller 消费 normalized assembly/status，而不是只读 `preview_timeline.production_id` |
| UI tree/create | `packages/core/src/content/sourceWorkspaceTree.ts`, `surface/project/src/features/content/...` | Add child 逻辑仍来自 production -> segment、segment -> scene_moment、setting -> state、state -> asset；Content Canvas 旧 timeline root/child 写入已要求显式 `legacyTimelineMount`；root timeline namespace 已可通过 project vocabulary picker 选择 `timelineNamespaceKind` 并走 path-first `writeHierarchyNode`；normalized timeline namespace parent 下的 child namespace / scene_moment create 已走 path-first `writeHierarchyNode`，child namespace kind 由 `@movscript/domain` vocabulary fallback/next-kind 默认到父级下一层；root setting namespace 和 setting child namespace/state create 已接 project vocabulary，并写入 `namespace_kind`；direct prompt scene_moment 已可选择 timeline namespace path 写入，自动挂载 setting/state 时也带 setting namespace kind；namespace scope 已能通过 Creative Canvas action 创建 `timeline_assembly_ref` content unit；generation command 直接 ensure `scene_moment_ref` / `asset_ref`；结构树、关系事实和主要创建文案已优先显示 vocabulary/category；Content Canvas arrange 已按 timeline namespace ancestor depth 排列，navigator 已暴露 `domainKind`，collapsed summary 和 filter label 已用 `domainKind` 显示 setting/timeline namespace | UI 需要继续区分 namespace node 和 system primitive；namespace node 不出现“生成内容”主命令，只有 primitive/assembly 出现；旧 add child 只能作为 legacy projection command；剩余是其他 legacy workbench/surface 入口继续 category/vocabulary 化 |
| Content Canvas graph/actions | `surface/project/src/features/content/domain/contentCanvasTypes.ts`, `contentCanvasWorkspaceSnapshot.ts`, `contentCanvasGraphReferences.ts`, `contentCreativeCanvasActions.ts`, `contentCanvasCreateNodeCommands.ts`, `contentCanvasContentUnitCreateNodeCommands.ts`, `loadContentCanvasProject.ts` | canvas 已有 normalized category / namespace candidate guard；namespace 节点的 Creative Canvas 子动作已从 `domainCategory` 分发；root timeline namespace 和 normalized timeline namespace parent 下的 child create 已接 path-first hierarchy writer，并由 `@movscript/domain` vocabulary fallback/next-kind 决定 root/child namespace kind 默认值；direct prompt scene_moment 已可用 timeline namespace path 创建 `scene_moment` 并确保 `scene_moment_ref`；namespace scope 的 assembly action 已创建 `timeline_assembly_ref` content unit，target 是 `timeline_assembly` 而不是 namespace；Electron gateway 已把 `timeline_assembly` ensure 分流到 `ensureMovScriptEngineTimelineAssemblyContentUnit`，避免 UI action 回到 generic ensure 或 legacy production writer；所有通过 production/segment 旧投影创建 timeline root/child 或直接 scene_moment 的路径，都已要求显式 `legacyTimelineMount`；node display code/kind、structure tree meta、relation ledger 类型事实已优先使用 namespace vocabulary；layout arrange 已从 fixed production/segment column 迁到 domain category + ancestor depth，navigator、collapsed summaries 和 filter labels 已携带/显示 `domainKind`；project loader 已把 `timeline_assembly` editing timeline 按 targetRef、scope 和 scope projection node 建索引 | 继续把旧 workbench surface 从 fixed kind 迁到 category/vocabulary；namespace node 只创建子 namespace / scene_moment / assembly，不直接生成候选 |
| Core workbench/orchestration legacy model | `packages/core/src/production/orchestration.ts`, `packages/core/src/content/workbenchWriteModel.ts`, `sourceWorkspaceEngine.ts`, `sourceWorkspaceData.ts` | 老 content workbench 仍以 productionId、segmentId、sceneMomentId 和 preview timeline item 组织拖拽、timeline item、progress；`sourceWorkspaceEngine` 已并行输出 canonical `timeline_assembly` editing timeline；`workbenchWriteModel` 在无 productionId 时已能用 `timeline_assembly` scope 输出 target/scope payload；legacy production editing timeline 保留兼容 | 继续标成 legacy table/workbench compatibility；新 timeline namespace/assembly 不复用 production orchestration helper，后续更多 caller 改走 normalized status/Editing Service |
| MCP/domain tools | `packages/core/src/mcp/tools/domain/definitions.ts`, `packages/core/src/mcp/node/tools/domain/actions.ts` | `domain_upsert_content_unit` 已支持并说明 `timeline_assembly_ref` scope-first 写法；`domain_upsert_production_tree` 仍是 legacy production-projection tree，且 tree upsert 默认还会创建 `production_ref / segment_ref / scene_moment_ref` | 继续把 agent 写入入口导向 explicit `timeline_assembly_ref`；tree writer 保持兼容，但不能成为自定义 namespace 的新建入口 |
| Project Service resource/read model | `services/project-service/src/server.mjs`, `packages/core/src/mcp/node/tools/project/resources.ts`, `packages/core/src/mcp/node/tools/project/summaries.ts` | resource view 已暴露 `namespace-vocabulary`、`timeline-namespaces`、`setting-namespaces`、`system-primitives`、`domain-nodes`、`domain-edges`；legacy `episodes/productions/scenes/segments/settings/setting-states` resource item 已带 `domainCategory`、`domainKind`、`legacyAlias`、`preferredResourceKind`；Project Service read model 已返回 `projectTimelineStatus` / `project_timeline_status`，由 shared `sourceWorkspaceStatus` helper 从 domain graph 和 `timeline_assembly_ref` content unit 推导；source command 已新增 `writeNamespaceNode` 和 `ensureTimelineAssemblyContentUnit`，前者把用户 `kind` 规范化为 `namespace_kind`，后者只创建 assembly content unit | resource/read model/source command 已有 canonical projection；下一步是让更多调用方停止直接调用 `createProduction/createSegment` 新建用户层级 |
| Engine/source commands | `packages/engine/src/index.ts`, `services/project-service/src/server.mjs`, `packages/project/src/index.ts` | content-unit ensure/write 边界已支持 `timeline_assembly` normalized target；Project Service 已提供 `writeNamespaceNode` / `ensureTimelineAssemblyContentUnit` 作为 namespace/assembly command；production/segment tree writer、`writeHierarchyNode` 和默认 `main` production 仍是 legacy facade | 继续把新入口收敛到 normalized target；旧 production/segment writer 只作为兼容 API，不承载用户自定义 namespace |
| Prompt compiler | `packages/prompt/src/index.ts` | prompt ref 已拒绝 namespace-like refs，例如 `{{episode::id}}` / `{{beat::id}}`，并把它们报告为 `unsupported_prompt_ref_kind`；稳定依赖继续走 primitive/content_unit/candidate/resource | 后续如新增 `{{timeline_assembly::id}}`，只能和 content-unit 引用择一，避免双轨 selected-resource dependency |
| Editing model/service | `packages/editing/src/movscript-edit-plan.ts`, `packages/editing/src/media-project.ts`, `packages/editing/src/index.ts`, `packages/editing/src/service-client.ts`, `packages/workspace/src/previewTimeline.ts`, `services/editing-service/src/server.mjs` | edit plan / MediaEditingProject 已能记录 `target_kind = "timeline_assembly"`、`target_ref`、`scope_kind`、`scope_ref` 和 legacy production alias；Editing Service 新增 `timelineAssemblyBundle` canonical view；Workspace Service 已能从 timeline namespace scope 派生 preview timeline；production timeline bundle 继续作为 legacy assembly alias 输出 | canonical view 已支持 `timeline_assembly:<namespace_kind>:<scope_ref>`，找不到 scope 时返回 blocked bundle 而不是降级为 production；剩余限制是 source layout 仍通过 production/segment 文件投影 namespace，preview timeline schema 仍保留 legacy `movscript.preview_timeline.v1` |
| Runtime workspace scope | `packages/workspace/src/root.ts`, `packages/workspace/src/node/paths.ts` | workspace scope 是 `global / project / production`，production scope 决定 provider session cwd 和 interpret base dir | 这属于 runtime context，不等同于用户 timeline namespace；若要扩展，不应把 episode/season 直接塞进 scope union |
| Shared/Desktop semantic entities | `packages/shared/src/surfaceSemanticEntities.ts`, `apps/desktop/src/shared/infrastructure/api/semanticEntityConfigs.ts`, `packages/core/src/production/*` | 仍有 `segments / sceneMoments / assetSlots / production_id / owner_type` 等旧表格式 surface 配置和 production analysis/orchestration helper | 先标为 legacy/table-surface projection，不反推新 source domain；需要 UI 迁移时再映射到 namespace/primitive |
| CLI | `apps/cli/src/commands/lang.ts`, `apps/cli/README.md` | CLI 暴露 `production add`、`segment add`、`scene-moment add`；`content-unit add/modify` 已支持 `timeline_assembly_ref`、`--timeline-assembly`、`--scope-kind`、`--scope-ref`，并把 `production_ref/segment_ref` 标成 legacy assembly alias | 继续补 namespace-aware create/list 命令；旧 production/segment 命令保留为 legacy convenience，不新增 `episode_ref/beat_ref` |
| Data Service decisions | `services/data-service/internal/app/contentcandidate/*`, `services/data-service/internal/app/decision/*`, `services/data-service/internal/domain/job/helpers.go`, `services/data-service/internal/infra/persistence/model/decision.go` | decision 表是通用 `target_kind/target_ref`，但 content-candidate generation、job sync、reconcile 固定写 `target_kind = "content_unit"` | 这是正确边界：后端 candidate/selection 继续只服务 content unit，不扩展到 namespace；assembly 也通过 assembly content unit 进入 |
| Project client/contracts | `packages/project/src/index.ts`, `packages/mcp-contracts/src/index.ts`, `packages/agent-protocol/src/*` | Project client resource view kind 已包含 namespace vocabulary、timeline/setting namespace、system primitive、domain graph，以及 legacy `episodes / productions / scenes / segments / settings / setting-states`；Project Service read model 已并行携带 `project_timeline_status`；`ProjectSourceCommandName` 已包含 `writeNamespaceNode` / `ensureTimelineAssemblyContentUnit` 这类 canonical command；MCP/agent context snapshot 已并行携带 `domainFocus`，`productionId` 仅作为 legacy projection | 这些是 surface/API compatibility terms；新增 namespace scope 不复用 productionId；后续继续把 MCP tree tool 和剩余 legacy caller 从 production-first 迁到 projection-first |
| MCP host/runtime status | `packages/mcp-host/src/stdio.ts`, `packages/runtime-contracts/src/index.ts` | `movscript_runtime_status` 仍支持 legacy `productionId`，并已能把 `scopeKind/scopeRef/targetKind/targetRef/timelineAssemblyRef` 透传到 Local Surface URL；project source detection 已消费 workspace layout policy 的 source root files / source collection dirs，可识别 `timeline` source collection | runtime status 是只读路由入口，只传递 focus、不解释 namespace；剩余是 runtime status/read model 不再围绕 production summary 组织状态 |
| Agent browser surfaces | `packages/core/src/agent/surfaces.ts`, `surface/project/src/components/AgentPreviewTimelineSurface.tsx`, `ProjectOverviewSurface.tsx`, `ProjectSurfaceRouteView.tsx` | preview/status surface 已支持 normalized timeline scope / `timeline_assembly` focus；`productionId` 只作为 legacy production-scope projection；页面不再因缺 productionId 阻塞 assembly/episode scope；status read model 已优先使用 `project_timeline_status` | 剩余是 project overview/entry 更深入接入 vocabulary label 与 assembly readiness；surface route 继续保持 normalized focus query |
| Agent chat/protocol | `packages/agent-chat/src/chat/agentChatServerRequests.ts`, `packages/agent-protocol/src/*` | protocol workspace context / client input 已允许携带 `domainFocus`；workspace scope 仍保持 `global/project/production`，不把 episode/beat 塞进 scope union；decision request 展示 `targetKind/targetPath/contentUnitId` | `contentUnitId` 是正确稳定目标；`targetKind` 必须继续拒绝 namespace target；旧 production workspace 只做 legacy alias，精确对象走 normalized focus |
| Desktop Agent workspace/handoff | `apps/desktop/src/shared/contracts/workspaceChangeHandoff.ts`, `apps/desktop/src/features/agent/domain/workspaceDomainModel.ts`, `AgentRuntimeChatShell.tsx`, `agentCommandInput.ts` | review path、runtime route context 和 command input 已消费 `@movscript/domain` normalized focus；非 production timeline scope 不再制造 `productionId`；`content_unit_workspace` 指向 production/segment 时投影为 timeline assembly preview | `production_workspace` / `content_unit_workspace` 作为 legacy workspace kind 暂留；下一步同步 agent generation projection 标签和 workspace history 文案 |
| Desktop Electron runtime bridge | `apps/desktop/src/electron/ElectronMCPContextBridge.tsx`, `apps/desktop/src/shared/contracts/electronApiWorkspaceContext.ts`, `apps/desktop/electron/services/projectEngineRegistry.ts`, `apps/desktop/electron/ipc/movscriptEngineIpc.ts` | Electron MCP context bridge 已从 route search 派生 `domainFocus`，只有 `scopeKind=production` 才回填 legacy `productionId`；workspace context 已能携带 `domainFocus`；engine IPC 仍暴露 production/segment create 和 production snapshot作为 legacy compatibility；已新增 `ensureMovScriptEngineTimelineAssemblyContentUnit` facade，强制把 namespace scope 输出收敛为 `targetKind=timeline_assembly`、`contentUnitType=timeline_assembly_ref`，不触发 production/segment writer；共享 `SurfaceHostApi` 已暴露该可选能力，Content Canvas Electron gateway 已消费它；registry 从 `production_ref/segment_ref` 还原 runtime fields | 这是 runtime/source bridge，不应直接改成用户 namespace；下一步继续让旧 production/segment 输入投影到 namespace-aware writer 或明确停留在 compatibility 分组 |
| Local/Web surface host | `services/local-surface-host/src/project/*`, `services/web-surface-host/src/projectSurfaceRouting.ts`, `services/web-surface-host/src/main.tsx` | route context 和 navigator 已接受 normalized timeline focus；production scope 投影为 legacy `productionId`，非 production scope 会清掉旧 `productionId` 并原样透传 focus query；Local/Web host 都识别 `timeline_assembly_ref` alias，Web host 已抽出 focus-first route helper，navigator href 会规范化 query；Local Surface Host 的 project status snapshot 已优先消费 Project Service read model 中的 `project_timeline_status`，并把 normalized `domain_focus` / timeline scope / assembly target 写入 snapshot target；local content API 对 namespace hierarchy 写入转发 `writeNamespaceNode`，对 assembly ensure 转发 `ensureTimelineAssemblyContentUnit` | 继续把桌面 bridge 的旧 production/segment create 入口降级为 legacy convenience；避免 host runtime 自建 vocabulary |
| Local Surface semantic adapter | `services/local-surface-host/src/host-runtime/infrastructure/api/semanticEntities.ts` | `productions/segments/settings/settingStates` 旧列表已优先消费 Project Service `resources/view` 的 `timeline-namespaces` / `setting-namespaces` projection，并把返回记录标为 `legacyAlias` / `preferredResourceKind`；其他实体仍走 workspace query 固定映射 | 继续把 desktop semantic entity API 和旧 writable table surface 从固定 kind 迁到 canonical resource/read-model projection；不要让 host runtime 自己定义 domain vocabulary |
| Desktop semantic entity API | `apps/desktop/src/shared/infrastructure/api/semanticEntityWorkspace.ts`, `semanticEntityConfigs.ts`, `workspaceDomainRepository.ts` | `productions / segments` 旧表单已暴露 `namespace_kind`；显式 namespace 或已有 `timeline/` source path 会走可选 `writeHierarchyNode`，写到 `timeline/...`，并清掉 namespace node 不应携带的 content/candidate/selection 字段；无 namespace 的 production/segment/scene_moment 写入仍保留 legacy `saveProductionSnapshot` 兼容 | 继续把 UI 表单和桌面 bridge 的默认创建路径引向 vocabulary/read-model；旧无 namespace payload 只作为 legacy convenience |
| Project entry registry/overview | `surface/project/src/features/project/domain/projectEntryRegistry.tsx`, `projectOverviewModel.ts`, `projectEntryDeckModel.ts`, `projectOverviewData.ts` | 入口 id/stage 仍兼容保留 `orchestration_production`；purpose/owns/reads 已转向 timeline namespace + scene_moment + assembly；primary selection 已改成 `scopeKind/scopeRef` 指向 timeline namespace，`productionId` 只作为 legacy fallback；session selection 已能保存字符串 namespace ref、scope 和 target focus；review 入口不再要求 production entity，并可携带 scope/target/`timeline_assembly_ref`；overview 已尝试从 content workspace snapshot 构建 `project_timeline_status`，并优先用 timeline namespace、system primitive 和 assembly readiness 计算入口状态；旧 `productions/segments` semantic list 只作为 fallback | deck/session key 和部分 UI title 仍保留旧 entry id；后续 label/title 应来自 vocabulary/read model，而不是固定 `productionId` |
| Admin/workspace history surface | `surface/admin/src/types/index.ts`, `surface/admin/src/i18n/locales/*.json` | admin 类型和文案里仍有 `asset_slot`、`segment`、`scene_moment`、`production_workspace`、`content_unit_workspace`，还有 `Project.total_episodes` 等历史字段 | 这层先作为显示/历史兼容；后续标签应来自 read model/vocabulary，不能反向定义 source schema |
| Canvas surface | `surface/canvas/src/types.ts`, `surface/canvas/src/features/presentation/useWorkbenchCanvasLauncher.ts` | Canvas 仍有 `asset_slot / segment / scene_moment / content_unit` 等 semantic kind 和 `assets / production` workbench stage | Canvas 应保持 workflow/resource surface，不直接写 namespace；如果绑定 domain，只绑定 system primitive/content unit/assembly |
| Resource surface candidates | `surface/resource/src/resourceCandidateAttachPanel.tsx`, `surface/resource/src/resourceCandidateBinding.ts`, `packages/shared/src/workspaceCandidates.ts` | 资源库仍可把资源加入 `asset_slot` 或 `keyframe` 候选，payload 带 `production_id / scene_moment_id / content_unit_id` | 这是 legacy inline candidate/asset-slot 流程；新资源选择应优先进入 `asset_ref / keyframe_ref` content unit candidate，不扩展到 namespace |
| Inline candidate/decision helpers | `packages/decision/src/index.ts`, `packages/workspace/src/repository/inlineCandidates.ts`, `packages/workspace/src/repository/candidates.ts`, `surface/project/src/features/content/domain/contentCanvasGraphReferences.ts` | legacy target kind 仍包含 `asset / storyboard / keyframe / content_unit`，workspace candidates 可直接写 asset/keyframe inline candidate | 这些是迁移兼容入口；不得新增 namespace target，长期收敛到 asset/keyframe/storyboard content unit candidate |
| Shot Library | `packages/shot-library/src/index.ts`, `surface/shot-library/src/features/domain/*` | Shot library 使用 `shot`、`production_facets`、story beat 等检索词，但不是 source domain 的 production/segment | 作为参考镜头库保留；导入到项目时映射到 `expression_unit(role=shot)`、storyboard/keyframe 或 content unit，不恢复 `shot_ref` |
| Docs/README/examples | `apps/plugin/README.md`, `plugins/movscript/README.md`, `apps/cli/README.md`, `docs/movscript-agent-runtime-architecture.zh-CN.md`, `docs/TODO.md` | 文档仍把 source paths 写成 `settings/**`、`content_units/**`、`productions/**`，并把 planning upserts 描述为 production/segment/scene_moment/shot | schema 确定后要同步更新说明和示例；在此之前标注为 legacy projection，避免 agent/用户继续学习旧层级 |
| Plugin bundle/release artifacts | `apps/plugin/bin/movscript-agent-mcp.mjs`, `plugins/movscript/bin/movscript-agent-mcp.mjs`, `plugins/movscript/runtime/**` | 打包后的 agent MCP runtime 内嵌旧 content-unit adapter、preview timeline 和 source layout 逻辑 | 不能手改 bundle；源代码改造后必须重新构建插件、刷新 cache/release，并加 drift 检查 |
| Agent plugin skills | `plugins/movscript/skills/*`, `apps/plugin/skills/*` | planning/domain/generation/editing/review/content-unit recipe 已改为 timeline namespace + system primitive + `timeline_assembly_ref`；`production/segment` 和 `production_ref/segment_ref` 只作为 legacy projection/assembly alias | 继续保持 source skill 和源码同步；plugin bundle/cache 仍需通过构建发布流程同步，不能手改 |
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
| `services/project-service`, `packages/project` | Project API/resource view 已暴露 canonical namespace/domain graph 资源，并把 `episodes / productions / scenes / segments / settings / setting-states` 标成 legacy projection；read model 已输出 `project_timeline_status`；source command 已加入 `writeNamespaceNode` / `ensureTimelineAssemblyContentUnit` | 继续让上层调用方改用 vocabulary-aware command，旧 `createProduction/createSegment` 保持 legacy convenience |
| `services/data-service`, `packages/data-client`, `packages/decision` | backend decision/candidate 主要绑定 `content_unit`，方向正确 | 保持边界，不扩展到 namespace |
| `packages/mcp-host`, `packages/mcp-contracts`, `packages/agent-protocol`, `packages/agent-chat` | agent 入口、runtime status、decision request 仍携带 `productionId/targetKind` | `productionId` legacy focus；decision target 走 normalized target |
| `packages/core/src/agent`, `surface/project/src/components/Agent*Surface.tsx` | agent browser surface 的 preview/status 页面仍以 `productionId` 为 focus | 新增 timeline/assembly surface focus |
| `apps/desktop/src/features/agent`, `apps/desktop/src/shared/contracts` | agent workspace review path、handoff 和 command input 会从 `production_workspace/productionId` 推导上下文 | legacy workspace alias + namespace/assembly/content-unit focus |
| `apps/desktop/electron`, `apps/desktop/src/electron` | Electron MCP context、workspace scope、engine IPC 和 project registry 仍保留 production/segment bridge；engine IPC 已新增 timeline assembly ensure facade，用 canonical `timeline_assembly_ref` 进入生产流程 | runtime bridge legacy fields + normalized focus；旧 production/segment create 继续降级为 compatibility |
| `apps/plugin`, `plugins/movscript` | 技能和打包 MCP runtime 会固化旧语义 | 源码改造后重建 bundle，增加 drift check |
| `services/local-surface-host`, `services/web-surface-host` | surface URL/read-model snapshot 仍兼容 `productionId`；local/web route context 和 navigator 已统一按 normalized focus 清理 stale `productionId`，并支持 `timeline_assembly_ref` alias；local host status 和 semantic adapter 已消费 Project Service read/resource projection，local content API 已把 namespace/assembly 写入路由到 canonical source command | legacy focus + namespace focus projection；继续迁移 desktop bridge 的旧 production/segment create 入口 |
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
| `packages/engine/src/index.ts` | `saveContentUnit` 已能透传 `target_category/target_kind/target_ref/scope_kind/scope_ref`；`ensureContentUnitForEntity(targetKind="timeline_assembly")` 会创建 canonical `timeline_assembly_ref`，并把已有 `production_ref/segment_ref` 识别为 legacy assembly alias | 下一步不要扩 `episode_ref/beat_ref`；如果新增 namespace-aware create tool，也应只创建 namespace node 或显式 assembly primitive，再由 content unit 指向 assembly |
| `packages/core/src/mcp/tools/domain/definitions.ts` | `domain_upsert_content_unit` 已明确 `timeline_assembly_ref` 是 namespace-scope video 的 canonical target；`domain_upsert_production_tree`、`domain_upsert_segment`、`domain_upsert_scene_moment` 仍围绕 production/segment projection | 继续新增 namespace-aware tool 或在旧工具描述中保持 legacy/projection 边界；agent 新建 assembly 应走 explicit `timeline_assembly_ref` |
| `packages/core/src/mcp/node/tools/domain/actions.ts` | `domain_upsert_content_unit` 已透传 `target_category/target_kind/target_ref/scope_kind/scope_ref`；`domain_upsert_production_tree` 对未声明 target 的嵌套 content unit 仍保留 legacy `production_ref/segment_ref` 默认，但显式 `timeline_assembly_ref` 不再继承 tree context 的 legacy primary ref | tree tool 仍是 compatibility writer；新模型下 namespace tree upsert 不应隐式给 namespace scope 创建 content unit，显式 assembly payload 必须落成 canonical `timeline_assembly_ref` |
| `packages/core/src/content/sourceWorkspaceStatus.ts`, `packages/core/src/mcp/node/tools/domain/actions.ts` | 已新增 shared `sourceWorkspaceStatus` helper；`domainProductionStatusSummary` 仍保留 `movscript.production_status_summary.v1` 兼容 schema，但已标 `legacy_alias` / `preferred_schema = movscript.project_timeline_status.v1`，并并行返回 `namespace_vocabulary`、`project_timeline_status`、`timeline_namespaces`、`timeline_assemblies`；assembly status 由 `timeline_assembly_ref` content unit 和 normalized scope edge 得出 | 下一步让更多 surface/read model 入口直接以 `project_timeline_status` 为主 schema；旧 production editing timeline 只作为 assembly alias |
| `packages/project/src/index.ts` | `ProjectSourceCommandName` 已包含 `writeNamespaceNode` / `ensureTimelineAssemblyContentUnit`，并补齐实际 source command union；resource view kind 已包含 namespace/domain graph projection 和 legacy setting/timeline aliases | Project client 已有 canonical command vocabulary；继续把具体 caller 从 legacy writer facade 迁过来，旧 resource kind 仅做 compatibility label |
| `services/project-service/src/server.mjs` | source command 已支持 `writeNamespaceNode` / `ensureTimelineAssemblyContentUnit`；`projectResourceEntityKind` 对 `episodes/productions/scenes/segments` 的硬映射仍作为 legacy resource view fallback | Resource view/source command 已能 vocabulary-aware projection；剩余是调用方和 legacy resource fallback 继续降级为兼容层，不能让 API 层定义用户 ontology |
| `packages/mcp-contracts/src/index.ts` | `MCPContextSnapshot` 顶层仍有 `productionId` | 该字段保留为 legacy focus；新增 `timelineScopeId/namespacePath/timelineAssemblyId/focusedPrimitiveRef` 一类 neutral focus |

## Surface/runtime focus 细化扫描

这层不一定直接写 source，但会决定 agent 认为“当前对象”是什么。若这里继续只传 `productionId`，agent planning、review surface、status summary 和 provider session 都会回到旧 production focus。

| 文件 | 当前行为 | 改造判断 |
| --- | --- | --- |
| `services/local-surface-host/src/routes/localRouteLinks.ts` | `projectRouteContext` 已按 normalized focus 优先解析；`projectSurfaceHrefForLocalProject` / `projectRouteHref` 会规范化 timeline focus query，非 production scope 清掉旧 `productionId`；`timeline_assembly_ref` alias 已进入同一 focus parser | 继续把 `productionId` 作为 legacy query；新增 focus 字段时统一进入 normalized focus helper，不再散落解析 |
| `services/local-surface-host/src/project/localProjectSurfaceRuntime.ts` | navigator href 已在 query/params 合并后规范化 timeline focus，避免旧 `productionId` 和新 namespace scope 并存 | local runtime 不定义 namespace；只负责完整转发 normalized focus |
| `services/local-surface-host/src/project/LocalProjectSurfaceHostRoute.tsx` / `projectStatusSnapshot.ts` | `useProjectReadModel` 仍接收 legacy `productionId`，但 status snapshot 已优先消费 read model 的 `project_timeline_status`，并把 normalized `domain_focus`、timeline scope 和 assembly target 写入 snapshot target；`movscript.production_status_summary.v1` 标成 alias，没有 projection 时才回退 legacy production summary | 继续把 URL/route 里的 `productionId` 作为 legacy query；后续可直接让 status surface 请求 project timeline schema |
| `services/web-surface-host/src/projectSurfaceRouting.ts` / `main.tsx` / `projectSurfaceRuntime.ts` | Web host 已抽出 focus-first route helper；route context 和 navigator href 都会规范化 timeline focus query，非 production scope 清掉旧 `productionId`，production assembly alias 回填 legacy `productionId`；raw query 继续传给 `ProjectSurfaceRouteView` 作为 surface params | 后续如增加新的 focus 字段，应先进入 `@movscript/domain` normalizer，再由 local/web helper 转发 |
| `packages/core/src/agent/surfaces.ts` | preview/status surface 已输出 normalized domain focus、timeline scope 和 assembly target；`productionId` 是 legacy projection | preview timeline 长期应打开 assembly preview，而非 production preview；status data 仍需升级 read model |
| `apps/desktop/src/pages/agent/AgentPreviewTimelinePage.tsx` / `AgentProjectStatusPage.tsx` | 页面已从 query 形成 normalized focus；没有 productionId 时，timeline assembly target/scope 仍可启用 loader | 后续页面可显示更明确的 vocabulary label / assembly title |
| `surface/project/src/components/AgentPreviewTimelineSurface.tsx` / `AgentProjectStatusSurface.tsx` | UI 文案和 chips 已改成 Timeline / normalized focus；status surface 已优先读取 `project_timeline_status.timeline_assemblies`，旧 `summary.productions[0].content_units` 仅作 fallback；Local Host status snapshot 也已透传 read model projection | 后续减少 legacy fallback 路径，并让 status surface 直接以 project timeline schema 展示 |
| `surface/project/src/components/AgentImpactSurface.tsx` | impact preview link 已优先使用 normalized target/scope，path regex 只做 legacy fallback | 继续避免从 namespace path 反推出 production-only preview |
| `apps/desktop/src/electron/ElectronMCPContextBridge.tsx` | 只在 scripts route 解析 query `productionId` 并写入 MCP context | context bridge 应传 normalized focus；scripts route 上的 productionId 只做 legacy route hint |
| `apps/desktop/src/shared/contracts/electronApiWorkspaceContext.ts` / `apps/desktop/electron/services/workspaceRealm.ts` | workspace scope union 是 `global/project/production`，`scope = production` 会进入 workspace path/context | 不把用户 namespace 塞进 scope union；新增 focus payload 与 runtime scope 分离 |
| `packages/mcp-host/src/stdio.ts` | `movscript_runtime_status` 入参和 Local Surface URL common query 支持 `productionId` | runtime status 是只读路由入口，应支持转发 namespace/assembly focus，但解释仍交给 Project Service/read model |
| `apps/desktop/src/shared/contracts/workspaceChangeHandoff.ts` / `workspaceDomainModel.ts` | review path 已按 content unit / scene moment / assembly / namespace focus 分流；`production_workspace` 可打开项目级 scripts review，`content_unit_workspace` 的 production/segment target 会进入 timeline assembly preview | workspace kind 仍是 legacy alias；后续同步标签和历史记录展示，避免用户继续把它理解成 source ontology |
| `apps/desktop/src/features/agent/domain/agentCommandInput.ts` / `AgentRuntimeChatShell.tsx` | command input 和 runtime workspace context 已优先消费 normalized focus；非 production timeline scope 保持 project runtime scope + `domainFocus`，productionId 只是 legacy route hint | 后续 read model/vocabulary label 进入 page context 时，也应继续映射到同一 `domainFocus` |
| `apps/desktop/src/shared/infrastructure/api/semanticEntityConfigs.ts` / `semanticEntityWorkspace.ts` | Desktop semantic entity writer 暴露 productions/segments/sceneMoments；production/segment 表单已可填 `namespace_kind`，显式 namespace 或已有 `timeline/` path 会走 hierarchy writer；无 namespace payload 仍调用 `saveProductionSnapshot` | UI 直接写旧 source 的高风险已降低一层；继续把默认创建 UI 从 legacy table 转向 vocabulary-aware surface |
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
| `surface/project/src/features/content/application/contentCanvasCreateNodeCommands.ts` / `contentCanvasCommands.ts` | root production 已支持制作级 production type picker + `writeHierarchyNode` 写 `timeline/{id}/production.json`；project 创建不再选择 timeline；production type 只推荐内部 `timeline_namespaces`，不会自动实例化多层；child create 在 normalized `timeline_namespace` parent 下已用 production type/vocabulary 推导 child namespace kind，并用 `writeHierarchyNode` 写 namespace path / scene_moment path，且不反写 `production_id/segment_id`；root setting namespace 和 setting child namespace/state create 已用 project vocabulary 推导 kind，并通过 engine facade 写入 `namespace_kind`；namespace scope assembly 已通过 `ensureContentUnitForEntity(targetKind="timeline_assembly", contentUnitType="timeline_assembly_ref")` 创建 content unit；旧 production/segment projection 写入必须显式 `legacyTimelineMount`；结构树、radial code、关系事实和主要创建文案已显示 vocabulary/category；Content Canvas arrange 已按 domain ancestor depth 排列 timeline namespace，navigator item、collapsed summary 和 filter label 已按 namespace `domainKind` 展示；默认 id 仍包含 `canvas_production`、`canvas_segment` | 剩余是把其他 legacy workbench surface 从固定 production/segment 展示迁到 project vocabulary；旧 production/segment create 只作为 legacy command |
| `surface/project/src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts` | 直接创建 scene moment 已支持选择 timeline namespace path，并用 `writeHierarchyNode` 写 `scene_moments/{id}/scene_moment.json`；content unit payload 仍是 `scene_moment_ref`，不会把 namespace 当 target；如果使用 production + segment 旧父级，仍必须显式传 `legacyTimelineMount` | 旧 production/segment mount 只作为 legacy wizard/compatibility path；下一步是让 direct prompt 的 namespace parent picker 也显示 vocabulary label/模板建议，而不是只列当前节点 |
| `surface/project/src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts` | `createAssetCanvasNode` / `createAssetFromSettingState` 会创建 setting/state/asset，并确保 `asset_ref` content unit | 方向基本正确：asset 是 system resource slot，候选通过 `asset_ref` content unit；要调整的是 setting/state label 与 namespace vocabulary，而不是 candidate 边界 |
| `surface/project/src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts` | expression/keyframe/storyboard 创建依赖 `requiredSceneMomentRefs`，仍从 production/segment path 推导 parent | 这些 primitive 保留，但 parent 解析要从 normalized parent edge 获取；不能要求 scene_moment 必须在 segment 下才能创建视觉证据 |
| `surface/project/src/features/content/application/contentCanvasContentUnitCommands.ts` | `ensureContentUnitForRef` 只接受 `asset/scene_moment/expression_unit/keyframe/storyboard` target | 这是正确边界；增加 `timeline_assembly` 后仍排除 namespace |
| `surface/project/src/features/content/application/contentCanvasCandidateCommands.ts` | generate/upload/select 全部要求 `content_unit` node，后端请求也按 `contentUnitId` 走 | 这是最应该保留的生产边界；namespace node 不应拥有 generate/upload/select candidate 主动作 |
| `surface/project/src/features/content/application/contentCreativeCanvasActions.ts` | production node 显示“添加段落”，segment node 显示“添加情节”；scene_moment、expression_unit、asset 等节点可发起生成/上传/选择候选 | action model 要升级为 category-driven：timeline namespace 只能新增子 namespace、scene_moment、assembly；system primitive/assembly/content_unit 才能生成或选择候选 |
| `surface/project/src/features/content/application/contentCreativeCanvasDependencies.ts` | “命名空间依赖”只覆盖 `scene_moment -> expression_unit -> keyframe/storyboard`，并没有 timeline namespace | 命名要调整：这里实际是 primitive containment/dependency，不是用户 timeline namespace；未来 timeline namespace 依赖要从 normalized graph 输入 |
| `surface/project/src/features/content/application/contentCanvasLayout.ts` | layout 固定列为 `project -> production -> segment -> scene_moment -> content_unit -> candidate/resource` | 布局应按 category/role 排列：timeline namespace lane、system primitive lane、content unit/candidate lane；旧 production/segment 列只作为 legacy projection |
| `surface/project/src/features/content/application/loadContentCanvasProject.ts` | 并行 query `production`、`segment`、`scene_moment` 等固定 entity；editing timeline 已支持 `timeline_assembly`，并按 targetRef、scopeKey 和 scopePath 对应的 projection node 建索引 | 继续减少固定 entity query 对布局/标签的决定权，更多显示从 domain graph/vocabulary 读取 |
| `packages/core/src/content/sourceWorkspaceEngine.ts` | 仍读取 productions 的 legacy preview timeline；同时已从 `timeline_assembly_ref` content unit scope 读取 scope-aware preview timeline，并生成 `targetKind: "timeline_assembly"` editing timeline；production preview 只作为 legacy timeline 保留 | 剩余是旧 workbench/table flow 继续从 productionId timeline 迁到 normalized assembly/status |
| `packages/core/src/content/sourceWorkspaceData.ts` | `ContentSourceWorkspaceEditingTimeline.targetKind` 只有 `scene_moment | production`；`sourceParentRefs` 从 path 推导 `production_id/segment_id/scene_moment_id` | 加 `timeline_assembly` target；parent refs 改成 normalized parent/scope refs，旧字段保留兼容 |
| `packages/core/src/content/workbenchWriteModel.ts` | 拖动 content unit 到 timeline 时旧路径仍可从 `unit.production_id` 或 row.productionIds[0] 取 production；无 productionId 但有 `timeline_assembly` scope 时，已创建 `target_kind/target_ref/scope_kind/scope_ref` payload，不再强制 `preview_timeline.production_id` | 旧 table/workbench flow 保留兼容；新 assembly timeline 不通过 production_id 创建 preview timeline，后续 caller 继续传 normalized scope |
| `packages/core/src/production/orchestration.ts` | `productionOrchestrationEntityKinds` 和 defaults 仍包含 productions、segments、assetSlots、contentUnits，创建 defaults 会写 `production_id/segment_id` | 这是 legacy orchestration/table helper；不能继续承接新 namespace 字段 |
| `surface/project/src/features/content/components/useContentCanvasWorkspaceCreationCommands.ts` / `useContentCanvasWorkspaceController.ts` | UI dialog 仍有 createProduction、production 下建 segment、segment 下建 scene_moment 的操作链 | 新 UI 要从 template/vocabulary 初始化 namespace path；旧 production dialog 进入 compatibility 分组 |
| `surface/project/src/features/content/application/contentCanvasProjectEntrySession.ts` | project entry session 用 `canvasNode/node/kind` 保存焦点，默认 selectionKind 是 `scene_moment` | 这层可继续用 node id，但 selection kind 要能表达 namespace/assembly/content_unit；默认不应假设当前焦点是 scene_moment |
| `surface/project/src/features/project/domain/projectEntryRegistry.tsx` | `orchestration_production` entry id/stage 仍保留兼容；purpose/owns/reads 已转为 timeline namespace + scene_moment + assembly/content unit；primarySelection 已用 `scopeKind/scopeRef` 表达 timeline scope，并保留 `productionId` legacy fallback；review 不再要求 production entity，且可携带 scope/target/`timeline_assembly_ref` | 后续 tab label 要从 vocabulary/read model 来，不再固定展示 production |
| `surface/project/src/features/project/presentation/projectOverviewModel.ts` | overview data 已尝试读取 content workspace snapshot 并构建 `project_timeline_status`；progress/blocking 优先使用 timeline namespace count、scene_moment system primitive count 和 timeline assembly readiness；legacy `productions/segments` semantic list 仅 fallback | 后续继续把 primary selection / entry label 从旧 entry id 和 `productionId` query 迁到 vocabulary/read model |
| `surface/project/src/features/project/presentation/projectEntryDeckModel.ts` | deck restore 把旧 `scripts` snapshot 映射到 `orchestration_production`，并恢复 `productionId` search | 保留 legacy restore；新 snapshot/search 要支持 namespace/assembly focus，避免恢复时又落回 production route |

## CLI / skills / docs / tests 细化扫描

这一层决定 agent 和用户实际会怎样使用系统。即使 schema/read model 改对了，如果 CLI help、skill recipes、README 和 fixtures 仍持续推荐 `production -> segment -> scene_moment`，新项目还是会被写回旧模型。

| 文件/区域 | 当前行为 | 改造判断 |
| --- | --- | --- |
| `apps/cli/src/commands/lang.ts` | CLI 暴露 `production add`、`segment add`、`scene-moment add`；`segment add` 默认 `--production main`；`scene-moment`、storyboard、keyframe、audio cue、expression unit 和 content unit 都大量使用 `--production / --segment / --scene-moment` 定位 | 旧命令保留为 legacy convenience；新增 namespace-aware 命令应使用 `--scope`、`--namespace-path`、`--timeline-parent` 或等价 parent edge，不继续扩展成 `--episode/--act/--beat` |
| `apps/cli/src/commands/lang.ts` | parent parser 依赖 `parseSegmentRefOption`、`parseSceneMomentRefOption`、`parseStoryboardRefOption`，并在缺少 segment/scene moment 时直接报错 | 第一阶段可以继续接受旧 path；新 writer 应让 path parent 和显式 parent/scope refs 进入同一 normalized parent 解析，而不是在每个命令里硬编码 segments |
| `apps/cli/src/commands/lang.ts` | `content-unit add/modify` 已支持 `timeline_assembly_ref`、`--timeline-assembly`、`--scope-kind`、`--scope-ref`；使用 assembly scope 时不会再写 `production_ref/segment_ref`；旧 `--production/--segment` help 标为 legacy assembly alias | 继续禁止把 namespace kind 扩展成 `episode_ref/beat_ref`；后续 namespace writer 应使用 parent/scope refs，而不是继续增加固定层级参数 |
| `apps/cli/src/commands/lang.ts` | interactive slash help 已包含 `timeline_assembly_ref` 和 `--timeline-assembly` 参数，但仍把 `/production add`、`/segment add`、`/scene-moment add` 列为标准路径 | 后续 slash help 要加 namespace/template 初始化和 assembly 示例；旧 production/segment help 移到 compatibility 段 |
| `apps/cli/README.md` | 示例已加入 `content-unit add --timeline-assembly ... --scope-kind ...`，并标注 production/segment 是 legacy timeline projection convenience | schema 决策后改成 namespace vocabulary/template + scene_moment + content unit/assembly 示例；迁移期先标 legacy |
| `plugins/movscript/skills/planning/SKILL.md` / `apps/plugin/skills/planning/SKILL.md` | planning skill 已改成先决定 output/scope granularity，并把 timeline namespace scope output 导向 `timeline_assembly_ref` | 继续避免新增 `episode_ref/beat_ref` 或把 production/segment 当作新 ontology |
| `plugins/movscript/skills/planning/references/entity-mapping.md` | entity mapping 已把 episode/act/sequence/beat 表达为 timeline namespace，当前 source 使用 legacy `production/segment` projection | 后续 source layout 迁移时再更新具体 writer/source names |
| `plugins/movscript/skills/planning/references/content-unit-recipes.md` | content-unit recipe 已推荐 `timeline_assembly_ref`，并把 `production_ref/segment_ref` 标成 legacy assembly alias | 保持和 interpreter/engine adapter 测试同步 |
| `plugins/movscript/skills/domain/SKILL.md` / `domain-story.md` | domain story 已改成 timeline namespace structure + `scene_moment` production center；adapter 列表包含 `timeline_assembly_ref`，旧 ref 标 legacy | 继续同步插件 bundle/cache，避免发布旧技能 |
| `plugins/movscript/skills/generation/SKILL.md` / `review/SKILL.md` | generation/review 语言已从 production output/readiness 收敛为 content-unit output、system primitive、timeline assembly 和 generation readiness | 继续保持 `scene_moment` production center；不要把 namespace prompt ref 或 namespace node 引回 selection gate |
| `plugins/movscript/skills/editing/SKILL.md` | editing 语言已把 production timeline / production-level handoff 标成 legacy projection，并推荐 timeline assembly / dedicated MediaEditingProject | Editing Service 源码已支持 production-scope legacy alias 和非 production namespace scope assembly bundle；后续同步工具描述和示例时要标注 missing scope 会返回 blocked bundle |
| `apps/plugin/skills/**`、`plugins/movscript/skills/**`、`apps/desktop/.codex/.claude/.mova/.agents/plugins/**` | 同一套技能存在 source、plugin copy、desktop bundled/catalog copy 多份 | 不手改各处副本；源 skill 改完后通过 plugin build/install 流程同步，并增加 drift check |
| `apps/plugin/bin/movscript-agent-mcp.mjs` / `plugins/movscript/bin/movscript-agent-mcp.mjs` | 打包 bundle 中仍内嵌 `domain_upsert_production_tree`、`productionTimelineBundle`、`productionId`、`production_ref/segment_ref` 等逻辑 | 这是构建产物，不手工 patch；源代码改完后重建，并用 grep/drift check 证明 bundle 语义已同步 |
| `packages/prompt/tests/content-unit-prompt.test.mjs` | 有测试明确验证 `{{segment:opening}}` 通过 `segment_ref` content unit 解析到 selected video resource | 保留为 legacy prompt-ref 兼容测试；新增测试证明 `{{episode::id}}` 不进入 selection gate，assembly 通过 `timeline_assembly_ref` 或 `{{content_unit::id}}` 进入 |
| `packages/interpreter/tests/integration/source-validation.test.mjs` / `artifacts.test.mjs` | 明确验证 `production_ref` 和 `segment_ref` 是合法 video primary refs、能生成 runtime panel/artifact | 保留为 legacy alias 测试；新增 `timeline_assembly_ref` artifact/stale/runtime panel 测试 |
| `packages/editing/tests/media-project.test.mjs` / `packages/editing/tests/service-client.test.mjs` / `services/editing-service/tests/server.test.mjs` / `packages/core/tests/content.test.mjs` / `surface/project/src/features/content/application/contentCanvasArchitecture.test.ts` | `productionTimelineBundle` 已断言为 legacy assembly alias；media editing provenance、edit plan context 和 canonical `timelineAssemblyBundle` 已携带 `timeline_assembly` target/scope；非 production scope assembly 已覆盖真实 `timeline_assembly:episode:<id>` bundle、missing scope blocked bundle、core snapshot assembly editing timeline 和 Content Canvas loader 索引 | 继续补其它 legacy workbench/surface caller 测试，证明它们不再只能请求 production preview timeline |
| `apps/desktop/src/features/agent/domain/workspaceDomainModel.test.ts` / `AgentRuntimeChatShell.test.ts` | workspace/handoff 测试断言 `production_workspace`、`productionId`、`scope = production` | 保留 legacy route 测试；新增 normalized focus 测试，证明 namespace/assembly/content unit focus 不被强行转成 production |
| `services/local-surface-host/src/routes/localRouteLinks.test.ts` | route test 只验证 URL path segment 和 project id segment，不验证 domain namespace focus | 新增 `timelineScopeId/namespacePath/timelineAssemblyId/focusedPrimitiveRef` query round-trip，并明确区分 URL segment 与 domain segment |

## 包级改造清单

### `packages/domain`（新增）

这是这次任务最终要建立的系统抽象中心。第一版目标不是包办所有 domain 逻辑，而是提供其他包必须共同消费的纯语义层：

- 新增 package `@movscript/domain`，保持无文件系统、无服务、无 UI 依赖。
- 导出 node category、system primitive kind、content unit target kind、relation edge kind、normalized focus 等稳定类型。
- 导出 production type / namespace vocabulary helper，包含 `video / film / episode / lesson / custom` 的默认模板，并保留 `short_video / series / course` 作为 legacy alias。
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
- `contentCanvasCreateNodeCommands.ts` 和 `contentCanvasContentUnitCreateNodeCommands.ts` 已禁止隐式 legacy production/segment mount；旧 root/child/scene mount 必须显式 `legacyTimelineMount`。`contentCanvasCreateNodeCommands.ts` 已能用 namespace path 写 root namespace、child namespace / scene_moment；root/child timeline namespace kind 已接 project vocabulary picker/default；root setting namespace 和 setting child namespace/state create 已接 project vocabulary，并通过 engine facade/MCP payload 写入 `namespace_kind`；direct prompt scene_moment 也已可选择 timeline namespace path 写入并确保 `scene_moment_ref`，自动挂载 setting/state 时也带 setting namespace kind；`contentCanvasCommands.ts` 已能从 namespace scope 创建 `timeline_assembly_ref` content unit；结构树、radial code、关系事实和主要创建文案已 vocabulary 化；`contentCanvasLayout.ts` arrange 已按 domain ancestor depth 排列 timeline namespace；`contentCanvasNavigation.ts` navigator 已用 `domainCategory` 识别 timeline namespace 并携带 `domainKind`；`contentCanvasViewSummaries.ts` collapsed summary 已按 namespace `domainKind` 聚合/显示；`ContentCanvasPresentationModel.ts` filter label 已从 namespace `domainKind` 推导，filter value 仍保持 stable legacy projection kind。下一步是其他旧 workbench/surface 入口继续 category/vocabulary 化。
- `contentCreativeCanvasActions.ts` 已把 namespace 节点的子动作分发收敛到 `domainCategory` helper，并保持 namespace node 无 generate/upload/select candidate 主动作；namespace scope assembly action 已落到 `timeline_assembly_ref` content unit；child namespace kind 已由 project vocabulary 默认到父级下一层。
- `contentCanvasWorkspaceElectronGateway.ts` 已在 `targetKind = "timeline_assembly"` 时调用 `ensureMovScriptEngineTimelineAssemblyContentUnit`，只把 scope 交给 desktop bridge；非 assembly target 才继续走 generic content-unit ensure。
- `contentCanvasCandidateCommands.ts` 当前只对 `content_unit` 生成/上传/选择候选，这个边界应保留；不要为了 namespace node 增加直接 candidate action。
- `contentCanvasLayout.ts` 的固定列应从 kind-based 改成 category/role-based，避免新 vocabulary 被强行摆回 production/segment 列。
- `contentCanvasProjectEntrySession.ts` 可以继续保存 `nodeId`，但 `selectionKind` 要支持 namespace/assembly/content_unit，不默认把缺省焦点当成 scene_moment。
- `AgentPreviewTimelineSurface.tsx`、`ProjectOverviewSurface.tsx` 和 `ProjectSurfaceRouteView.tsx` 已把 `productionId` 降为 legacy focus，并支持 assembly/timeline scope focus。
- `projectEntryRegistry.tsx` 的 `orchestration_production` id 可以作为 legacy route id 保留；entry purpose、owns/reads、primary selection 和 review query 已转向 timeline namespace + scene_moment/assembly，`productionId` 只作为 legacy fallback。
- `projectOverviewData.ts` / `projectOverviewModel.ts` 已优先从 content workspace snapshot 构建并消费 `project_timeline_status`；progress/blocking 使用 timeline namespace、scene_moment/system primitive 和 assembly readiness，旧 semantic list 只作为 fallback。

`packages/core/src/production/orchestration.ts`、`workbenchWriteModel.ts`、`sourceWorkspaceData.ts` 和 `sourceWorkspaceEngine.ts` 要单独处理：它们是旧 content workbench/table flow，仍会消费 `preview_timeline.production_id`、`preview_timeline_item.production_id`。当前 `sourceWorkspaceEngine` 已并行输出 canonical `targetKind = "timeline_assembly"` editing timeline；`workbenchWriteModel` 也已能在无 productionId 时写出 assembly target/scope payload。旧 production editing timeline 短期保留为 legacy compatibility。剩余 workbench/table 入口不能继续扩展 production 字段，新 flow 应走 normalized read model 和 Editing Service assembly target。

### `packages/engine` 和 Project Service

这层是 API/write boundary：

- `ProjectSourceCommandName` 已新增 `writeNamespaceNode` / `ensureTimelineAssemblyContentUnit`；旧 `createProduction/createSegment` 保留兼容。
- `MovScriptEngine*Input` 的 `productionId/segmentId` 是 legacy facade；新 flow 使用 `timelineScopeId/namespacePath/timelineAssemblyId/focusedPrimitiveRef`。
- `writeHierarchyNode` / `updateEntityBasics` 不能继续只通过 `targetPath` 里的 `productions/segments/scene_moments` 推导上下文。
- `saveProduction/saveSegment/saveSceneMoment` 的默认 `productionId = "main"` 要限制在 legacy writer；namespace-aware 空项目不能被隐式写成 main production。
- `ensureContentUnitForEntity` 已支持 `timeline_assembly`，但继续排除 namespace target。
- `saveContentUnit` / `defaultContentUnitOutputKind` 已增加 `timeline_assembly_ref`，并把 `production_ref/segment_ref` 迁到 alias path。
- `readProjectResourceView` 已增加 vocabulary-aware projection；`episodes -> production`、`scenes -> segment` 只作为 legacy resource fallback。
- Project Service 的 candidate/prompt endpoint 已经要求 `contentUnitId`，这是正确边界，避免扩展成 namespace candidate endpoint。
- MCP tool descriptions 要把 production/segment 解释为 legacy namespace，不再教 agent 把 namespace 当作 content unit target。

### `packages/prompt` 和 generation

Prompt compiler 直接影响 dependency gate：

- 不建议支持 `{{episode::id}}`、`{{act::id}}`、`{{timeline_namespace::id}}` 作为稳定生成依赖。
- 如果 prompt 需要引用 namespace 上下文，应由 prompt builder 展开为文本上下文，而不是要求该 namespace 有 selected candidate。
- 稳定资源依赖继续走 `{{asset::id}}`、`{{storyboard::id}}`、`{{keyframe::id}}`、`{{audio_cue::id}}`、`{{scene_moment::id}}`、`{{expression_unit::id}}`、`{{content_unit::id}}`、`{{candidate::id}}`、`{{resource::id}}`。
- 若 assembly output 需要作为上游资源，新增 `{{timeline_assembly::id}}` 或通过 `{{content_unit::id}}` 引用它对应的 content unit；两者择一，避免双轨。
- generation payload 层主要消费 compiled prompt 和 resource ids，改动较小；风险集中在 prompt compiler 和 content unit adapter。

### `packages/editing` 和 Editing Service

`timeline_assembly` 会落到剪辑/合成边界：

- edit plan artifact 和 MediaEditingProject provenance 已能携带 `target_kind = "timeline_assembly"`、`target_ref`、`scope_kind`、`scope_ref`，并保留 `legacy_target_kind / legacy_target_ref` 兼容旧 production bundle。
- production timeline bundle 当前已作为 legacy assembly bundle 输出，`production_id / productionId` 继续保留给旧调用方，但 preferred schema / target fields 指向 `movscript.timeline-assembly-bundle.v1`。
- Editing Service client/server 已接受 `timelineAssemblyBundle` view；production scope 走 legacy alias，非 production scope 通过 Workspace Service 的 timeline namespace preview 派生能力直接读取 scene_moment items。找不到 scope 时返回 blocked bundle，而不是偷塞进 production。
- scene moment timeline bundle 保持稳定，因为 `scene_moment` 仍是系统生产单位。
- 下一步不是继续扩展 production builder，而是把剩余 legacy workbench/surface 入口接到 scope-aware assembly preview 和 project timeline status，减少旧 production preview timeline 的调用面。

### `apps/cli`

CLI 是迁移时最容易继续制造旧项目结构的入口：

- `production add` / `segment add` / `scene-moment add` 第一阶段保留为 legacy convenience command。
- `segment add` 目前默认 `--production main`，新 namespace writer 不应复制这个默认值，否则空项目会被隐式塑造成电影 production。
- `parsePlanningParentOptions`、`parseStoryboardParentOptions`、`parseAudioCueParentOptions`、`parseExpressionUnitParentOptions` 等 helper 现在都围绕 `productionId/segmentId/sceneMomentId`；应新增 normalized parent 解析层，避免每个命令单独理解 `segments` 路径。
- 新增 namespace-aware 命令时，不应直接叫 `episode_ref` 或 `act_ref`；应创建 namespace node、scene moment 或 timeline assembly。
- `content-unit add/modify` 已支持 `--timeline-assembly`、`--scope-kind`、`--scope-ref`，对应 `content_unit_type = "timeline_assembly_ref"`；只给出 assembly/scope 参数时会自动推断该类型。
- `content-unit add/modify` 仍支持 `--production`、`--segment`，但 help 中已标为 `production_ref / segment_ref` 的 legacy assembly alias；显式 assembly scope 写入时不会再把它们写成 primary ref。
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
- Agent-facing `domain_production_status_summary` 已并行返回 `project_timeline_status`，并把旧 `production_status_summary` 标成 alias；后续新增工具或 read model 可以直接以 `project_timeline_status` 为主 schema。

### `packages/mcp-host` 和 runtime status

MCP host 是 agent 进入 MovScript 的第一层入口，因此它的 legacy focus 语言会明显影响 agent 后续行为。

当前扫描结论：

- `movscript_runtime_status` 入参支持 `projectId` 和 legacy `productionId`。
- runtime status 会把 `productionId` 拼进 Local Surface Host URL query，但它只表示 legacy production-scope focus。
- runtime status 已支持把 `scopeKind/scopeRef/targetKind/targetRef/timelineAssemblyRef` 透传给 Local Surface URL；它不解释这些字段，只让 surface/read model 做 normalized focus 解析。
- `inspectProjectSource` 已使用 `@movscript/workspace` 的 source root files / source collection dirs 判断项目是否是 MovScript project；没有 legacy `productions/`、但有 `timeline/` source collection 的项目也能被识别。
- Local Surface URL 固定生成 overview/content/timeline 路由，并把 common query 传给 surface。
- 目前它还没有消费 future `namespacePath/focusedPrimitiveRef` 字段；如果新增，应继续作为 focus query 原样透传。

推荐策略：

- `productionId` 保留为 legacy focus，但 tool description 应说明它不是用户 timeline namespace。
- 新增 namespace focus 时，runtime status 不应新增解释逻辑；继续把 neutral focus fields 传给 surface URL，并由 Project Service/read model 解析。
- 项目识别已从手写固定目录名转向 workspace layout policy、`project.json` metadata 和 source collection 组合判断；后续新增 collection 应先进入 workspace layout policy。
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

- `packages/core/src/agent/surfaces.ts` 的 preview/status surface 已接受 normalized timeline scope / assembly target，并把 `productionId` 降为 legacy production-scope projection。
- `apps/desktop/src/pages/agent/AgentPreviewTimelinePage.tsx` 不再因为缺 `productionId` 阻塞；有 timeline assembly target 或 timeline scope 时也会 fetch snapshot。
- `surface/project/src/components/AgentPreviewTimelineSurface.tsx` 已显示 `Timeline preview`，缺失态改成 timeline preview scope，不再是 `Missing productionId`。
- `surface/project/src/components/AgentProjectStatusSurface.tsx` 已把文案改成 timeline readiness，并优先从 `project_timeline_status.timeline_assemblies` 读取工作项；legacy `productions[]` 只作为 fallback。
- `surface/project/src/components/AgentImpactSurface.tsx` 已优先从 normalized target/scope 生成 preview link；path regex 只做 legacy fallback。
- `surface/project/src/features/project/domain/projectEntryRegistry.tsx` 的入口 id/stage 仍是 `orchestration_production` 兼容 key，但文案、`owns/reads` 和 primary selection 已改成 timeline namespace、scene_moment、timeline_assembly；review 入口不再要求 production entity，并可携带 scope/target/`timeline_assembly_ref`。
- `surface/project/src/features/project/application/projectWorkspaceReview.ts` 已把 workspace artifact 的 target/scope 规范化成 focus query；非 production scope 会清掉旧 `productionId`。
- `projectOverviewData.ts` / `projectOverviewModel.ts` 已优先读取 content workspace snapshot 并消费 `project_timeline_status`；入口状态用 timeline namespace、scene_moment/system primitive、timeline assembly readiness 和 content-unit readiness 计算，旧 `productions/segments` list 只作为 fallback。

推荐策略：

- Agent surface entity/query 已增加 timeline scope / assembly / normalized focus；后续如引入 `namespacePath` / `timelineAssemblyId` 展示字段，应继续映射到同一 normalized focus。
- Preview timeline surface 的长期目标应是 assembly preview，而不是 production preview；没有 assembly 时可以从 namespace scope 反查可用 assembly 或提示创建 assembly。
- MCP project status summary、Project Service read model、Local Surface Host status snapshot 和 AgentProjectStatusSurface 的主数据结构已从 `productions[]` 升级到 timeline namespace/assembly/readiness projection。
- Impact surface 的 preview link 从 normalized target/assembly/content unit 生成；path regex 只做 legacy fallback。
- Project entry id 可以保留 `orchestration_production` 做路由兼容；primary selection 已按 timeline scope 传递，后续 UI title/tab label 应按 project vocabulary 展示，不把 production 当唯一蓝图入口。
- Project overview 已接入 `project_timeline_status` 作为主状态来源；没有 host snapshot 时才回退到 legacy semantic lists。

### Local/Web Surface Host 和 Desktop Semantic API

这层风险比普通展示层高，因为它会把 UI 操作写回 workspace。

当前扫描结论：

- `services/local-surface-host/src/routes/localRouteLinks.ts` 的 `projectRouteContext` 已从 normalized focus 推导 legacy production scope；如果 focus 是 `episode/act/beat` 这类非 production scope，会清掉旧 `productionId`。
- `services/local-surface-host/src/project/localProjectSurfaceRuntime.ts` navigator 已在合并 query/params 后规范化 timeline focus，避免旧 productionId 和新 namespace scope 同时存在。
- `services/web-surface-host/src/main.tsx` 已用同样的 focus-first 逻辑把 `productionId` 当 legacy fallback。
- status/read-model snapshot 已有 `project_timeline_status` 主投影；production summary 兼容路径保留为 legacy fallback。
- `services/local-surface-host/src/host-runtime/infrastructure/api/semanticEntities.ts` 还有一套 host runtime semantic entity adapter，把 `segments` 映射到 `segment`、`productions` 映射到 `production`、`settingStates` 映射到 `setting_state`。
- `apps/desktop/src/shared/infrastructure/api/semanticEntityWorkspace.ts` 的 writable kinds 包含 `productions / segments / sceneMoments`。
- Desktop writer 创建 segment 和 scene moment 时强制要求 `production_id / segment_id`，并调用 `saveProductionSnapshot` 写回旧目录树。
- Desktop semantic entity config 已把 `productions / segments` 描述为 legacy timeline projection，把 `sceneMoments` 描述为固定 system primitive；这只是防止 UI/API 继续误导，不代表 writer 已完成 namespace-aware 迁移。

推荐策略：

- Host route 的 `productionId` 保留为 legacy focus，不继续代表唯一 timeline namespace。
- namespace focus 通过 `scopeKind/scopeRef`、`targetKind/targetRef` 或后续 `namespacePath` 原样传入 surface；只有 `scopeKind=production` 会投影回 legacy `productionId`。
- Local/Web host runtime 已原样转发 normalized focus，避免只有 Desktop 能打开 namespace-aware surface。
- `movscript.production_status_summary.v1` 在 host 内部作为 legacy alias；新 status snapshot 已优先来自 Project Service/read model 的 timeline projection。
- Local Surface Host 的 semantic adapter 已优先消费 Project Service resource projection，把 `productions/segments/settings/settingStates` 当 legacy alias；后续继续迁移其他固定映射。
- Desktop semantic entity writer 已接入 namespace-aware hierarchy writer：显式 `namespace_kind` 会写 `timeline/...`，无 namespace payload 保留 legacy convenience；后续要让默认 UI 选择 project vocabulary，而不是要求用户手填。
- `sceneMoment` writer 可以保留，但 parent 参数应从 `production_id + segment_id` 逐步升级为 `timeline_parent_ref` 或 normalized parent edge。

### Desktop Agent workspace 和 Admin history

这层不直接定义 source schema，但会影响 agent 如何理解“当前用户正在看的对象”。

当前扫描结论：

- `apps/desktop/src/shared/contracts/workspaceChangeHandoff.ts` 已从 workspace target 构造 normalized focus route params；`production_workspace` 没有 production target 时也可打开项目级 scripts review；非 production scope 不会制造 `productionId`。
- `apps/desktop/src/features/agent/domain/workspaceDomainModel.ts` 已把 `content_unit_workspace` 指向 production/segment 的情况投影到 content preview 的 `timeline_assembly` focus，不再回到 production scripts workbench。
- `AgentRuntimeChatShell.tsx` 已从 URL query 读取 normalized focus；`scopeKind=episode` 这类非 production focus 会保持 project scope + `domainFocus`，不会伪装成 runtime production scope。
- `agentCommandInput.ts` 已把 normalized focus 写入 `uiSnapshot.domainFocus`，并优先用 target/entity/scope 生成 page context；`productionId` 只是 legacy route hint。
- `agentSessionGenerationProjection.ts` 和相关测试仍把 `production_workspace` 显示为“制作工作区”。
- `surface/admin/src/types/index.ts` 和 `surface/admin/src/i18n/locales/*.json` 仍保留 `asset_slot`、`segment`、`scene_moment`、`production_workspace`、`content_unit_workspace` 等历史类型和标签。

推荐策略：

- `production_workspace` 和 `content_unit_workspace` 第一阶段作为 legacy workspace alias 保留，避免打断已有 review/handoff；语义上已经转为 timeline structure / content-unit review 的兼容名。
- 新增 focus payload 优先使用 `domainFocus` 或可规范化字段，例如 `scopeKind/scopeRef`、`targetKind/targetRef`、`timeline_assembly_ref`、`contentUnitId` 或 `focusedPrimitiveRef`。
- Agent command input 已不再仅凭 `productionId` 推断当前对象；后续 read model 返回 vocabulary label 后，应继续落到同一个 normalized focus。
- content unit / scene moment review path 优先进入 content preview；namespace scope output 进入 assembly/content unit review，这条已经在 Desktop handoff 和 workspace artifact review path 中覆盖。
- Admin/workspace history 可以继续保存原始 legacy kind，但展示标签应逐步来自 project vocabulary/read model，而不是硬编码成 schema 事实。
- 如果历史记录指向 namespace scope 输出，review path 应落到 `timeline_assembly_ref` content unit 或 content preview，而不是让 namespace 自己成为 review target。

### Desktop Electron runtime bridge

Electron 这一层更像 runtime/context bridge。它不应该定义用户 namespace，但如果继续只传 `productionId`，agent 和 provider session 仍会被拉回旧 focus。

当前扫描结论：

- `apps/desktop/src/electron/ElectronMCPContextBridge.tsx` 已从 route search 派生 `domainFocus`，并只在 `scopeKind=production` 时回填 legacy `productionId`。
- `apps/desktop/src/shared/contracts/electronApiWorkspaceContext.ts` 和 `providerConfigModel.ts` 的 workspace scope 仍是 `global | project | production`，但 workspace context 已能携带 `domainFocus`。
- `apps/desktop/electron/services/workspaceRealm.ts` 看到 `scope = production` 时仍把 workspace 归到 project dir/provider session cwd，不单独解释 production source。
- `apps/desktop/electron/services/projectEngineRegistry.ts` 会把 content unit 的 `production_ref / segment_ref / scene_moment_ref` 还原成 runtime fields。
- `apps/desktop/electron/ipc/movscriptEngineIpc.ts` 和 preload API 仍暴露 `createProduction`、`createSegment`、`saveProductionSnapshot` 作为 legacy compatibility。
- `apps/desktop/electron/services/projectEngineRegistry.ts`、IPC 和 preload API 已新增 `ensureMovScriptEngineTimelineAssemblyContentUnit`，调用方只提供 scope；bridge 会强制写成 `timeline_assembly_ref` content unit，不会调用 production/segment writer；共享 `SurfaceHostApi` 和 Content Canvas Electron gateway 已接入这条 facade。
- `apps/desktop/electron/services/mediaPipeline/**` 中的 `segment` 主要是 HLS/timeline media segment，不属于 domain namespace 改造。

推荐策略：

- Electron workspace scope 的 `production` 保留为 legacy runtime scope，短期不直接替换成 episode/act。
- MCP context bridge 已新增 normalized focus payload；后续如增加 `namespacePath/focusedPrimitiveRef` 字段，应先进入 `@movscript/domain` focus helper，再由 bridge 透传。
- workspace realm 继续负责 cwd/realm，不负责解释 namespace；namespace 解释在 Project Service/read model。
- Project engine registry 应把 `production_ref / segment_ref` 规范化成 assembly alias，再交给 runtime snapshot。
- Engine IPC 的旧 create production/segment API 保留兼容；新 namespace scope 输出应优先走 `ensureMovScriptEngineTimelineAssemblyContentUnit` 或 Project Service `ensureTimelineAssemblyContentUnit`，不再让调用方手拼 `production_ref/segment_ref`。
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

- `plugins/movscript/skills/*` 和 `apps/plugin/skills/*` 里的 planning/domain/generation/editing/review/content-unit recipe 已换成 namespace + primitive / assembly；plugin bundle/cache 仍需通过构建同步。
- `README`、CLI 示例、runtime architecture 文档中的固定路径说明要标注 legacy。
- 测试分两批：第一批覆盖 projection/compatibility；第二批在 source layout 变化时再大规模改路径 fixture。

技能文档里优先要改这些位置：

- `planning/references/entity-mapping.md`: `production / episode / film unit -> production` 要改成 timeline namespace vocabulary。
- `planning/references/content-unit-recipes.md`: 已把 `production_ref` / `segment_ref` 改成 legacy assembly alias，新推荐是 `timeline_assembly_ref`。
- `planning/references/planning-workflows.md`: “Create production, segment, scene moments” 改成 “choose timeline namespace path, then create scene moments”。
- `domain/references/domain-story.md`: “production granularity decision” 改成 “timeline scope / production center decision”，避免把 granularity 和固定 production entity 绑定。
- `generation/SKILL.md` / `review/SKILL.md`: 已把 production output/readiness 改成 content-unit output、system primitive / assembly 和 generation readiness。
- `editing/SKILL.md`: 已把 production timeline composition 改成 timeline assembly / legacy production handoff。

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
| Namespace projection fixtures | 保留 legacy `project.json.namespace_vocabulary` 兼容读取 + legacy source projection | 证明旧项目 vocabulary 仍能显示，但 source layout 不必先变 |
| New semantic fixtures | 新增制作 root `production_type` / `timeline_namespaces`、explicit parent/scope refs、`timeline_assembly_ref`、namespace node 不含 content-unit-ref | 证明新语义成立，且 namespace 不进入 candidate/selection |

第一阶段最值得新增的测试：

- `packages/domain`: category/target/ref/path/focus/invariant/vocabulary 的纯函数测试；证明 namespace target 被拒绝、legacy production/segment ref 投影为 assembly、path parent edge 保留但不决定用户 vocabulary，vocabulary fallback/child-kind 只提供创建顺序、不创建 parent truth。
- `packages/language`: project schema 兼容读取 `namespace_vocabulary`，但 project 初始化不写 selected timeline。
- `packages/core`: read model 能把 legacy production/segment 投影成 timeline namespace。
- `packages/interpreter`: legacy `production_ref/segment_ref` 在 normalized graph 中投影为 implicit assembly。
- `packages/interpreter`: `timeline_assembly_ref` content unit 能进入 artifact/stale/prompt adapter。
- `surface/project`: namespace node 无直接 generation command，Creative Canvas action model 已按 `domainCategory` 分发 namespace 子动作；assembly/primitive 有 generation command。
- `surface/project`: content canvas create/layout/navigation 不再把 production/segment 固定成唯一结构列和唯一 parent chain。
- `surface/project`: content canvas candidate generation/upload/select 仍只对 `content_unit` 生效；namespace node 没有 direct candidate action。
- `surface/project`: direct scene-moment creation 以及 Content Canvas root/child legacy timeline creation 的旧 production + segment mount 已显式化为 `legacyTimelineMount`；root namespace、direct scene-moment、normalized timeline namespace parent 下的 child namespace / scene_moment 创建已走 path-first hierarchy writer；root/child timeline namespace kind 已接 project vocabulary，并通过 `@movscript/domain` 统一 fallback/next-kind；root setting namespace、setting child namespace/state create 和 direct prompt 自动挂载 setting/state 已接 project setting namespace vocabulary，并写入 `namespace_kind`；namespace scope assembly 已创建 `timeline_assembly_ref` content unit，Electron gateway 已断言走 `ensureMovScriptEngineTimelineAssemblyContentUnit`；结构树、radial code、关系事实和主要创建文案已显示 vocabulary/category；layout arrange 已按 domain ancestor depth 排列 timeline namespace，navigator 已携带 `domainKind`，collapsed summaries 和 filter labels 已按 namespace `domainKind` 展示。最终还需要把其他 legacy surface 继续 vocabulary 化。
- `surface/project`: project entry/overview 能以 `project_timeline_status` 中的 namespace vocabulary、scene_moment/system primitive 和 assembly readiness 计算进度，不再以 `productions.length === 0` 或 legacy semantic list 作为唯一入口判断；project entry registry/session store 已覆盖 `scopeKind/scopeRef`、target focus、`timeline_assembly_ref` review query 和字符串 namespace ref 持久化。
- `packages/core`: old content workbench write model 作为 legacy compatibility 保留；无 productionId 的 assembly move payload 已写 `target_kind/target_ref/scope_kind/scope_ref`，新 assembly preview 不写入 `preview_timeline.production_id`。
- `packages/core`: `ContentSourceWorkspaceEditingTimeline.targetKind` 支持 `timeline_assembly`，legacy production timeline 投影到 assembly。
- `packages/core/src/agent`: preview/status browser surface 支持 `timelineScopeId/namespacePath/timelineAssemblyId`，`productionId` 只是 legacy query。
- `packages/prompt`: `{{episode::id}}` 不作为 selected resource dependency；`{{content_unit::id}}` 进入 selection gate，未来如新增 `{{timeline_assembly::id}}` 必须避免和 content-unit 引用双轨。
- `services/data-service`: content candidate generation/reconcile 继续只写 `target_kind = "content_unit"`。
- `services/local-surface-host` / `services/web-surface-host`: `productionId` 仍可作为 legacy focus，但 namespace focus 能投影到 status summary；Local Surface Host status snapshot target 已携带 normalized `domain_focus`；Local/Web route tests 已覆盖非 production scope 不回填 `production_id`，以及 `timeline_assembly_ref` alias 不被误解释成 production。
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
- `packages/core/tests/content.test.mjs`、`packages/core/tests/production.test.mjs`、`packages/core/src/content/workbenchWriteModel.ts` 对应测试：覆盖 legacy production orchestration/workbench 不被新 namespace 继续扩展，并覆盖无 productionId 的 assembly scope timeline move payload。
- `surface/project/src/features/content/application/contentCanvasArchitecture.test.ts`、`contentCanvasWorkspaceCommandModel.test.ts`、`projectEntryRegistry.test.ts`、`projectEntrySessionStore.test.ts`、`projectOverviewModel` 相关测试：覆盖 canvas graph/action/layout/create command/candidate action、project entry scope-first primary selection/session focus 和 project overview 的 namespace projection。
- `surface/project/src/features/content/integrations/contentSourceWorkspaceElectron.test.ts`、`packages/core/src/content/sourceWorkspaceData.ts` 对应测试：覆盖 source workspace parent refs 不再只从 `productions/segments` 推导。
- `surface/project/src/components/AgentPreviewTimelineSurface.tsx` 和 `packages/core/src/agent/surfaces.ts` 对应测试：覆盖 preview/status surfaces 可用 assembly/timeline focus，不再强制 `productionId`。
- `packages/prompt/tests/content-unit-prompt.test.mjs`: 保留 `{{segment:opening}}` 解析到 legacy `segment_ref` selected resource 的测试，同时新增 prompt ref 不直接把 namespace 作为 selected resource dependency 的测试。
- `packages/editing/tests/media-project.test.mjs`、`packages/editing/tests/service-client.test.mjs`、`services/editing-service/tests/server.test.mjs`: 覆盖 `productionTimelineBundle` 作为 legacy assembly alias，以及新 assembly target 的 MediaEditingProject provenance。
- `packages/project/tests/client.test.mjs`、`services/project-service/tests/server.test.mjs`、`packages/core/tests/mcp.test.mjs`: resource view/MCP `resources/read` 已覆盖 namespace vocabulary、timeline namespace、setting namespace、legacy timeline/setting aliases 和 domain edge projection；Project Service read model 和 MCP status summary 已覆盖 `project_timeline_status` / `timeline_assembly_ref` projection。
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
- 新写入的 namespace node 不包含 `content_unit_ref/content_unit_refs/main_content_unit_id` 这类字段，也不包含 `candidates/selection/selected_candidate_id/selected_resource_id/resource_id` 这类生产状态字段。
- 新建 content unit 时不能把 `target_kind` 设为 timeline namespace 或 setting namespace。
- `scene_moment` 仍能作为固定 system primitive 被创建、查询、生成、进入 stale graph。
- 需要 namespace scope 输出时，通过 `timeline_assembly_ref` content unit 进入生产流程。
- 旧 `production_ref / segment_ref` 在 normalized graph 中等价于 implicit `timeline_assembly_ref`，并有测试覆盖。
- relation/stale graph 消费 normalized edge；树状父子关系可以来自 path，target/scope/cross-tree 关系来自显式 refs；显式 parent/scope ref 与 path parent 冲突时报 `path_parent_ref_conflict`。
- UI 中 namespace node 没有直接“生成候选/选择候选”的主流程；assembly 和 system primitive 才有。
- Content Canvas 的 node kind、layout、create action 和 candidate action 能区分 namespace node 与 system primitive；不会默认创建 `canvas_production/canvas_segment` 作为新结构前置。
- Content Canvas 的 namespace assembly ensure 走 `ensureMovScriptEngineTimelineAssemblyContentUnit`，由 desktop bridge 生成 canonical `timeline_assembly_ref`，而不是由 UI 复用 production/segment writer。
- Project Entry/Overview 不再把 `orchestration_production`、`productionId` 或 `productions.length` 当成唯一项目进度和 review 入口；Project Entry primary selection/session 已支持 timeline scope、assembly target 和字符串 namespace ref；overview 已优先消费 `project_timeline_status`。
- prompt compiler / source validation 不把任意 namespace ref 当成必须 selected candidate 的资源依赖，并对 namespace-like prompt refs 报 `unsupported_prompt_ref_kind`。
- Editing Service 能接收 assembly target 或明确把 legacy production timeline bundle 投影为 assembly。
- Agent Browser preview/status surfaces 支持 timeline scope 或 assembly focus；`Missing productionId` 不再阻塞新模型路径。
- Agent surface snapshot/status 已在 MCP summary 和 Local Surface Host read model adapter 中明确把 `movscript.production_status_summary.v1` 和 `productions[]` 标为 legacy alias，并提供 `project_timeline_status` 主投影；Project Service source command、Local Surface semantic adapter、Desktop semantic writer、MCP `domain_upsert_timeline_namespace_tree`、path-aware `domain_upsert_scene_moment` 以及 `expression_unit/storyboard/keyframe/audio_cue` upsert 工具已开始消费同一 projection，tree writer 已支持在 namespace path 下写入这些 system primitive，剩余 legacy caller 继续迁移。
- Core legacy content workbench 的 production orchestration/write model 被明确隔离为 compatibility；write model 已支持 assembly scope payload，但不把 namespace 变成 production_id。
- CLI、MCP 和 agent skills 不再推荐新建 `production_ref / segment_ref` 作为普通 production unit；只作为 legacy assembly alias。
- Engine/MCP tree upsert 不会自动给 namespace scope 创建 `production_ref/segment_ref` content unit；`domain_upsert_timeline_namespace_tree` 上的 namespace-scope `content_units` 会被收敛为 `timeline_assembly_ref`，旧 `domain_upsert_production_tree` 只作为兼容入口保留。
- Project Service resource view 不再把 `episodes/scenes/settings/setting-states` 直接硬映射为 production/segment/setting/state ontology，而是返回 vocabulary-aware projection，并给 legacy item 标注推荐 canonical resource kind。
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

当前已经建立纯领域抽象 package，让后续迁移都有同一个语义中心：

- 已新增 `packages/domain` / `@movscript/domain`。
- 已定义 category、system primitive、content unit target、relation edge、normalized focus。
- 已实现 legacy projection：`production/segment/setting/state` 投影到 namespace；`production_ref/segment_ref` 投影到 assembly。
- 已实现 invariant：namespace 不作为 content unit target，不拥有 content-unit-ref，不拥有 candidate/selection。
- 已实现 path parent edge normalizer：path 是 containment source，不是用户 vocabulary source。
- 已实现 namespace vocabulary fallback、root kind 和 child kind 推导；fallback 只作为创建顺序，不作为实例 parent truth。
- 已增加 package-level tests，作为下游迁移的哨兵。

这一阶段完成后，后续 package 只接入 `@movscript/domain`，不再复制 namespace/target/ref 判断。

### Phase 2：制作级 production type + read-model projection

先不改 source layout，只做用户可见和 agent 可理解的抽象：

- project 初始化保持干净，不写 selected timeline。
- 创建制作时选择 production type，并把推荐内部 `timeline_namespaces` 写入 root production。
- `project.json.namespace_vocabulary` 仅作为旧项目兼容和可选 registry 读取。
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

当前状态：relation graph 已消费 `@movscript/domain` 的 path parent edge、content unit target/scope normalizer 和 legacy assembly alias；impact report 已能让 namespace context 变更沿 relation graph 影响 descendant primitive、timeline assembly content unit 和 setting asset content unit；regeneration plan 已优先从 latest interpret 的 impact report artifact 读取 changed entities、affected content units 和 preview timeline hints。

### Phase 5：namespace-aware writer/API/UI

当 projection 稳定后，再改写入入口：

- 新增 namespace-aware create/update API。
- MCP 已新增 `domain_upsert_timeline_namespace_tree`，用于写 `timeline/**` 下 path-first 的 timeline namespace tree，并能在 namespace 节点下写入 `scene_moment` 及其 system primitive 子节点；`domain_upsert_scene_moment` 已支持 `targetPath/namespacePath`，`domain_upsert_expression_unit/keyframe/storyboard/audio_cue` 已支持 `targetPath/sceneMomentPath/expressionUnitPath` 直接写入 namespace scene-moment path；旧 `domain_upsert_production_tree` 继续作为 legacy production/segment projection API。
- UI 支持递归 timeline namespace 和 setting namespace。
- namespace node 的主要操作是“新增子 namespace / 新增 scene_moment / 新增 assembly / 编辑上下文”，不是“生成内容”。
- Content Canvas 改成 category-driven action model，不再用 production/segment 固定列和固定 parent chain。
- Agent Browser surfaces、Project Entry primary selection/session、Project Overview 同步支持 namespace/assembly focus。
- Legacy content workbench/production orchestration helper 冻结为 compatibility，不继续承接新 namespace 字段。
- `domain_upsert_production_tree`、`domain_upsert_segment`、`domain_upsert_setting_tree` 继续保留为 legacy convenience API；新 timeline namespace 写入优先使用 `domain_upsert_timeline_namespace_tree`。

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
| Local Surface Host semantic adapter 继续维护固定 vocabulary，和 Project Service read model 分叉 | 中 | host adapter 已消费 Project Service resource projection；剩余固定映射只保留给非 namespace 实体和 fallback |
| Agent Browser preview/status surface 强制 `productionId`，新 namespace/assembly 项目无法进入 review | 中 | surface entity/query 支持 timeline scope 和 assembly focus；productionId 只做 legacy query |
| Source command/semantic adapter 继续维护 production-first vocabulary，让 agent 以为 production 是唯一状态单位 | 中 | MCP summary、Project Service read model、Project Service canonical source command、Local Host status/semantic adapter、Desktop semantic writer 和 MCP timeline namespace tree writer 已接同一 projection；旧 caller 保留 compatibility 并继续迁移 |
| Agent decision request 允许 namespace target，被用户 adopt/reject 后形成伪稳定状态 | 中高 | decision metadata 只允许 content unit candidate/resource 或 system primitive/assembly target |
| inline candidate helper 被继续扩展，出现 `episode/act` 这类 legacy direct target | 中高 | 冻结 inline target kind；新增生成/选择流统一进入 content unit candidate |
| content canvas 命令误给 namespace node 创建生成任务，或自动创建 `canvas_production/canvas_segment` | 中 | UI command model 按 node category 控制；namespace 只反查相关 work items，新创建走 namespace/primitive/assembly |
| Project Entry/Overview 用 `productionId` 或 `productions.length === 0` 阻塞内容入口 | 中 | Entry primary selection/session 已支持 `scopeKind/scopeRef`、assembly target 和字符串 namespace ref；overview 已优先消费 `project_timeline_status`，progress/blocking 基于 namespace template、scene_moment、assembly/content unit readiness，legacy semantic list 仅 fallback |
| legacy content workbench write model 继续扩展 production timeline 字段 | 中 | 标为 compatibility；无 productionId 时已输出 assembly target/scope payload；新 assembly preview 走 normalized read model 和 Editing Service |
| generated plugin bundle/agent skill 与源代码语义漂移 | 中 | 源语义稳定后重新构建 bundle、更新技能和 manifest，并加 drift check |
| README/架构文档/CLI 示例继续教旧 production/segment 层级 | 中 | schema 决策后同步更新 docs/examples；迁移期统一标注 legacy projection |

## 设计原则

1. 用户拥有 namespace 命名权。
2. 系统保留 namespace 行为分类。
3. System primitives 保持系统类型稳定。
4. Content unit 保持唯一生产任务入口。
5. Namespace node 不能直接成为 content unit target。
6. Namespace source record 不保存 content-unit-ref 反向指针。
7. Candidate、selection 和 resource 状态不写回 namespace node。
8. `scene_moment` 保持固定系统生产单位，只允许 UI alias。
9. Stale impact 追踪语义依赖，而不是只追踪路径。
10. Path 父子关系是默认 parent edge 来源；先抽象 read model，再评估是否真的需要迁移 source layout。

## 建议决策

### Project 不选择 timeline，制作选择 production type

新建 project 时不应填写 `timeline_template`、`timeline_namespaces` 或 selected timeline vocabulary。Project 是工作区和素材/设定容器，不是某一种影片结构本身。

真实项目里可能同时存在多个制作：一个长片、几个预告短视频、一集电视剧、一个课程小节。它们可以共享 setting namespace、素材和 project standards，但 production 的业务类型和内部 timeline namespace 推荐应该在创建“制作”时选择。

推荐制作 root 记录的概念形态：

```json
{
  "schema": "movscript.production.v1",
  "kind": "production",
  "id": "launch_promo",
  "title": "Launch Promo",
  "namespace_kind": "production",
  "production_type": "video",
  "timeline_namespaces": ["hook", "proof", "demo", "cta"]
}
```

如果需要让用户维护自定义 type/profile library，可以把它作为 project 级 registry 存在，例如 `production_type_profiles`、`namespace_profiles` 或兼容期的 `namespace_vocabulary`。但这只是“可选词库”，不是 project 的 selected timeline。

`project_standards.json` 仍然只放风格、镜头、画面、负面提示词、生成偏好等创作标准。后续如果 namespace registry 变得很大，可以再迁移到独立文件，例如 `namespace_vocabulary.json`，但第一阶段不建议过早拆分。

### Timeline namespace 需要制作级默认推荐

Timeline namespace 需要默认推荐，但推荐属于 production type，不属于 project。模板只能是起步脚手架，不应成为硬编码 ontology，也不应自动创建 production 内部实例树。

推荐提供这些内置 production type：

- `video`: `hook / proof / demo / cta`
- `film`: `act / sequence / beat`
- `episode`: `act / sequence / beat`
- `lesson`: `segment`
- `custom`: 用户填写自己的 `production_type` 和 `timeline_namespaces`

模板的作用是降低创建制作的启动成本，并帮助 agent 选择合理的初始规划语言。模板不应该决定系统行为；系统行为仍来自 domain 分类：production/timeline namespace、setting namespace、system primitive、content unit。电视剧的 `series / season` 可作为 tag、分组、筛选字段或用户自定义 namespace，但系统默认只创建具体要生产的一集 production。

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

实现层面不应把未知 prompt ref 当作无害文本静默放过。`{{episode::episode_01}}`、`{{beat::opening}}` 这类 namespace-like ref 应产生 `unsupported_prompt_ref_kind` blocker / source validation diagnostic，提示 namespace vocabulary 只是上下文，不是 selected-resource dependency。这样可以避免 agent 以为某个 namespace node 已经拥有可选择候选或稳定资源。

### Editing target 从 production 升级到 assembly

剪辑和合成层也不应长期把 `production` 当作唯一聚合目标。

当前 production timeline / production edit plan 可以兼容解释为 legacy assembly：

```text
production timeline bundle -> timeline_assembly(scope = legacy production)
segment timeline bundle -> timeline_assembly(scope = legacy segment)
scene moment timeline bundle -> scene_moment
```

当前实现已经把 production timeline / production edit plan 包成 production-scope assembly alias：editing artifact、MediaEditingProject source/provenance、context selected units 都会携带 `target_kind = "timeline_assembly"`、`target_ref = "timeline_assembly:production:<id>"`、`scope_kind = "production"`、`scope_ref = <id>`，同时保留 `productionId / productionPath` 和 legacy target 字段给旧调用方。

`timelineAssemblyBundle` 是新的 canonical service view。production scope 仍作为 legacy alias 走旧 production preview timeline；非 production scope，例如 `timeline_assembly:episode:pilot`，会通过 Workspace Service 从 timeline namespace scope 派生 preview timeline items，并生成不含 `productionId` 的 MediaEditingProject source/provenance。找不到 scope 时返回 blocked bundle，而不是把 episode/act/beat 偷偷降级成 production。

长期形态仍然是 editing artifact 接收 `target_kind = "timeline_assembly"`、`target_ref`、`scope_kind`、`scope_ref`，而不是必须携带 `productionId / productionPath`。`scene_moment` timeline bundle 可以保持稳定，因为它本来就是系统生产单位。

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
