# Agent Workspace Editing Model

Status: design direction

This document records the intended product and agent model for MovScript editing. It replaces the older workspace-first mental model with a direct workspace editing model.

## 1. Core Decision

The agent should behave like a collaborator editing the current work, not like a planner submitting workspaces for review.

The product model should be:

```text
User intent
-> agent edits the current work
-> system validates and saves the edit
-> agent reports what changed
-> user continues adjusting if needed
```

The agent's internal model should be:

```text
All agent work happens inside the current workspace.
```

The user should not need to understand:

- workspace
- workspace
- workspace review
- snapshot
- rollback
- apply
- database writes
- workspace internals

The user should only see:

- what the agent changed
- whether the result is usable
- what can be adjusted next

## 2. Why Change

The current workspace-first model creates too many concepts:

```text
workspace
workspace
review
preview apply
apply
rollback
formal write
database state
```

That model is useful for an approval workflow, but it is too heavy for an agent that should directly help users shape a MovScript work.

The desired experience is closer to:

```text
User: Make this scene tighter.
Agent: I shortened the scene, removed repeated explanation, and kept the emotional turn.
User: Make the last exchange warmer.
Agent: I softened the last exchange while keeping the same plot beat.
```

The user is continuously directing the current work. They are not reviewing workspaces as a separate product object.

## 3. Final User Mental Model

The product should expose one primary concept:

```text
Current work
```

The agent modifies the current work directly. If the user dislikes the result, they ask the agent to keep changing it.

Examples:

- "把第二场压缩一点"
- "这次太硬了，改得自然一点"
- "刚才那版方向不对，把人物动机改回更克制"
- "保留第三场的改动，但第二场恢复成更慢的节奏"
- "不要解释那么多，直接让动作体现"

These are all new editing instructions against the current work. They are not system rollbacks.

## 4. Final Internal Mental Model

The internal domain concept is:

```text
Workspace
```

Definition:

```text
Workspace is the editable working surface materialized from the current MovScript state.
The agent edits the workspace.
The system validates and saves valid workspace changes back to persistent state.
```

The workspace can still use the existing workspace-shaped schema if that schema already expresses the editable state. The schema shape does not need to change first.

The name must change because `workspace` carries the wrong product meaning. It implies a temporary, un-applied, reviewable artifact. The new model needs a neutral editing surface.

## 5. Workspace Becomes Workspace

The migration is primarily semantic and naming-oriented:

```text
workspace -> workspace
```

This does not require changing the data shape immediately.

Recommended rule:

```text
Workspace is a legacy storage name.
Workspace is the domain concept.
```

If the database or persisted files still use `workspace_*` fields during migration, hide that behind adapters. Agent instructions, domain services, API responses, UI copy, and tool names should move to `workspace`.

## 6. Workspace Review Goes Away

The workspace review flow should no longer be the main path.

Remove from the primary product flow:

- generate workspace
- show workspace review
- accept workspace
- reject workspace
- apply workspace
- rollback workspace
- pending workspace status

Replace with:

- direct edit
- validation
- save
- result summary
- follow-up edit

Old flow:

```text
agent generates workspace
-> user reviews
-> user accepts
-> system applies
```

New flow:

```text
agent edits workspace
-> system validates and saves
-> user sees result
-> user continues editing if needed
```

Workspace-like structures may still exist temporarily as implementation details or compatibility payloads. They should not be user-facing or agent-facing core concepts.

## 7. No System Rollback

The product should not promise system rollback as a normal interaction.

The model is fix-forward:

```text
If an edit is wrong, keep editing from the current state.
```

When the user says:

- "撤销"
- "恢复刚才"
- "改回去"
- "还是上一版"
- "这次不要了"

The agent should interpret that as:

```text
Make a new edit that moves the current work back toward the user's requested direction.
```

The agent should not say:

```text
已恢复到上一个快照。
```

unless a real version-restore feature is explicitly added.

Better wording:

```text
我把这段重新调回更克制的方向，并保留了当前版本里有效的节奏调整。
```

## 8. Technical Atomicity Is Still Required

Not having product rollback does not mean accepting partial writes.

