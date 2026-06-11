# MovScript Skill Language Refactor

## 目标

这次重构的目标不是给每个 skill 增加更多规则，而是让所有 skill 使用同一条 MovScript 生产故事线：

```text
影视结构
  -> 连续性资产
  -> 镜头视觉锚点
  -> 可生成的 content unit
  -> candidates / selection
  -> interpreter 检查影响和过期状态
```

用户说“我要改一个镜头”“我要补关键帧”“我要选角色形象”“这个结果是不是过期了”时，skill 应该能稳定判断这是在改源结构、补连续性资产、生成候选、选择结果，还是解释修改影响。

同时，skill 不应该擅自扩大用户需求。用户可能只是想做一个简单视频，也可能是在搭建一个可长期复用、可追踪、可连续生产的项目。agent 必须先判断或询问用户的目标范围，再决定是否引入完整的 production / setting / asset / content unit 结构。

如果用户明确说要模仿某个镜头或参考视频，skill 不应只根据文字描述直接生成。必须先把参考视频作为素材进行抽帧分析，理解构图、景别、运动、节奏、主体调度和关键画面，再把分析结果整理成 storyboard/panels，并创建对应的 content unit 用于上传、候选化和选择分镜图。

## 当前问题

现有 `domain`、`planning`、`generation`、`review` skill 都包含了正确规则，但概念分散：

- `content_unit` 的解释散落在 domain/planning/generation/review 中，容易被理解成影视层级节点。
- `setting / setting_state / asset` 的目的没有被讲成“连续性防穿帮机制”。
- `storyboard` 和 `keyframe` 都在说视觉表达，但分工需要更明确。
- `candidate / selection / interpreter` 的闭环没有形成一段统一叙事。
- planning 和 generation 都有“缺规划 / 可补图 / 可生成”判断，但缺少同一套判断依据。

重构后应避免每个 skill 自己解释一套概念。

## 核心叙事

MovScript 不是一次性 prompt 系统，而是一个影视生产语言。

它先把影片拆成可编辑、可审查的影视结构：

```text
production -> segment -> scene_moment -> shot
```

然后用更细的视觉、声音、表演和连续性对象降低生成破绽：

```text
setting -> setting_state -> asset
shot -> storyboard / keyframe / expression_unit / audio_cue
```

最后用 `content_unit` 把源结构引用起来，形成一次可生成、可选择、可检查的生产任务：

```text
content_unit -> candidate -> selection
```

`interpreter` 负责读取源文件变化、解释语义影响、判断 selection 是否 stale，并指出哪些 content unit 需要用户决策。

除了 `content_unit` 以外，其他实体都应理解为影视生产的前置结构：它们描述故事、场面、镜头、表演、声音、角色、状态、资产和视觉锚点。它们不是每次都要一次性全部设计出来，而是根据用户当前目标逐步补齐。

## 术语定义

### 影视结构

`production` 是可生产的视频成品边界，例如一集、一个短片、一个广告片。

`segment` 是 production 内的节奏、情绪或戏剧功能段落。它不一定等于传统场景，更像剪辑和叙事节奏单元。

`scene_moment` 是具体戏剧时刻，描述何时、何地、发生什么、情绪是什么。它提供上下文，不是镜头本身。

`shot` 是真正的镜头生产单元，承载景别、机位、运动、调度、灯光、表演、声音、时长、转场等镜头语言。

`expression_unit` 是 scene_moment 里的表达单元，例如对白、旁白、字幕、动作文本、视觉说明。它服务于叙事和表演表达。

`audio_cue` 是 scene_moment 里的声音单元，例如音效、音乐、环境声、对白提示、拟音。它服务于声音连续性和节奏。

这些实体和 setting/state/asset/storyboard/keyframe 一样，都是生成前的影视结构或生产条件。它们帮助 content unit 变得可生成、可复用、可检查，但它们本身不是 content unit。

### 连续性资产

`setting` 是可复用事实，例如角色、地点、道具、世界规则、风格。

`setting_state` 是同一个 setting 在某个上下文里的状态，例如雨中湿发、受伤妆、损坏道具、夜晚场景。

`asset` 是挂在 setting state 下的资源槽，例如“湿发参考图”“角色正脸参考”“损坏手机参考”。asset 不是候选结果本身，它说明这里需要一个稳定资源。

