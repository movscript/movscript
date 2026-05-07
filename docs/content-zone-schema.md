# 内容区数据库收敛

当前内容区以语义实体为准，不再兼容旧的分集、分场、分镜、镜头生产链表。

## 已清理旧表

迁移 `000025_remove_v1_production_entities` 和 `000026_content_zone_semantic_tables` 会删除：

- `final_videos`
- `shots`
- `storyboards`
- `episode_scenes`
- `scene_setting_refs`
- `scenes`
- `episode_setting_refs`
- `episodes`

这些表对应旧版「分集 -> 分场 -> 分镜 -> 镜头 -> 成片」链路。内容区页面改走语义实体表和 `/projects/:id/entities/...` 接口。

## 内容区新表

- 片段：`segments`
- 情节：`scene_moments`
- 内容：`content_units`
- 资料：`creative_references`、`creative_reference_states`
- 关系：`creative_reference_usages`、`creative_relationships`
- 素材：`asset_slots`、`asset_slot_candidates`
- 结构化分镜与预演：`storyboard_scripts`、`storyboard_versions`、`storyboard_lines`、`keyframes`、`preview_timelines`、`preview_timeline_items`

`scripts`、`script_versions`、`raw_resources`、`resource_bindings` 仍作为源文本和资源文件基础表保留。旧 `assets` / `asset_views` 会迁移到 `asset_slots` / `asset_slot_candidates` 后删除。

## 槽与候选

内容区按“槽 -> 候选 -> 最终目标”理解：

- 内容单元本质是内容槽，状态可停留在 `candidate`，确认后再进入 `confirmed`、`in_production` 或 `locked`。
- 素材本质是素材槽，`asset_slots` 表示缺口、候选素材或已锁定素材，`asset_slot_candidates` 记录某个素材槽下有哪些候选。
- 内容单元的候选目标可以同时存在：关键帧、画面、语音、字幕。当前页面用 `keyframes` 与关联的 `asset_slots` / `asset_slot_candidates` 汇总这四类目标，不额外引入并行候选表。
- 候选采纳、拒绝、返工等动作统一写入 `candidate_decisions`，其中 `candidate_type` 可包含 `content_unit`、`keyframe` 和 `asset_slot_candidate`。

## 用户视角的核心概念

这些概念不是旧版「分集 -> 分场 -> 分镜 -> 镜头」的改名，而是面向 AI 生成、素材准备和画布工作流的语义对象。

### 片段

片段对应 `segments`。它是剧本文本被拆出来后的第一层语义单元，用来回答“这段内容在叙事或制作上是一块什么”。片段不等同于场景，可以是一场戏、一段蒙太奇、旁白段、产品展示段、片头、转场，或者临时章节。

用户理解：

- 片段是从剧本版本里切出来的内容块。
- 片段保留来源范围、原文/摘要、顺序、类型和确认状态。
- 片段下面可以继续拆出多个情节，也可以关联多个内容单元。
- 片段偏“结构和来源”，不应该被素材生成结果随意覆盖。

### 情节

情节对应 `scene_moments`。它是 AI 生成最需要的上下文单元，用来回答“什么时间、什么地点、什么条件下，谁/什么在做什么，气氛如何”。代码注释里把它定义为核心 AI-generation context，前端当前标签也使用“情节”。如果产品语言更想表达“情景”，可以把 UI 文案改成“情景”，但底层 `scene_moment` 的语义更接近“情境化的行动时刻”，不是传统剧情大纲里的 plot beat。

用户理解：

- 情节从片段中拆出，描述一个可用于生成画面、声音、字幕或素材需求的具体时刻。
- 它记录时间、地点、条件、动作、情绪和状态。
- 它通常会派生内容单元和素材槽。
- 情节是画布里最适合作为提示词上下文读取的对象。

### 创作资料

创作资料对应 `creative_references` 和 `creative_reference_states`。它是项目级的“创作资料库”或“设定圣经”，统一承载人物、地点、道具、产品、品牌、风格、世界规则、时代背景和限制条件。

用户理解：

- 创作资料是跨片段、跨情节复用的稳定设定。
- `creative_references` 表示资料本体，例如角色、场景、道具、品牌、风格。
- `creative_reference_states` 表示资料在某个范围内的临时状态，例如某个角色在某个情节里的服装、情绪、道具、视觉备注。
- `creative_reference_usages` 记录某个片段、情节、内容单元或关键帧使用了哪份资料或哪份状态，保证连续性。
- `creative_relationships` 记录资料之间的关系，例如人物关系、品牌归属、道具归属、风格约束。

### 素材定义

素材定义当前应理解为 `asset_slots`，也就是“素材槽”，而不是文件本身。真实上传或生成的文件是 `raw_resources`，文件和业务对象之间通过 `resource_bindings` 绑定。

用户理解：

- 素材定义回答“这里需要什么素材”，例如角色半身参考图、场景环境图、产品细节图、配音、Logo、风格参考。
- 一个素材槽可以处于 `missing`、`candidate`、`locked` 或 `waived`。
- 素材槽可以绑定创作资料、创作资料状态、片段、情节、内容单元或关键帧。
- `asset_slot_candidates` 记录某个素材槽有哪些候选。候选本身也是 `asset_slots`，通常带有 `resource_id`。
- 最终被使用的素材通过 `resource_id`、`locked_asset_slot_id` 或资源绑定确认。