Saving workspace changes should still be technically safe:

- parse before persist when possible
- validate before durable write when possible
- use atomic database transactions for multi-entity writes
- never leave the database in a half-applied state
- if save fails, do not claim the work changed
- if validation fails, repair the current workspace or report the blocking field

This is not a user-facing rollback feature. It is ordinary write integrity.

## 9. Agent Skill Contract

All skills should inherit one compact contract:

```text
You work inside the current workspace.

The workspace represents the current editable MovScript state.
Your job is to understand the user's intent, modify the workspace directly, validate/apply the result, and summarize what changed.

Do not expose workspace, workspace, snapshot, rollback, apply, database, or review internals to the user.
If the user dislikes the result, continue editing the current workspace.
```

Default workflow:

```text
1. Understand the user's intent.
2. Locate the smallest relevant part of the workspace.
3. Read only the context needed to edit safely.
4. Modify the workspace directly.
5. Validate the workspace.
6. Save the workspace.
7. Tell the user what changed in work-level language.
```

Default constraints:

- Do not create a workspace for ordinary edits.
- Do not ask the user to review a workspace.
- Do not promise exact historical restore.
- Do not mention internal storage or tool names unless the user explicitly asks.
- Do not broaden the edit scope beyond the user's intent.
- Ask before high-risk destructive or large-scope edits.

## 10. Skill Simplification

The current skill set can be simplified because the agent no longer needs to reason about review artifacts.

The main skill vocabulary should be:

```text
workspace
intent
edit
validate
save
summary
```

Avoid in skill instructions:

```text
workspace
workspace
review
snapshot
rollback
apply
formal write
accepted
rejected
pending workspace
```

Specialized skills should describe domain behavior only.

Example, dialogue editing:

```text
You edit dialogue in the current workspace.
Preserve character intent, scene continuity, and the required plot beat.
Modify only the requested dialogue and directly necessary neighboring lines.
After saving, summarize the changed dialogue direction.
```

Example, structure organization:

```text
You organize story structure in the current workspace.
Prefer preserving existing material while changing order, grouping, labels, and relationships.
Ask before broad structural rewrites.
After saving, summarize the structural change.
```

Example, issue diagnosis:

```text
You inspect the current workspace for story, continuity, formatting, or production issues.
If the user asks for fixes, edit the workspace directly.
If the user only asks for diagnosis, report the issues without changing the workspace.
```

## 11. User-Facing Language

Use work-level language:

```text
我压缩了第二场的对白，删掉重复解释，并保留了角色的情绪转折。
```

```text
我把第三场重新分成两个节拍：先推进冲突，再落到角色选择。
```

```text
这个修改没有保存成功，因为第 4 个 content unit 缺少必要的场景锚点。我可以先补齐这个锚点再继续。
```

Avoid implementation language:

```text
我修改了 workspace。
```

```text
workspace 已经 apply。
```

```text
可以 rollback 到 snapshot。
```

```text
这个 workspace 处于 pending review 状态。
```

## 12. High-Risk Confirmation

Removing workspace review does not mean every action should be silent.

For ordinary edits, the agent should act directly.

For high-risk edits, ask a narrow confirmation before editing:

- deleting many scenes, content units, or assets
- replacing a large portion of the work
- restructuring an entire production
- overwriting user-authored material with generated material
- changing reusable project-level references that many scenes depend on
- binding or unbinding generated media in a way that affects downstream output

The confirmation should be simple:

```text
这会删除 12 段对白并重排第 3 场。要继续吗？
```

This is not a workspace review. It is a safety confirmation.

## 13. Validation And Save Semantics

The agent should normally try to save after editing.

Recommended operation:

```text
editWorkspace
-> validateWorkspace
-> saveWorkspace
-> summarizeResult
```

If validation fails:

```text
editWorkspace
-> validateWorkspace fails
-> repair if safe
-> validate again
-> saveWorkspace
```

If validation cannot be repaired safely, the agent reports a concrete blocker.

If save fails:

- do not claim the change is saved
- report the concrete failure if available
- either repair and retry, or ask for the missing decision

Avoid saying `apply` in user-facing language. Prefer:

