# MovScript Workspace Ontology

本文定义 MovScript 在 Git canonical 架构下唯一的 workspace 本体。它用于统一前端、CLI、MCP、agent、后端和 core 包对 workspace 的命名、路径、权限和工作流理解。

本文只定义目标模型，不兼容 editable projection 时代的 `namespace`、`projection`、`sync`、`materialize` 等概念。

## 核心结论

MovScript 只有一个业务事实源：

```text
Project Git Repository
```

一个项目就是一个 Git repository。项目 repo 自身就是 project workspace，不再需要 `Workspace Namespace` 这个中间概念。

最终工作流是：

```text
edit/ files -> review -> build -> .build/current
```

只有 `build` 成功，修改才算进入当前有效版本。

## 目录模型

项目 repo 根目录建议如下：

```text
project.json
workspace.json

edit/
  setting/
  standards/
  scripts/
  productions/
  assets/
  delivery/

.build/
  current/
  indexes/
  reviews/
  manifests/
```

### edit/

`edit/` 是唯一的可编辑业务区。

agent 和 UI 只能直接修改 `edit/` 下的业务文件。所有创作类实体都以 `edit/` 中的文件为输入。

示例：

```text
edit/setting/setting_{id}.json
edit/standards/project_standards.json
edit/scripts/script_{id}/script.md
edit/productions/production_{id}/production.json
edit/productions/production_{id}/segments/segment_{id}.json
edit/productions/production_{id}/scene_moments/scene_moment_{id}.json
edit/productions/production_{id}/content_units/content_unit_{id}.json
edit/assets/asset_slot_{id}.json
edit/assets/asset_slot_{id}.candidates/candidate_{id}.json
```

### .build/

`.build/` 是 MovScript 构建区。

它保存当前生效版本、索引、review 结果和构建 manifest。agent 和 UI 不直接修改 `.build/`。

示例：

```text
.build/current/
.build/indexes/domain-index.json
.build/reviews/review_{id}.json
.build/manifests/build_{id}.json
```

`.build/current` 表示上一次成功 build 后的有效业务状态。`review` 比较的是：

```text
.build/current -> edit/
```

`build` 成功后，MovScript 根据 `edit/` 重建索引和当前版本，并更新 `.build/current`。

## 本体层级

### Project Workspace

`Project Workspace` 就是项目 Git repo。

它包含：

```text
project metadata
editable domain files under edit/
build output under .build/
```

不再存在 `movscript.project:{id}` 这种 workspace namespace。项目 id、repo id、branch、commit 等信息属于 repo binding 或 build manifest，不是 workspace 本体。

### Domain Workspace

`Domain Workspace` 是业务编辑面。它定义 agent 和 UI 当前编辑哪类实体、可以参考哪些上下文、review/build 应检查什么。

当前唯一允许的 domain workspace：

```text
project_standards_workspace
setting_workspace
production_workspace
content_unit_workspace
asset_workspace
```

domain workspace 必须直接绑定 domain schema、`edit/` 路径和 validator。MCP 只能返回 domain model，不能再包装第二层 workspace 协议。

### Build Version

`Build Version` 是一次成功 build 的结果。

每次 build 至少产生：

```text
.build/current/
.build/indexes/domain-index.json
.build/manifests/build_{id}.json
```

`build manifest` 记录：

```text
source edit file hashes
domain schema versions
validator version
build time
changed entities
warnings
```

## Domain Workspace 清单

### project_standards_workspace

用途：项目级创作标准。

拥有实体：

```text
project_standards
prompt_rule
style_rule
quality_rule
```

编辑路径：

```text
edit/standards/project_standards.json
```

### setting_workspace

用途：项目级设定。角色、地点、道具、世界观、风格参考都统一称为 `setting`，不再保留单独的 `setting` 概念。

拥有实体：

```text
setting
setting_state
setting_relationship
```

编辑路径：

```text
edit/setting/setting_{id}.json
edit/setting/setting_{id}.states/state_{id}.json
edit/setting/relationships/relationship_{id}.json
```

示例：

```json
{
  "schema": "movscript.setting.v1",
  "id": "setting_hero",
  "kind": "character",
  "name": "女主",
  "description": "年轻工程师，克制、敏锐。",
  "status": "active"
}
```

### production_workspace

用途：生产结构和场景叙事结构。

拥有实体：

```text
production
segment
scene_moment
writing_expression
setting_usage
```

编辑路径：

```text
edit/productions/production_{id}/production.json
edit/productions/production_{id}/segments/segment_{id}.json
edit/productions/production_{id}/scene_moments/scene_moment_{id}.json
```

`setting_usage` 引用 `setting`，不创建新的 setting。

### content_unit_workspace

用途：把 scene moment 拆成可生产的内容单元。

拥有实体：

```text
content_unit
content_unit_timing
content_unit_visual_plan
storyboard_brief
```

编辑路径：

```text
edit/productions/production_{id}/content_units/content_unit_{id}.json
```

### asset_workspace

用途：素材需求和候选素材。

拥有实体：

```text
asset_slot
candidate
candidate_decision
keyframe
```

编辑路径：

```text
edit/assets/asset_slot_{id}.json
edit/assets/asset_slot_{id}.candidates/candidate_{id}.json
edit/productions/production_{id}/keyframes/keyframe_{id}.json
edit/productions/production_{id}/keyframes/keyframe_{id}.candidates/candidate_{id}.json
```