只有当一个对象需要跨镜头复用，或会影响视觉一致性时，才应抽成 setting/state/asset。一次性、不复用的内容不必资产化。

asset 图应尽量脱离具体场景情节，强调可复用身份和状态。优先使用少背景、干净背景或中性背景的多视角 content-unit 图来说明角色、道具、服装、妆造、状态和材质；避免把某个剧情镜头、具体场景光效、复杂环境和一次性构图固化进 asset。这样 asset 才能在多个 scene_moment、shot、storyboard 和 keyframe 中复用。

### 镜头语言

`storyboard` 是 shot 的视觉组织方案。它描述镜头如何被视觉化，包括画面节点、时间线、分镜面板、setting refs、连续性说明和 prompt hint。

`keyframe` 是 shot 的视觉锚点。它用于在视频生成前先锁定关键画面、构图、状态和连续性，也可以作为后续视频生成的参考图来源。

当用户要求“模仿某个镜头”时，storyboard 还承担参考镜头拆解结果：从参考视频抽帧得到的代表性画面、镜头运动、主体位置变化、节奏点和转场关系，都应该进入 storyboard graph、timeline 或 storyboard_panels，而不是只写成一段泛化 prompt。

简化理解：

```text
shot 说明怎么拍
storyboard 说明这一镜头如何被视觉组织
keyframe 锁定某个关键画面应该长什么样
```

### 生产任务

`content_unit` 是顶层项目级生产任务，不是影视层级节点。

它通过 refs 指向影视结构、资产、关键帧、分镜、音频或表达单元，然后派生出 runtime panel、input version、dependency report 和 selection validity。

当前专业类型：

| 类型 | 输出 | 用途 |
| --- | --- | --- |
| `asset_ref` | image | 生成或选择可复用资产参考图 |
| `keyframe_ref` | image | 生成或选择关键帧参考图 |
| `storyboard_ref` | video | 生成或选择分镜/镜头视频结果 |

未知 `content_unit_type` 可以存在，但 interpreter 不会为它完整追踪上游依赖、hash 和 stale 状态。

对于“模仿参考镜头后上传分镜图”的工作流，应创建一个专门承接分镜图的 content unit。当前实现如果还没有专门 adapter，可以先使用明确命名的 generic 类型，例如 `storyboard_panel_ref` 或 `storyboard_upload_ref`，但 skill 必须说明它是分镜图上传/候选/选择槽，不是最终视频生成槽。后续 refactor 应补一个专业 adapter，让分镜图 content unit 也能被 dependency report、input hash 和 stale selection 正式追踪。

设计原则：先有必要的影视结构，再创建 content unit。不要为了创建 content unit 而强行补全整部影片的所有分镜、所有 keyframe、所有资产和所有声音细节。

### 候选和选择

`candidate` 是生成、上传或导入得到的可选结果。

`selection` 是用户或 workflow 确认采用的结果。selection 应该记录 candidate/resource、选择原因、接受时的 input hash 或提示词快照，以及 stale policy。

不要因为生成成功就自动 selection。生成只是提供候选，选择才是产品状态决策。

如果下游 content unit 依赖上游 content unit 的已选结果，而上游还没有 selection，则不要开始下游生成。先让用户选择、确认或明确接受缺少依赖的风险。默认规则是：没有被选择的候选不能作为稳定依赖。

### Interpreter

`interpreter` 的职责是解释当前源状态，而不是替用户决定生成。

它应回答：

- 源文件是否有效。
- 改动属于 metadata、semantic input、reference、selection 还是 sequence reorder。
- 改动影响 content unit 自己，还是影响下游引用。
- 当前 selection 是否 stale。
- 哪些 downstream content units 需要 review。

“affected” 不等于“必须 regenerate”。它表示需要用户或 workflow 做决策：keep、relink、re-prompt、regenerate、re-shoot、deprecate 或 accept-stale。

## 目标 Skill 结构

推荐保留现有 skill 数量，但调整职责和引用关系：

```text
skills/domain/SKILL.md
skills/domain/references/domain-story.md
skills/domain/references/entity-glossary.md

skills/planning/SKILL.md
skills/planning/references/planning-workflows.md
skills/planning/references/content-unit-recipes.md

skills/generation/SKILL.md
skills/generation/references/candidate-selection-flow.md
skills/generation/references/resource-id-rules.md
skills/generation/references/shot-imitation-workflow.md

skills/review/SKILL.md
skills/review/references/affected-vs-regenerate.md

skills/project/SKILL.md
skills/workspace/SKILL.md
```

