# Project 路径优先与后端存储解耦改造方案

## 背景

当前 MovScript 同时存在两种 Project 语义。

第一种是旧语义：Project 是后端实体。桌面端从 `/projects` 拉取项目列表，项目窗口、Agent 会话、候选决策、生成任务、审计、用量、Git 仓库代理都围绕后端 `project_id` 组织。工作区路径由 `MovScript Home + realm + user/org + project_id` 推导，例如：

```text
<MovScript Home>/realms/local/user/1/projects/project_42
```

第二种是刚引入的过渡语义：Project 可以用 `projectDir` 直接定位。MCP domain runtime、桌面项目窗口、workspace 文件服务、engine registry 已经可以在部分路径上绕过后端 `project_id`。

用户期望的最终模型不是“云端项目”和“本地项目”二分，而是更接近 `git init`：

- Project 首先是一个目录。
- `movscript init` 可以在任意目录初始化项目。
- 后端不拥有 Project 生命周期，也不负责创建/摆放项目目录。
- 后端仍需要识别稳定的 project identity，用来组织候选、选择、生成任务、资源索引等结构化数据。
- 后端的 Project identity 应来自项目 manifest 的 `project_uid` 和 user/org scope，而不是来自后端 Project 表主键。
- Git 存储业务源数据；后端存储候选/选择等结构化运行与协作数据。

这意味着当前过渡态还不够。`projectDir` 不能只是旧 `projectId` 模型旁边的一条分支；Project locator、后端 API、前端状态、Agent/MCP 契约都需要整体收敛到 path-first。

## 当前代码现状

### 工作区路径

`packages/core/src/workspace/node/paths.ts` 仍然以 `userId/orgId/projectId` 推导项目目录：

```ts
resolveMovScriptProjectWorkspacePaths({
  workspaceDir,
  realm,
  userId,
  orgId,
  projectId,
})
```

其中 `projectId` 会变成 `projects/project_<id>`。如果没有 `projectId`，默认落到 `projects/project`。这说明工作区定位仍然把项目当作 MovScript Home 内部的一块派生空间。

`packages/workspace/src/node/service.ts` 已经支持 `projectDir`：

```ts
createNodeMovScriptWorkspaceService({ projectDir })
```

这部分是目标架构里最接近正确方向的地方：engine 和 workspace service 本质上只需要一个项目根目录。

### MCP

`packages/core/src/mcp/node/tools/workspace/locator.ts` 已经接受：

- `projectDir`
- `project_dir`
- `projectPath`
- `project_path`
- `cwd`

但 fallback 仍然是旧式 `projectId`，并且 `resolveMCPRequiredProjectId` 仍被 generation 工具使用。`packages/core/src/mcp/tools/domain/definitions.ts` 也仍把 `projectId` 描述为 backend decision storage 所需身份。

刚新增的 `movscript_project_init` 和 `movscript_project_fetch` 可以初始化/打开任意路径，但命名和语义仍是过渡态：

- `fetch` 实际是 open/inspect，不是远端 fetch。
- `projectId` 仍在返回值里像 locator。
- `movscript_project_create` 仍会创建后端项目实体。

### 后端

后端现在明确拥有 Project：

- `apps/backend/internal/infra/persistence/model/project.go`
  - `Project`
  - `ProjectRepository`
  - `ProjectMember`
- `apps/backend/internal/interfaces/http/router/project_routes.go`
  - `/projects`
  - `/projects/:id`
  - `/projects/:id/decisions`
  - `/projects/:id/content-units/:contentUnitId/candidates/generate`
  - `/projects/:id/git/*gitPath`

候选决策也硬绑定后端 project：

- `apps/backend/internal/infra/persistence/model/decision.go`
  - `DecisionContext.ProjectID uint`
  - unique index: `(project_id, target_kind, target_ref)`
- `apps/backend/internal/app/decision/service.go`
  - `TargetInput.ProjectID uint`
  - `normalizeTarget` 要求 `ProjectID != 0`
- `packages/workspace/src/repository/decisionStore.ts`
  - `createMovScriptBackendDecisionStore({ projectId })`
  - 请求路径是 `/api/v1/projects/${projectId}/decisions`

这和目标模型冲突：后端应该只知道“某个 user/org scope 下的一份数据”，而不应该要求这份数据属于后端 Project 表。

### 桌面前端