- save
- update
- changed
- finished
- not saved

Internal code can choose one canonical verb:

- `saveWorkspace` if the operation is user/product oriented
- `syncWorkspace` if the operation is storage oriented
- `commitWorkspace` only if the team wants explicit transaction semantics

Recommended default:

```text
saveWorkspace
```

## 14. Operation Log

The system may still keep a lightweight operation log, but not for rollback.

Purpose:

- help the agent understand what it just changed
- support observability
- support user-visible activity summaries
- support debugging failed saves
- support future comparison features if needed

Example shape:

```json
{
  "id": "edit_123",
  "actor": "agent",
  "userIntent": "压缩第 2 场对白",
  "summary": "删掉重复解释，保留情绪转折",
  "affectedEntities": ["scene_2", "content_unit_18", "content_unit_19"],
  "validationStatus": "passed",
  "saveStatus": "saved",
  "createdAt": "2026-06-02T10:00:00Z"
}
```

This log should not create a user-facing restore promise.

## 15. Naming Migration

Rename all user-facing, agent-facing, and domain-facing `workspace` concepts.

Recommended mapping:

| Old | New |
| --- | --- |
| workspace | workspace |
| Workspace | Workspace |
| workspaceId | workspaceId |
| workspace file | workspace file |
| workspace buffer | workspace buffer |
| workspace content | workspace content |
| workspace state | workspace state |
| workspace lifecycle | workspace lifecycle |
| workspace_create | workspace_create or workspace_open |
| workspace_apply_preview | workspace_validate |
| workspace_apply | workspace_save |
| applyWorkspace | saveWorkspace |
| WorkspaceService | WorkspaceService |
| WorkspaceRepository | WorkspaceRepository |
| AgentWorkspaceStore | AgentWorkspaceStore |
| workspaceStore | workspaceStore |
| agent://workspace/{id}/content | agent://workspace/{id}/content |

The exact tool names can be chosen during implementation, but the semantic direction should be consistent.

For storage migration:

```text
Legacy persisted name: workspace
Domain/API/tool/UI name: workspace
```

Use adapters until the storage layer can be renamed safely.

## 16. Workspace Naming Migration

Workspace-specific names should either disappear or become domain edit names.

Recommended mapping:

| Old | New |
| --- | --- |
| workspace | edit plan, workspace edit, or remove entirely |
| workspace_first | workspace_edit_router |
| workspace review | change summary or activity |
| workspace workspace | workspace edit buffer |
| project_standards_workspace | project_standards_edit |
| setting_workspace | setting_edit |
| asset_workspace | asset_edit |
| production_workspace | production_edit |
| content_unit_workspace | content_unit_edit |
| workspaceSnapshot | workspaceSeed or sourceState |

If the schema names are expensive to migrate, keep schema ids as compatibility names temporarily, but do not surface them in prompts or UI.

## 17. Current Files That Conflict With The New Model

Based on the current repository, these areas still encode the old model:

- `movscript/apps/agent/catalog/skills/movscript/rules/workspace/instruction.md`
- `movscript/apps/agent/catalog/skills/kernel/workspace_first/instruction.md`
- `movscript/apps/agent/catalog/skills/workspace/rules/lifecycle/instruction.md`
- `movscript/apps/agent/catalog/skills/workspace/lifecycle_support/instruction.md`
- `movscript/apps/agent/catalog/skills/core/base/default/instruction.md`
- `movscript/apps/agent/catalog/LAYERING.md`
- `movscript/apps/agent/src/ARCHITECTURE.md`
- `movscript/apps/agent/src/workspaces/`
- `movscript/apps/agent/src/ports/workspace/`
- `movscript/apps/agent/src/adapters/workspace/`
- runtime tool names such as `workspace_create`, `workspace_apply_preview`, and `workspace_apply`

The most important prompt-level conflicts are:

- "Workspace is local review artifact"
- "Workspace is schema workspace"
- "Do not apply unless user asks"
- "Workspace review before formal write"
- "Report workspaceId, validation, preview, apply"
- "Local workspace is not formal project data"

These should be replaced by the workspace contract.

## 18. Catalog Layering Target

