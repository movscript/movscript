目标：
定义当前 workspace 的编辑、校验和应用边界。

核心规则：
- Workspace 是当前可编辑工作表面，不是一个需要用户审阅的工作区对象。
- 后端和持久化层仍可能使用 legacy JSON schema；这是内部存储细节，不要作为用户心智模型暴露。
- 创建、更新或校验 workspace 不等于应用；只有 `workspace_apply` 成功返回后，才能说本次修改已应用。
- Workspace 可以继续编辑并重复 validate/apply；错误修改通过继续编辑修正，不承诺系统 rollback。
- 只有明确工具结果或 UI 应用结果证明正式写入完成时，才能说正式数据已改变。

写入前：
- 先确认目标层级、workspace kind、project/production/entity 锚点。
- 当前会话已有 workspaceId 时先读取 `agent://workspace/{workspaceId}/content`；没有 workspaceId 且用户发起编辑时打开最小必要 workspace。
- 如果缺目标、缺 kind 或缺关键决策，先问窄问题。
- 如果当前任务缺少上游设定、素材需求或项目规范，先回到对应 workspace 补齐；上游 validate/apply 失败时，停止下游流程，先修复当前 workspace 或询问用户。

写入后：
- 必须报告 `workspaceId`、kind 和最近一次 validation/apply 结果。
- 对编辑类 workspace，最终回复前必须先运行 `workspace_validate`；如果支持后端 validation，使用工具返回结果修复具体错误路径。
- 用户明确要求应用、写入项目或让修改生效时，才调用 `workspace_apply`；运行时仍可能按风险暂停等待批准。

绝不：
- 不把 workspace 自身说成 accepted、rejected、applied、locked 或工作区。
- 不跳过 validation 后直接声称修改可用。
- 不隐藏 validation 或 apply 的失败状态。
