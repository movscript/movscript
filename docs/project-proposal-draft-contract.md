# Project Proposal Draft Contract

`project_proposal` 是项目级治理提案草稿，不是最终结果。只有用户确认并执行 apply 后，才会写入正式项目实体。

## Positioning

`project_proposal` 应该面向当前目标 snapshot，而不是面向最终落库 operation。

草稿里最重要的是让用户看到“项目设定库和素材需求整理后应该长什么样”。`operations` 只作为兼容字段保留，正式落库操作应在 apply 前由系统基于最新数据库、当前 snapshot、resolver 和 validator 重新生成。

项目提案内部按两层顺序组织：

1. 先整理 `creative_references`
2. 再整理依附于设定资料的 `asset_slots`

`creative_reference` 描述“这个设定是什么”；`asset_slot` 描述“这个设定需要哪些可复用素材或视图”。

例如人物的主视图、侧视图、全身图、表情组、服装状态图都属于 `asset_slot`，不应该被建成新的 `creative_reference`。这样可以避免把“角色本体”和“角色素材视图”混成重复设定。

## Canonical Draft Shape

```json
{
  "schema": "movscript.project_proposal.v1",
  "scope": "project_proposal",
  "summary": "一句话概述本次项目治理结论",
  "proposal": {
    "creative_references": [],
    "asset_slots": []
  },
  "operations": [],
  "impact_notes": [],
  "createdAt": "2026-05-08T12:00:00.000Z"
}
```

## Node Rules

- `creative_references` only accepts `entity: "creativeReferences"`.
- `asset_slots` only accepts `entity: "assetSlots"`.
- `operations` is reserved for compatibility and should stay empty.
- Do not use placeholder ids such as `0`.
- Do not emit `reuse` actions in new drafts.
- Asset slots that describe a view/material requirement for a setting should point back to the owning creative reference by `owner_type`, `owner_id` / `owner_client_id`, or equivalent payload fields.
- Do not represent "main view", "side view", "full body view", "expression sheet", or similar visual requirements as separate creative references.

### Creative References

- `create`: new reference, no `target_id`, `payload.name` required.
- `update`: existing reference, `target_id` required.
- `delete`: existing reference, `target_id` required.
- `merge`: existing reference merge, `target_id` plus non-empty `source_ids` required.

### Asset Slots

- `create`: new asset slot, no `target_id`, `payload.name` required.
- `update`: existing asset slot, `target_id` required.
- `delete`: existing asset slot, `target_id` required.
- `lock_asset`: lock an existing asset slot, `target_id` required.
- For visual view requirements, prefer explicit payload fields such as `view_type`, `owner_type`, `owner_id`, `owner_client_id`, `usage`, or `rationale` instead of encoding all semantics only in `name`.

## Prompt Rules

- Draft is a reviewable snapshot, not a final result.
- First propose canonical creative references, then propose asset slots required by those references.
- Use incremental draft edits, then validate before finalizing.
- If nothing changes, record the reasoning in `summary` or `impact_notes` instead of writing `reuse`.
- If there are no existing project entities yet, only use `create`.
- Never place example ids or `0` into `id`, `target_id`, or `source_ids`.
