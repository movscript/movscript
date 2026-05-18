目标：
为单个 production 基于当前 snapshot 产出或编辑一个本地 production_proposal draft。不要创建正式 production 实体。

Draft schema：{{schema:movscript.production_proposal.v1.id}}

{{schema:movscript.production_proposal.v1}}

模型契约：
- 字段含义、seed 策略、review route 和 apply 边界应以 runtime draft model contract 为准。
- 当前运行环境若提供 draft model MCP 工具，创建或编辑 draft 前必须先读取该模型契约。
- 如果 draft model MCP 工具尚不可用，临时使用上方 schema、当前 focus 和已读 project 层对象；不要把本 skill 中的字段描述当成长期唯一字段源。

输入：
- 当前 focus 中的 project、production、selected segment 或 scene moment。
- 用户提出的 production 编排、情绪段、场景时刻、引用使用或 unresolved requirement 变更。
- 可选的已有 project references 或 asset slots；没有素材准备也可以继续制作编排。
- 如果用户目标必须依赖不存在的 project 层 creative reference 或 asset slot，先按对象切换到 setting_proposal 或 asset_proposal draft 梳理这些上游对象。

边界：
- 此 workflow 只维护 production 层 proposal draft。
- Production proposal 的 seed 必须是 snapshot：把当前 production、绑定剧本 brief、项目剧本库和现有编排作为只读依据，draft 本身就是可编辑 snapshot 底稿。
- 不创建正式 production 实体，不修改 project 层 creative reference 或 asset slot 定义。
- 缺少可选素材或资源时，可以在 production draft 中记录 unresolved requirements / production-ready gaps；缺少“必须引用”的 project 层设定资料时先创建或更新 setting_proposal draft，缺少 project 层素材需求时先创建或更新 asset_proposal draft。
- 每个 retained 或新增的 scene_moment 都必须在节点内写入可追溯上下文：优先用 `creative_references: [{ id, role }]` 绑定已有 project 设定；需要 production-local 素材需求时写入 `asset_slots`。只在最终回复里说“已检查到对象存在”不算绑定。
- 生成或保留 scene_moment 前先判定上下文归属：已有可复用设定就绑定 `creative_references`；缺少必须复用的设定就停止 production draft 写入并交接 setting_proposal；只需要一次性 production-local 素材时写 `asset_slots`；两者都不需要时必须在 `impact_notes` 说明原因。

上下文缺失回退：
- 缺项目级制作标准时，先交接 project_standards_proposal。
- 缺必须引用的人物、地点、道具、世界规则或 creative reference 时，先交接 setting_proposal。
- 缺必须引用的素材需求、asset slot、归属或复用边界时，先交接 asset_proposal。
- 缺具体内容单元、制作项节拍、旁白、字幕、转场、音乐节拍、情绪推进或钩子时，交接 content_unit_proposal。
- 缺关键帧、镜头、图片、视频输出或生成约束时，交接 visual_generation；若缺生成前的内容单元结构，先交接 content_unit_proposal。
- 不要写 action patch 草稿；production proposal 只接受 snapshot 形态，删除靠省略节点完成。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 模型：{{tool:movscript_get_draft_model}}
- Draft：{{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- Project 设定和素材槽查询：{{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_slots}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 确认 focus，必要时询问 projectId 或 productionId。
2. 获取 production_proposal 的 draft model 契约；若暂不可用，使用 schema fallback 并在输出中说明。
3. 使用 draft model 返回的 snapshot seed；如需要剧本正文，再调用项目剧本读取工具，不要自行假设当前剧本/brief。
4. 先检查 production proposal 需要引用的 project 层对象是否已存在或已有可用 setting_proposal / asset_proposal draft 可承接；可通过 draft model seed 确认，也可调用 `movscript_query_creative_references` / `movscript_query_asset_slots` 查询。无法确认 id 存在时不得绑定；如果不存在，停止 production draft 写入，按缺口类型转去创建/更新对应 project 层 draft，并在输出中说明 production 将在其通过 review 后继续。
5. 如果当前会话已有 production_proposal draftId，先读取它；否则创建 production_proposal draft，source/target 记录 production 锚点，并把 MCP 返回的 seed/modelRef 作为 movscript_create_draft.seed 传入。
6. 修改现有 draft 前必须先读取内容；用 JSON Pointer operations patch segments、scene moments，以及每个 scene moment 下的 `creative_references`/`asset_slots`。Production draft 不创建 project 层设定；已有设定只用 `{ "id": number, "role"?: string }` 引用，不写 `action`。
7. Validate draft，然后运行 preview apply。
8. 如果出现 validation 或后端错误，patch 具体路径并再次 preview。

校验：
- Production proposal 只能写 production 层内容。
- 新增已绑定引用必须能追溯到已有 project 数据；必须引用但不存在的设定资料要进入 setting_proposal，必须引用但不存在的素材需求要进入 asset_proposal，而不是在 production_proposal 里临时创造。
- Validate 或 preview apply 出现 `SCENE_MOMENT_WITHOUT_CONTEXT` 时，必须 patch 对应 scene_moment，添加已有 creative reference reuse 或明确的 asset_slots 素材需求后再次 preview。
- 不确定 segment 或 scene moment 范围时，应询问用户。

输出：
回复 draftId、projectId、productionId、draft status、最近一次 preview apply 的 ok/stage、segments 和 scene moments 数量，以及未解决缺口。

绝不：
- 绝不把 draft 说成正式 production 已变更。
- 绝不在 production_proposal 中新增 project 层定义。
