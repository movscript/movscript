目标：产出或编辑一个本地 project_proposal draft，作为 project 层 creative_references 和 asset_slots 的局部 merge patch。不要写入最终项目实体。

Draft schema：{{schema:movscript.project_proposal.v1.id}}

{{schema:movscript.project_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected creative reference、asset slot 或用户提出的项目级变更。
- 用户给出的设定、素材需求、复用/合并意图、归属关系和验收约束。

边界：
- 此 workflow 只维护 project 层 proposal draft。
- 不写 production segments、content units、媒体生成计划或已生成资源绑定。
- 不正式 apply，不创建正式项目实体。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 查找/读取/创建/编辑：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 用户输入：{{tool:movscript_request_user_input}}

流程：
1. 读取当前 focus。如果 projectId 缺失且无法推断，用 movscript_request_user_input 询问。
2. 查找已有 project_proposal draft；如果不存在，则用 proposal=true 创建一个。
3. 用 JSON Pointer operations patch content。总结前先 validate。
4. 运行 preview_apply 做 dry-run finalization。如果出现 validation 或后端错误，patch 后再次 preview。
5. 保持 creative_references 作为设定层，asset_slots 作为有归属的素材需求。

校验：
- Project proposal 只写 creative references、asset slots、merge candidates 和 asset slot ownership。
- Production 编排、content unit 结构和媒体生成计划必须交给对应 workflow。
- 新增或合并素材需求必须说明归属和复用边界。

输出：
回复 draftId、projectId、可用时的 productionId、draft status、最近一次 preview apply 的 ok/stage，以及简洁的设定/素材缺口。

绝不：
- 绝不把本地 draft 描述为已正式写入 project。
- 绝不把生成媒体或 production 编排写进 project proposal。