`apps/frontend/src/features/project/components/ProjectsPage.tsx` 仍从 `/projects` 获取项目列表。新增本地路径入口后，本地项目被包装成 `Project`，并用负数 `ID` 作为 synthetic id。这是兼容手段，不是最终模型。

`apps/frontend/src/shared/infrastructure/session/projectStore.ts` 仍有：

```ts
currentProjectId: number | null
```

很多 query key 和 app event scope 也仍以数字 projectId 为主。Agent、资源候选、GeneratedResultCard、ProjectAgentContentPanel 等功能仍要求 `projectId`。

### CLI

`apps/cli/src/commands/lang.ts` 里 `createCliEngine` 已经比较接近目标模型：

- `--cwd` 优先作为项目目录。
- `MOVSCRIPT_PROJECT_DIR` 可作为项目目录。
- `MOVSCRIPT_PROJECT_ID` 只用于创建 backend decision store。

但 `apps/cli/src/commands/workspace.ts` 仍通过 `resolveMovScriptProjectCwd({ user, org, projectId })` 推导项目目录。CLI 内部还未统一到 `cwd/projectDir`。

## 核心问题

### 1. Project 被后端实体化

后端 `Project` 表承载了名称、owner、org、成员、Git 仓库、progress 等。这样 Project 必须先在后端存在，后端才能存决策、生成候选、Git workspace、用量和审计。

但对本地/Codex/CLI 工作流而言，Project 应该像 Git repository：

```text
mkdir my-film
cd my-film
movscript init
```

这个操作不应该需要登录、后端、org、owner 或 project membership。

### 2. `projectId` 混合了三种含义

当前 `projectId` 同时表示：

- 后端 Project 表主键。
- 工作区目录 slug。
- MovScript 项目 manifest 里的 `project_id`。

这三个含义应该分离：

- 后端不应该有 Project 主键作为必需 locator。
- 项目目录由 path/cwd 决定。
- manifest 里的 project uid 只是内容身份，用于 namespace、同步、引用，不是后端实体 id。

### 3. 后端决策存储和 Project membership 耦合

决策接口现在是：

```text
/api/v1/projects/:id/decisions
```

权限由 project membership 控制。目标模型应该是：

```text
/api/v1/project-data/decisions?scope_kind=org&scope_id=9&project_uid=...
```

权限由 user/org scope 控制。Project 以 manifest `project_uid` 的形式出现，用来组织候选结构化数据，但不要求后端 Project 表中先存在一条项目记录。

### 4. 桌面状态把 Project 当后端列表项

项目页现在默认展示后端项目列表，本地路径项目需要塞成 `Project`。这会导致：

- 本地项目无法自然出现在最近项目列表里。
- progress/detail/plugins 等 query 仍尝试访问 `/projects/:id`。
- 负数 synthetic ID 容易污染 Agent、资源、candidate、query key。

### 5. Codex 复用不自然

Codex 工作目录天然是 cwd。理想契约应该是“工具在 cwd 下工作”，而不是先让 Codex 发现或创建后端 projectId。

## 目标原则

1. **Project 是目录，不是后端实体。**

   项目的源文件、manifest、standards、scripts、content units、productions 都以项目目录为源头。

2. **后端提供 user/org scoped project data storage。**

   后端关心的是谁在存、存在哪个 scope、属于哪个 `project_uid`、target 是什么、候选/选择是什么、ACL 是什么。后端不负责项目目录生命周期，但需要把候选数据按项目身份结构化组织。

3. **`projectDir`/`cwd` 是运行时 locator。**

   Engine、MCP、CLI、Electron project window 都应该以 `projectDir` 定位 source workspace。

4. **manifest uid 是内容身份，不是后端主键。**

   `project.json` 或 `workspace.json` 中应有稳定 uid，例如 `project_uid`。它用于构造 namespace、同步索引和跨设备识别，但不代表后端拥有该项目。

5. **user/org 只决定远端存储 scope，不决定项目路径。**

   登录状态不应该改变本地项目根目录。登录只影响是否可以读写远端 scoped project data。

6. **本地优先，远端可选。**

   没有登录时，决策、候选、选择等可落盘到项目目录。登录后可选择同步或使用远端 scoped project data。

7. **兼容旧后端项目，但不扩大旧模型。**

   旧 `/projects/:id` 可以作为 migration compatibility，但新功能不应继续依赖后端 Project entity。

## 存储边界与目标数据模型

### 存储边界