`SKILL.md` 只保留触发条件、核心流程和必须遵守的规则。长解释放入 references。

## Reference 拆分建议

### `domain/references/domain-story.md`

放共享故事线，所有 skill 都可以按需读取。

必须包含：

- MovScript 是影视生产语言，不是单次 prompt。
- 影视结构线：`production -> segment -> scene_moment -> shot`。
- 前置结构线：`production / segment / scene_moment / shot / expression_unit / audio_cue / setting / setting_state / asset / storyboard / keyframe`。
- 连续性资产线：`setting -> setting_state -> asset`。
- 视觉表达线：`shot -> storyboard / keyframe`。
- 生产任务线：`content_unit -> candidate -> selection`。
- interpreter 的审查和影响解释职责。
- 除 `content_unit` 外的实体都是生成前置条件，不要求一次性全部设计完。

### `domain/references/entity-glossary.md`

放短定义和别名映射。

现有 `planning/references/entity-mapping.md` 可以迁移或复制到这里，然后由 planning 引用它。

要求：

- 使用正式实体名：`scene_moment`、`storyboard`、`content_unit`。
- 中文或产品词只是 alias，不要写入源文件字段名。
- 明确 `content_unit` 是 top-level production task with refs。
- 明确 keyframe/storyboard 是 shot-owned。
- 明确 audio cue/expression unit 是 scene-moment-owned。
- 明确除 `content_unit` 外，其余实体都是影视结构或生产前置条件。

### `planning/references/planning-workflows.md`

放复杂规划路径。

必须包含三种路径：

1. 从剧本/故事材料规划 production。
2. 从已有 scene_moment 补 shot/storyboard/keyframe。
3. 为一致性补 setting/state/asset/content_unit。

规划顺序建议：

```text
project_standards
-> setting / setting_state / asset
-> production / segment / scene_moment
-> shot
-> keyframe / storyboard
-> expression_unit / audio_cue
-> content_unit
-> inspect / interpret
```

这个顺序不是要求一次性全部创建。agent 应根据用户当前目标选择最小必要前置结构：

- 用户只要简单视频：只补最少 scene_moment、shot、storyboard 或 content unit。
- 用户要角色/场景一致：补 setting/state/asset，并优先让 asset_ref 生成少背景、多视角、弱剧情绑定的可复用参考图。
- 用户要先看画面：补 keyframe 和 keyframe_ref。
- 用户要模仿参考镜头：补参考抽帧分析、storyboard panels 和分镜图 content unit。
- 用户要声音/字幕/对白连续：补 audio_cue 或 expression_unit。

### `planning/references/content-unit-recipes.md`

保留现有文件，但改成围绕“生产任务”解释，而不是只列字段。

必须强调：

- `asset_ref` 用于稳定复用资产。
- `asset_ref` 的图像目标应尽量少背景、多视角、弱剧情绑定，避免把一次性场景情节写死进资产。
- `keyframe_ref` 用于先看关键画面效果。
- `storyboard_ref` 用于最终视频/分镜视频生成。
- 强一致路径是：asset candidate selected -> keyframe candidate selected -> storyboard/video candidate selected。
- 快速探索路径可以跳过资产化，但要说明一致性和 stale tracking 风险。

### `generation/references/candidate-selection-flow.md`

保留现有文件，但需要和新叙事对齐：

- 生成结果先写 candidate。
- 只有用户确认后写 selection。
- selection 影响下游 content units。
- 生成前先读 content unit artifact bundle。

### `generation/references/shot-imitation-workflow.md`

新增文件，用于用户明确要求模仿某个镜头、参考视频、广告片段、电影片段或已上传视频时。

必须包含：

- 先确认用户是在做简单模仿视频，还是要把参考镜头纳入完整项目。
- 使用视频抽帧能力读取整个参考视频或完整参考片段，不只看首帧/末帧。
- 从抽帧结果分析景别、构图、镜头运动、主体调度、光线、色彩、节奏点和关键帧。
- 把分析结果写入 shot、storyboard、keyframe，而不是直接拼一个泛 prompt。
- 生成或整理 storyboard panels 分镜图。
- 创建用于分镜图上传/候选/选择的 content unit。
- 分镜图 content unit 没有 selection 前，不启动依赖它的后续视频生成。