The catalog product layers should move from:

```text
Agent Core
Workspace
MovScript workspace skills
Candidate
Generation
```

to:

```text
Agent Core
Workspace
MovScript editing skills
Candidate
Generation
```

The `Workspace` layer owns:

- workspace read
- workspace edit
- workspace validation
- workspace save
- workspace lifecycle if multiple workspaces exist
- file refs for workspace content
- compatibility adapters for legacy workspace storage

The `MovScript` layer owns:

- project context
- production context
- script reading
- creative reference queries
- asset slot queries
- domain-specific editing runbooks

The `Candidate` and `Generation` layers can stay separate. Generated media is still not automatically accepted or bound unless the user requests that edit and the workspace save succeeds.

## 19. Tool Model Target

The agent should receive tools that match the workspace model.

Possible tool set:

```text
workspace_focus_get
workspace_open
workspace_read
workspace_search
workspace_edit
workspace_validate
workspace_save
workspace_activity_list
```

The agent should not need:

```text
workspace_apply_preview
workspace_apply
workspace_create
workspace_review
workspace_accept
workspace_reject
rollback
```

Compatibility can be staged:

```text
workspace_validate -> calls existing workspace_apply_preview internally
workspace_save -> calls existing workspace_apply internally
workspace_open/read/edit -> calls existing workspace file plumbing internally
```

The model should only see workspace names.

## 20. UI Target

Remove or de-emphasize:

- workspace review panel
- workspace pending state
- accept/reject workspace buttons
- workspace terminology
- apply terminology
- rollback controls tied to workspace history

Replace with:

- current work editor
- agent activity summary
- validation/apply status
- high-risk confirmation dialog
- "keep adjusting" chat interaction
- optional affected entity highlights

Suggested activity item:

```text
Agent edited Scene 2
Compressed dialogue, removed repeated explanation, preserved the emotional turn.
Saved.
```

Suggested failure item:

```text
Agent could not save the edit
Content unit 4 is missing a scene anchor.
```

## 21. How To Handle "Undo" Language

The user may still say "undo" naturally. The agent should support the intent without promising system restore.

User:

```text
撤销刚才那个改动
```

Agent behavior:

```text
Read current workspace.
Use recent operation summary if available.
Make a new edit that reverses or softens the previous direction.
Validate and save.
Summarize the new result.
```

Agent response:

```text
我把刚才压缩过的对白重新放松了一些，恢复了角色解释动机的两句，但保留了更紧的场景节奏。
```

Do not say:

```text
我已经回滚到之前的快照。
```

## 22. How To Handle Failed Edits

There are three different failure classes.

Validation failure:

```text
The workspace content is structurally invalid.
```

Agent should repair if safe. If not safe, report the exact field or entity.

Save failure:

```text
The workspace content is valid but could not be persisted.
```

Agent should not claim the change is saved. It may retry if the failure is transient and retry is allowed.

Ambiguous user intent:

```text
The agent cannot determine the edit target or scope.
```

Agent should ask one narrow question.

## 23. What Still Needs Confirmation

The agent should not ask for confirmation for ordinary local edits.

It should ask for confirmation when:

- the edit is destructive
- the edit is broad
- the edit may affect reusable references
- the user asks for a vague large change
- the user asks to replace human-written work with generated work
- tool permissions classify the operation as high-risk

Confirmation should be about scope, not workspace content.

Bad:

```text
我创建了一个 workspace，请审阅。
```

Good:

```text
这会重排整个 production 的 8 个 scene moments。要继续吗？
```

## 24. Implementation Plan

Recommended migration order:

1. Document the new model.
2. Rewrite core skill instructions around workspace editing.
3. Disable workspace-first as the default route.
4. Introduce workspace-named tool aliases over existing workspace tools.
5. Update agent-facing tool descriptions to hide workspace/workspace semantics.
6. Update UI copy from workspace review to agent activity and save status.
7. Rename domain services from workspace to workspace where low risk.
8. Keep legacy storage shape until the domain rename is stable.
9. Rename storage tables/fields only if the old names keep causing maintenance mistakes.
10. Remove dead workspace review paths after compatibility traffic is gone.