MovScript 项目数据应明确分为两类。

### 业务源数据：Git 存储

业务源数据是项目的可审查、可 diff、可分支、可合并内容，应该存在项目目录里，并由 Git 管理：

- `workspace.json`
- `project.json`
- `project_standards.json`
- `settings/**`
- `scripts/**`
- `content_units/**`
- `productions/**`

这些数据定义“要做什么”。它们不依赖登录用户，也不依赖后端 Project 表。`movscript init` 和普通文件编辑即可产生完整业务源。

### 候选与运行数据：后端结构化存储

候选数据不是普通业务源文件。它们需要结构化查询、选择状态、生成任务、资源关联、审计、权限、协作更新和可能的并发控制，应由后端识别并存储：

- content unit candidates
- selected candidate / decision context
- generation jobs
- resource indexes / artifact refs
- candidate review metadata
- usage/audit records

因此后端不是完全“不感知项目”。更准确地说：

- 后端不拥有项目目录，不负责 `project init/open`。
- 后端需要识别 `project_uid`，并在 user/org scope 下管理该项目的候选数据。
- 后端的 project identity 是 manifest identity，不是后端 Project 表主键。

推荐后端候选数据主键维度：

```text
scope_kind + scope_id + project_uid + target_kind + target_ref
```

或等价 namespace：

```text
scope      = org/9
project    = 01JZABC...
target     = content_unit:content_units/cu_opening
```

这比纯 `namespace/key/value` 更利于结构化查询，也避免退化成无类型 KV。

### ProjectManifest

项目目录根部应有稳定 manifest。可以继续使用 `workspace.json` / `project.json`，但需要明确字段含义。

建议 `workspace.json` 承担项目身份：

```json
{
  "schema": "movscript.workspace.v2",
  "project_uid": "01J...",
  "title": "Demo Film",
  "created_at": "2026-06-21T00:00:00.000Z",
  "updated_at": "2026-06-21T00:00:00.000Z",
  "sync": {
    "default_scope": {
      "kind": "user",
      "id": "123"
    },
    "namespace": "movscript/projects/01J..."
  }
}
```

`project.json` 继续是领域源文件：

```json
{
  "schema": "movscript.project.v1",
  "kind": "project",
  "project_id": "demo",
  "title": "Demo Film"
}
```

区别：

- `project_uid`: 系统级稳定身份，用于同步 namespace。
- `project_id`: 创作域内可读 ID，用于源文件引用和路径 slug。
- `projectDir`: 当前机器上的绝对路径，不写进可共享源文件，最多写入最近项目索引。

### ProjectLocator

最终运行时只需要 path-first locator：

```ts
type ProjectLocator = {
  projectDir: string
}
```

如果需要打开远端同步副本，也应该先 materialize 到本地目录，再返回 `projectDir`：

```ts
type ProjectOpenResult = {
  locator: { projectDir: string }
  manifest: ProjectManifest
  sync?: {
    scope: StorageScope
    namespace: string
  }
}
```

不要使用：

```ts
{ kind: 'backend'; projectId: 42 }
```

作为新模型的一等 locator。它只能存在于 legacy adapter。

### StorageScope

后端 scoped project data 的访问身份：

```ts
type StorageScope =
  | { kind: 'user'; userId: string | number }
  | { kind: 'org'; orgId: string | number }
```

客户端可以从登录态、当前 org、显式选择中得到 scope。scope 与项目路径无关。

### StorageKey

一条远端数据由以下维度唯一定位：

```ts
type ScopedStorageKey = {
  scope: StorageScope
  projectUid: string
  namespace: string
  key: string
}
```

例如：

```text
scope      = org/9
projectUid = 01JZABC...
namespace  = decisions
key        = decisions/content_units/cu_opening
```

后端需要验证当前用户是否能访问 `org/9`，并把数据归属到 `projectUid = 01JZABC...`。它不需要先存在一条后端 Project 表记录，但需要能按 `projectUid` 查询和维护候选数据。

## 后端改造方案

### 新增 scoped project data storage

新增持久化模型，例如：