## 画布场景下的读写边界

画布应定位为生产阶段工具，主要负责生产图片、视频、音频等可交付素材。片段、情节、创作资料和内容单元可以作为生产上下文被读取，但不应由画布直接改写；画布写入应集中在素材槽、候选素材、资源文件和资源绑定上，并留下审计。结构性内容的改动应回到内容区、资料区或专门的审核/候选流程。

| 对象 | 画布应可读 | 画布应可写 | 建议原因 |
| --- | --- | --- | --- |
| 片段 `segment` | 标题、类型、顺序、摘要、原文/来源范围、状态、下游情节/内容计数 | 不可写 | 片段是剧本结构切分，属于内容区事实。画布只能把它作为提示词上下文，不能在生产素材时改写结构。 |
| 情景/情节 `scene_moment` | 时间、地点、条件、动作、情绪、描述、关联创作资料、素材缺口 | 不可写 | 情景是生成上下文，画布应读取它来生产图片、视频、音频；情景内容本身的修改应回到内容区。 |
| 创作资料 `creative_reference` | 名称、类型、别名、描述、内容、重要性、状态、状态列表、关系、素材槽 | 不可写 | 创作资料是连续性来源和设定事实。画布可读取人物、地点、道具、品牌、风格等资料，但不应在生产运行中修改资料本体。 |
| 创作资料状态 `creative_reference_state` | 范围、状态名、视觉备注、情绪、服装、道具、标签 | 不可写 | 状态可作为局部生成约束读取；状态变更会影响连续性，应由资料区或审核流程确认。 |
| 内容单元 `content_unit` | 标题、类型、顺序、时长、镜头/构图/运动/提示词、状态、关联情景和素材 | 不直接写结构字段；只允许通过资源绑定挂接生产结果 | 内容单元是生产目标和验收上下文。画布可以向它回挂图片、视频、音频结果，但不应直接改写镜头、构图、提示词等结构字段。 |
| 素材定义 `asset_slot` | 名称、类型、状态、优先级、描述、槽位、提示词、所属资料、候选集、锁定素材 | 可写候选图片、候选视频、候选音频、结果资源、资源绑定；必要时更新候选状态 | 素材槽就是生产缺口和候选容器，是画布写回的主要目标。画布写入的是“产出的素材”，不是上游设定。 |
| 资源 `raw_resource` | 文件类型、名称、URL、缩略图/预览、绑定关系 | 可新建图片、视频、音频资源，并绑定到素材槽或内容单元 | 文件是画布生产的直接产物。业务意义通过素材槽、内容单元和 `resource_bindings` 表达。 |

## 当前实现状态与缺口

已具备：

- 后端已提供语义实体 CRUD：`/projects/:id/entities/segments`、`scene-moments`、`creative-references`、`creative-reference-states`、`asset-slots`、`content-units` 等。
- 前端画布左侧语义货架已经展示片段、情节、创作资料、素材、内容单元，并可拖成 `entity_card`。
- 画布实体卡片已有端口模型：可根据 workflow schema 生成可读输出端口和可写输入端口。
- `asset_slot` 和 `content_unit` 已进入 workflow entity schema，但后续应收紧写入语义：画布只写生产素材、资源绑定和候选，不直接改写结构字段。
- 画布写回会调用 `EntityIOService.WritePorts`，写入字段或 `resource_bindings`，并生成 `canvas_entity_write_audits`。
- 素材槽候选写回已有专门逻辑：画布输出资源可以创建候选素材槽、`asset_slot_candidates` 和候选资源绑定。

缺口：

- workflow entity schema 已移除旧 `setting` 实体，后续应统一通过 `creative_reference`、`creative_reference_state` 和使用关系读取创作资料上下文。
- `EntityIOService` 当前的写入能力偏通用，后续需要明确区分只读上下文端口和生产写回端口，避免画布直接写入片段、情景、创作资料等上游事实。
- `EntityCardNode` 目前只为 `asset_slot`、`content_unit` 拉取 `/entities/:kind/:id/semantic-values`，片段、情节、创作资料主要依赖拖拽时的摘要文本，卡片预览不足。
- 画布写回已有审计表，但用户侧还缺少明显的素材候选采纳、锁定、回滚和查看写回历史的完整闭环。
- 产品语言需要统一：代码和部分 UI 使用“情节”，用户表达可能是“情景”。建议确认最终中文名；如果采用“情景”，底层仍可保留 `scene_moment`。

建议优先补齐：

1. 为 `segment`、`scene_moment`、`creative_reference`、`creative_reference_state` 增加只读 semantic/workflow schema，供画布读取上下文。
2. 让 `/entities/:kind/:id/semantic-values` 支持这些对象的关键字段和关系计数。
3. 在画布实体卡片中区分“读取上下文端口”和“生产写回端口”，片段、情景、创作资料只读，素材槽开放候选/资源写入，内容单元只允许挂接生产结果。
4. 将画布写回目标限制为图片、视频、音频等资源、`resource_bindings`、`asset_slot_candidates` 和素材槽锁定/候选状态。
5. 在 UI 中补素材候选采纳/拒绝、锁定、回滚入口，让画布生成结果进入可审核的生产素材流程。
