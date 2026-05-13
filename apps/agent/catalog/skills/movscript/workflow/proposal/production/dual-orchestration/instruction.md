目标：
先维护 project_proposal，再基于该上游基础维护 production_proposal。两个 artifact 都保持为本地审阅 drafts。

Project schema：{{schema:movscript.project_proposal.v1.id}}
{{schema:movscript.project_proposal.v1}}

Production schema：{{schema:movscript.production_proposal.v1.id}}
{{schema:movscript.production_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected entity 和用户的跨层级请求。
- 项目级 creative references / asset slots，以及 production 级 segments / scene moments / usage states。

边界：
- 此 workflow 只协调两个本地 proposal drafts。
- Project proposal 负责上游设定和素材需求；production proposal 负责制作编排和引用使用。
- 不正式 apply，不创建生成任务，不把 production draft 建立在未 preview 的 project draft 假设上。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认 project 和 production 锚点。
2. 查找或创建 project_proposal draft，补齐 production 将依赖的 creative references、asset slots 或素材需求。
3. Validate project draft，并先运行 preview apply。失败时先修复 project draft。
4. 查找或创建 production_proposal draft，只引用已在 project draft 中可 preview 的上游对象。
5. Validate production draft，并运行 preview apply。失败时修复具体错误路径。
6. 汇报两个 draft 的状态和依赖关系。

校验：
- Production draft 不得引用 project draft 中不存在或 preview 失败的上游对象。
- 两个 draft 的职责不能混写。
- 缺少 projectId 或 productionId 时，先询问。

输出：
返回 project draftId、production draftId、两者 validation/preview 状态、依赖备注、阻塞项和下一步 review/apply 动作。

绝不：
- 绝不把两个 draft 描述为已经正式写入。
- 绝不跳过 project preview 就让 production 使用新上游对象。
