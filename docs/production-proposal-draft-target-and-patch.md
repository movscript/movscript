# Production Proposal Draft: Target Snapshot and Patch Revisions

本文记录制作编排 `production_proposal` draft 的推荐定位和多轮 Agent 修改协议。

## 结论

`production_proposal` draft 的权威状态应该是 **target snapshot**，不是 patch operation log。

Agent 每一轮修改时不直接重写数据库，也不只在最终文本里输出 patch。Agent 应该调用结构化 tool 提交 patch，由系统校验 patch、应用到 draft 的 target snapshot，并把 patch 保存为同一个 draft 下的 revision history。

最终 apply 时，不 replay revision patches。系统应重新读取最新数据库上下文，基于 `targetSnapshot` 做 resolution、diff 和 validation，再生成正式 apply operations。

简化表达：

```text
数据库当前状态 + 项目级复用索引 + 当前 draft target snapshot
  -> Agent tool call 提交 patch
  -> 系统应用 patch，生成新的 target snapshot revision
  -> 用户继续提示修改，重复上述过程
  -> 用户确认
  -> 系统重新读取最新数据库，resolve/diff/validate
  -> 后端 apply operations 写入正式实体
```

## 为什么不是单纯 patch operation

只把 draft 定义成 patch operation list 有几个问题：

- 用户和 UI 需要审阅的是当前完整方案，而不是一串历史命令。
- 多轮修改后 patch list 会越来越长，Agent 很容易基于旧状态继续打补丁，造成重复创建、悬空引用或漏改父子关系。
- 数据库可能在 draft 生命周期内变化，历史 patch 不能作为最终落库依据。

Patch 更适合做每一轮修改的输入、审计记录、撤销依据和解释材料，不适合作为 draft 的唯一权威状态。

## 为什么不是单纯 target snapshot

只保存 target snapshot 也不够：

- 无法解释“本轮到底改了什么”。
- 很难做撤销、审计和用户确认。
- 节点缺失无法区分是 Agent 漏写、用户删除、判断不需要，还是本轮未涉及。
- 项目级设定资料和素材复用不能靠 snapshot 自己判断，必须依赖最新数据库索引和 resolver。

Snapshot 更适合作为当前方案的权威状态和 UI 展示对象。

## 推荐 Draft Shape

```json
{
  "schema": "movscript.production_proposal_draft.v2",
  "kind": "production_proposal",
  "projectId": 42,
  "productionId": 7,
  "base": {
    "projectVersion": "project-progress-v31",
    "productionVersion": "production-v12",
    "capturedAt": "2026-05-09T12:00:00.000Z"
  },
  "targetSnapshot": {
    "segments": [],
    "scene_moments": [],
    "creative_references": [],
    "creative_reference_usages": [],
    "asset_slots": []
  },
  "revisions": [
    {
      "id": "rev_003",
      "parentRevisionId": "rev_002",
      "patches": [
        {
          "op": "replace_scene_summary",
          "scene_client_id": "sm_002",
          "value": "第二个情景改为更强的悬疑推进。"
        },
        {
          "op": "add_reference_usage",
          "scene_client_id": "sm_002",
          "reference_client_id": "cr_lin_xia",
          "role": "protagonist"
        }
      ],
      "reason": "用户要求第二段更悬疑，并补充女主在场。",
      "createdBy": "agent",
      "createdAt": "2026-05-09T12:05:00.000Z"
    }
  ],
  "changeSummary": "第二段已调整为悬疑推进；林夏被补充为 sm_002 的主角设定引用。"
}
```

## Target Snapshot 结构原则

Target snapshot 描述“当前希望方案长什么样”，不要把正式落库动作混进节点主体里。

推荐把实体本体和使用关系拆开：

```json
{
  "targetSnapshot": {
    "creative_references": [
      {
        "client_id": "cr_lin_xia",
        "db_id": 31,
        "resolution": "reuse",
        "kind": "character",
        "name": "林夏",
        "profile": {}
      },
      {
        "client_id": "cr_old_watch",
        "db_id": null,
        "resolution": "unresolved",
        "kind": "prop",
        "name": "旧怀表",
        "profile": {}
      }
    ],
    "creative_reference_usages": [
      {
        "owner_type": "scene_moment",
        "owner_client_id": "sm_002",
        "reference_client_id": "cr_lin_xia",
        "role": "protagonist",
        "state": {
          "emotion": "警惕",
          "visual_notes": "雨夜中回头确认身后动静"
        }
      }
    ]
  }
}
```

这样可以避免把项目级设定资料本体和情景使用关系混在 `scene_moment.creative_references[]` 下。

## Agent 修改协议

Agent 每一轮应该读取：

- 当前 `targetSnapshot`：知道方案现在是什么样。
- 最近若干条 `revisions`：知道刚刚为什么这样改。
- `changeSummary`：知道累计修改意图。
- 最新 context pack：包括当前 production、项目级设定资料索引、项目级素材索引、已有 usage 和版本号。

