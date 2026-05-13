目标：产出或编辑一个本地 project_proposal draft，作为 project 层 creative_references 和 asset_slots 的局部 merge patch。不要写入最终项目实体。

Draft schema：{{schema:movscript.project_proposal.v1.id}}

{{schema:movscript.project_proposal.v1}}

工具引用：
- Focus：{{tool:movscript_get_focus}}
- Draft 创建/编辑：{{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 用户输入：{{tool:movscript_request_user_input}}

Workflow：
1. 读取当前 focus。如果 projectId 缺失且无法推断，用 movscript_request_user_input 询问。
2. 查找已有 project_proposal draft；如果不存在，则用 proposal=true 创建一个。
3. 用 JSON Pointer operations patch content。总结前先 validate。
4. 运行 preview_apply 做 dry-run finalization。如果出现 validation 或后端错误，patch 后再次 preview。
5. 保持 creative_references 作为设定层，asset_slots 作为有归属的素材需求。