```go
type ScopedProjectDataObject struct {
  gorm.Model
  ScopeKind  string `gorm:"not null;size:16;uniqueIndex:uidx_scoped_project_data"`
  ScopeID    string `gorm:"not null;size:128;uniqueIndex:uidx_scoped_project_data"`
  ProjectUID string `gorm:"not null;size:128;uniqueIndex:uidx_scoped_project_data;index"`
  DataKind   string `gorm:"not null;size:64;uniqueIndex:uidx_scoped_project_data;index"`
  TargetKind string `gorm:"size:64;uniqueIndex:uidx_scoped_project_data;index"`
  TargetRef  string `gorm:"size:512;uniqueIndex:uidx_scoped_project_data;index"`
  Key        string `gorm:"size:512;uniqueIndex:uidx_scoped_project_data"`
  ValueJSON  string `gorm:"type:text;not null"`
  Version    string `gorm:"not null;size:128"`
  CreatedBy  *uint  `gorm:"index"`
  UpdatedBy  *uint  `gorm:"index"`
}
```

可选扩展：

- `ContentType`
- `ETag`
- `DeletedAt`
- `Visibility`
- `ExpiresAt`
- `MetadataJSON`

### API 契约

建议新增：

```text
GET    /api/v1/project-data/decisions?scope_kind=org&scope_id=9&project_uid=01J...&target_kind=content_unit&target_ref=...
POST   /api/v1/project-data/decisions/query
PUT    /api/v1/project-data/decisions/candidates
POST   /api/v1/project-data/decisions/candidates
PUT    /api/v1/project-data/decisions/selection
```

写入 body：

```json
{
  "scope": { "kind": "org", "id": "9" },
  "project_uid": "01J...",
  "target_kind": "content_unit",
  "target_ref": "content_units/cu_opening",
  "candidate": { "id": "candidate_a" },
  "expected_version": "..."
}
```

查询 body：

```json
{
  "scope": { "kind": "org", "id": "9" },
  "project_uid": "01J...",
  "target_kind": "content_unit",
  "target_refs": [
    "content_units/cu_opening",
    "content_units/cu_closing"
  ]
}
```

权限：

- `user` scope：只能当前 user 自己访问。
- `org` scope：需要 org member。
- 未来共享项目权限不应恢复为后端 Project membership，而应作为 namespace ACL 或 workspace share policy。

### Decision store 迁移

新增 `createMovScriptScopedStorageDecisionStore`：

```ts
createMovScriptScopedStorageDecisionStore({
  baseUrl,
  scope,
  projectUid,
  token,
})
```

它实现现有 `MovScriptDecisionStore` 接口，但请求 scoped project data API：

```text
key = decisions/content_units/<contentUnitId>
```

旧的 `createMovScriptBackendDecisionStore({ projectId })` 保留为 legacy adapter，只供旧 `/projects/:id` 项目使用。

`MovScriptDecisionContext` 里的 `project_id` 应降级为可选 legacy 字段，新增：

```ts
scope?: { kind: 'user' | 'org'; id: string }
  project_uid?: string
```

或者不写入 record，只由 transport 层定位。

### Content candidate generation 迁移

当前接口：

```text
POST /projects/:projectId/content-units/:contentUnitId/candidates/generate
```

目标接口应把 Project 从路径中移除：

```text
POST /api/v1/generation/content-unit-candidates
```

body：

```json
{
  "scope": { "kind": "org", "id": "9" },
  "namespace": "movscript/projects/01J...",
  "content_unit_id": "cu_opening",
  "project_context": {
    "prompt": "...",
    "refs": []
  }
}
```

生成任务、资源、用量可以继续带 `project_uid` 或 `namespace` 作为 metadata，但不能要求 `project_id` 外键。

## Core / Workspace / Engine 改造方案

### 统一 ProjectEnvironment

新增一个核心类型，替代散落的 `workspaceDir/userId/orgId/projectId/projectDir`：

```ts
type ProjectEnvironment = {
  projectDir: string
  movScriptHomeDir?: string
  manifest: ProjectManifest
  storage?: {
    scope: StorageScope
    namespace: string
    mode: 'local' | 'remote' | 'hybrid'
  }
}
```

Engine 创建应只接受 projectDir 和可选 decision store：

```ts
createNodeMovScriptEngine({
  projectDir,
  decisionStore,
})
```

`resolveMovScriptProjectCwd` 保留但标记 legacy，不能再作为新代码默认入口。

### 本地 decision store

为了保证无登录时也能完整工作，需要实现文件型 decision store：

```ts
createMovScriptFileDecisionStore({
  projectDir,
})
```

建议落盘路径：

```text
<projectDir>/.movscript/decisions/content_units/<contentUnitId>.json
```