Agent 每一轮应该调用 tool 提交 patch，例如：

```json
{
  "tool": "movscript_patch_production_proposal_draft",
  "args": {
    "draftId": "draft_123",
    "expectedRevisionId": "rev_003",
    "reason": "用户要求删除旧怀表，改为手机通知触发悬疑。",
    "patches": [
      {
        "op": "remove_reference_candidate",
        "reference_client_id": "cr_old_watch"
      },
      {
        "op": "create_reference_candidate",
        "reference": {
          "client_id": "cr_phone_notification",
          "kind": "prop",
          "name": "手机通知"
        }
      },
      {
        "op": "add_reference_usage",
        "scene_client_id": "sm_002",
        "reference_client_id": "cr_phone_notification",
        "role": "plot_trigger"
      }
    ]
  }
}
```

系统负责：

- 校验 `expectedRevisionId`，避免基于旧版本覆盖新修改。
- 校验 patch schema。
- 应用 patch 到 `targetSnapshot`。
- 写入新的 revision。
- 更新 `changeSummary`。
- 运行 validator，返回错误、警告和可复用候选。

## Patch 是否保存为 Draft

Patch 不应单独保存成另一个 draft。

Patch 应作为当前 `production_proposal` draft 的 `revisions[]` 保存。这样 draft 仍然只有一个权威对象，UI 和 Agent 都围绕同一个 draft 继续工作。

后续喂给模型时，不要只喂 patch list。推荐喂：

```json
{
  "currentTargetSnapshot": {},
  "recentChanges": [
    "rev_003: 第二段改为悬疑推进，新增林夏引用。",
    "rev_002: 删除旧怀表素材需求。"
  ],
  "changeSummary": "当前方案聚焦雨夜追踪，主角林夏在第二段发现异常。",
  "reusableProjectIndex": {
    "creative_references": [],
    "asset_slots": []
  }
}
```

模型看 snapshot 来理解“现在是什么”，看 recent changes 来理解“为什么变成这样”。

## 项目级复用不能交给 Snapshot 自己解决

项目级设定资料和素材复用必须由系统提供 context pack，并由 resolver/validator 裁定。

每次 Agent 修改前，context pack 至少应该包含：

- 当前 production 的 segments、scene moments、usages。
- 项目级 `creative_references` 摘要：`id`、`kind`、`name`、aliases、profile 摘要、fingerprint。
- 项目级 `asset_slots` 摘要：`id`、`name`、`owner_type`、`owner_id`、locked resource 状态。
- 版本号或更新时间，用于 stale check。

Agent 可以提出：

- “这个情景需要一个叫林夏的人物设定引用。”
- “这个道具候选叫旧怀表。”

但系统必须检查：

- 名称或别名是否命中已有设定资料。
- 新候选是否和已有项目级设定重复。
- `reuse` / `update` 是否有真实 `db_id`。
- `create` 是否确实没有高置信复用对象。
- usage 是否指向存在的 scene 和 reference。
- asset slot 是否已有可复用或可锁定对象。

## 最终 Apply 协议

最终 apply 不信任旧 revision，也不直接 replay patches。

推荐流程：

1. 用户确认当前 `targetSnapshot`。
2. 系统重新读取最新数据库 context pack。
3. resolver 重新解析 `targetSnapshot` 中的 unresolved references 和 asset slots。
4. diff engine 计算 `base/current database -> targetSnapshot` 的正式 operations。
5. validator 检查跨项目引用、缺失父节点、重复创建、悬空 usage、stale version。
6. UI 展示最终 impact summary。
7. 后端按拓扑顺序 apply operations。

正式 apply operations 可以包括：

- `create creative_reference`
- `update creative_reference`
- `create segment`
- `update segment`
- `create scene_moment`
- `link creative_reference_usage`
- `unlink creative_reference_usage`
- `create asset_slot`
- `lock asset_slot`

删除正式实体必须是显式操作，不应由 target snapshot 中缺少节点来隐式表达。

## 与当前实现的差异

当前 `production_proposal` 更接近树形 target snapshot，但节点里混有 `action: create | reuse | update`。这能跑通审阅和 apply，但准确性边界不够清楚。

推荐演进方向：

- `production_proposal` 保留 target snapshot 作为权威状态。
- 从嵌套 `scene_moment.creative_references[]` 演进为独立 `creative_references[]` 和 `creative_reference_usages[]`。
- Agent 不直接写正式实体，只调用 patch tool 修改 draft。
- patch 保存为 draft 内部 revision history。
- apply 前重新读取数据库并重新 resolve，而不是信任 Agent 写出的 action。

## 设计原则

- Draft 是可审阅目标方案，不是正式数据。
- Patch 是修改过程和审计记录，不是最终落库依据。
- Agent 通过 tool 修改 draft，不通过自然语言结果修改状态。
- 项目级复用由系统 resolver/validator 保底，不完全依赖模型判断。
- 最终写库必须基于最新数据库上下文重新 diff 和校验。