candidate 引用 resource id，但 resource 二进制和 generation job runtime 不进入业务实体。

## 文件类别

文档不再用“禁止写入”描述业务边界。边界只看文件类别和 owner。

### editable

`editable` 文件是 `edit/` 下的业务源文件。

规则：

```text
agent/UI 可以改
review 必须检查
build 以它作为输入
build 成功后才生效
```

### built

`built` 文件是 `.build/` 下的构建结果。

规则：

```text
只有 MovScript build 写入
agent/UI 不直接改
可由 edit/ 重新生成
表示当前有效版本
```

### runtime

`runtime` 是不进入 project repo 的运行态。

示例：

```text
generation job state
provider session logs
temporary uploads
local cache
desktop session state
```

业务文件只能引用 runtime 产生的稳定结果，例如 `resource_id`。

### external

`external` 是项目外部数据。

示例：

```text
resource metadata
model catalog
provider catalog
repo binding
user/project permission
```

external 数据可以被 `get_model` 用作上下文，但不作为 workspace 文件直接编辑。

## MCP 模型

MCP 只提供三个 workspace 工具：

```text
get_model
review
build
```

实际工具名可以带 MovScript 前缀，例如：

```text
movscript_workspace_get_model
movscript_workspace_review
movscript_workspace_build
```

### get_model

用途：告诉 agent 如何编辑当前 entity。

输入：

```json
{
  "entityType": "asset_slot",
  "entityId": "asset_slot_001"
}
```

输出：

```json
{
  "workspaceKind": "asset_workspace",
  "entityType": "asset_slot",
  "editablePaths": ["edit/assets/asset_slot_001.json"],
  "contextPaths": [
    "edit/setting/**",
    "edit/standards/project_standards.json"
  ],
  "schema": "movscript.asset_slot.v1",
  "instructions": [
    "Edit only the returned editablePaths unless the user explicitly asks to create related entities.",
    "Reference setting ids instead of creating setting data inside asset slots.",
    "Run review after edits."
  ]
}
```

`get_model` 不创建 projection，不写 `.build/`，不返回 MCP 自己的保存协议。

### review

用途：检查从上一次 build 到当前 `edit/` 的变化。

比较范围：

```text
.build/current -> edit/
```

review 必须输出：

```text
changed files
changed entities
schema issues
domain issues
reference issues
build readiness
```

review 不让修改生效。review 只是说明当前 diff 是否可以 build。

### build

用途：重建索引并让当前修改生效。

build 必须执行：

```text
load edit/
validate schemas
validate domain rules
validate references
write .build/indexes
write .build/current
write .build/manifests
```

只有 build 成功，当前修改才算进入有效版本。

如果 build 失败：

```text
.build/current 不变
返回错误和可定位的文件路径
agent/UI 继续修改 edit/
```

## Review 和 Build 语义

### review 是检查

review 的问题是：

```text
从上一次 build 到现在，edit/ 改了什么？
这些修改是否满足 schema 和 domain 规则？
如果 build，会影响哪些 entity？
```

### build 是提交到当前版本

build 的问题是：

```text
当前 edit/ 能否成为新的有效业务状态？
如果可以，生成新的 .build/current 和 domain index。
```

### Git commit 是持久化

Git commit 的问题是：

```text
把 edit/ 和 .build/ 的这次成功状态保存到项目 repo 历史。
```

推荐顺序：

```text
agent edits edit/
review
build
git commit
```

## Agent 工作流

```text
1. agent 调用 get_model，获得 entity 的 schema、editablePaths 和编辑说明。
2. agent 直接修改 edit/ 下的文件。
3. agent 调用 review，查看从上一次 build 到现在的变化和问题。
4. 如果 review 有问题，agent 继续修改 edit/。
5. review 通过后，调用 build。
6. build 成功后，本次修改成为当前有效版本。
7. UI 或后端再处理 Git commit。
```

agent 不直接修改 `.build/`。agent 不构造 submit payload。agent 不调用 backend semantic apply。

## UI 工作流

```text
1. UI 从 .build/current 或 .build/indexes 读取当前有效状态。
2. UI 编辑 edit/ 下的业务文件。
3. UI 可实时调用 review。
4. 用户确认后调用 build。
5. build 成功后 UI 刷新 .build/current。
```

UI 展示当前有效状态时优先读 `.build/`，编辑时写 `edit/`。

## Core 包职责

`@movscript/core` 应提供：

```text
workspace ontology types
domain workspace model registry
entity -> workspace model resolver
edit file loader
domain index builder
review engine
build engine
build manifest writer
MCP get_model/review/build handlers
```

`@movscript/core` 不应提供：

```text
workspace namespace
editable projection protocol
projection materializer
projection sync
MCP-owned workspaceProtocol
backend semantic apply operation builder
provider-specific workspace state
frontend route protocol
```

## 迁移判断标准

如果一段代码仍然需要以下概念，说明它还没有迁移到新 ontology：

```text
namespace
projection
sync
materialize
workspace_submit as semantic apply
setting as independent concept
agent writes generated files
review reads backend database rows as source of truth
```

迁移完成后的判断标准：

```text
project repo 是 project workspace
agent 只改 edit/
build 只写 .build/
review 比较 .build/current 和 edit/
setting 替代 setting
MCP 只剩 get_model/review/build
build 成功才算修改生效
```