说明：

- `.movscript/` 是运行态/本地元数据，不是创作源文件。
- 是否纳入 git 由项目策略决定，默认可忽略。
- 如果希望候选选择成为可协作源文件，可以另行设计 `decisions/**` 源目录，但不能和 `.interpret/**` 混淆。

### Project manifest helper

新增：

```ts
readMovScriptProjectManifest(projectDir)
ensureMovScriptProject(projectDir, options)
resolveMovScriptProjectEnvironment(input)
```

`ensureMovScriptProject` 类似 `git init`：

- 如果目录不存在，可创建。
- 如果没有 `workspace.json`，写入 v2 manifest。
- 如果已有 v1 manifest，补 `project_uid`。
- 不访问后端。

## MCP 改造方案

### 工具命名

替换当前过渡命名：

```text
movscript_project_init
movscript_project_open
movscript_project_status
```

废弃或隐藏：

```text
movscript_project_create
movscript_project_fetch
system_project_create
system_project_fetch
```

原因：

- `create` 暗示后端实体创建。
- `fetch` 暗示远端拉取。
- `init/open/status` 更符合 cwd 工作流。

### locator 规则

所有 project-scoped MCP domain 工具都应接受：

```json
{
  "cwd": "/path/to/project"
}
```

并把 `cwd` 视为 `projectDir`。如果没有传 `cwd/projectDir`，MCP server 可以使用进程 cwd 或 provider session cwd，但必须在响应里明确返回 resolved projectDir。

`projectId` 不再是 project-scoped domain 工具的一等参数。只有 legacy 工具或 backend generation adapter 可以临时接受。

### storage scope 参数

需要远端存储的工具应接受独立 storage 参数：

```json
{
  "cwd": "/path/to/project",
  "storage": {
    "scope": { "kind": "org", "id": "9" },
    "mode": "remote"
  }
}
```

如果不传 storage：

- 默认使用本地 file decision store。
- 如果 manifest 有 sync 默认 scope，可以使用 manifest。
- 如果登录态存在但 manifest 无配置，不应自动绑定，除非用户确认。

## CLI 改造方案

### 默认 cwd

所有 `movcli workspace` 和 `movcli lang` 命令默认使用当前目录：

```text
movcli init
movcli inspect
movcli interpret
movcli query entities
```

等价于：

```text
movcli --cwd .
```

### 环境变量

建议保留：

- `MOVSCRIPT_PROJECT_DIR`: 显式项目目录。
- `MOVSCRIPT_HOME`: MovScript Home。

废弃或降级：

- `MOVSCRIPT_WORKSPACE_DIR`: 仅作为 legacy alias。
- `MOVSCRIPT_PROJECT_ID`: 仅 legacy backend decision adapter 使用。

新增：

- `MOVSCRIPT_STORAGE_SCOPE_KIND`
- `MOVSCRIPT_STORAGE_SCOPE_ID`
- `MOVSCRIPT_STORAGE_NAMESPACE`

## 桌面端改造方案

### Project 类型重塑

前端 `Project` 不应再等同后端项目表。

建议新增：

```ts
type ProjectRef = {
  uid: string
  title: string
  projectDir: string
  description?: string
  updatedAt?: string
  sync?: {
    scope: StorageScope
    namespace: string
  }
}
```

`Project.ID` 只保留在 legacy adapter：

```ts
type LegacyBackendProjectRef = ProjectRef & {
  legacyBackendProjectId: number
}
```

### 项目列表

项目页不应只拉 `/projects`。应展示：

1. 最近打开项目：来自 MovScript Home desktop state。
2. 当前目录项目：如果 App 是从一个 projectDir 打开的。
3. 可选远端索引：从 scoped project data 中的 `movscript/project-index` 查询。
4. legacy 后端项目：作为迁移分组显示，可一键 materialize/open。

最近项目索引存储在 MovScript Home：

```text
<MovScript Home>/desktop-state/recent-projects.json
```

结构：

```json
{
  "items": [
    {
      "uid": "01J...",
      "title": "Demo Film",
      "projectDir": "/Users/me/demo-film",
      "lastOpenedAt": "2026-06-21T00:00:00.000Z",
      "sync": {
        "scope": { "kind": "org", "id": "9" },
        "namespace": "movscript/projects/01J..."
      }
    }
  ]
}
```

### 项目窗口

窗口 API 应统一为：

