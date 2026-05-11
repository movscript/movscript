# Project Proposal Draft Contract

`project_proposal` 是项目级设定/素材需求的局部语义补丁。它不是全量快照，也不是落库 operation log。

## Positioning

Agent 只维护本地 draft。用户确认 apply 之后，后端才把 draft 与当前正式项目状态做 merge。

Merge 语义是边界核心：

- draft 没有提到的正式设定资料、素材需求不变。
- draft 节点没有提到的字段不变。
- `id` 存在表示 merge 到已有实体。
- `id` 不存在表示新增候选。
- 字段缺失表示“不修改该字段”。
- `merge_candidates` 只用于设定资料本身的合并建议。
- 不允许 `operations`、`action`、`entity`、`target_id`、`source_ids`、`payload`。

## Canonical Draft Shape

```json
{
  "schema": "movscript.project_proposal.v1",
  "scope": "project_proposal",
  "summary": "一句话概述本次局部调整",
  "proposal": {
    "creative_references": [
      {
        "client_id": "cr_heroine",
        "fields": {
          "name": "女主",
          "kind": "person"
        }
      },
      {
        "id": 35,
        "fields": {
          "description": "只修改被提到的描述字段"
        },
        "merge_candidates": [
          {
            "source_id": 48,
            "reason": "48 与 35 描述同一角色，建议合并到 35"
          }
        ]
      }
    ],
    "asset_slots": [
      {
        "id": 56,
        "owner": {
          "type": "creative_reference",
          "id": 35
        },
        "fields": {
          "name": "女主主视图",
          "view_type": "front_main",
          "usage": "作为女主统一外观基准"
        }
      },
      {
        "fields": {
          "name": "女主侧视图",
          "kind": "image"
        },
        "owner": {
          "type": "creative_reference",
          "client_id": "cr_heroine"
        }
      }
    ]
  },
  "impact_notes": [],
  "createdAt": "2026-05-08T12:00:00.000Z"
}
```

## Node Rules

- `creative_references` 节点只接受 `client_id?`, `id?`, `fields?`, `merge_candidates?`。
- `asset_slots` 节点只接受 `client_id?`, `id?`, `owner?`, `fields?`。
- 新增节点没有 `id`，必须提供 `fields.name`。
- 更新节点有 `id`，只 merge `fields` 中出现的字段。
- 素材需求归属使用 `owner.type = "creative_reference"`，配合 `owner.id` 或 `owner.client_id`。
- 人物主视图、侧视图、全身图、表情组、服装状态图等都是 `asset_slots`，不能建成独立 `creative_references`。

## Prompt Rules

- Agent 永远只调整本地 draft。
- 不要复制全量项目状态。
- 未提到的内容不变。
- 合并设定资料时，在保留方 `creative_reference` 节点写 `merge_candidates`。
- 完成前必须 validate draft；如果语义 merge/dry-run 返回错误，按错误路径继续修正 draft。
