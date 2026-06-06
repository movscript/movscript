# Workdir 文件投影设计

本文档记录 MovScript 未来工作目录和本地文件投影的目标设计。核心目标是让 provider session 直接编辑本地文件，把本地文件视为草稿；只有显式 apply 时，草稿才会写回后端数据库。

通用框架的初始实现位于 `packages/editable-projections`。该 package 只负责文件投影、manifest、snapshot、diff、merge、update target artifact、apply review 和 command execution 协议；MovScript 的角色、素材、剧本、制作结构等概念应通过后续 domain adapter 接入。

为了让这套机制能用于 MovScript 以外的系统，框架应提供 adapter contract testkit 和 workflow contract testkit。每个业务系统在接入时都应为自己的 domain adapter 提供有效文件样本、无效文件样本和后端实体样本，验证 parse、validate、serialize、toProjection、createCommands 满足框架约定；同时用一个可丢弃 workspace 验证 update target artifact、review artifact、executor、canonical refresh 和最终 clean 状态的完整闭环。这样通用框架保持领域无关，领域语义留在 adapter 和业务 service 中。

## 框架产品形态

这套机制可以作为一个通用的 `editable-projections` 框架，而不是 MovScript 的专用 workspace 功能。框架本身只关心五件事：

1. 后端实体如何投影成本地文件。
2. 本地文件如何被解析、校验和序列化。
3. 本地草稿与 base snapshot、远端最新状态如何比较。
4. review plan 如何表达要执行的业务动作、冲突和阻塞项。
5. apply 时如何通过业务 executor 提交命令，并用后端返回的 canonical 数据刷新本地。

它不应该关心角色、素材、订单、客户、文章、工单等业务概念。业务系统只通过 adapter 和 executor 接入。

推荐 package 形态：

```text
@movscript/editable-projections
  core: adapter、registry、manifest、hash、diff、merge、review、apply、formatter
  node: 本地文件系统、manifest store、base snapshot store、artifact store
  testing: adapter contract、workflow contract、memory harness
  examples/*: note、movscript-project 等示例，不作为框架核心依赖
```

接入一个新系统时，业务方应实现三层边界：

```text
BackendStore
  读取当前后端 canonical entity，用于 update、status、merge 和 stale check。

ProjectionAdapter
  定义文件 schema、parse/serialize/validate、backend entity -> projection、
  projection diff -> domain command。

CommandExecutor
  把 review plan 中的 domain command 交给业务 service 执行。
  执行后返回 canonical update targets，让本地文件、manifest 和 base snapshot 回到 clean。
```

最小接入流程：

```ts
const project = createNodeEditableProjectionKit(workspaceDir, {
  adapters: [orderAdapter, customerAdapter],
  backendStore,
  executor,
})

await project.workflow.update([
  orderUpdateTarget(orderFromBackend),
])

// agent edits files in workspaceDir

const review = await project.workflow.reviewAndSave('.', 'reviews/current')
assertApplyReviewReady(review)
await project.workflow.loadAndApply('reviews/current')
```

这套 API 对 CLI、MCP、Electron、HTTP worker 都应该保持同一个模型：`update` 拉取、文件编辑、`review` 生成计划、`apply` 提交。不同入口只是换一层 transport，不应改变核心语义。

## 稳定性要求

框架要成为稳定产品，必须把以下行为视为公开契约：

- 所有 framework error 都有稳定 `code`，跨 CLI/MCP/HTTP 边界可序列化。
- 所有路径都拒绝绝对路径和 `..`，避免 agent 文件越界。
- review artifact 和 update target artifact 都要可持久化、可重新加载、可校验。
- apply 默认拒绝 stale review，除非调用方显式允许。
- apply 不直接写数据库，只执行 adapter 生成的 command。
- executor 返回的 canonical update target 必须重新校验，不能直接信任。
- Node store 与 memory store 都要通过同一套 workflow contract。
- 每个业务 adapter 都必须有 contract tests，证明样本、无效样本和命令生成满足约定。

## 设计目标

- 后端数据库仍然是正式状态和唯一权威数据源。
- 本地工作目录是后端数据的文件化投影，不是另一套业务状态。
- Provider session 只编辑文件，不需要理解每一种旧的 typed workspace 编辑接口。
- 本地文件永远可以作为草稿存在；`apply` 才是提交。
- `update` 从后端刷新当前投影，但默认不应悄悄覆盖本地脏改动。
- 后端实体的 hash 或 version 用作乐观锁，避免覆盖别人或前端刚写入的数据。
- 结构化 JSON 使用三方比较和字段级合并，能自动合并时自动合并，不能合并时生成冲突。

## 心智模型

这套机制参考 Git working tree、HTTP ETag / If-Match、JSON Patch、Terraform plan/apply 和 Kubernetes apply。