```ts
openProjectWindow({
  projectDir,
  route,
})
```

窗口 context：

```ts
type ElectronAppWindowContext = {
  kind: 'project'
  projectDir: string
  project?: ProjectRef
}
```

`projectId` 从 project window context 中移除。legacy 打开后端项目时，需要先 resolve/materialize 成 `projectDir`。

### Query key 和事件 scope

React Query key、app event scope、Agent session scope 不再用 number projectId，而用 project uid 或 projectDir fingerprint：

```ts
projectKeys.detail(projectUid)
projectAppEventScope({ projectUid })
```

当 manifest 尚未读取时，可临时使用 normalized projectDir hash，但一旦读到 manifest，必须迁移到 uid。

## Agent / Codex 改造方案

### 会话工作目录

Agent conversation workspace 应保存：

```ts
type AgentConversationWorkspace = {
  projectDir?: string
  projectUid?: string
  storage?: {
    scope: StorageScope
    namespace: string
  }
}
```

不要再从 provider session cwd 中正则解析 `project_(\d+)`。

### 工具调用

Codex/MCP 调用 domain 工具时，只传 cwd：

```json
{
  "cwd": "/Users/me/demo-film"
}
```

需要远端候选/选择时，再传 storage scope：

```json
{
  "cwd": "/Users/me/demo-film",
  "storage": {
    "scope": { "kind": "user", "id": "123" }
  }
}
```

### 生成结果采纳

当前 `GeneratedResultCard` 等组件使用 `projectId` 调用 workspace decision。目标应改成：

```ts
handleGeneratedContentUnitDecision({
  projectDir,
  projectUid,
  storage,
  request,
})
```

没有 storage 时写本地 file decision store；有 storage 时写 scoped project data decision store。

## 迁移计划

### Phase 0: 承认当前过渡态并冻结旧模型扩张

- 不再新增依赖 `/projects/:id` 的新功能。
- 新 MCP/CLI/domain 工具默认用 `cwd/projectDir`。
- `projectId` 仅作为 legacy adapter 参数。

### Phase 1: Project manifest v2

- 在 workspace package 新增 manifest helper。
- `movscript init` 写入 `workspace.json` v2，包括 `project_uid`。
- 旧 `workspace.json` 自动补 uid。
- 增加测试：任意临时目录 init 后无需登录即可 inspect/interpret。

### Phase 2: 本地 decision store

- 实现 `createMovScriptFileDecisionStore({ projectDir })`。
- Engine 默认在无 storage 时使用本地 decision store。
- `content unit candidate` 相关 domain 操作在无后端时也可完整读写。

### Phase 3: Scoped project data backend

- 新增 `scoped_storage_objects` 表。
- 新增 scoped project data API。
- 实现 `createMovScriptScopedStorageDecisionStore`。
- 后端权限从 project membership 改为 user/org scope。

### Phase 4: 前端 ProjectRef

- 引入 `ProjectRef`，替换 `Project.ID` 在项目窗口、store、query key、事件 scope 中的核心地位。
- 项目列表改为 recent projects first。
- `/projects` 列表变为 legacy/import section。

### Phase 5: MCP/CLI 接口清理

- `movscript_project_fetch` 改名 `movscript_project_open`。
- `system_project_create` 从默认工具发现中隐藏或标记 legacy。
- MCP project-scoped domain 工具移除 `projectId` 的主路径描述。
- generation 工具拆成：
  - local prompt/build/candidate write
  - remote generation job submit with storage scope

### Phase 6: Legacy 后端 Project 迁移

对旧后端项目提供迁移命令：

```text
movcli project migrate-backend --project-id 42 --target-dir ./my-film
```

流程：

1. 读取 `/projects/42` metadata。
2. clone 或导出旧 workspace。
3. 写入 `workspace.json` v2。
4. 把旧 decisions 复制到 scoped project data 或本地 `.movscript/decisions`。
5. 写入 recent projects。
6. 保留 legacy id 映射：

```json
{
  "legacy": {
    "backend_project_id": 42
  }
}
```

## 兼容策略

### 保留 legacy adapter

短期保留：

- `/projects`
- `/projects/:id/decisions`
- `createMovScriptBackendDecisionStore({ projectId })`
- `resolveMovScriptProjectCwd({ userId, orgId, projectId })`

但新增代码不得直接使用它们。应通过 `ProjectEnvironment` 或 `StorageDecisionStore` adapter。