Suggested first code slice:

```text
catalog skills only
```

Reason:

- highest effect on agent behavior
- lowest schema risk
- no database migration needed
- makes future tool/API renames easier to evaluate

Suggested second code slice:

```text
tool aliases and response field aliases
```

Reason:

- lets the model stop seeing workspace/workspace names
- can keep old implementation behind adapters
- supports incremental frontend migration

Suggested third code slice:

```text
UI removal of workspace review as primary path
```

Reason:

- aligns user experience with agent behavior
- avoids users learning concepts that are being removed

## 25. Compatibility Strategy

During migration, support both names at boundaries:

```text
old persisted field: workspaceId
new API/model field: workspaceId
```

Rules:

- new code should use workspace names
- old code can remain behind adapters
- compatibility adapters should be boring and explicit
- do not mix both names inside the same domain service if avoidable
- do not expose both names to the model in the same tool result

Example adapter:

```ts
type LegacyWorkspaceRecord = {
  workspaceId: string
  content: unknown
}

type WorkspaceRecord = {
  workspaceId: string
  content: unknown
}

function fromLegacyWorkspace(record: LegacyWorkspaceRecord): WorkspaceRecord {
  return {
    workspaceId: record.workspaceId,
    content: record.content,
  }
}
```

## 26. Observability

Trace and logs can keep implementation details, but ordinary trace summaries should follow the new model.

Prefer:

```text
workspace.edit.started
workspace.validation.failed
workspace.save.completed
```

Avoid adding new traces named:

```text
workspace.review.started
workspace.apply.completed
```

If existing trace names remain for compatibility, document them as legacy.

## 27. Permissions

The permission model should classify by risk, not by old workspace state.

Suggested risk classes:

- read workspace
- edit workspace
- save workspace
- generate media
- bind candidate
- destructive edit
- external side effect

Ordinary workspace edits should be smooth. High-risk saves should still pause for confirmation or approval.

## 28. Relationship To Generated Media

The generation model can remain separate.

Creating a generation job is not the same as editing the work.

Generated media becomes part of the work only when the user asks to use it and the workspace save succeeds.

User-facing language:

```text
我生成了一个候选画面。
```

Then, after binding or using it:

```text
我把这个候选画面加入了第 4 个关键帧。
```

Do not say generated media is accepted, locked, or bound unless the saved workspace state proves it.

## 29. Relationship To Script Reading

Script reading should remain a read operation unless the user asks for edits.

The agent should not confuse backend scripts with legacy workspace ids. In the new model:

```text
Script = source/project content that can be read
Workspace = editable current work surface
```

If the user asks:

```text
读一下第一集
```

the agent reads.

If the user asks:

```text
把第一集开头改得更快
```

the agent edits the workspace.

## 30. Non-Goals

This design does not require:

- changing the workspace schema immediately
- adding system rollback
- exposing workspace to users
- keeping workspace review as a normal flow
- making every edit ask for approval
- merging generation jobs into workspace editing
- removing technical transactions

## 31. Open Decisions

These should be decided during implementation:

- Should the canonical user/product verb be `save` or `update`?
- Should the internal storage verb be `syncWorkspace` or `saveWorkspace`?
- Should `workspace_open` create a new workspace or always load an existing current workspace?
- Does each project have exactly one active workspace, or can there be multiple named workspaces?
- How long should operation summaries be retained?
- Which high-risk edits require explicit user confirmation?
- Should old schema ids like `movscript.content_unit_workspace.v1` be renamed now or kept as compatibility ids?
- Should `agent://workspace/...` refs be migrated immediately to `agent://workspace/...`, or aliased first?

## 32. Target One-Paragraph Summary

MovScript's agent edits the current workspace directly. Workspace is the internal name for the editable surface materialized from the current project state; it replaces the old workspace/workspace mental model without requiring an immediate schema change. Users should not see workspace, workspace, apply, snapshot, or rollback concepts. They should see what the agent changed and continue directing the work. Wrong edits are handled by further edits from the current state, not by product-level rollback. Workspace review should be removed from the main path and replaced with direct edit, validation, save, and concise result summaries.