```text
后端数据库          = remote repository
本地 data 文件      = working tree
manifest/baseHash   = last synced commit / index
workspace_update    = pull / checkout
workspace_status    = git status
workspace_diff      = git diff
workspace_apply_review = terraform plan
workspace_apply     = commit + push
```

MovScript 不需要直接把这些文件放进 Git，也不需要引入 CRDT。这个场景更像 agent 在一个本地工作区里编辑项目文件，然后把变更提交给后端；Git/Terraform/Kubernetes 的同步与冲突模型比实时协同编辑模型更合适。

## 目录结构

推荐把 provider session 可编辑的业务文件放在 `data/`，把同步账本、冲突、刷新计划和审阅证据放在 `meta/`、`sync/`、`update-targets/` 或 `reviews/`。业务 JSON 文件本身应尽量干净，不嵌入同步 hash。

```text
<workspace-root>/
  .movscript/
    manifest.json
    data/
      users/
        {userId}/
          projects.index.json
          projects/
            {projectId}/
              project.json
              assets/
                asset_1.json
                asset_2.json
              productions/
                {productionId}/
                  production.json
                  segments/
                    segment_1.json
                  scene_moments/
                    scene_moment_1.json
                  content_units/
                    content_unit_1.json
              scripts/
                {scriptId}/
                  script.md
    meta/
      manifest.json
      conflicts/
    update-targets/
    reviews/
```

`data/` 是 agent 的主要工作区。`meta/manifest.json` 是系统内部同步账本，记录每个文件对应的后端实体、上次同步 hash、最新已知后端 hash、本地 hash 和 schema 信息。

## 业务文件

项目索引用于导航，不承载完整业务内容：

```json
{
  "id": 1,
  "name": "项目名",
  "assets": [
    {
      "id": 1,
      "name": "父亲旧照片",
      "path": "assets/asset_1.json"
    }
  ],
  "productions": [
    {
      "id": 1,
      "name": "第一集",
      "path": "productions/production_1/production.json"
    }
  ]
}
```

具体实体独立成文件：

```json
{
  "id": 1,
  "type": "asset",
  "name": "父亲旧照片",
  "status": "draft",
  "description": "一张边角磨损的家庭合影"
}
```

这样 provider session 可以先读 `project.index.json`，再精确打开需要编辑的实体文件，避免一次加载整个项目。

## 投影粒度

本地文件不应一比一映射数据库实体，也不应把整个项目压成一个大 JSON。推荐映射产品语义上的 aggregate / editable projection。

```text
数据库实体          = 内部存储模型
Editable Projection = provider session 可编辑模型
Index / View        = provider session 阅读模型
Command             = apply 后真正执行的业务动作
```

一比一数据库实体映射的问题是文件会过度数据库化，provider session 需要理解表结构、外键和系统字段，容易绕过业务服务层。一个大聚合文档的问题是冗余过多、冲突范围过大，apply 很难判断哪个字段是权威来源。

推荐折中方案：

```text
projects/1/
  project.index.json
  project.json
  references/
    creative_reference_12.json
  assets/
    asset_1.json
  productions/
    production_1/
      production.json
      structure.json
      content_units/
        content_unit_101.json
  scripts/
    script_1.md
```

其中：

- `project.json` 是项目基础信息的可编辑投影。
- `creative_reference_12.json` 是一个角色、地点、道具或其他创意参考的可编辑投影。
- `asset_1.json` 是一个素材资产的可编辑投影。
- `production_1/structure.json` 可以是叙事结构聚合，承载 segments、scene moments、content units 的顺序和层级关系。
- `content_unit_101.json` 承载单个内容单元的详细画面、情绪、动作、prompt 等字段。
- `project.index.json` 只做导航和摘要，不作为权威编辑入口。

核心原则是：每个事实只能有一个 writable owner。

例如角色名字只能在 `references/creative_reference_12.json` 中修改。其他文件可以出现导航信息：

```json
{
  "entityType": "creative_reference",
  "entityId": 12,
  "label": "张建国",
  "path": "../../references/creative_reference_12.json"
}
```

这里 `label` 和 `path` 是只读提示，不是权威字段。apply 时应忽略它们，或在发现过期时提示刷新。

## 文件类别

本地投影文件可以分为三类。

### Writable Projection

agent 可以编辑，apply 会转换成受控业务 command。

```text
project.json
assets/asset_1.json
references/creative_reference_12.json
productions/production_1/structure.json
productions/production_1/content_units/content_unit_101.json
```

Writable projection 应尽量规范化，避免同一个权威字段出现在多个可写文件里。

### Generated Index

系统生成，方便 agent 找文件和理解结构，默认只读。

```text
project.index.json
assets.index.json
references.index.json
production.index.json
```

Index 可以冗余 `label`、`path`、`summary`、`status` 等导航字段，因为它不是权威数据，可以随时通过 `workspace_update` 重建。

