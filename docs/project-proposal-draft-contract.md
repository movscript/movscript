# Project Proposal Draft Contract

`project_proposal` 是项目级治理提案草稿，不是最终结果。只有用户确认并执行 apply 后，才会写入正式项目实体。

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

## Prompt Rules

- Draft is a reviewable snapshot, not a final result.
- Use incremental draft edits, then validate before finalizing.
- If nothing changes, record the reasoning in `summary` or `impact_notes` instead of writing `reuse`.
- If there are no existing project entities yet, only use `create`.
- Never place example ids or `0` into `id`, `target_id`, or `source_ids`.