### `review/references/affected-vs-regenerate.md`

保留现有文件，但应突出：

- affected 是决策点，不是命令。
- stale selection 说明输入和已接受结果不一致。
- metadata change 不应触发重新生成判断。
- reference/selection change 会影响下游。

## 各 Skill 改法

### domain

`domain` 是总入口，负责告诉 agent：

- 先拿项目 focus。
- 先读 model 和 overview。
- 源文件、interpreted state、runtime/candidate/selection 的边界。
- 写操作优先用 domain API。
- 修改后 inspect/review，再 interpret。

建议把现在 `Core Concepts` 和 `Domain Graph` 压缩，只保留必要规则，并链接 `references/domain-story.md` 和 `references/entity-glossary.md`。

### planning

`planning` 负责把用户的创意意图落成源结构。

它应该回答：

- 用户是在做一个完整项目，还是只是做一个简单视频？
- 用户在说影视结构、连续性资产、镜头语言，还是生产任务？
- 是否需要复用？需要才创建 setting/state/asset。
- 是否需要先看图？需要就创建 keyframe 和 `keyframe_ref` content unit。
- 是否是在模仿参考镜头？是的话先规划参考视频抽帧、镜头分析、storyboard panels 和分镜图 content unit。
- 是否要生成视频？需要就创建 storyboard 和 `storyboard_ref` content unit。

如果用户只是做一个简单视频，不要默认创建完整 project-level 资产体系。可以走最小结构：必要的 scene_moment、shot、storyboard 或一个 content unit。只有当用户明确需要复用、系列化生产、角色/场景一致性、后续可追踪修改时，才扩展为完整项目结构。

planning 不应该试图一次性设计出所有 segment、所有 scene_moment、所有 shot、所有分镜、所有 keyframe、所有 expression/audio 和所有资产。它应该判断当前用户意图所需的前置结构，先补最小闭环，再通过后续 review/generation 逐步深化。

planning 不应该直接生成候选。它最多把 content unit 规划到 `可生成`，并在依赖未选择时停在 `可补图` 或 `缺选择` 状态。

### generation

`generation` 负责从 content unit artifact 出发生成候选。

流程应固定：

```text
resolve focus
-> read content unit artifacts
-> check readiness
-> generate resource
-> write candidate
-> inspect/review
-> interpret
-> select only when user confirms
```

generation 不应该在缺少 shot/storyboard/keyframe/asset refs 时悄悄发散 prompt。若用户坚持快速生成，可以说明风险并走最小可行路径。

generation 还必须检查上游 selection。凡是 runtime panel 或 dependency report 中需要使用上游 content unit 输出的地方，如果上游没有已选 candidate/resource，默认停止生成，要求用户先选择依赖结果。只有用户明确要求“先临时生成”“忽略依赖”“用草稿参考”时，才可以继续，并要在结果里说明这是非稳定路径。

当用户明确要求模仿某个镜头或视频时，generation 的前置步骤是参考视频抽帧分析，而不是直接生成。流程应固定为：

```text
read/upload reference video resource
-> extract frames across the full reference clip
-> analyze composition / motion / rhythm / blocking / lighting
-> create or update shot + storyboard + keyframes
-> create storyboard panel upload content unit
-> upload/write storyboard panel candidate
-> user selects storyboard panel candidate
-> only then generate downstream video candidate
```

如果无法读取或抽帧参考视频，应停止并说明缺少参考分析素材；不要假装已经理解了镜头。

### review

`review` 负责解释状态，不负责修。

它应该回答：

- 当前源和 interpreted state 是否一致。
- 哪些实体改了。
- 哪些 content units affected。
- 哪些 selection stale。
- 下一步是 keep、relink、re-prompt、regenerate、re-shoot、deprecate 还是 accept-stale。

review 不应自动 interpret、selection 或 regenerate，除非用户明确要求。

### project / workspace

`project` 和 `workspace` 保持轻量。

- `project` 负责创建/初始化项目和项目标准。
- `workspace` 负责兼容旧工作流、路径边界和安装/运行注意事项。
- 不要把完整领域概念复制到这两个 skill。

## Readiness 统一标准

所有 skill 使用同一组三态：

### 缺规划

缺少叙事、镜头、视觉意图、连续性对象或必要引用。

