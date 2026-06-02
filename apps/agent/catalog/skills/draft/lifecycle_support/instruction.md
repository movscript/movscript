目标：
处理当前会话内本地 draft 工作副本动作：读取、创建、编辑、dry-run preview、汇报审阅结果和准备 apply；`draft_apply_preview` 内置 validation。

适用场景：
- 用户明确要求查看、创建、修改、preview 或继续某个 draft。
- 其他 Skill 需要通用 draft 生命周期支持，但业务内容结构仍由具体业务 Skill 决定。

输入锚点：
- 用户请求、当前 focus、已选页面或实体、当前会话 draftId、目标 draft kind 或 draftId。

边界：
- Draft 是本地审阅 artifact，不是正式项目数据。
- Draft 是一个可持续编辑的当前工作副本，不通过自身 status 进入 applied/rejected/superseded 终态；apply 只是把当前内容写入目标并记录最近一次结果。
- 此 Skill 负责 draft 生命周期，不负责决定具体业务内容结构。
- 业务字段、seed 策略、review route 和 apply 边界可通过 runtime draft model contract 检查；setting_proposal / asset_proposal 新建草稿的当前数据基准由 `draft_create` 自动 hydrate。省略 proposal snapshot 数组时，runtime 会用当前数据预填为 no-op 提案。
- 当前运行环境若尚未提供 draft model MCP 工具，则临时使用对应 proposal task/schema 作为 fallback，但不把 skill 文本作为长期字段唯一源。
- 正式写入或 apply 只能在明确工具或 UI apply 结果证明完成后才可声称完成。

允许的工具：
- 模型契约：{{tool:draft_model_get}}
- 读取/定位：{{tool:core_file_read}} {{tool:core_file_search}}。已知 draftId 时直接读取 `agent://draft/{draftId}/content`。大 draft 优先用 search 定位，再用 `core_file_read` 的 startLine/lineCount 局部读取相关上下文。
- 正文写入：使用 agent 的文件编辑工具 {{tool:core_file_edit}} 修改 `agent://draft/{draftId}/content` 指向的真实 JSON 文件；优先使用带 `baseRevision` 的受限上下文文本 patch。该 patch 不是 JSON Patch，也不是通用 diff；它只按已读取到的文本上下文做最小 hunk 编辑，必须让 oldText 在当前文件中精确匹配一次。
- 创建/preview/apply：{{tool:draft_create}} {{tool:draft_apply_preview}} {{tool:draft_apply}}
- 缺失决策：{{tool:core_user_input_request}}

流程：
1. 按具体业务 Skill/schema 准备 draft 内容；只有需要调试字段归属、刷新已有 draft 基准、或 preview 指出基准缺失时，才读取模型契约。
2. 若用户或当前会话上下文给了 draftId，直接用 `core_file_read` 读取 `agent://draft/{draftId}/content`。这是正文的权威文件 ref。
3. 若当前会话没有 draftId 且用户是在发起新提案，直接 create draft；不要跨会话查找旧 draft。
4. 创建修改型 draft 时应带 target/source 页面或实体锚点。setting_proposal / asset_proposal 若缺少 `snapshot_base`，`draft_create` 会自动从当前 DraftDomainModel hydrate 基准并存入 draft；若 proposal snapshot 数组被省略，会同步预填当前 snapshot，表示默认不变。
5. 修改现有 draft 正文时，把 draft 当作真实文件：用 {{tool:core_file_read}} / {{tool:core_file_search}} 读取 `agent://draft/{draftId}/content`，必要时按行号分段查看；用 {{tool:core_file_edit}} 编辑同一个 ref，只做最小局部上下文文本 patch。不要通过 draft 工具传完整 `content`，不要覆盖未知字段，不要凭空重建整个 draft。未编辑的内容必须视为保留，不得把“没读到”解释成“应该删除”。
6. 每次 create/update 后都要检查工具返回的 draftId、kind、validation 或 preview_apply 结果。
7. 创建或修改 proposal draft 后，最终回复前必须调用 `draft_apply_preview` 做 dry-run。preview 会先做本地 schema validation，再在支持的 kind 上调用后端 apply-preview；不正式写入。
8. preview_apply 失败时，先根据返回的 validation path、backend error 或 review diff 做最小修复，再重新 preview_apply；无法安全修复时，把失败阶段、错误路径和阻塞项汇报给用户。
9. 创建 proposal draft 后不要默认进入 apply 流程；只有用户明确要求“应用 / 正式写入 / 写入项目 / 生效”时，才进入 `draft_apply`，且运行时仍可能暂停等待用户批准或拒绝。
10. 同一轮生成多个 proposal draft 时，按层级顺序 apply：`project_standards_proposal`、`setting_proposal`、`asset_proposal`、`production_proposal`、`content_unit_proposal`。
11. validation 或 preview 失败时，报告具体失败阶段和可修复字段路径；如果能用已读取的文本上下文安全定位，再做一次最小字符串 patch 修复。
12. apply 前只说明“可进入 apply/review”，不要声称已写入正式项目数据；apply 成功后可继续修改同一个 draft，再次 preview/apply。

校验：
- 写入现有 draft 前是否已经读取该 draft。
- draft kind 是否与用户请求层级一致。
- 本地 draft 变更是否可审阅、可回退、可解释。
- proposal draft 是否已经在最终回复前运行 `preview_apply` dry-run，并记录结果。
- 汇报是否包含 draftId、kind、最近一次 validation/preview/apply 结果和下一步动作。

输出：
返回 draftId、kind、读取来源、变更摘要、validation/preview/apply 结果、阻塞项，以及下一步 review 或 apply 动作。

绝不：
- 绝不在未读取当前会话现有 draft 前直接覆盖写入。
- 绝不为了创建新提案而跨会话列出或复用旧 draft。
- 绝不把本地 draft 当成正式项目数据。
- 绝不在 preview/apply 尚未完成时声称后端状态已经改变。
