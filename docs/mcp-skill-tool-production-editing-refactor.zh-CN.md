# MCP Skill Tool Production Editing Refactor

新增 production editing command family，用于把公开 CLI/MCP 合同集中到 production editing workflow，而不是暴露底层 backend project knobs。

只保留 `production_editing_resources_refresh`、`production_editing_workspace_list`、`production_editing_workspace_create`、`production_editing_workspace_get`、`production_editing_workspace_open`、`production_editing_workspace_delete`。

不保留 `backend.preferredRuntime` / `backend.installPolicy`。

后端动作交给 `system_edit` / `remotion`。Production editing command 只返回 workspace、handoff preflight、blockers 和 agent skill handoff，不直接暴露 backend install policy。