### Materialized View

为了上下文方便生成的聚合视图，通常只读，不直接 apply。

```text
production_context.json
storyboard_context.json
generation_context.json
```

View 可以反规范化，甚至可以为特定 agent 任务生成，但不能成为主要提交入口。若需要从 view 产生修改，应由 apply review 明确指出这些修改会落到哪些 writable projection 或业务 command。

## 冗余规则

为了兼顾编辑体验和一致性，采用以下规则：

- 权威字段不冗余，只存在于唯一 writable owner。
- 导航字段可以冗余，但默认只读。
- index 和 view 可以反规范化，但应可由后端或 writable projection 重建。
- apply 只接受 writable projection 的权威字段。
- 对于只读冗余字段，apply 应忽略、校验或提示刷新，不应把它们写回数据库。
- 文件边界围绕业务操作边界，而不是数据库表边界。

这能避免两个极端：过度数据库化导致文件碎片化、agent 难以编辑；过度大文档化导致冗余、冲突和权威来源不清。

## 同步账本

同步状态不写进业务 JSON，而是放进 `meta/manifest.json`：

```json
{
  "backendRevision": "global-rev-123",
  "files": {
    "projects/1/assets/asset_1.json": {
      "entityType": "asset",
      "entityId": 1,
      "schema": "asset.v1",
      "baseHash": "hash-when-last-synced",
      "localHash": "hash-when-last-written",
      "backendHash": "latest-known-backend-hash"
    }
  }
}
```

字段含义：

- `entityType` / `entityId`：文件对应的后端实体。
- `schema`：本地文件的业务 schema 版本。
- `baseHash`：上次从后端同步到本地时的实体 hash。
- `localHash`：系统最后一次记录到的本地文件 hash。
- `backendHash`：最近一次查询到的后端当前 hash。

真正的乐观锁应以后端当前 hash/version 为准，manifest 只记录本地已知状态。

## 工具语义

建议保留现有工具名，但重新明确语义：

- `workspace_update(path, mode = "safe")`：从后端刷新本地文件投影。
- `workspace_status(path)`：显示本地改动、后端改动、冲突和未跟踪文件。
- `workspace_diff(path)`：显示本地草稿相对 base 的差异。
- `workspace_apply_review(path)`：生成写回后端的计划，不写数据库。
- `workspace_apply(path, conflictPolicy = "fail")`：把本地草稿应用到后端。

`workspace_update` 的默认模式应保护本地草稿：

- `safe`：只更新本地未修改文件；脏文件不覆盖，必要时生成冲突或 remote 副本。
- `overwrite`：明确丢弃本地草稿，用后端状态覆盖。
- `merge`：尝试三方合并，无法合并时生成冲突。

通用框架中的 `workspace.update(targets, { mode })` 会把 writable projection 从 `BackendStore` materialize 到本地文件，并同步更新 manifest 与 base snapshot。Generated index 和 materialized view 不依赖后端实体查询，通常由调用方提供 `content` 更新；它们可以冗余导航信息，但仍默认只读，不能通过 apply 写回数据库。

当刷新目标需要跨 agent、CLI、MCP 工具、HTTP 或 UI 流转时，应保存为 update target artifact，而不是临时传一个不可审计的内存对象。框架提供 `serializeWorkspaceUpdateTargetsJson` / `parseWorkspaceUpdateTargetsJson`，以及 workflow 层的 `saveUpdateTargets`、`loadUpdateTargets`、`loadAndUpdate`。Node 接入默认可以用 `FileWorkspaceUpdateTargetStore` 写入 `update-targets/*.json`；测试和非 Node 环境可以用 `MemoryWorkspaceUpdateTargetStore`。

一次 `workspace.update` 批次中，同一个文件路径只能出现一次。重复路径应在 adapter materialize 或写入本地文件前被拒绝，避免“批次后面的 target 静默覆盖前面的 target”。这条规则同样适用于 apply 后业务 service 返回的 canonical update targets。

`workspace_apply_review` 类似 Terraform plan，应明确列出：

- 将创建哪些实体。
- 将修改哪些字段。
- 将删除或软删除哪些实体。
- 哪些文件无法应用。
- 哪些实体存在后端并发变更。

因为 update target 和 apply review 都会作为 JSON artifact 在 agent、CLI、MCP 工具、UI 和业务服务之间流转，update target 的 `content`、可执行 command payload 与 JSON Patch value 必须是 JSON-compatible。框架应拒绝 `undefined`、函数、`BigInt`、非有限数字和循环对象，避免保存 artifact 时字段被静默丢失或序列化失败。

`workspace_apply` 执行业务 command 后，业务 service 应返回 canonical update targets。框架用这些 targets 刷新本地文件、manifest 和 base snapshot，使本地草稿在提交成功后回到 clean 状态。这样 apply 不会变成直接数据库写入器，而是保持 `文件草稿 -> review plan -> 业务 command -> canonical refresh` 的完整闭环。

