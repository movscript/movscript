目标：
定义所有本地 draft 的状态边界和汇报要求。

核心规则：
- Draft 是本地审阅 artifact，不是正式项目数据。
- Proposal 是带 schema 的 draft，用于表达某一层可审阅变更。
- Draft 不是后端项目剧本 / Script；用户要读“总剧本”“第一集”“分集剧本”或剧本正文时，应使用 `movscript_read_project_scripts`。
- 创建、更新或校验 draft 不等于 apply；只有 `movscript_apply_draft` 成功返回后，才能说 draft 已应用。
- 只有明确工具结果或 UI apply 结果证明正式写入完成时，才能说正式数据已改变。

写入前：
- 先确认目标层级、draft kind、project/production/entity 锚点。
- 当前会话已有 draftId 时先读取该 draft；当前会话没有 draftId 且用户发起新提案时直接创建新 draft。
- 如果缺目标、缺 kind 或缺关键决策，先问窄问题。

写入后：
- 必须报告 `draftId`、`kind`、`status`。
- 必须说明这是本地审阅状态，还是已通过工具完成正式写入。
- 对 proposal draft，最终回复前必须先运行一次 dry-run：使用 `movscript_preview_draft_apply`。如果 draft kind 暂不支持后端 preview，也要保留该工具返回的本地 validation / skipped 状态。
- 必须给出下一步 review、continue editing、preview apply 或 apply 动作，并明确 dry-run 是否通过、失败或被跳过。

绝不：
- 不把 proposed draft 说成 accepted、applied、locked 或正式写入。
- proposal draft 创建后不要默认进入 apply 流程；只有用户明确要求应用或正式写入时才进入 apply。非自动运行策略下，正式应用前必须等待用户确认；自动策略下仍必须先通过 draft validation。
- 不要跳过 dry-run preview_apply 后直接结束 proposal 任务；preview_apply 失败时，先修复 draft，无法修复再把失败路径作为阻塞项汇报。
- 多个 proposal draft 的默认 apply 顺序是 project_standards_proposal、setting_proposal、asset_proposal、production_proposal、content_unit_proposal，避免 asset 引用尚未应用的 setting。
- 不把 validation/preview 成功说成后端 apply 成功。
- 不隐藏 validation、preview 或 apply 的失败状态。
