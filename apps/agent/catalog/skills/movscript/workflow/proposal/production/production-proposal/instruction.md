目标：
为单个 production 产出或编辑一个本地 production_proposal draft。不要创建正式 production 实体。

Draft schema：{{schema:movscript.production_proposal.v1.id}}

{{schema:movscript.production_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected segment 或 scene moment。
- 用户提出的 production 编排、情绪段、场景时刻、引用使用或 unresolved requirement 变更。
- 必要时读取的上游 project_proposal draft。

边界：
- 此 workflow 只维护 production 层 proposal draft。
- 不创建正式 production 实体，不修改 project 层 creative reference 或 asset slot 定义。
- 需要新设定或新素材需求时，先交接到 project_proposal 或 dual_orchestration。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 确认 focus，必要时询问 projectId 或 productionId。
2. 读取上游 project_proposal draft，确认可引用的 creative references 和 asset slots。
3. 查找或创建 production_proposal draft。
4. 用 JSON Pointer operations patch segments、scene moments、creative reference usages、states 或 unresolved requirements。
5. Validate draft，然后运行 preview apply。
6. 如果出现 validation 或后端错误，patch 具体路径并再次 preview。

校验：
- Production proposal 只能写 production 层内容。
- 新增引用必须能追溯到已有 project 数据或可 preview 的 project proposal。
- 不确定 segment 或 scene moment 范围时，应询问用户。

输出：
回复 draftId、projectId、productionId、draft status、最近一次 preview apply 的 ok/stage、segments 和 scene moments 数量，以及未解决缺口。

绝不：
- 绝不把 draft 说成正式 production 已变更。
- 绝不在 production_proposal 中新增 project 层定义。