## Apply 流程

`workspace_apply(path)` 对每个文件执行以下逻辑：

1. 根据 `meta/manifest.json` 找到文件对应的后端实体。
2. 计算当前本地文件 hash。
3. 查询后端当前实体 hash/version。
4. 比较 `base`、`local`、`remote` 三方状态。
5. 如果后端未变，本地已变，直接提交。
6. 如果本地未变，后端已变，提示先 update 或自动刷新。
7. 如果本地和后端都变了，尝试结构化三方合并。
8. 如果无法自动合并，生成 conflict，apply 失败或跳过该文件。

状态矩阵：

| 本地状态 | 后端状态 | 行为 |
| --- | --- | --- |
| 未改 | 未改 | 无操作 |
| 未改 | 已改 | update 可直接刷新 |
| 已改 | 未改 | apply 可直接提交 |
| 已改 | 已改 | 三方合并；失败则冲突 |
| 本地删除 | 后端未改 | apply 删除或软删除 |
| 本地修改 | 后端删除 | 冲突 |
| 本地新增 | 后端不存在 | apply 创建 |

## 三方合并

结构化 JSON 不应只比较 local 和 remote，而应比较：

```text
base   = 上次同步时的后端内容
local  = agent 编辑后的本地文件
remote = 当前后端最新内容
```

如果 local 和 remote 改的是不同字段，可以自动合并：

```json
{
  "base": { "name": "A", "status": "draft" },
  "local": { "name": "B", "status": "draft" },
  "remote": { "name": "A", "status": "ready" }
}
```

可合并为：

```json
{
  "name": "B",
  "status": "ready"
}
```

如果双方都改了同一字段且值不同，则生成冲突。

## Patch 与审计

后端提交可以使用完整实体，也可以从 local 相对 base 计算 JSON Patch 或 JSON Merge Patch。推荐在 review 阶段展示字段级 patch：

```json
[
  {
    "op": "replace",
    "path": "/name",
    "value": "新名字"
  }
]
```

这样更容易审计、预览、回滚，也便于前端向用户解释 agent 到底改了什么。

## 实体引用

业务实体之间的关系不建议使用 JSON Schema 风格的 `$ref` 作为主表达。`$ref` 更适合 schema 或文档片段引用，容易被工具链解释为展开或替换语义。

推荐使用显式业务引用：

```json
{
  "sceneMoment": {
    "entityType": "scene_moment",
    "entityId": 8,
    "label": "客厅夜谈",
    "path": "../scene_moments/scene_moment_8.json"
  },
  "characters": [
    {
      "entityType": "creative_reference",
      "entityId": 12,
      "label": "张建国",
      "path": "../../references/creative_reference_12.json"
    }
  ]
}
```

权威字段只有 `entityType` 和 `entityId`。`label` 与 `path` 是给人和 provider session 阅读的导航信息，apply 时可以校验或刷新，但不应作为主键。

可以约定：

- 业务关系使用 `{ "entityType": "...", "entityId": 123 }`。
- 导航信息使用可选 `label` 和 `path`。
- 文档结构或 schema 复用才使用 `$ref`。
- apply 时以后端 ID 为准，并校验引用实体是否存在、是否属于同一项目或允许的作用域。

## 与旧 workspace 的关系

旧的 `setting_workspace`、`asset_workspace`、`project_standards_workspace`、`production_workspace`、`content_unit_workspace` 可以逐步降级为兼容投影格式，而不是继续作为 agent 的主要编辑入口。

目标状态是：

- typed workspace 不再是 agent 需要选择的编辑对象。
- agent 面对的是普通文件和目录。
- 后端路由由 manifest、文件路径和 schema 共同解析。
- `workspace_update` / `workspace_apply_review` / `workspace_apply` 操作路径，不操作抽象 workspace 类型。
- 批量刷新以文件路径为幂等键；同一批次不能给同一路径返回多个结果。

迁移可以分阶段完成：

1. 保留现有 typed workspace 文件，但把工具入口改成 path-first。
2. 增加 `project.index.json` 和实体级文件投影。
3. 将 hash、dirty、conflict 状态统一迁移到 manifest/sync 账本。
4. 让 apply 支持实体级 JSON 文件。
5. 将旧 typed workspace 仅作为兼容导出或只读聚合视图。

## 原则

- 业务文件保持可读、可编辑、少元数据。
- 同步和冲突状态独立存放，不污染业务 schema。
- 默认保护本地草稿，不静默覆盖。
- apply 前可 preview，preview 应足够解释数据库写入影响。
- 后端 hash/version 是最终并发控制依据。
- 能自动合并就自动合并，不能合并就明确冲突，不猜测覆盖。