### 兼容响应

过渡期 API 可以返回 legacy 字段：

```ts
{
  projectDir,
  projectUid,
  legacyBackendProjectId?: number
}
```

但 UI 和 MCP 不应把 `legacyBackendProjectId` 当主键。

## 测试与验收

### Core / Workspace

- `createNodeMovScriptEngine({ projectDir })` 在任意临时目录可 init/inspect/interpret。
- 未登录、无 `projectId` 时 content-unit decision 可写入本地 decision store。
- `resolveMovScriptProjectCwd` 的新使用点被禁止或 lint 检查。

### MCP

- `movscript_project_init({ cwd })` 在任意目录写入 manifest。
- `domain_overview({ cwd })` 不需要 user/org/projectId。
- `domain_create_content_candidate({ cwd })` 无 storage 时写本地 store。
- 有 storage 时写 scoped project data。
- 工具 schema 不再要求 `projectId`。

### Backend

- scoped project data user scope 只能本人访问。
- org scope 只允许 org member 访问。
- scoped project data optimistic concurrency 正常。
- decision store 可通过 scoped project data 完成 get/query/upsert/select。
- 不创建 Project row 也能存储决策。

### Desktop

- 新建项目默认选择目录并执行 init。
- 打开任意已有目录，若无 manifest，可提示 init。
- 最近项目列表来自 MovScript Home，不依赖 `/projects`。
- 项目窗口刷新后仍从 `projectDir` 恢复。
- Agent 会话、candidate selection、workspace mutation 不使用负数 synthetic ID。

### CLI / Codex

- 在任意目录执行 `movcli init && movcli inspect && movcli interpret` 成功。
- Codex MCP 只传 cwd 即可完整读取和编辑项目。
- 无登录环境下不访问后端 project API。

## 风险与取舍

### namespace 冲突

如果两个本地目录复制自同一个项目，它们会共享 `project_uid`。这是类似 Git clone 的行为。需要在 UI 提供“fork identity”操作：

```text
movcli project fork-identity
```

它生成新的 `project_uid` 和 namespace。

### 本地/远端决策冲突

同一 content unit 在本地和远端都改过 selection 时，需要 merge policy：

- `local-wins`
- `remote-wins`
- `manual`

初期可以采用 explicit sync，不自动双向合并。

### 资源 ID 仍是后端数字

`RawResource ID` 当前仍是后端资源主键。完全本地化需要另一个资源身份方案，例如 `resource_uid` 或 `artifact_ref`。本次 Project 解耦可以先把资源作为 scoped project data/generation 的后续阶段，但文档上要避免把 `resource_id` 设计成后端 Project 表依赖。

### 管理后台 Project 页面

admin 的 Project 管理页面未来应转为 legacy/backend workspace 管理或 scoped project data namespace 管理。不要再把它作为新 Project 生命周期入口。

## 推荐的最终接口

### MCP

```text
movscript_project_init({ cwd?, title? })
movscript_project_open({ cwd? })
movscript_project_status({ cwd? })
domain_overview({ cwd })
domain_interpret({ cwd })
domain_create_content_candidate({ cwd, storage?, payload })
```

### Electron

```ts
initMovScriptProject({ projectDir, title })
openMovScriptProject({ projectDir })
openProjectWindow({ projectDir, route })
```

### Core

```ts
const env = await resolveMovScriptProjectEnvironment({ projectDir })
const engine = createNodeMovScriptEngine({
  projectDir: env.projectDir,
  decisionStore: createDecisionStoreForEnvironment(env),
})
```

### Backend

```text
PUT  /api/v1/storage/objects
POST /api/v1/storage/query
POST /api/v1/generation/content-unit-candidates
```

## 结论

正确的方向不是把旧系统扩展成“backend project + local project”双模型，而是把 Project 从后端实体中拿出来，恢复成一个目录工作区。

后端应成为 user/org scope 下的结构化候选数据与计算服务。Project 是否存在、在哪里、如何初始化，应该由本地文件系统和 `workspace.json` manifest 决定；后端只按 manifest `project_uid` 识别候选数据归属。

这样 MovScript 才能同时满足：

- 桌面端任意目录打开。
- CLI/Codex cwd 复用。
- 无登录本地创作。
- 登录后可选同步。
- 后端不需要感知 Project 生命周期。
- 未来协作和云同步通过 storage scope/namespace 演进，而不是绑死在后端 Project 表。
