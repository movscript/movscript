目标：
为单个 production 基于当前 snapshot 产出或编辑一个本地 production_proposal draft。不要创建正式 production 实体。

Draft schema：{{schema:movscript.production_proposal.v1.id}}

{{schema:movscript.production_proposal.v1}}

模型契约：
- 字段含义、seed 策略、review route 和 apply 边界应以 frontend DraftDomainModel 为唯一来源。
- 当前运行环境若提供 draft model MCP 工具，创建或编辑 draft 前必须先读取该模型契约。
- 如果 draft model MCP 工具尚不可用，临时使用上方 schema、当前 focus 和已读 project_proposal；不要把本 skill 中的字段描述当成长期唯一字段源。

输入：
- 当前 focus 中的 project、production、selected segment 或 scene moment。
- 用户提出的 production 编排、情绪段、场景时刻、引用使用或 unresolved requirement 变更。
- 可选的已有 project references 或 asset slots；没有素材准备也可以继续制作编排。
- 如果用户目标必须依赖不存在的 project 层 creative reference、asset slot、设定或素材需求，先切换到 project_proposal draft 梳理这些上游对象。

边界：
- 此 workflow 只维护 production 层 proposal draft。
- Production proposal 的 seed 必须是 snapshot：把当前 production、绑定剧本 brief、项目剧本库和现有编排作为只读依据，不把 seed 当作可编辑底稿。
- 不创建正式 production 实体，不修改 project 层 creative reference 或 asset slot 定义。
- 缺少可选素材或资源时，可以在 production draft 中记录 unresolved requirements / production-ready gaps；缺少“必须引用”的 project 层对象时，不继续补 production draft，先创建或更新 project_proposal draft。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 模型：{{tool:movscript_get_draft_model}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 确认 focus，必要时询问 projectId 或 productionId。
2. 获取 production_proposal 的 draft model 契约；若暂不可用，使用 schema fallback 并在输出中说明。
3. 使用 draft model 返回的 snapshot seed；如需要剧本正文，再调用项目剧本读取工具，不要自行假设当前剧本/brief。
4. 先检查 production proposal 需要引用的 project 层对象是否已存在或已有可用 project_proposal draft 可承接；如果不存在，停止 production draft 写入，转去创建/更新 project_proposal draft，并在输出中说明 production 将在其通过 review 后继续。
5. 查找或创建 production_proposal draft，source/target 记录 production 锚点，并把 MCP 返回的 seed/modelRef 作为 movscript_create_draft.seed 传入。
6. 修改现有 draft 前必须先读取内容；用 JSON Pointer operations patch segments、scene moments、creative reference usages、states 或 unresolved requirements。
7. Validate draft，然后运行 preview apply。
8. 如果出现 validation 或后端错误，patch 具体路径并再次 preview。

校验：
- Production proposal 只能写 production 层内容。
- 新增已绑定引用必须能追溯到已有 project 数据；必须引用但不存在的对象要进入 project_proposal，而不是在 production_proposal 里临时创造。
- 不确定 segment 或 scene moment 范围时，应询问用户。

输出：
回复 draftId、projectId、productionId、draft status、最近一次 preview apply 的 ok/stage、segments 和 scene moments 数量，以及未解决缺口。

绝不：
- 绝不把 draft 说成正式 production 已变更。
- 绝不在 production_proposal 中新增 project 层定义。