典型动作：

- 补 scene_moment 的 action/emotion/where。
- 补 shot 的 camera/blocking/lighting/timing。
- 补 setting/state/asset。

### 可补图

scene_moment 和 shot 已清楚，但视觉锚点不足。

典型动作：

- 创建 keyframe。
- 创建 storyboard。
- 创建 `asset_ref` 或 `keyframe_ref` content unit。
- 生成或选择参考图 candidate。

对于模仿参考镜头的任务，即使用户最终要视频，也应先进入 `可补图`：抽帧、分析、补 storyboard panels，并让用户选择分镜图后再进入视频生成。

### 缺选择

上游资产、关键帧或参考 content unit 已有候选，但还没有 selection，因此不能作为稳定依赖进入下一步生成。

典型动作：

- 展示候选。
- 让用户选择或确认。
- 写入 selection。
- interpret 后再继续下游生成。

### 可生成

目标 content unit 的关键输入清楚，依赖可解析，上游需要的 selection 已确认，runtime panel 没有 blocking issue。

典型动作：

- 生成 candidate。
- 写入 candidate。
- 用户确认后 selection。
- interpret 后 review downstream。

## 写作规则

后续重写 skill 时遵守：

- `SKILL.md` 不写长篇解释，长解释放 references。
- 每个概念只在一个 reference 中完整定义，其他地方链接。
- 不擅自把简单视频需求扩展成完整项目；需求范围不清楚时先询问用户是在做项目还是做一次性简单视频。
- 用户明确要模仿某个镜头或参考视频时，必须先抽帧分析完整参考片段，整理成 storyboard/panels，并创建分镜图 content unit；不要直接靠文字印象生成。
- asset 参考图尽量少背景、多视角、与具体场景情节解耦；需要剧情光效、构图和动作时，应放到 keyframe/storyboard，而不是 asset。
- 除 `content_unit` 外的实体都是影视结构或生产前置条件；根据用户当前需求补齐必要部分，不一次性设计全部细节。
- 不把 `content_unit` 描述成 production 层级节点。
- 不说“affected 就要 regenerate”。
- 不在上游依赖未 selection 时启动下游生成，除非用户明确选择非稳定路径。
- 不把 generated resource、candidate、selection 混成一个概念。
- 不把 provider URL、文件路径、MCP resource URI 当成 MovScript RawResource ID。
- 不拼错正式实体名：使用 `scene_moment`、`storyboard`、`content_unit`。
- 中文 UI 词可以出现，但工具参数和源字段必须使用正式实体名。

## 迁移步骤

1. 新增 `skills/domain/references/domain-story.md`。
2. 新增 `skills/domain/references/entity-glossary.md`，并从 `planning/references/entity-mapping.md` 迁移别名表。
3. 精简 `skills/domain/SKILL.md`，只保留入口规则、工具边界、编辑流程和 references 导航。
4. 重写 `skills/planning/SKILL.md`，让它围绕“规划源结构和 content unit”工作。
5. 更新 `planning/references/content-unit-recipes.md`，强调 content unit 是生产任务封装。
6. 更新 `skills/generation/SKILL.md`，把“生成前读 content unit artifacts”作为硬流程。
7. 更新 `skills/review/SKILL.md`，把 affected/stale/decision options 作为核心输出。
8. 检查 `agents/openai.yaml` 或 skill metadata 是否仍匹配新描述。
9. 用三类任务做人工验收：
   - “帮我把这个故事拆成镜头。”
   - “这个角色在几个镜头里要一致，先补参考图。”
   - “我改了 keyframe，这个视频要不要重做？”

## 验收标准

重构后的 skill 应满足：

- 用户问概念时，能讲清“影视结构、连续性资产、镜头视觉、生产任务、候选选择、解释闭环”。
- 用户要规划时，先创建源结构，再创建 content unit。
- 用户要生成时，从 content unit artifact 出发，而不是临时拼散 prompt。
- 用户要 review 时，能区分 changed、affected、stale、regenerate。
- 用户要复用角色/场景/道具时，知道何时创建 setting/state/asset，何时不创建。
- 用户要看生成前效果时，知道用 keyframe 和 `keyframe_ref`。
- 所有 skill 对 `content_unit` 的定义一致：顶层生产任务，通过 refs 引用源对象，用于 candidate/selection/interpreter 闭环。
