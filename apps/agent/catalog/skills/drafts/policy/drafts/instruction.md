目标：
定义所有本地 draft 的状态边界和汇报要求。

核心规则：
- Draft 是本地审阅 artifact，不是正式项目数据。
- Proposal 是带 schema 的 draft，用于表达某一层可审阅变更。
- Draft 不是后端项目剧本 / Script；用户要读“总剧本”“第一集”“分集剧本”或剧本正文时，应使用 `movscript_read_project_scripts`。
- 创建、更新或校验 draft 不等于 apply。
- 只有明确工具结果或 UI apply 结果证明正式写入完成时，才能说正式数据已改变。

写入前：
- 先确认目标层级、draft kind、project/production/entity 锚点。
- 当前会话已有 draftId 时先读取该 draft；当前会话没有 draftId 且用户发起新提案时直接创建新 draft。
- 如果缺目标、缺 kind 或缺关键决策，先问窄问题。

写入后：
- 必须报告 `draftId`、`kind`、`status`。
- 必须说明这是本地审阅状态，还是已通过工具完成正式写入。
- 必须给出下一步 review、continue editing、preview apply 或 apply 动作。

绝不：
- 不把 proposed draft 说成 accepted、applied、locked 或正式写入。
- 不把 validation/preview 成功说成后端 apply 成功。
- 不隐藏 validation、preview 或 apply 的失败状态。
