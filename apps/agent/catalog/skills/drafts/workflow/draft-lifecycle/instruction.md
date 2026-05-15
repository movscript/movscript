目标：
处理通用本地 draft 生命周期动作：发现、读取、创建、编辑、校验、dry-run preview、汇报审阅状态和准备 apply。

适用场景：
- 用户明确要求查看、创建、修改、校验、preview 或继续某个 draft。
- 其他 workflow 需要通用 draft 生命周期支持，但业务内容结构仍由具体业务 workflow 决定。

输入锚点：
- 用户请求、当前 focus、已选页面或实体、已有本地 drafts、目标 draft kind 或 draftId。

边界：
- Draft 是本地审阅 artifact，不是正式项目数据。
- 此 workflow 负责 draft 生命周期，不负责决定具体业务内容结构。
- 业务字段、seed 策略、review route 和 apply 边界应来自 runtime draft model contract，并通过 MCP 暴露给 Agent。
- 当前运行环境若尚未提供 draft model MCP 工具，则临时使用对应 proposal workflow/schema 作为 fallback，但不把 skill 文本作为长期字段唯一源。
- 正式写入或 apply 只能在明确工具或 UI apply 结果证明完成后才可声称完成。

允许的工具：
- 模型契约：{{tool:movscript_get_draft_model}}
- 列表/发现：{{tool:movscript_list_drafts}}
- 读取：{{tool:movscript_get_draft}} {{tool:movscript_read_draft}}
- 写入/校验/preview：{{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺失决策：{{tool:movscript_request_user_input}}

流程：
1. 写入前必须先读取模型契约和现有 draft。若模型 MCP 不可用，说明使用 schema fallback。
2. 若用户给了 draftId，先 get/read 该 draft；若没有 draftId，先 list 相关 kind/status/page scope 的 drafts。
3. 只有确认没有合适现有 draft，或用户明确要求新建时，才 create draft。
4. 创建修改型 draft 时应带 target/source 页面或实体锚点，并把模型 MCP 返回的 seed/modelRef 作为 movscript_create_draft.seed 传入。
5. 修改现有 draft 时，基于已读取内容做最小 patch；不要覆盖未知字段，不要凭空重建整个 draft。
6. 每次 create/update 后都要检查工具返回的 draftId、kind、status、validation 或 preview_apply 结果。
7. validation 或 preview 失败时，报告具体失败阶段和可修复路径；如果能安全定位 JSON Pointer 或字段路径，再做一次最小修复。
8. apply 前只说明“可进入 apply/review”，不要声称已写入正式项目数据。

校验：
- 写入动作前是否已经读取或列出现有 draft。
- draft kind 是否与用户请求层级一致。
- 本地 draft 变更是否可审阅、可回退、可解释。
- 汇报是否包含 draftId、kind、status 和下一步动作。

输出合同：
返回 draftId、kind、status、读取来源、变更摘要、validation/preview 状态、阻塞项，以及下一步 review 或 apply 动作。

绝不：
- 绝不在未读取现有 draft/list 结果前直接覆盖写入。
- 绝不把本地 draft 当成正式项目数据。
- 绝不在 preview/apply 尚未完成时声称后端状态已经改变。
