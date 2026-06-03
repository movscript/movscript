目标：
处理当前会话内 workspace 动作：打开、读取、编辑、校验、保存和汇报结果。

适用场景：
- 用户明确要求查看、创建、修改、校验、应用或继续某个 workspace。
- 其他 Skill 需要通用 workspace 生命周期支持，但业务概念由业务 Skill 决定，具体字段和协议由 MCP contract 决定。

输入锚点：
- 用户请求、当前 focus、已选页面或实体、当前会话 workspaceId、目标 workspace kind、MCP workspace contract。

边界：
- Workspace 是当前可编辑工作表面。底层存储和后端 schema 兼容层是内部实现细节。
- 此 Skill 负责 workspace 生命周期，不负责决定具体业务内容结构、字段或 JSON schema。
- 业务字段、seed 策略、validation effects 和保存边界必须通过 MCP workspace contract 检查；不要从 Skill、历史消息或本地 schema 推断。
- 正式保存只能在明确工具或 UI save/apply 结果证明完成后才可声称完成。

允许的工具：
- 模型契约：{{tool:get_workspace_model}}
- 读取/定位：{{tool:core_file_read}} {{tool:core_file_search}}。已知 workspaceId 时读取 `agent://workspace/{workspaceId}/content`。大 workspace 优先用 search 定位，再用 `core_file_read` 的 startLine/lineCount 局部读取相关上下文。
- 正文写入：使用 {{tool:core_file_edit}} 修改 `agent://workspace/{workspaceId}/content` 指向的真实 JSON 文件；
- 打开/校验/保存：{{tool:workspace_open}} {{tool:workspace_validate}} {{tool:workspace_apply}}
- 缺失决策：{{tool:core_user_input_request}}

流程：
1. 按业务概念判断最小编辑层级；打开或编辑前读取 MCP workspace model/contract。具体字段、schema、seed 和保存边界只相信 MCP 返回。
2. 若用户或当前会话上下文给了 workspaceId，直接用 `core_file_read` 读取 `agent://workspace/{workspaceId}/content`。这是正文的权威文件 ref。
3. 若当前会话没有 workspaceId 且用户是在发起新编辑，直接 `workspace_open`；不要跨会话查找旧 workspace。`workspace_open` 应由前端 contract/hydration 决定初始正文。
4. 修改现有 workspace 正文时，把 workspace 当作真实文件：先读，再用 `core_file_edit` 对同一个 ref 做最小局部上下文文本 patch。不要覆盖未知字段，不要凭空重建整个 workspace。未编辑的内容必须视为保留。
5. 每次 create/update 后都要检查工具返回的 workspaceId、kind、validation 或 apply 结果。
6. 最终回复前必须调用 `workspace_validate`。校验结果必须包含足够判断的 validation/effects/impact；失败时先根据 MCP 返回的 path、backend error 或 diff 做最小修复，再重新 validate。
7. 保存前检查 validation effects 是否与本次业务意图一致。多改、少改或跨层时不要保存，继续编辑或询问用户。
8. 只有用户明确要求“保存 / 应用 / 写入项目 / 生效”时，才进入 `workspace_apply`；成功后可继续修改同一个 workspace，再次 validate/apply。

校验：
- 写入现有 workspace 前是否已经读取该 workspace。
- workspace kind 是否与用户请求层级一致，并由 MCP contract 支持。
- workspace 变更是否可解释、可验证、可保存。
- validation effects 是否等于本次编辑意图。
- 汇报是否包含 workspaceId、kind、最近一次 validation/save 结果和下一步动作。

输出：
返回 workspaceId、kind、读取来源、变更摘要、validation effects/save 结果、阻塞项，以及下一步继续编辑或保存动作。

绝不：
- 绝不在未读取当前会话现有 workspace 前直接覆盖写入。
- 绝不为了创建新编辑而跨会话列出或复用旧 workspace。
- 绝不把未应用 workspace 当成正式项目数据。
- 绝不在 validate/apply 尚未完成时声称后端状态已经改变。
