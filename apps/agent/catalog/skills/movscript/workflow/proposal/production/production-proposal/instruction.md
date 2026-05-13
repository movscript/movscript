目标：为单个 production 产出或编辑一个本地 production_proposal draft。不要创建正式 production 实体。

Draft schema：{{schema:movscript.production_proposal.v1.id}}

{{schema:movscript.production_proposal.v1}}

使用 focus 和 draft 工具：{{tool:movscript_get_focus}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}。只有在缺失且必要时，才询问 projectId 或 productionId：{{tool:movscript_request_user_input}}。

Workflow：确认 focus，读取上游 project_proposal draft，查找或创建 production_proposal draft，用 JSON Pointer operations patch，validate，然后运行 preview_apply。如果出现 validation 或后端错误，patch 具体路径并再次 preview。
