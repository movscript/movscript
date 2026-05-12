# Agent Capability Layering — 目标架构

> **状态**:目标状态规范(非过渡方案)。本文档描述重构完成后的最终形态,不考虑向后兼容。所有现有 `manifest` / `skill` / `bundle` 字段中与本文档冲突的部分应被替换。
>
> **读者**:负责执行重构的工程师、写第三方 plugin / pack 的扩展开发者、做 agent 编排前端/后端集成的人。
>
> **配套文档**:本文是契约总纲。`agent-orchestration-design.md`(编排数据模型)、`script-production-graph-architecture.md`(实体层)、`plugins.md`(插件运行时)与本文交叉引用,但**本文是 agent 层抽象的单源契约**——其他文档若与此冲突,以此为准。

## 0. 为什么要重构

当前的 `skill + manifest + tool + schema + bundle + mode` 之间边界混乱,主要表现:

| 现状问题 | 实质 |
|---|---|
| `catalog/skills/modes.json` 在 `instruction` 里手写了 draft JSON 骨架 | Schema 不再是单源 |
| Skill 指令复述 tool 的 action 列表和参数 | Tool 描述被复制 |
| `bundle` 既是"打包发布"也是"启用选择"机制 | 一个抽象兼两职 |
| `mode` 既映射 skill,又内嵌 tool grant 和 soul,又是 UI 选项 | 一个抽象兼三职 |
| Skill 池里混了 mode、workflow、policy、persona 四种东西 | 类型未拆 |
| `DEFAULT_AGENT_MANIFEST` 内联了一份 skill body,绕过 catalog | 来源不唯一 |
| MCP plugin 注入的 tool 与本地 tool 走同一注册表,但权限模型不一致 | 边界模糊 |
| `appliesWhen` 是单字符串关键词,前端无法用 UI context 触发 workflow | 触发机制不结构化 |

最终形态要求每一层只回答**一个**问题:

> **Schema** 内容长什么样?
> **Tool** 能做什么动作?
> **Skill** 在做这件事时应该怎么思考和表达?
> **Capability Pack** 哪些 skill/tool 该一起发布?
> **Agent Profile** 这个 agent 实例绑定了哪些能力?

---

## 1. 五层架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 5: Agent Profile                                               │
│   一个 agent 实例的运行时绑定:persona + enabled workflows/policies/ │
│   tools + permissions + model. 由 UI mode 或 用户配置 选出。         │
└──────────────────────────────────────────────────────────────────────┘
                              ▲ binds
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 4: Capability Pack                                             │
│   纯发布单元。把若干 skill + tool + schema 打包成一个可分发的能力包。│
│   pack 不出现在 prompt 里,只在 install / uninstall 时被解释。       │
└──────────────────────────────────────────────────────────────────────┘
                              ▲ contains
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 3: Skill   (拆四类,互不混用)                                  │
│  ── Persona   全局人设和底层准则。每个 profile 至多 1 个。            │
│  ── Workflow  长流程 runbook。受 trigger 激活。                       │
│  ── Policy    横切约束(审批、安全、写入边界)。永远叠加。            │
│  ── (Mode 不再是 skill 类型;它是 Profile preset 的别名 — 见 §6)      │
└──────────────────────────────────────────────────────────────────────┘
              ▲ references via $ref            ▲ references via $ref
┌──────────────────────────────┐    ┌───────────────────────────────────┐
│ Layer 2: Tool                │    │ Layer 1: Schema                   │
│  LLM-callable function:      │    │  Draft 内容形状的单源契约。       │
│  name, description (signature│    │  id, json-schema, prompt summary, │
│  only), input schema,        │    │  examples. 不写"怎么用",只写    │
│  permission, risk, approval. │    │  "长什么样"。                     │
│  不写"何时用"。              │    │                                   │
└──────────────────────────────┘    └───────────────────────────────────┘
```

**单向依赖**:上层引用下层,下层不知道上层存在。Skill 引用 Tool 和 Schema,Profile 引用 Skill 和 Tool。Schema 和 Tool 互不引用。

### 1.5 每层职责 / 反职责速查表

写一个新 skill / tool / pack 之前对照此表,任一"反职责"列命中即代表设计走偏。

| 层 | 回答的问题 | **必须**包含 | **绝对不能**包含 |
|---|---|---|---|
| Schema | 内容长什么样 | JSON Schema、prompt summary、examples、scope | 何时使用、用哪个 tool、调用顺序 |
| Tool | 能做什么动作 | 函数签名、inputSchema、permission、risk、approval defaults | 业务流程、JSON 骨架、"当用户想 X 时" |
| Persona | 这个 agent 是谁 | 身份、底色、沟通风格、不变约束 | 具体 workflow 步骤、tool 参数细节 |
| Workflow | 怎么走一个流程 | 触发条件、步骤、占位符引用、输出契约 | 内联 schema、复述 tool API、人设描述 |
| Policy | 什么红线/横切规则 | 规则文本、作用域(scope)、优先级 | 流程步骤、tool 列表(应放 workflow) |
| Pack | 哪些资源同发布 | id 列表 + version 约束 | 何时启用、启用顺序 |
| Profile | 现在启用了什么 | persona 引用、workflow/policy 列表、tool 授权、model 绑定 | skill body、schema 内容、tool description |

---

## 2. Layer 1 — Schema(内容形状的唯一真理源)

### 2.1 职责
- 定义 draft 内容 payload 的 JSON 形状
- 提供给 LLM 看的简洁形状摘要(不是完整 JSON Schema 文档)
- 提供示例
- 提供向后端 apply 时所需的校验函数

### 2.2 不负责
- 不写"什么时候应该创建这个 draft"
- 不写"应该用哪个 tool 创建"
- 不出现在 prompt 里,除非被 skill `$ref` 引用

### 2.3 包位置
`packages/draft-schemas/`

### 2.4 形状

```ts
// packages/draft-schemas/src/types.ts
export interface DraftSchemaDefinition {
  id: string                       // 'movscript.project_proposal.v1'
  kind: DraftKind                  // 'project_proposal'
  category: DraftSchemaCategory    // 'project' | 'production' | 'content_unit' | ...
  title: string                    // 'Project Proposal'
  jsonSchema: JSONSchema7          // 完整 JSON Schema,用于 validate / preview_apply
  promptSummary: string            // 给 LLM 看的形状摘要(≤ 30 行)
  examples: ReadonlyArray<{ name: string; content: unknown }>
  scope: DraftScope                // 'project' | 'production' | 'content_unit' | 'asset'
  version: string                  // '1.0.0'
  status: 'active' | 'deprecated'  // 见 §2.8
  supersededBy?: string            // 若 deprecated,指向新 id
}
```

### 2.5 单文件结构

```
packages/draft-schemas/src/
├── index.ts                  // 仅 re-export
├── types.ts                  // DraftSchemaDefinition 等通用类型
├── registry.ts               // DRAFT_SCHEMA_REGISTRY: Record<DraftSchemaKey, DraftSchemaDefinition>
├── project-proposal/
│   ├── index.ts              // 导出 DraftSchemaDefinition
│   ├── schema.json           // JSON Schema 文档
│   ├── prompt-summary.md     // 给 LLM 的形状摘要
│   └── examples/
│       └── basic.json
├── production-proposal/
├── content-unit-proposal/
├── content-unit-media-proposal/
├── asset-proposal/
└── script-split-proposal/
```

### 2.6 prompt-summary 写法

`prompt-summary.md` 是 LLM 唯一会看到的 schema 内容。它必须:

- ≤ 30 行
- 用伪 TS 类型或简化 JSON 表达形状
- 标注所有必填字段、enum、相互依赖
- 不复述 JSON Schema 文档的全部细节

例:

```md
# movscript.project_proposal.v1

Content shape:

  {
    "proposal": {
      "creative_references": Array<{
        action: "create" | "update" | "reuse",
        id?: number,                     // 必填当 action=update|reuse
        client_id?: string,              // 必填当 action=create
        merge_candidates?: Array<{ id?: number; fields: {...} }>,
        fields: { name: string; description?: string; tags?: string[] }
      }>,
      "asset_slots": Array<{
        action: "create" | "update" | "reuse",
        owner: { type: "creative_reference"; id?: number; client_id?: string },
        fields: { name: string; kind: "image" | "video" | "audio" | "text" }
      }>
    },
    "impact_notes"?: string,
    "summary"?: string
  }

Rules:
- reuse/update 必须带已有 id;create 必须带 client_id
- 每个 asset_slot 必须 own 一个 creative_reference
- 风格词(cinematic 等)需配具体特征,否则进 impact_notes
```

### 2.7 关键不变量
- **任何 skill 指令中出现 JSON 骨架都是缺陷**。skill 只能写 `$ref: schema://movscript.project_proposal.v1`,runtime 将其替换为 `prompt-summary.md` 的内容。
- Schema 包永远不 import agent 代码。
- `examples[].content` 必须能通过 `jsonSchema` 校验(单测保证)。

### 2.8 Schema 版本与废弃

#### 2.8.1 版本号语义

`id` 中的 `.vN`(`v1`/`v2`)是**主版本号**,只在 breaking change 时递增。同主版本内的非破坏性补丁通过 `version` 字段(semver)区分,但 `id` 保持不变。

- **破坏性变更**(必须 bump `vN`):删字段、改字段类型、改 enum 已有值、调整必填关系
- **非破坏性变更**(只 bump `version`):加可选字段、加 enum 新值、放宽校验、改 `promptSummary` 措辞

#### 2.8.2 多版本共存

同一个 `kind`(如 `project_proposal`)可以有多个 active schema(`.v1` 和 `.v2`),用不同的 `id` 共存。registry 按 `id` 索引,不按 `kind`。Skill 必须显式选择版本:

```json
"schemaRefs": ["schema://movscript.project_proposal.v2"]
```

**禁止**写 `"schema://movscript.project_proposal.latest"` 这种隐式版本。

#### 2.8.3 Deprecation 流程

```
active → deprecated → removed
```

- **deprecated**:schema 仍可被 runtime 解析,但 linter 报 warning;`supersededBy` 必须指向继任 id
- **removed**:registry 删除;任何引用都让 linter / runtime 报 error

Deprecate 一个 schema 时:
1. 在 `index.ts` 设 `status: 'deprecated'` + `supersededBy: 'movscript.project_proposal.v2'`
2. linter 扫描所有 skill 的 `schemaRefs`,对仍引用旧 id 的 workflow 列出迁移清单
3. 至少保留**一个完整 release**作为过渡(给 plugin 作者时间),再走 removed

#### 2.8.4 Draft kind 与 schema id 的关系

一个 `DraftKind`(如 `'project_proposal'`)是**业务概念**,可以同时挂多个 schema id 表达版本演进。`DRAFT_SCHEMA_REGISTRY` 仍按 id 索引,另导出辅助查询:

```ts
export function listSchemasByKind(kind: DraftKind): DraftSchemaDefinition[]
export function getActiveSchemaForKind(kind: DraftKind): DraftSchemaDefinition  // 取 status=active 中 version 最大者
```

后端 / 前端凭 `draft.schemaId`(全限定带版本)精确匹配,不靠 `draft.kind`。

---

## 3. Layer 2 — Tool(动作 + 权限)

### 3.1 职责
- 定义一个 LLM 可调用的函数
- 提供函数签名级别的英文 description("这个函数做什么")
- 声明权限、风险、审批策略默认值
- 提供 inputSchema 供 LLM 生成参数

### 3.2 不负责
- 不写"什么场景应该调用我"(→ skill 的工作)
- 不组合多步流程(→ workflow skill 的工作)
- 不直接关心 schema 的形状(→ 通过 tool 的 inputSchema 间接表达,但 inputSchema 不复述 draft 内容 schema)

### 3.3 目录

```
apps/agent/catalog/tools/
├── platform/                  // 全局基础设施工具
│   ├── context.tool.json
│   ├── project.tool.json
│   ├── memory.tool.json
│   └── catalog.tool.json
├── drafts/
│   ├── create.tool.json
│   ├── read.tool.json
│   ├── update.tool.json
│   └── list.tool.json
├── visual-generation/
│   ├── create-job.tool.json
│   └── get-job.tool.json
└── input/
    └── request-user-input.tool.json
```

一个文件一个 tool。文件名 = `<short-name>.tool.json`。

### 3.4 ToolDefinition 形状

```ts
export interface ToolDefinition {
  name: string                   // 'movscript_update_draft'
  description: string            // 函数签名级描述,英文,1-3 句
  inputSchema: JSONSchema7       // 必填,见 §3.7
  permission: Permission         // 'draft.write' | 'project.read' | ...
  risk: ToolRiskLevel            // 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'
  projectScoped: boolean
  defaults: {
    grant: 'allow' | 'deny'      // 默认是否授权(profile 可覆盖)
    approval: 'never' | 'always' | 'on_write'
  }
  source: ToolSource             // 'runtime' | 'plugin' | 'mcp' — 见 §3.8
  capability?: string            // 一句话功能摘要(供 skill 渲染 tool reference 时使用)
  pluginId?: string              // source ∈ {'plugin','mcp'} 时必填,指向贡献此 tool 的 plugin
  errorCodes?: ToolErrorCode[]   // 此 tool 可能返回的稳定错误码集合,供 skill / UI 处理
}

export type ToolSource = 'runtime' | 'plugin' | 'mcp'
```

### 3.5 description 写法

- 函数式:开头 "Create / Read / Update / List ..."
- 列出输入域和返回值类别
- **不**写 "Use when X" / "Don't use when Y"
- 工具的"何时用"由 skill 描述

例(正确):

```
Edit, validate, or dry-run one local draft. Actions:
- patch_content: JSON Pointer add/replace/remove
- replace_text: old/new string pair
- validate: local schema only
- preview_apply: dry-run that surfaces validation + backend apply errors
Returns the updated draft, validation result, and (for preview_apply) the backend dry-run report.
```

例(错误,含 skill 的内容):

```
Edit, validate, or dry-run one local draft. The recommended self-healing loop:
edit -> preview_apply -> inspect validation/backendError -> patch and re-preview
until ok=true.  [这一行应该写在 workflow skill 里,不是 tool description]
```

### 3.6 capability 字段

`capability` 字段是写给 skill 模板用的极短摘要(≤ 60 字)。当 skill 通过 `$ref: tool://movscript_update_draft` 引用一个 tool 时,runtime 在 skill instruction 里插入这个 capability,不是完整 description。

例:
- `movscript_update_draft.capability = "对一个本地 draft 做局部编辑/校验/dry-run apply"`
- `movscript_create_generation_job.capability = "提交一个图像或视频生成任务(异步)"`

### 3.7 inputSchema 约定

#### 3.7.1 必填

`inputSchema` **必填**,不允许省略。它是 LLM 生成参数的契约,也是 toolPolicy / approval UI 的展示来源。

#### 3.7.2 多 action 的 tool

如果一个 tool 承载多个动作(`movscript_update_draft` 有 `patch_content` / `replace_text` / `validate` / `preview_apply`),用 `oneOf` + discriminator:

```json
{
  "type": "object",
  "required": ["action", "draftId"],
  "properties": {
    "draftId": { "type": "string" }
  },
  "oneOf": [
    {
      "properties": {
        "action": { "const": "patch_content" },
        "ops": { "type": "array", "items": { "$ref": "#/$defs/jsonPatchOp" } }
      },
      "required": ["action", "ops"]
    },
    {
      "properties": {
        "action": { "const": "preview_apply" }
      },
      "required": ["action"]
    }
  ]
}
```

`{{tool:<name>.actions}}` 占位符会读取这个 `oneOf` 的 `action.const` 值,渲染为 enum 列表。

#### 3.7.3 错误返回约定

Tool 执行成功返回业务 payload;失败返回:

```ts
{ ok: false, code: ToolErrorCode, message: string, retryable: boolean, details?: unknown }
```

`code` 必须在 `ToolDefinition.errorCodes` 中预先声明。Skill 可以在 instruction 里通过 `{{tool:<name>.errors}}` 占位符引用这组错误码,以指导 LLM 处理失败。

#### 3.7.4 projectId 注入

`projectScoped: true` 的 tool,其 `inputSchema` **不应**包含 `projectId` 字段。Runtime 在 `applyToolPolicy` 阶段自动注入当前 `AgentRun.projectId`,LLM 无需也无权传入。

### 3.8 Plugin / MCP 提供的 Tool

#### 3.8.1 source 字段语义

| source | 实现来源 | 注册路径 | 权限模型 |
|---|---|---|---|
| `runtime` | agent server 本地代码 | `catalog/tools/*.tool.json` + `src/tools/<name>.ts` 处理函数 | 内置 permission 集 |
| `plugin` | 第三方 JS 插件(见 §14) | plugin pack 内 `tools/*.tool.json` + plugin bundle 提供 handler | plugin manifest 声明的 permission,需 profile 授权 |
| `mcp` | MCP server(stdio / http) | 由 MCP server `tools/list` 返回的 schema 动态注册 | MCP server 自带的 schema 翻译为内部 permission 后,需 profile 授权 |

#### 3.8.2 plugin 贡献的 Tool

Plugin pack 提交一个或多个 `.tool.json`,**必须**:

- 声明 `source: 'plugin'` 和 `pluginId`
- `permission` 取值需在平台的 plugin 允许集内(plugin 不能授予自己 `system.*` 权限)
- `risk` 不允许是 `destructive`(plugin 不能直接做不可逆操作;不可逆操作走 runtime tool + approval)

#### 3.8.3 MCP 贡献的 Tool

MCP server 描述的 tool 由 agent 启动时的 MCP adapter 翻译为 `ToolDefinition`:

- `name` 强制 prefix 为 `mcp__<server_id>__`,避免名字撞车
- `inputSchema` 来自 MCP `tools/list`
- `description` 取自 MCP 但 linter 仍执行"反污染检查"(§11)
- `permission` 默认为 `mcp.<server_id>.<tool_name>`,profile 必须显式授权才能使用
- `defaults.approval` 默认 `'always'`(MCP 工具一律先走人工审批),plugin 作者可在 MCP server 的 movscript-specific metadata 中下调,但 risk ≥ `write` 时不允许低于 `'on_write'`

#### 3.8.4 Tool 不可用的状态

Runtime 维护每个 tool 的 `availability`:

```ts
type ToolAvailability =
  | { state: 'active' }
  | { state: 'inactive'; reason: 'pack_not_installed' | 'pack_disabled' }
  | { state: 'unavailable'; reason: 'plugin_load_failed' | 'mcp_server_down'; lastError?: string }
  | { state: 'deprecated'; supersededBy?: string }
```

LLM 看到的工具列表只包含 `state: 'active'`;其他状态的 tool 即使 profile 授权也不出现。`movscript_list_tools` runtime tool 可读到全部状态(给开发者诊断用)。

---

## 4. Layer 3 — Skill(拆四类)

### 4.1 类型枚举

```ts
export type SkillKind = 'persona' | 'workflow' | 'policy'
// Note: 'mode' 不再是 skill 类型。它是 Profile preset 的别名,见 §6。
```

每个 skill 文件**必须**在元数据里声明 `kind`。运行时按 kind 走不同的注入逻辑。

### 4.2 注入语义对比

| Skill kind | 何时出现在 prompt | 上限 | 优先级 |
|---|---|---|---|
| `persona` | Profile 启用即出现,覆盖整轮会话 | 每个 profile **至多 1 个** | 最高 |
| `workflow` | Profile 启用 + `triggers` 命中当前用户输入 | 单轮通常 0-2 个(见 §4.5.2 上限) | 低于 persona |
| `policy` | Profile 启用即出现,永远叠加 | 不限 | 中等(高于 workflow,低于 persona) |

最终 prompt 拼接顺序:
```
[persona] → [policies, 按 priority 降序] → [matched workflows, 按 priority 降序] → [user message]
```

### 4.3 目录

```
apps/agent/catalog/skills/
├── persona/
│   ├── movscript-default.persona.json
│   └── visual-director.persona.json
├── workflow/
│   ├── project-proposal.workflow.json
│   ├── production-proposal.workflow.json
│   ├── dual-orchestration.workflow.json
│   ├── script-split.workflow.json
│   ├── content-unit-proposal.workflow.json
│   ├── content-unit-media-proposal.workflow.json
│   ├── asset-proposal.workflow.json
│   ├── asset-candidate-generation.workflow.json
│   ├── visual-generation.workflow.json
│   ├── creative-workbench.workflow.json
│   ├── setting-prep.workflow.json
│   ├── project-progress.workflow.json
│   ├── script-writing.workflow.json
│   └── storyboard-gap-review.workflow.json
└── policy/
    ├── approval-boundaries.policy.json
    ├── safe-drafts.policy.json
    └── platform-concepts.policy.json
```

### 4.4 SkillDefinition 通用形状

```ts
interface SkillDefinitionBase {
  id: string                     // 'movscript.workflow.project-proposal'
  kind: SkillKind                // 'persona' | 'workflow' | 'policy'
  version: string                // '1.0.0'
  name: string                   // 'Project Proposal'
  description: string            // 一句话给开发者看
  priority: number               // 数字越大越靠前;persona 默认 1000
  enabled: boolean

  /** prompt 模板,可插入 $ref 占位符 */
  instructionTemplate: string

  /** 这个 skill 推荐使用的工具,会被 runtime 渲染进 instruction */
  toolRefs?: string[]            // ['tool://movscript_update_draft', ...]

  /** 这个 skill 涉及的 draft schema,会被 runtime 渲染进 instruction */
  schemaRefs?: string[]          // ['schema://movscript.project_proposal.v1']

  /** 输出约束 */
  outputContract?: string

  metadata?: Record<string, unknown>
}
```

#### persona 扩展
```ts
interface PersonaSkill extends SkillDefinitionBase {
  kind: 'persona'
  // persona 一般无 triggers/toolRefs/schemaRefs
}
```

#### workflow 扩展
```ts
interface WorkflowSkill extends SkillDefinitionBase {
  kind: 'workflow'
  triggers: SkillTrigger[]        // 必填,见 §4.5
  toolRefs: string[]              // 必填,workflow 必须显式声明用什么 tool
  schemaRefs?: string[]
  /** 工具收窄:在此 workflow 激活时,LLM 只看到 toolRefs 列出的 tool。见 §6.8 */
  toolScope?: 'union' | 'intersect'  // 默认 'intersect'
}
```

#### policy 扩展
```ts
interface PolicySkill extends SkillDefinitionBase {
  kind: 'policy'
  // policy 通常无 triggers(永远叠加)
  scope?: PolicyScope             // 见 §4.7.1
}

export type PolicyScope =
  | 'global'                                              // 默认,profile 启用即生效
  | { mode?: string[]; workflow?: string[]; risk?: ToolRiskLevel[] }
```

#### 4.4.5 Persona 取代旧 mode soul

旧 `modeRegistry.MODE_CONFIGS[*].soul` 字符串(以及 `DEFAULT_AGENT_MANIFEST.soul`)在目标态全部迁移成 `PersonaSkill.instructionTemplate`,并被 profile 引用。

| 旧字段 | 新位置 |
|---|---|
| `MODE_CONFIGS['plan'].soul` | `catalog/skills/persona/plan-orchestrator.persona.json` 的 `instructionTemplate` |
| `DEFAULT_AGENT_MANIFEST.soul` | `catalog/skills/persona/movscript-default.persona.json` 的 `instructionTemplate` |

Persona instruction 的范围限定为:
- "你是谁"(身份)
- "你怎么说话"(沟通基调)
- "无论做什么都不能违反的底线"(只放绝对不变的部分;有条件的规则放 policy)

**Persona 不写流程步骤,不引用 tool / schema**(`toolRefs` / `schemaRefs` 即使有也会被 linter 警告)。如果一段文字要描述"在 X 情况下应该 Y",它属于 policy 而非 persona。

`profile.persona = null` 合法,表示纯任务驱动的 agent,无人格层;此时 prompt 直接以 policies 开头。

### 4.5 Trigger 模型(取代 `appliesWhen`)

不再用单个字符串关键词做模糊匹配。用结构化 trigger 数组:

```ts
type SkillTrigger =
  | { kind: 'keyword'; any: string[] }              // 包含任一关键词
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'intent'; id: string }                  // 由前端/编排层显式发送 intent
  | { kind: 'context'; selector: ContextSelector }  // 当前 UI 上下文匹配
  | { kind: 'always' }                              // 总是触发(workflow 极少用)
```

#### 4.5.1 ContextSelector 规范

`ContextSelector` 描述对 `RuntimeContext.uiContext` 的匹配条件。所有字段是 AND;同字段内多个值是 OR。

```ts
export interface ContextSelector {
  mode?: string[]                       // 当前 profile 的 modeAlias
  route?: string[]                      // 前端路由 pattern,如 'productions/:id/orchestrate'
  selectedKind?: DraftKind[]            // 用户当前选中的实体类型
  selectedScope?: DraftScope[]
  draftStatus?: ('proposed'|'confirmed'|'superseded')[]
  hasProductionId?: boolean
  hasProjectId?: boolean
  custom?: Record<string, string | string[] | boolean>  // 自由扩展,由前端约定
}

export interface RuntimeContext {
  profile: AgentProfile
  message: string                       // 当前用户消息
  intents: string[]                     // 前端显式发送的 intent ID 列表
  uiContext: {
    mode?: string
    route?: string
    selectedKind?: DraftKind
    selectedScope?: DraftScope
    selectedId?: string | number
    draftStatus?: 'proposed' | 'confirmed' | 'superseded'
    projectId?: number
    productionId?: number
    [k: string]: unknown                 // custom 字段
  }
  conversation: ConversationSnapshot     // 历史轮次摘要(用于 policy 评估)
}
```

前端构造 HTTP 请求时**必须**把 `uiContext` 作为顶层字段传给 agent server;agent server 不臆造 context。

#### 4.5.2 Trigger 评估的边界

- **多 workflow 同时命中**:全部纳入候选,按 `priority` 降序排,**默认上限 2**(可通过 profile metadata `maxActiveWorkflows` 调整,绝对上限 4)。超出上限的丢弃并记录 telemetry。
- **同 priority 冲突**:按 `id` 字典序定序(可重现,不依赖文件加载顺序)。
- **零命中**:不报错。prompt 中只有 persona + policies + user message。
- **trigger 求值是纯函数**:同输入必得同输出,不允许做 IO(读 catalog 例外,但应是只读快照)。
- **trigger 命中由谁产生**:`keyword`/`regex` 由 runtime 求值;`intent` 由前端在 HTTP 请求中显式提供;`context` 由 runtime 比对 `uiContext`。

### 4.6 instructionTemplate 写法

模板里**只能**用纯散文写"如何思考、如何沟通、输出格式"。引用外部资源必须用占位符:

| 占位符 | 替换为 |
|---|---|
| `{{tool:movscript_update_draft}}` | 该 tool 的 `capability` 文本 |
| `{{tool:movscript_update_draft.actions}}` | 该 tool 的 input schema 的 action enum 列表 |
| `{{tool:movscript_update_draft.errors}}` | 该 tool 的 `errorCodes` 列表(供 LLM 处理错误)|
| `{{schema:movscript.project_proposal.v1}}` | 该 schema 的 `prompt-summary.md` 内容 |
| `{{schema:movscript.project_proposal.v1.id}}` | 字面 schema id 字符串 |
| `{{ctx:hasProjectId}}` | 当前 RuntimeContext 中的对应字段(字符串化) |

工具/schema 内容由 runtime 注入,禁止在 skill 里手抄。

完整示例(`workflow/project-proposal.workflow.json`):

```json
{
  "id": "movscript.workflow.project-proposal",
  "kind": "workflow",
  "version": "1.0.0",
  "name": "Project Proposal",
  "description": "Draft project-level setting and asset proposals as a local merge patch.",
  "priority": 900,
  "enabled": true,
  "triggers": [
    { "kind": "intent", "id": "project_proposal" },
    { "kind": "context", "selector": { "mode": ["project-orchestration"] } },
    { "kind": "keyword", "any": ["项目提案", "项目设定", "素材需求", "project proposal"] }
  ],
  "toolRefs": [
    "tool://movscript_get_current_context",
    "tool://movscript_create_draft",
    "tool://movscript_update_draft",
    "tool://movscript_get_draft",
    "tool://movscript_list_drafts",
    "tool://movscript_request_user_input"
  ],
  "toolScope": "intersect",
  "schemaRefs": [
    "schema://movscript.project_proposal.v1"
  ],
  "instructionTemplate": "目标:产出或编辑一个本地 project_proposal draft,作为对项目级 creative_references 和 asset_slots 的局部 merge patch。不写正式项目实体。\n\n## 草稿形状\n使用 schema {{schema:movscript.project_proposal.v1.id}}。Content payload:\n\n{{schema:movscript.project_proposal.v1}}\n\n## 工具能力速查\n- create_draft / update_draft / get_draft: {{tool:movscript_update_draft}} {{tool:movscript_create_draft}}\n- request_user_input: {{tool:movscript_request_user_input}}\n\n## 工作流\n1. 调用 get_current_context → 缺 projectId 时用 request_user_input 询问\n2. list_drafts(kind=project_proposal) 找已有草稿;否则 create_draft\n3. 编辑用 update_draft action=patch_content (JSON Pointer) 或 replace_text\n4. dry-run finalize: update_draft action=preview_apply。ok=false → 读 validation/backendError → 改 → 再 preview\n5. creative_references 是设定层;每个 asset_slot 必须 own 一个 creative_reference\n6. 避免单独的风格词(cinematic 等),需配具体特征,否则进 impact_notes\n",
  "outputContract": "回复包含: draftId, projectId, productionId(若有), 当前 draft status, 最近 preview_apply ok/stage, 设定与素材缺口的简明摘要。"
}
```

注意:
- 不再有 `appliesWhen` 字符串
- 不再在 instruction 中粘贴 schema JSON 骨架
- 不再复述 tool API
- triggers 是结构化的;可同时支持 intent / keyword / context

### 4.7 Skill 之间的关系

#### 4.7.1 Skill 不能引用 Skill

Skill 之间**没有**引用机制:`instructionTemplate` 里不允许写 `{{skill:foo}}` 或 `extends: 'other-skill'`。需要"两个 workflow 共用一段约束"时,把这段约束抽成 **policy**;profile 同时启用 policy 与两个 workflow,prompt 拼接时 policy 自动叠加在两个 workflow 之前。

这条规则带来的成本:有些规则在多个 workflow 重复写一两句。这是有意识的取舍——避免 skill 之间产生隐式拓扑。

#### 4.7.2 Policy 与 Tool defaults 的优先级

Policy 可以收紧 tool 的审批要求,但**不能放宽** tool 自身的 defaults:

| Tool defaults.approval | Policy 要求 | 实际 approval |
|---|---|---|
| `never` | (任何) | 取 policy 要求(`never`/`on_write`/`always` 都可) |
| `on_write` | `never` | **on_write**(policy 放宽被忽略,linter warning) |
| `on_write` | `always` | `always`(policy 收紧生效) |
| `always` | (任何) | `always`(永远不可放宽) |

合并算法:`max(tool.defaults.approval, profile.toolGrants[*].approval, ∑policy.requires.approval)`,其中 `never < on_write < always`。

profile 的 `toolGrants[*].approval` 服从同样规则——profile 可以收紧但不能放宽 tool defaults。

#### 4.7.3 Policy 的 scope

`PolicyScope` 让 policy 限定作用域:

```json
{
  "id": "movscript.policy.write-guard",
  "kind": "policy",
  "scope": { "risk": ["write", "generate", "destructive"] },
  "instructionTemplate": "执行写入或生成动作前必须先 preview_apply 并通过校验。"
}
```

- `scope: 'global'`(默认):profile 启用即生效
- `scope: { mode: ['create','project-orchestration'] }`:仅在这些 mode profile 中生效
- `scope: { workflow: ['movscript.workflow.script-split'] }`:仅当该 workflow 当轮被激活时生效
- `scope: { risk: [...] }`:作为 tool gating 的额外条件出现,但仍以 policy 文本注入 prompt

`workflow` 与 `risk` 二者本质上都是"条件激活"——它们让 policy 行为更像 workflow,但仍保持**永远在 workflow 之前**的注入顺序。

---

## 5. Layer 4 — Capability Pack(纯发布单元)

### 5.1 职责
- 把若干 schema + tool + skill 打包成一个**可分发**的能力包
- 描述这些资源的版本一致性约束
- 声明 pack 来源(builtin / plugin / mcp)

### 5.2 不负责
- **不**决定 agent 启用了什么。启用/停用是 Profile 的工作。
- **不**出现在 prompt 里。

### 5.3 目录

```
apps/agent/catalog/packs/
├── core.pack.json                  // 平台基础(platform tools + safe-drafts policy)
├── drafts.pack.json                // 通用 draft 编辑工具
├── proposal.pack.json              // 项目提案 + 制作提案 + script-split
├── visual-generation.pack.json     // 视觉生成工具 + workflow
└── content-unit.pack.json          // 内容单元相关
```

### 5.4 CapabilityPack 形状

```ts
export interface CapabilityPack {
  id: string                       // 'movscript.pack.proposal'
  version: string                  // '1.0.0',semver
  name: string
  description?: string
  source: PackSource               // 见 §5.6

  /** 这个 pack 包含哪些资源 */
  schemas: string[]                // schema ids
  tools: string[]                  // tool names
  skills: string[]                 // skill ids (任意 kind 都行)

  /** 与其他 pack 的依赖 / 互斥 */
  requires?: {
    packs?: Record<string, string>     // { 'movscript.pack.core': '>=1.0.0' }
    schemas?: Record<string, string>   // { 'movscript.project_proposal.v1': '>=1.0.0' }
    tools?: Record<string, string>
    skills?: Record<string, string>
  }
  conflicts?: string[]             // pack ids 列表;同时启用即拒绝 install

  /** plugin/MCP 提供的 pack 才有 */
  pluginId?: string                // 见 §14
  mcpServerId?: string

  /** Pack 启用前置 */
  capabilities?: {
    requiresPermissions?: string[]     // 用户必须授予才能 install
    requiresFeatureFlags?: string[]
  }
}

export type PackSource = 'builtin' | 'plugin' | 'mcp'
```

### 5.5 与 Profile 的关系
Profile 通过 `enabledPacks: string[]` 引入 pack。引入 pack 等价于把它包含的所有 skill/tool/schema **登记为可用**,但是否激活仍由 Profile 的 `enabledWorkflows / enabledPolicies / toolGrants` 控制。

> "可用" ≠ "激活"。Pack 解决"装上了什么",Profile 解决"打开了什么"。

### 5.6 Plugin / MCP 提供的 Pack

#### 5.6.1 install 流程(plugin pack)

```
1. 用户在前端 plugin marketplace 选 install
2. 前端把 plugin bundle URL + manifest 发给 agent server (POST /plugins)
3. agent server 校验 plugin manifest signature(可选)
4. agent server 把 pack 落盘到 catalog/packs/_plugins/<pluginId>.pack.json,
   把 tool/skill/schema 落盘到 catalog/.../<pluginId>/
5. agent server 跑 catalog linter
   - 失败 → 拒绝 install,回滚目录,返回 PackInstallError
   - 通过 → 写入 IndexedDB 记录,broadcast `catalog:changed`
6. 已有 in-flight agent 不受影响(见 §7.7);新 agent 启动时使用新 catalog
```

#### 5.6.2 plugin pack 限制

- `tools[]` 中每个 tool 的 `source` 必须是 `plugin`,`pluginId` 必须等于 pack 的 `pluginId`
- `schemas[]` 不允许覆盖 builtin schema 的 id(冲突时 linter 拒绝)
- `skills[]` 必须遵守同样的 kind 分桶规则
- pack 中所有 `permission` 必须在平台的 plugin-allowed 集合内
- pack 不允许 `conflicts` 任何 `builtin` 来源的 pack(防止用户 install 第三方包后破坏内置流程)

#### 5.6.3 MCP pack

每个连接的 MCP server 在 agent 启动时被映射为一个虚拟 pack:

```json
{
  "id": "mcp.<server_id>",
  "version": "<mcp server reported version>",
  "source": "mcp",
  "mcpServerId": "<server_id>",
  "tools": [/* mcp server 的 tools/list */],
  "skills": [],
  "schemas": []
}
```

MCP 不能贡献 skill 或 schema——它只是工具源。

### 5.7 Pack 冲突解决

| 冲突类型 | 处理 |
|---|---|
| 两个 pack 声明同一个 `tool.name` | linter 拒绝(install 时);若运行期发生(plugin 热装),后装者被拒 |
| 两个 pack 声明同一个 `schema.id`(完全相同 version 也不行) | 同上 |
| 两个 pack 声明同一个 `skill.id` | 同上 |
| pack A 的 `conflicts` 列出 pack B,profile 同时 enable | linter / resolveProfile 报错,profile 加载失败,fallback 到 default profile |
| 一个 builtin pack 和一个 plugin pack 同时声明同一个 id | 永远拒绝 plugin pack(builtin 优先) |

冲突信号在 install 时拒绝,**不允许**通过 namespace 重命名等"魔法"解决——这条规则保护 skill instructionTemplate 中的 `$ref` 永远稳定。

---

## 6. Layer 5 — Agent Profile(运行时绑定)

### 6.1 职责
- 描述**一个 agent 实例**的运行时绑定
- 是 LLM 调用前的最终 source of truth

### 6.2 取代关系
| 旧 | 新 |
|---|---|
| `DEFAULT_AGENT_MANIFEST` | `defaultProfile`(声明在 `catalog/profiles/`) |
| `modeRegistry.MODES` | 一组 **Profile Preset**(同样在 `catalog/profiles/`) |
| `manifest.skills`(内联 skill body) | **不允许**。Profile 只引用 skill id。 |
| `enabledBundleIds` | `enabledPacks` |
| `manifest.soul` 字符串 | persona skill id(见 §4.4.5) |

### 6.3 AgentProfile 形状

```ts
export interface AgentProfile {
  schema: 'movscript.agent.profile.v1'
  id: string                          // 'movscript.profile.project-orchestration'
  version: string
  name: string
  description?: string

  /** Profile preset 的别名,UI 通过 mode 选这个 profile。null 表示非 mode profile。 */
  modeAlias?: string                  // 'project-orchestration' | 'create' | ...

  /** 引入哪些 pack(决定"可用集") */
  enabledPacks: string[]

  /** 实际激活的 skill,按 kind 分桶 */
  persona: string | null              // 至多 1 个 persona skill id
  enabledWorkflows: string[]          // workflow skill ids
  enabledPolicies: string[]           // policy skill ids

  /** Tool 授权(覆盖 pack/tool 的默认 grant) */
  toolGrants: ToolGrant[]

  /** Model 绑定;见 §6.9 */
  model?: ModelBinding

  /** 配额与上限(可选,默认从平台配置取) */
  limits?: ProfileLimits

  /** Profile 合并的来源链(由 runtime 填,不在文件里写) */
  resolvedFrom?: ProfileResolutionTrace

  metadata?: Record<string, unknown>
}

export interface ToolGrant {
  name: string
  mode: 'allow' | 'deny'
  approval?: 'never' | 'always' | 'on_write'  // 覆盖 tool defaults.approval,但服从 §4.7.2 规则
}

export interface ProfileLimits {
  maxActiveWorkflows?: number         // 默认 2
  maxToolCallsPerTurn?: number        // 默认 16
  systemPromptCharLimit?: number      // 默认 32000;超出时降级见 §7.4.5
}
```

注意:`permissions: string[]` 字段已移除——permission 集**完全由 `toolGrants` 派生**(见 §6.10),不允许手写。

### 6.4 目录

```
apps/agent/catalog/profiles/
├── default.profile.json                       // 通用聊天 profile
├── modes/
│   ├── chat.profile.json
│   ├── plan.profile.json
│   ├── create.profile.json
│   ├── review.profile.json
│   ├── project-orchestration.profile.json
│   ├── production-orchestration.profile.json
│   ├── dual-orchestration.profile.json
│   ├── asset-proposal.profile.json
│   ├── content-unit-proposal.profile.json
│   ├── content-unit-media-proposal.profile.json
│   ├── asset-candidate-generation.profile.json
│   ├── creative-workbench.profile.json
│   ├── script-split.profile.json
│   └── setting-prep.profile.json
├── org/
│   └── <org-id>.profile.json                  // 组织级覆盖(可选)
└── user/
    └── <user-id>.profile.json                 // 用户级覆盖(可选)
```

### 6.5 Profile 示例

`profiles/modes/project-orchestration.profile.json`:

```json
{
  "schema": "movscript.agent.profile.v1",
  "id": "movscript.profile.project-orchestration",
  "version": "1.0.0",
  "name": "项目提案助手",
  "description": "整理项目级设定、素材需求,生成可审阅 project_proposal 草稿。",
  "modeAlias": "project-orchestration",
  "enabledPacks": [
    "movscript.pack.core",
    "movscript.pack.drafts",
    "movscript.pack.proposal"
  ],
  "persona": "movscript.persona.project-orchestrator",
  "enabledWorkflows": [
    "movscript.workflow.project-proposal"
  ],
  "enabledPolicies": [
    "movscript.policy.safe-drafts",
    "movscript.policy.approval-boundaries",
    "movscript.policy.platform-concepts"
  ],
  "toolGrants": [
    { "name": "movscript_get_current_context", "mode": "allow", "approval": "never" },
    { "name": "movscript_create_draft",        "mode": "allow", "approval": "never" },
    { "name": "movscript_get_draft",           "mode": "allow", "approval": "never" },
    { "name": "movscript_list_drafts",         "mode": "allow", "approval": "never" },
    { "name": "movscript_update_draft",        "mode": "allow", "approval": "never" },
    { "name": "movscript_request_user_input",  "mode": "allow", "approval": "never" }
  ],
  "model": {
    "provider": "anthropic",
    "modelId": "claude-3-5-sonnet-20250101"
  }
}
```

### 6.6 关键不变量
- Profile **永远**只引用 skill id,**永远不**内联 skill instruction
- 每个 mode = 一个 mode profile。`modeAlias` 字段把 UI 的 mode key 映射到 profile id
- 如果一个 workflow 没被任何 enabled profile 列入 `enabledWorkflows`,它就不会进入 prompt(即使 trigger 命中)
- `permissions` 字段不能手写,由 toolGrants 派生

### 6.7 Profile 合并语义(Org / Mode / User)

#### 6.7.1 三层合并

最终 profile 由最多三层 merge 而成:

```
effective = merge(default.profile, mode.profile, org.profile?, user.profile?)
                                                ↑ 同层时按文件顺序
```

合并发生在 `resolveProfile()` 内部,每次 agent 启动时执行;**结果不缓存到磁盘**。

#### 6.7.2 字段级合并规则

| 字段 | 合并方式 |
|---|---|
| `id`, `version`, `name`, `description`, `schema` | 取最后一层(具有最高优先级) |
| `modeAlias` | 取 mode profile 的值;org/user 不能改 |
| `enabledPacks` | **合集**(union)。任一层 enable 即可用 |
| `persona` | 取最后一层非 null 值(后覆盖前) |
| `enabledWorkflows` | **合集**(union),按 id 去重 |
| `enabledPolicies` | **合集**(union),按 id 去重 |
| `toolGrants` | 按 `name` 合并;同 name 时**后者覆盖前者**(注意 approval 仍服从 §4.7.2 收紧但不放宽) |
| `model` | 后覆盖前(整体替换,不字段级 merge) |
| `limits` | 字段级 merge;**取每个字段的最严值**(min)|
| `metadata` | 浅 merge,后覆盖前 |

#### 6.7.3 Org / User profile 的允许字段

为了防止用户 profile 解开了 org 设的红线,Org/User profile 的**允许字段**子集为:

| 层 | 可写字段 |
|---|---|
| `org` | `enabledPacks`(只能减不能加,值需为 mode profile 中的子集)、`enabledWorkflows`(只能减)、`enabledPolicies`(只能加,合规红线)、`toolGrants`(只能收紧)、`limits`(只能调小)、`metadata` |
| `user` | `enabledWorkflows`(只能减)、`toolGrants`(只能收紧)、`metadata` |

linter 校验"只能减/只能加"的方向。违反则该层 profile 整体作废并 warning。

#### 6.7.4 resolvedFrom 追踪

合并后的 effective profile 由 runtime 填一个 `resolvedFrom`:

```ts
export interface ProfileResolutionTrace {
  layers: Array<{ source: 'default' | 'mode' | 'org' | 'user'; id: string; version: string }>
  resolvedAt: string                  // ISO timestamp
}
```

写到 telemetry 与 agent run 的 `debug` 字段,便于复现"为什么这个 agent 启用了这个 workflow"。

### 6.8 Skill-scoped Tool Gating

LLM 在当前轮看到的 tool 列表由以下交集生成:

```
visibleTools =
    available.tools                                       // pack 装上的
  ∩ { t | profile.toolGrants[t].mode === 'allow' }       // profile 授权的
  ∩ scopeFilter(activeWorkflows)                          // 见下
  ∩ { t | t.availability.state === 'active' }
```

`scopeFilter(activeWorkflows)`:

- 如果没有 workflow 激活 → `scopeFilter = all`(persona+policy 模式)
- 如果有一个或多个 workflow 激活,对每个 workflow 取 `effectiveSet`:
  - `toolScope === 'intersect'`(默认) → `effectiveSet = workflow.toolRefs`
  - `toolScope === 'union'` → `effectiveSet = all granted tools`
- 多 workflow 时,各 `effectiveSet` 求**并集**(union)

这条规则保证:在 `project-proposal` workflow 激活时,LLM 看不到 `movscript_create_generation_job`(那是 `asset-candidate-generation` workflow 的工具),哪怕 profile 把它整体授权了。

**例外**:`movscript_request_user_input` 是平台保留工具,只要 profile 授权,任何 workflow 都能看到(它不参与 scope 计算)。见 §7.6。

### 6.9 ModelBinding 形状

```ts
export interface ModelBinding {
  provider: 'anthropic' | 'openai' | 'azure' | 'custom'
  modelId: string                     // 'claude-3-5-sonnet-20250101'
  platformModelId?: string            // 平台侧的 modelConfig id,用于配额/计费

  /** 多 model 路由(可选) */
  routes?: ModelRoute[]
}

export interface ModelRoute {
  when: { workflow?: string[]; risk?: ToolRiskLevel[]; longContext?: boolean }
  use: { provider: string; modelId: string; platformModelId?: string }
}
```

路由匹配按数组顺序,首匹配优先;无匹配回落到顶层 `provider/modelId`。Profile 合并时 `model.routes` 整体替换(不数组合并)。

平台允许 plugin 引入新 provider 实现,但 plugin 必须实现 `ModelClientAdapter` 接口(在 §17 给出)。

### 6.10 permissions 派生规则

`profile.permissions: string[]`(旧字段)**已移除**。Runtime 在 `resolveProfile()` 之后计算:

```ts
effectivePermissions = new Set(
  toolGrants
    .filter(g => g.mode === 'allow')
    .map(g => registry.tools.get(g.name)?.permission)
    .filter(Boolean)
)
```

`applyToolPolicy` 直接读 `effectivePermissions`;profile 文件、UI、日志都不再写 permissions。这条规则消除了"profile 列了 permission 却没列对应 toolGrant"或反之的所有不一致。

---

## 7. Runtime 组装流程

### 7.1 请求 → Prompt 的完整管线

```
[1] HTTP 请求到达 (mode? message? uiContext? intents?)
       │
       ▼
[2] 选 Profile:
    profile = resolveProfile(modeAlias, orgId, userId)   // 见 §6.7
       │
       ▼
[3] 解析 Pack → 可用资源集
    available = ∑ packs(profile.enabledPacks) → {schemas, tools, skills}
       │
       ▼
[4] 解析 Skill:
    persona  = lookup(profile.persona)                  // 至多 1
    policies = profile.enabledPolicies.map(lookup)
                .filter(scopeMatches(profile, ctx))     // 应用 PolicyScope
    candidates = profile.enabledWorkflows.map(lookup)
       │
       ▼
[5] Trigger 评估:
    workflows = candidates.filter(w => evaluateTriggers(w, ctx))
                          .sort(byPriorityDesc, byIdAsc)
                          .slice(0, profile.limits.maxActiveWorkflows ?? 2)
       │
       ▼
[6] 渲染 Skill instructionTemplate:
    对每个 skill,替换 {{tool:...}} / {{schema:...}} / {{ctx:...}} 占位符
       │
       ▼
[7] 拼接 system prompt:
    [persona?]
    [policy_1, ..., policy_n]   (priority desc)
    [workflow_1, ..., workflow_m] (priority desc)
    若超 limits.systemPromptCharLimit → §7.4.5 降级
       │
       ▼
[8] 构造 tool catalog (Skill-scoped):
    toolset = available.tools
              ∩ allowed toolGrants
              ∩ scopeFilter(workflows)
              ∩ active availability
    (LLM 看到的工具列表只是这一组,不是所有 registered tool)
       │
       ▼
[9] 调用 ModelClient,LLM 输出 toolCall
       │
       ▼
[10] applyToolPolicy(toolCall, profile, ctx)
    检查: registered? in toolset? permission? projectScoped? approval?
    若 approval 触发 → 见 §7.5
       │
       ▼
[11] 执行 tool / 返回结果 / 续转
    错误处理见 §7.4
```

### 7.2 Trigger 评估算法

```ts
function evaluateTriggers(skill: WorkflowSkill, ctx: RuntimeContext): boolean {
  if (skill.triggers.length === 0) return false
  return skill.triggers.some(t => {
    switch (t.kind) {
      case 'always':  return true
      case 'keyword': return t.any.some(k => ctx.message.toLowerCase().includes(k.toLowerCase()))
      case 'regex':   return new RegExp(t.pattern, t.flags ?? '').test(ctx.message)
      case 'intent':  return ctx.intents.includes(t.id)
      case 'context': return matchSelector(t.selector, ctx.uiContext)
    }
  })
}
```

任一 trigger 命中即激活。**没有 trigger 数组的 workflow 永远不激活**(与 policy/persona 区分)。

### 7.3 占位符渲染

```ts
function renderSkill(skill: SkillDefinitionBase, registry: CatalogRegistry, ctx: RuntimeContext): string {
  return skill.instructionTemplate.replace(
    /\{\{(tool|schema|ctx):([^}]+)\}\}/g,
    (_, kind, ref) => {
      if (kind === 'tool') {
        const [name, sub] = ref.split('.')
        const tool = registry.tools.get(name)
        if (!tool) throw new CatalogRefError('tool', ref)
        if (!sub)               return tool.capability ?? tool.description
        if (sub === 'actions')  return enumActions(tool.inputSchema)
        if (sub === 'errors')   return formatErrorCodes(tool.errorCodes)
        throw new CatalogRefError('tool-sub', ref)
      }
      if (kind === 'schema') {
        const [id, sub] = ref.split(/\.(?=id$)/)
        const schema = registry.schemas.get(id)
        if (!schema) throw new CatalogRefError('schema', ref)
        if (sub === 'id') return schema.id
        return schema.promptSummary
      }
      if (kind === 'ctx') {
        return String(get(ctx.uiContext, ref) ?? '')
      }
      return ''
    },
  )
}
```

**未解析的占位符必须报错**,不要静默替换为空串。catalog load 期间应预先 lint 所有 skill 模板。

### 7.4 错误与回退分类

Runtime 的所有错误归入下表;每一类有规定的处理路径,**不允许**静默失败。

| 错误码 | 时机 | Dev 环境 | Prod 环境 | 上报 |
|---|---|---|---|---|
| `catalog.load.parse_error` | catalog load 时 JSON parse 失败 | startup fail | startup fail | error log |
| `catalog.lint.fail` | linter 拒绝(如 ref 未解析) | startup fail | startup fail | error log |
| `catalog.ref.missing` | runtime 渲染时占位符指向不存在的资源 | throw,返回 5xx | 同左 | error log + 写入 agent run debug |
| `profile.resolve.miss` | mode 没有对应 profile | fallback 到 `default.profile` + warning | 同左 | warning log + 通知前端 |
| `profile.merge.violation` | org/user profile 越权(放宽红线) | 该层丢弃 + warning | 同左 | warning log |
| `trigger.eval.error` | regex 编译失败、context 字段缺失 | 该 trigger 视为不命中 + warning | 同左 | warning log |
| `tool.policy.not_granted` | LLM 调了未授权 tool | 返回结构化 error 给 LLM,允许它换工具 | 同左 | info log |
| `tool.policy.approval_required` | 需要审批 | 走 §7.5 | 同左 | info log |
| `tool.exec.error` | tool 实现内部抛 | 包装为 `{ok:false,...}` 返回 LLM | 同左 | warning log,retryable=true 时 LLM 可重试 |
| `tool.exec.timeout` | tool 超过 `tool.defaults.timeoutMs` | 包装为 `{ok:false, code:'timeout'}` | 同左 | warning log |
| `prompt.size.exceeded` | system prompt > limits.systemPromptCharLimit | §7.4.5 降级 | 同左 | warning log |

#### 7.4.5 Prompt size 降级策略

超 `systemPromptCharLimit` 时,按以下顺序丢弃直到符合上限:

1. 丢弃 `priority < 100` 的 policy(标注为"non-critical")
2. 丢弃匹配 workflow 中 `priority` 最低的
3. 移除 schema promptSummary 的 examples 区段
4. 仍超 → throw `prompt.size.exceeded`,返回 5xx,前端展示"上下文过载,请缩减输入或拆分任务"

降级决策必须写入 telemetry,便于事后看是哪一类 skill 体积失控。

### 7.5 Approval 流程契约

#### 7.5.1 状态机

```
LLM emits toolCall
       │
       ▼
applyToolPolicy → approval required?
       │ no                      │ yes
       │                         ▼
       │                  emit AgentEvent{type:'approval.requested', toolCall, reason}
       │                         │
       │                         ▼
       │                  前端 UI 显示卡片
       │                         │
       │           ┌─────────────┴─────────────┐
       │           ▼                           ▼
       │     user approves                user denies / edits
       │           │                           │
       │           ▼                           ▼
       │     execute tool                emit AgentEvent{type:'approval.denied'} + 续转
       └─→ execute tool                  LLM 看到 ToolResult{ok:false, code:'user_denied'}
```

#### 7.5.2 渲染责任

- **谁渲染卡片**:前端。前端订阅 `approval.requested` 事件,根据 `tool.inputSchema` + `tool.description` 生成可编辑表单。
- **谁判定 approval 是否需要**:agent server 的 `applyToolPolicy`(纯函数:tool.defaults + profile.toolGrants + 命中 policy.scope.risk → 最终决定)。
- **谁存储决策**:agent server 把 `approval` 事件写入 `AgentRun.events`。

#### 7.5.3 用户行为

- **approve**:不改参数 → 直接执行
- **approve with edit**:用户改了部分参数 → 改后参数走一次 `inputSchema` 校验,通过则执行,失败则返回 LLM 错误
- **deny**:tool 返回 `{ok:false, code:'user_denied', message:'User declined to approve.'}` 给 LLM;LLM 决定换 tool / 询问用户 / 放弃
- **timeout**(默认 5 分钟,可配):同 deny,但 `code:'approval_timeout'`

#### 7.5.4 不可绕过项

`tool.defaults.approval === 'always'` 的 tool 无论 profile 怎么配,都必须走 approval 流程。这是 §4.7.2 中"approval 只能收紧不能放宽"的具体体现。

### 7.6 request_user_input — Agent 反向询问的特殊地位

`movscript_request_user_input` 在五层架构中身份特殊——它是**唯一**允许 agent 主动驱动 UI 显示问句的 tool。其特性:

- **不参与 workflow 的 `toolScope` 收窄**(见 §6.8):只要 profile 授权,任何 workflow 激活时它都可见
- **`approval` 默认 `never`**(询问用户本身不是写操作)
- **专用 inputSchema**:`{ question: string; expectedAnswer?: 'text'|'enum'|'number'|'boolean'; choices?: string[]; placeholder?: string }`
- **返回形态**:`{ ok: true, answer: string | number | boolean | null }`;`null` 表示用户跳过
- **持久化**:每次询问会作为 `AgentEvent{type:'user_input.requested'}` 写入 run.events,answer 写为 `user_input.received`
- **不可被 plugin 覆盖**:plugin 不能注册同名 tool,也不能在 inputSchema 上扩展私有字段(平台保留)

前端组件以**对话气泡 + 表单**双形态接收此事件,具体由 `expectedAnswer` 决定渲染。

### 7.7 Catalog Hot-Reload 契约

#### 7.7.1 触发方式

- 显式调用 `movscript_reload_agent_catalog` tool(开发者)
- 前端通过 `POST /agent/catalog/reload`(管理员)
- Plugin install / uninstall(自动)

#### 7.7.2 In-flight Agent 隔离

每个 `AgentRun` 在创建时**snapshot** 一份 catalog 引用:

```ts
export interface AgentRun {
  id: string
  catalogVersion: string        // catalog 全局版本号
  catalogSnapshot: WeakRef<CatalogRegistry>
  // ...
}
```

Reload 时:
1. 新 catalog 被 build 并通过 linter
2. 失败 → 老 catalog 不变,reload 返回 4xx
3. 成功 → 新 catalog 接管"current" 指针,版本号 bump
4. 已 in-flight 的 run 继续用旧 snapshot(weakref 保活到 run 结束)
5. 新建 run 使用新 catalog

这条规则保证:**同一个 run 中,skill / tool / schema 永远不会"变"**。

#### 7.7.3 失败回滚

Reload 内部按以下顺序原子化:

```
1. 复制 current catalog 为 candidate
2. 对 candidate 应用变更(install / uninstall / 文件修改)
3. 跑 linter
4. 失败 → 丢弃 candidate,记 audit log,返回失败
5. 成功 → 原子替换 current,版本号 bump,发出 `catalog:changed` 事件
```

文件系统侧的临时改动放在 `_staging/` 目录,只有完整通过 lint 后才 `rename` 到正式位置。

---

## 8. 完整类型定义(target state)

```ts
// ============== Layer 1: Schema ==============
export interface DraftSchemaDefinition {
  id: string
  kind: DraftKind
  category: DraftSchemaCategory
  scope: DraftScope
  title: string
  version: string
  status: 'active' | 'deprecated'
  supersededBy?: string
  jsonSchema: JSONSchema7
  promptSummary: string
  examples: ReadonlyArray<{ name: string; content: unknown }>
}

// ============== Layer 2: Tool ==============
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JSONSchema7
  permission: string
  risk: 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'
  projectScoped: boolean
  defaults: {
    grant: 'allow' | 'deny'
    approval: 'never' | 'always' | 'on_write'
    timeoutMs?: number                  // 默认 30000
  }
  source: 'runtime' | 'plugin' | 'mcp'
  capability?: string
  pluginId?: string
  mcpServerId?: string
  errorCodes?: ToolErrorCode[]
  availability?: ToolAvailability       // 由 runtime 计算,文件中不写
}

export type ToolErrorCode = string      // 平台保留前缀:'platform.*';plugin 用 'plugin.<id>.*'

export type ToolAvailability =
  | { state: 'active' }
  | { state: 'inactive'; reason: 'pack_not_installed' | 'pack_disabled' }
  | { state: 'unavailable'; reason: 'plugin_load_failed' | 'mcp_server_down'; lastError?: string }
  | { state: 'deprecated'; supersededBy?: string }

// ============== Layer 3: Skill ==============
export type SkillKind = 'persona' | 'workflow' | 'policy'

export interface SkillDefinitionBase {
  id: string
  kind: SkillKind
  version: string
  name: string
  description: string
  priority: number
  enabled: boolean
  instructionTemplate: string
  toolRefs?: string[]
  schemaRefs?: string[]
  outputContract?: string
  metadata?: Record<string, unknown>
}

export type PersonaSkill = SkillDefinitionBase & { kind: 'persona' }
export type WorkflowSkill = SkillDefinitionBase & {
  kind: 'workflow'
  triggers: SkillTrigger[]
  toolRefs: string[]
  toolScope?: 'union' | 'intersect'     // 默认 'intersect'
}
export type PolicySkill = SkillDefinitionBase & {
  kind: 'policy'
  scope?: PolicyScope
}
export type PolicyScope =
  | 'global'
  | { mode?: string[]; workflow?: string[]; risk?: ToolDefinition['risk'][] }
export type SkillDefinition = PersonaSkill | WorkflowSkill | PolicySkill

export type SkillTrigger =
  | { kind: 'keyword'; any: string[] }
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'intent'; id: string }
  | { kind: 'context'; selector: ContextSelector }
  | { kind: 'always' }

export interface ContextSelector {
  mode?: string[]
  route?: string[]
  selectedKind?: DraftKind[]
  selectedScope?: DraftScope[]
  draftStatus?: ('proposed' | 'confirmed' | 'superseded')[]
  hasProductionId?: boolean
  hasProjectId?: boolean
  custom?: Record<string, string | string[] | boolean>
}

// ============== Layer 4: Capability Pack ==============
export interface CapabilityPack {
  id: string
  version: string
  name: string
  description?: string
  source: 'builtin' | 'plugin' | 'mcp'
  schemas: string[]
  tools: string[]
  skills: string[]
  requires?: {
    packs?: Record<string, string>
    schemas?: Record<string, string>
    tools?: Record<string, string>
    skills?: Record<string, string>
  }
  conflicts?: string[]
  pluginId?: string
  mcpServerId?: string
  capabilities?: {
    requiresPermissions?: string[]
    requiresFeatureFlags?: string[]
  }
}

// ============== Layer 5: Agent Profile ==============
export interface AgentProfile {
  schema: 'movscript.agent.profile.v1'
  id: string
  version: string
  name: string
  description?: string
  modeAlias?: string
  enabledPacks: string[]
  persona: string | null
  enabledWorkflows: string[]
  enabledPolicies: string[]
  toolGrants: ToolGrant[]
  model?: ModelBinding
  limits?: ProfileLimits
  metadata?: Record<string, unknown>
  resolvedFrom?: ProfileResolutionTrace
}

export interface ToolGrant {
  name: string
  mode: 'allow' | 'deny'
  approval?: 'never' | 'always' | 'on_write'
}

export interface ProfileLimits {
  maxActiveWorkflows?: number
  maxToolCallsPerTurn?: number
  systemPromptCharLimit?: number
}

export interface ModelBinding {
  provider: 'anthropic' | 'openai' | 'azure' | 'custom'
  modelId: string
  platformModelId?: string
  routes?: ModelRoute[]
}

export interface ModelRoute {
  when: { workflow?: string[]; risk?: ToolDefinition['risk'][]; longContext?: boolean }
  use: { provider: string; modelId: string; platformModelId?: string }
}

export interface ProfileResolutionTrace {
  layers: Array<{ source: 'default' | 'mode' | 'org' | 'user'; id: string; version: string }>
  resolvedAt: string
}

// ============== Runtime ==============
export interface RuntimeContext {
  profile: AgentProfile
  message: string
  intents: string[]
  uiContext: UIContext
  conversation: ConversationSnapshot
  catalogVersion: string
}

export interface UIContext {
  mode?: string
  route?: string
  selectedKind?: DraftKind
  selectedScope?: DraftScope
  selectedId?: string | number
  draftStatus?: 'proposed' | 'confirmed' | 'superseded'
  projectId?: number
  productionId?: number
  [k: string]: unknown
}

export interface ConversationSnapshot {
  turnCount: number
  lastToolCalls: Array<{ name: string; success: boolean }>
  recentErrors: Array<{ code: string; toolName?: string }>
}
```

---

## 9. 目标目录结构总览

```
movscript/
├── packages/
│   └── draft-schemas/                       # Layer 1 - 内容形状的单源
│       └── src/
│           ├── types.ts
│           ├── registry.ts
│           ├── project-proposal/
│           ├── production-proposal/
│           ├── content-unit-proposal/
│           ├── content-unit-media-proposal/
│           ├── asset-proposal/
│           └── script-split-proposal/
│
└── apps/agent/
    ├── catalog/                             # 所有可加载的声明式资源
    │   ├── tools/                           # Layer 2
    │   │   ├── platform/
    │   │   ├── drafts/
    │   │   ├── visual-generation/
    │   │   ├── input/
    │   │   └── _plugins/<pluginId>/         # plugin 贡献(install 时落盘)
    │   ├── skills/                          # Layer 3
    │   │   ├── persona/
    │   │   ├── workflow/
    │   │   ├── policy/
    │   │   └── _plugins/<pluginId>/
    │   ├── packs/                           # Layer 4
    │   │   ├── core.pack.json
    │   │   ├── drafts.pack.json
    │   │   ├── proposal.pack.json
    │   │   ├── visual-generation.pack.json
    │   │   ├── content-unit.pack.json
    │   │   └── _plugins/<pluginId>.pack.json
    │   ├── profiles/                        # Layer 5
    │   │   ├── default.profile.json
    │   │   ├── modes/
    │   │   │   ├── chat.profile.json
    │   │   │   ├── plan.profile.json
    │   │   │   ├── create.profile.json
    │   │   │   ├── review.profile.json
    │   │   │   ├── project-orchestration.profile.json
    │   │   │   ├── production-orchestration.profile.json
    │   │   │   ├── dual-orchestration.profile.json
    │   │   │   ├── asset-proposal.profile.json
    │   │   │   ├── content-unit-proposal.profile.json
    │   │   │   ├── content-unit-media-proposal.profile.json
    │   │   │   ├── asset-candidate-generation.profile.json
    │   │   │   ├── creative-workbench.profile.json
    │   │   │   ├── script-split.profile.json
    │   │   │   └── setting-prep.profile.json
    │   │   ├── org/
    │   │   └── user/
    │   └── _staging/                        # hot-reload 临时区(见 §7.7)
    │
    └── src/
        ├── catalog/                         # 加载 / lint / 索引 catalog
        │   ├── loader.ts                    # 读 JSON / 校验 / 索引
        │   ├── registry.ts                  # CatalogRegistry: tools/skills/schemas/packs/profiles
        │   ├── linter.ts                    # 校验 schema refs / tool refs / pack deps
        │   ├── reloader.ts                  # hot-reload 控制器,见 §7.7
        │   └── index.ts
        ├── profiles/                        # Layer 5 运行时
        │   ├── resolveProfile.ts            # mode + org + user override → AgentProfile
        │   ├── profileMerge.ts              # 字段级合并规则
        │   ├── profile.types.ts
        │   └── index.ts
        ├── skills/                          # Layer 3 运行时
        │   ├── triggerEvaluator.ts
        │   ├── promptComposer.ts            # 渲染 + 拼接 system prompt
        │   ├── promptSizeManager.ts         # §7.4.5 降级
        │   ├── skill.types.ts
        │   └── index.ts
        ├── tools/                           # Layer 2 运行时
        │   ├── toolPolicy.ts                # 权限/审批检查
        │   ├── toolCatalogResolver.ts       # 给 LLM 看的工具列表(含 scope filter)
        │   ├── toolExecutor.ts
        │   ├── approvalGateway.ts           # §7.5 approval 流程
        │   ├── tool.types.ts
        │   └── index.ts
        ├── plugins/                         # §14 plugin / MCP 集成
        │   ├── pluginInstaller.ts
        │   ├── pluginRegistry.ts
        │   ├── mcpAdapter.ts
        │   └── pluginManifest.types.ts
        ├── orchestration/                   # agent loop / graph
        ├── adapters/
        ├── state/
        ├── context/
        ├── drafts/
        ├── memory/
        ├── telemetry/                       # §15 可观测性
        │   ├── events.ts
        │   └── reporter.ts
        └── server.ts
```

---

## 10. 从现状到目标的映射

> 仅作开发参考,本节不构成迁移步骤;重构以**目标状态**为准。

| 现状文件 / 字段 | 目标位置 |
|---|---|
| `catalog/skills/modes.json::movscript.intent.mode.plan` | `catalog/profiles/modes/plan.profile.json`(soul → `catalog/skills/persona/plan-orchestrator.persona.json`;workflow 移除) |
| `catalog/skills/modes.json::movscript.intent.project-proposal` | `catalog/skills/workflow/project-proposal.workflow.json`(schema 抽出到 `packages/draft-schemas/project-proposal/prompt-summary.md`) |
| `catalog/skills/modes.json::movscript.intent.production-proposal` | `catalog/skills/workflow/production-proposal.workflow.json`(同上) |
| `catalog/skills/modes.json::movscript.intent.dual-orchestration` | `catalog/skills/workflow/dual-orchestration.workflow.json` |
| `catalog/skills/modes.json::movscript.intent.script-split` | `catalog/skills/workflow/script-split.workflow.json`(schema 抽出) |
| `catalog/skills/drafts.json::movscript.drafts.safe-drafts` | `catalog/skills/policy/safe-drafts.policy.json` |
| `catalog/skills/drafts.json::movscript.policy.approval-boundaries` | `catalog/skills/policy/approval-boundaries.policy.json` |
| `catalog/skills/platform.json::movscript.platform.concepts` | `catalog/skills/policy/platform-concepts.policy.json`(或拆为 persona,取决于 default profile 是否需要它作底层身份) |
| `catalog/bundles/*.json` | `catalog/packs/*.pack.json`(重命名 + 改字段;补 `version` / `source` / `requires`) |
| `src/manifest/agentManifest.ts::DEFAULT_AGENT_MANIFEST` | `catalog/profiles/default.profile.json`;`soul` 字段 → `persona` 引用 |
| `src/manifest/modeRegistry.ts::MODE_CONFIGS` | `catalog/profiles/modes/*.profile.json`,soul → persona skill |
| `src/manifest/pluginCatalog.ts` | `src/catalog/loader.ts` + `src/catalog/registry.ts` + `src/profiles/resolveProfile.ts` |
| `src/manifest/skillResolver.ts::messageMatches` | `src/skills/triggerEvaluator.ts` |
| `src/manifest/skillResolver.ts::resolveAgentSkills` | `src/skills/promptComposer.ts` |
| `src/tools/toolPolicy.ts` | 保留并扩展,加入 §4.7.2 approval 合并规则与 §7.5 approval gateway 调用 |
| `appliesWhen: string` | `triggers: SkillTrigger[]`(结构化) |
| skill.instruction 中的 JSON 骨架 | 抽到 `packages/draft-schemas/<kind>/prompt-summary.md` |
| skill.instruction 中复述的 tool API | 抽到 `tool.capability` + `{{tool:name}}` 占位符 |
| manifest.skills 内联 skill body | 禁止;只能 `profile.persona/enabledWorkflows/enabledPolicies` 引用 skill id |
| MCP adapter(`src/adapters/mcp/`) | `src/plugins/mcpAdapter.ts`,贡献 `source: 'mcp'` 的虚拟 pack |
| `manifest.permissions` 数组 | 移除;由 `toolGrants` 派生(§6.10) |

---

## 11. Catalog Linter(必备)

`src/catalog/linter.ts` 在 catalog load 和 hot-reload 时强制检查:

### 11.1 引用完整性
1. **schema 引用必须存在**:任何 skill 的 `schemaRefs` 和 `{{schema:...}}` 占位符引用的 id 必须能在 schema registry 找到
2. **tool 引用必须存在**:任何 skill 的 `toolRefs` 和 `{{tool:...}}` 占位符引用的 name 必须能在 tool registry 找到
3. **未替换的占位符**:渲染时若有 `{{...}}` 残留必须报错
4. **pack 完整性**:`pack.schemas/tools/skills` 中每一项必须能在对应 registry 找到
5. **deprecated 引用**:任何 skill / pack / profile 引用 `status === 'deprecated'` 的 schema → warning

### 11.2 类型与计数约束
6. **workflow 必须有 triggers**:`kind: 'workflow'` 且 `triggers.length === 0` 时报错
7. **persona 数量**:每个 profile 的 persona 字段必须 `null` 或指向一个真实存在的 persona skill
8. **profile 引用约束**:`enabledWorkflows` 项必须 `kind==='workflow'`;`enabledPolicies` 项必须 `kind==='policy'`;`persona` 项必须 `kind==='persona'`
9. **persona 内不引用工具**:`PersonaSkill.toolRefs/schemaRefs` 非空 → warning
10. **profile 不写 permissions**:发现旧字段 → error

### 11.3 反污染启发式
11. **JSON 骨架检测**:若 skill instructionTemplate 中匹配 `^\s*\{\s*"` 这样的整块 JSON,报告 warning:"建议抽到 schema package"
12. **Tool description 反污染**:若 tool description 含 "Use when" / "Do not use" / "When the user asks" 等 skill 用语,报告 warning
13. **Persona 内不写流程步骤**:persona instructionTemplate 含 "调用 X" / "调用 tool" 等 → warning

### 11.4 Pack / Profile 一致性
14. **Profile 引用必须在 enabledPacks 覆盖范围内**:`persona / enabledWorkflows / enabledPolicies` 引用的 skill,其 id 必须出现在某个 `enabledPack.skills` 列表中
15. **toolGrants 必须在 enabledPacks 覆盖范围内**:`toolGrants[*].name` 必须出现在某个 `enabledPack.tools` 列表中
16. **Pack 冲突检测**:任何两个被同一 profile enabled 的 pack 不允许声明同名 tool / schema id / skill id
17. **Pack version 约束**:`requires.packs/schemas/tools/skills` 中所有 version range 必须能在当前 registry 满足

### 11.5 Profile 合并校验
18. **Org/User profile 越权**:org profile 加 `enabledPacks` / 解锁 `toolGrants` 等违反 §6.7.3 方向规则的 → 整体作废 + warning
19. **modeAlias 唯一**:多个 mode profile 不能声明同一个 `modeAlias`

### 11.6 Approval / Policy 一致性
20. **不可放宽的 approval**:profile 的 `toolGrants[*].approval` 弱于 `tool.defaults.approval` → warning(仍以 max 为准,但提示作者)
21. **PolicyScope.workflow 引用必须存在**

Linter 失败应使 agent server 启动失败(开发环境),hot-reload 时整体回滚(生产环境)。

---

## 12. 关键不变量速查表

| 编号 | 不变量 |
|---|---|
| **I1** | Schema 包是 draft 内容形状的唯一来源。skill 不得手抄 JSON 骨架。 |
| **I2** | Tool description 是函数签名,不写 "when to use"。 |
| **I3** | Skill 引用 tool/schema 必须通过 `$ref` 占位符,不允许字面复述。 |
| **I4** | 每个 skill 有且仅有一个 `kind`:persona / workflow / policy。 |
| **I5** | 每个 profile 至多 1 个 persona。 |
| **I6** | Workflow 必须有 `triggers` 数组。 |
| **I7** | Policy 永远叠加(除非有 `scope` 限定)。 |
| **I8** | Bundle/Pack 不出现在 prompt 里,仅作发布单元。 |
| **I9** | Profile 不内联 skill body,只引用 skill id。 |
| **I10** | 不知道某个 tool/schema id 时,runtime 必须报错,不静默降级。 |
| **I11** | Mode 是 Profile preset 的别名,不是单独的层。 |
| **I12** | Schema package 不 import agent server。Tool registry 不 import skill。Skill 不 import profile。单向依赖。 |
| **I13** | Skill 之间不互相引用(无 `extends`,无 `{{skill:...}}`)。 |
| **I14** | Profile 的 `permissions` 字段不存在;permission 由 `toolGrants` 派生。 |
| **I15** | Tool 的 `approval` 只能收紧不能放宽(`max(defaults, grant, policy)`)。 |
| **I16** | Org/User profile 只能收紧不能解锁(只能减 workflow,只能加 policy,只能收紧 toolGrant)。 |
| **I17** | 同一个 AgentRun 看到的 catalog 永不变(hot-reload 用 snapshot 隔离)。 |
| **I18** | `movscript_request_user_input` 不受 workflow scope 收窄影响,且 plugin 不能覆盖。 |
| **I19** | `tool.name` / `schema.id` / `skill.id` / `pack.id` 在全局唯一,不允许 namespace 重命名解冲突。 |
| **I20** | Plugin 不能贡献 risk=destructive 的 tool;destructive 操作仅 runtime + approval。 |

---

## 13. 命名与版本约定

### 13.1 ID 命名空间

所有 catalog 资源的 id 遵循 `<vendor>.<layer>.<name>` 模式:

| 层 | 模式 | 例 |
|---|---|---|
| Schema | `<vendor>.<kind>.v<N>` | `movscript.project_proposal.v1` |
| Tool | `<vendor>_<verb>_<noun>` | `movscript_update_draft` (注意:tool 用下划线,其他用点) |
| Persona | `<vendor>.persona.<name>` | `movscript.persona.project-orchestrator` |
| Workflow | `<vendor>.workflow.<name>` | `movscript.workflow.project-proposal` |
| Policy | `<vendor>.policy.<name>` | `movscript.policy.safe-drafts` |
| Pack | `<vendor>.pack.<name>` | `movscript.pack.proposal` |
| Profile | `<vendor>.profile.<name>` | `movscript.profile.project-orchestration` |

Plugin / 第三方 vendor 用自己的 namespace:`acme.workflow.market-analysis`。

### 13.2 Tool 命名特例

Tool 的 `name` 是 LLM 直接看到的函数名,使用 snake_case(`movscript_update_draft`),不带点号——多数 LLM provider 对函数名只允许 `[a-zA-Z_][a-zA-Z0-9_]*`。

MCP-bridged tool 强制加前缀:`mcp__<server_id>__<original_name>`。Plugin tool 推荐 prefix `plugin__<plugin_id>__`,但不强制。

### 13.3 Version 语义

所有 catalog 资源的 `version` 字段是 semver:

| 改动类型 | bump |
|---|---|
| 修文案 / 改格式 / 加 example | patch (`1.0.0 → 1.0.1`) |
| 加可选字段、加 enum 值、放宽 trigger、加可选 toolRef | minor (`1.0.0 → 1.1.0`) |
| 删字段、改字段类型、删 trigger、删 toolRef、破坏占位符兼容 | major(对 schema 强制改 `.vN` id;对其他资源 bump major) |

Pack `requires.*` 使用 npm-style range(`^1.0.0`, `>=1.0.0 <2.0.0`)。

### 13.4 Deprecation 流程(横切)

任何资源(schema / tool / skill / pack)废弃流程:

```
status: active → deprecated → removed
```

- **deprecated**:文件保留,新增 `supersededBy` 字段;linter 对引用方报 warning
- **过渡期**:至少保留一个完整 release
- **removed**:文件删除;linter / runtime 对引用方报 error

Profile 不需要 deprecation(profile 由 modeAlias 选择,删一个 mode profile 等价于该 mode 不再可用)。

---

## 14. Plugin 与 MCP 集成契约

### 14.1 Plugin Pack Manifest

第三方 plugin 通过提交一个 `plugin.manifest.json` 注册自己:

```ts
export interface PluginPackManifest {
  id: string                          // 'acme.pack.market-analysis'
  version: string
  name: string
  description: string
  author: { name: string; url?: string }

  /** plugin 提供的资源(平台 install 时落盘到 catalog/_plugins/<id>/) */
  contributes: {
    schemas?: DraftSchemaDefinition[]       // 允许 plugin 贡献新 schema(仅扩展,不覆盖)
    tools?: ToolDefinition[]                // source 必须为 'plugin'
    skills?: SkillDefinition[]
    pack: CapabilityPack                    // 必填,source='plugin'
    profiles?: AgentProfile[]               // 可选,plugin 可贡献 mode profile
  }

  /** 运行时入口 */
  runtime: {
    type: 'js-iframe'                       // 当前唯一支持的类型
    bundleUrl: string                       // plugin bundle 的 URL,见 plugins.md
    permissions: string[]                   // plugin 在沙箱中可用的 mov.* API 子集
  }

  /** 兼容性 */
  compatibility: {
    movscriptAgent: string                  // semver range,例 '>=2.0.0 <3.0.0'
  }

  /** 签名(可选,平台 marketplace 强制) */
  signature?: { alg: 'ed25519'; key: string; sig: string }
}
```

### 14.2 install 协议

```
POST /api/agent/plugins
Content-Type: application/json
{
  "manifest": PluginPackManifest,
  "source": "marketplace" | "url" | "local"
}

Response 200:
{
  "installed": true,
  "pack": { "id": "acme.pack.market-analysis", "version": "1.0.0" },
  "catalogVersion": "2026.05.12.3"          // 新 catalog 版本号
}

Response 4xx:
{
  "installed": false,
  "errors": [
    { "code": "lint.tool.duplicate_name", "detail": "tool acme_search already exists" },
    { "code": "compat.movscript_agent", "detail": "requires >=2.0.0, found 1.9.0" }
  ]
}
```

### 14.3 Plugin 沙箱契约

Plugin 贡献的 tool 实际执行时:

1. agent runtime 把 toolCall 通过 `window.mov` postMessage 转发到 plugin iframe
2. iframe 内 plugin handler 执行,返回结果
3. runtime 校验 result 符合 `tool.outputSchema`(若 plugin 声明)
4. runtime 把 result 包装为 ToolResult 返回 LLM

Plugin 不能在 iframe 内:
- 调其他 plugin 的 tool(必须通过 runtime 中转)
- 修改 catalog
- 读 other-plugin scope 数据
- 直接发起 LLM 调用

具体沙箱细节见 `plugins.md`;本文只规约 plugin 与 catalog / runtime 的接口。

### 14.4 MCP Server 集成

agent server 连接 MCP server 通过 `adapters/mcp/`:

```
启动时 / 配置变更时:
1. 读 mcp.config.json:[{ id, transport: 'stdio'|'http', endpoint, env? }]
2. 对每个 server 调 tools/list
3. 翻译每个 mcp tool 为 ToolDefinition(source='mcp', name=mcp__<id>__<name>)
4. 注册为虚拟 pack: id='mcp.<id>'
5. catalog reload(走 §7.7 协议)
```

MCP server 健康检查:
- 每 30s 一次 `tools/list` ping
- 失败时把对应 tool 的 `availability.state` 置为 `unavailable`
- 不下线 catalog,只下线 tool 可见性

### 14.5 Plugin 与 MCP 的能力差异

| 能力 | Plugin | MCP |
|---|---|---|
| 贡献 Tool | ✅ | ✅ |
| 贡献 Skill | ✅ | ❌ |
| 贡献 Schema | ✅ | ❌ |
| 贡献 Profile | ✅ | ❌ |
| 贡献 Pack | ✅ | 虚拟 pack(自动) |
| 沙箱 | iframe | 进程外 |
| 用户 install | marketplace / URL | 管理员配置 |
| risk=destructive tool | ❌ | ❌ |

---

## 15. 可观测性 (Telemetry)

### 15.1 必发事件

每个 agent run 至少发出以下结构化事件:

```ts
type AgentEvent =
  | { type: 'profile.resolved'; runId: string; profile: ProfileResolutionTrace }
  | { type: 'trigger.evaluated'; runId: string; workflowId: string; matched: boolean; matchedTriggerKind?: SkillTrigger['kind'] }
  | { type: 'prompt.composed'; runId: string; personaId: string|null; policyIds: string[]; workflowIds: string[]; charCount: number; degraded?: 'dropped_policies'|'dropped_workflows'|'dropped_examples' }
  | { type: 'tool.call.attempted'; runId: string; toolName: string; risk: ToolDefinition['risk'] }
  | { type: 'tool.call.policy_decision'; runId: string; toolName: string; decision: 'allow'|'deny'|'approval_required'; reason?: string }
  | { type: 'approval.requested'; runId: string; toolName: string; argsPreview: unknown }
  | { type: 'approval.resolved'; runId: string; toolName: string; outcome: 'approved'|'approved_with_edit'|'denied'|'timeout' }
  | { type: 'tool.call.executed'; runId: string; toolName: string; ok: boolean; durationMs: number; errorCode?: string }
  | { type: 'catalog.reload'; catalogVersion: string; outcome: 'ok'|'rolled_back'; lintErrors?: number }
  | { type: 'plugin.installed'; pluginId: string; packId: string }
  | { type: 'plugin.uninstalled'; pluginId: string }
```

### 15.2 关联与采样

- 所有事件带 `runId`(单次 agent 调用)和 `sessionId`(用户会话)
- `profile.resolved` 必发(每次启动)
- `trigger.evaluated` / `prompt.composed`:必发
- `tool.call.*`:必发
- 采样:`tool.call.executed` 的 success=true 案例可配置 1/N 采样;失败永远全采

### 15.3 用途

- **调试 trigger 误命中**:`trigger.evaluated` 提供匹配链
- **回放 prompt**:`prompt.composed` 写入 `runId` 对应的 trace 存储,可重建 system prompt
- **分析 policy 拒绝率**:`tool.call.policy_decision` 聚合
- **审计 approval 决策**:`approval.resolved` 长期留存(合规)

### 15.4 PII / 安全约束

- `argsPreview` 在 `approval.requested` 中只保留前 200 字节,且对 `risk: 'write'|'generate'|'destructive'` 类工具做脱敏(用户名、邮箱、token 等)
- prompt 全文不进 telemetry,只进 `runId` 的隔离 trace 存储,保留 30 天后清理(配置可调)

---

## 16. 测试约定

### 16.1 单元测试边界

| 层 | 测试对象 | 工具 |
|---|---|---|
| Schema | `jsonSchema` 与 `examples[].content` 一致 | ajv |
| Tool | inputSchema 形状校验 + handler 单测 | jest + ajv |
| Skill | instructionTemplate 占位符可解析(用 mock registry) | snapshot |
| Pack | requires/conflicts 解析 | catalog linter 单测 |
| Profile | merge 函数三层 fixture | jest |
| Runtime | trigger evaluator 全 trigger kind 覆盖 | jest |

### 16.2 集成测试

`src/__tests__/integration/` 至少覆盖:

1. **每个 mode profile** 启动一次,跑一次 `composePrompt`,snapshot 测试输出
2. **每个 workflow** 至少一组 `(uiContext, message) → triggers matched` 用例
3. **plugin install / uninstall** 全流程(install 通过 → use tool → uninstall → tool 不可见)
4. **hot-reload 回滚**:故意提交一个会被 linter 拒绝的 plugin pack,验证回滚
5. **approval 流程**:LLM 调一个 `approval=always` 的 tool,前端模拟 approve/deny

### 16.3 Catalog snapshot 测试

`apps/agent/src/__tests__/catalog/__snapshots__/` 存放每个 mode profile 拼好的 system prompt snapshot,任何 catalog 改动让 snapshot diff 浮现,review 必看。

snapshot 文件命名:`<modeAlias>--<scenario-name>.snap.md`,例:`project-orchestration--no-context.snap.md`。

### 16.4 Plugin 兼容性测试

平台维护一个**官方 plugin 测试套**,plugin 作者可在本地跑:

```bash
movcli plugin test ./my-plugin
```

套件检查:manifest 合法、tool inputSchema 合法、bundle 能加载、handler 对每个 inputSchema 都能返回符合 outputSchema 的结果。

---

## 17. 公开扩展点 (Extension Points)

供 plugin 作者或下游 fork 引用,**这是平台对外承诺的稳定 API**(semver 保护)。

### 17.1 Plugin SDK 类型

```ts
// @movscript/plugin-sdk 导出
export type {
  DraftSchemaDefinition,
  ToolDefinition,
  ToolErrorCode,
  SkillDefinition,
  PersonaSkill,
  WorkflowSkill,
  PolicySkill,
  SkillTrigger,
  ContextSelector,
  CapabilityPack,
  AgentProfile,
  ModelBinding,
  PluginPackManifest,
}

export function definePlugin(manifest: PluginPackManifest): PluginPackManifest
export function defineTool<I, O>(t: ToolDefinition & { handler: (input: I) => Promise<O> }): ToolDefinition
export function defineWorkflow(w: WorkflowSkill): WorkflowSkill
export function definePolicy(p: PolicySkill): PolicySkill
export function definePersona(p: PersonaSkill): PersonaSkill
```

### 17.2 ModelClientAdapter 接口

第三方接入新 LLM provider:

```ts
export interface ModelClientAdapter {
  provider: string
  supportsTools: boolean
  call(input: {
    systemPrompt: string
    messages: ChatMessage[]
    tools: ToolDefinition[]
    model: ModelBinding
  }): AsyncIterable<ModelStreamChunk>
}
```

注册方式:`registerModelAdapter(adapter)`(只在 plugin 初始化阶段可调)。

### 17.3 Linter 钩子

Plugin 可注册额外 linter rule(只对自己 namespace 生效):

```ts
export interface CatalogLintRule {
  id: string                          // 'acme.lint.no_unsafe_keywords'
  scope: 'plugin' | 'global'         // plugin only allowed
  check(ctx: LintContext): LintIssue[]
}
```

### 17.4 Trigger Kind 扩展

平台不允许 plugin 增加 trigger kind(避免触发求值不可预测)。如需新触发方式,plugin 应贡献一个 runtime tool,workflow 调用该 tool + 用 `intent` trigger 由前端发出。

### 17.5 不变 API

以下接口标记为**永不破坏性变更**(major bump 平台版本时也保持兼容):

- `DraftSchemaDefinition`, `ToolDefinition`, `SkillDefinition` 的字段集(可加新可选字段,不可删/改类型)
- `definePlugin` / `defineTool` 等 SDK 顶层函数签名
- `POST /api/agent/plugins` install 协议
- `AgentEvent` 类型的现有事件(可加新 type)

---

## 18. 开放问题与显式不在范围

### 18.1 显式不在范围(本次重构不解决)

| 项 | 原因 |
|---|---|
| Skill 跨语言(Python skill / Lua skill) | 当前只支持 JS skill instructionTemplate,不开放 DSL |
| Profile 继承(`extends: 'parent-profile'`) | 故意保持扁平 merge,避免 diamond inheritance 复杂度 |
| 多 agent 协作 / agent-to-agent 调用 | 单 agent 框架,跨 agent 走 backend RPC 而非 catalog |
| A/B variant 直接在 profile 层面 | 用 plugin 提供多版本 workflow + intent 路由实现 |
| 端到端可编辑 prompt(让用户改 instructionTemplate) | 走 plugin/fork,不开放 runtime 编辑 |
| Real-time skill marketplace 动态拉取 | 当前 install 是离散事件,不订阅远端 |

### 18.2 待定决策(需后续 RFC)

1. **Skill 输出 schema**:workflow 的 `outputContract` 当前是自由文本。是否升级为结构化 outputSchema,让前端可机器解析 agent 输出?
2. **Cost / 配额按 profile 计费**:多模型路由后,如何按 profile-level 配额限流?
3. **Plugin 间消息总线**:plugin A 想让 plugin B 知道一件事(如"用户改了项目"),目前只能各自轮询。是否引入 plugin event bus?
4. **Schema 演进的迁移工具**:`v1 → v2` 时,已有 draft 怎么自动迁移?目前只能 plugin 写迁移代码,平台未提供框架。
5. **Persona 多语言**:`instructionTemplate` 当前是单一字符串。是否引入 `i18n` 结构?

### 18.3 Plugin 生态留白

平台目前不规约的部分(留给 plugin 生态自己长出):

- Plugin 之间的最佳实践共享格式
- 第三方 Pack 的语义化分类(reviewer pack? translator pack?)
- Profile 的"模板市场"
- LLM provider 之外的 ML 能力接入(本地 SLM、embedding service 等)

---

## 19. 实施时的最小可工作切片

下面只列分片顺序,作为重构落地参考(不是兼容路径,每一步切完旧实现即可删):

1. **Schema 包重构**:把现有 `packages/draft-schemas/src/index.ts` 拆成每个 schema 一个目录,写 `prompt-summary.md` 和 `schema.json`;补 `status` / `supersededBy` 字段。
2. **Tool 重构**:每个 tool 一个文件,移除 description 中的 skill 用语,补充 `capability` / `inputSchema` / `errorCodes` 字段;加 `source` 区分。
3. **Skill 重构**:把现有 skill 按 kind 拆到 `skills/{persona,workflow,policy}/`;把 instructionTemplate 中的 schema/tool 复述替换成占位符;`appliesWhen` → `triggers`。
4. **Persona 析出**:把 `MODE_CONFIGS.soul` 字符串与 `DEFAULT_AGENT_MANIFEST.soul` 落地为独立 persona skill 文件。
5. **Pack 重构**:把 `bundles/` 改名为 `packs/`,更新字段(`version` / `source` / `requires` / `conflicts`)。
6. **Profile 重构**:把 `DEFAULT_AGENT_MANIFEST` 和 `MODE_CONFIGS` 全部搬到 `profiles/`;移除 `permissions` 字段。
7. **Runtime 重构**:拆 `pluginCatalog.ts` 成 `catalog/loader.ts` + `catalog/registry.ts` + `profiles/resolveProfile.ts` + `skills/promptComposer.ts`;新增 `profiles/profileMerge.ts`、`skills/triggerEvaluator.ts`。
8. **Approval Gateway**:新增 `tools/approvalGateway.ts`,把 `applyToolPolicy` 中"是否需要 approval"逻辑提到这里,前端接事件。
9. **Skill-scoped Tool Gating**:`tools/toolCatalogResolver.ts` 加入 §6.8 的 scopeFilter。
10. **Linter**:实现 `catalog/linter.ts` 全部 §11 规则,server 启动时跑一遍;hot-reload 跑一遍。
11. **Hot-Reload 控制器**:实现 `catalog/reloader.ts`,落地 `_staging/` 目录、weakref snapshot。
12. **Plugin 集成**:实现 `plugins/pluginInstaller.ts` / `pluginRegistry.ts`,接受 `PluginPackManifest`。
13. **MCP 适配**:把现有 MCP adapter 改造成贡献虚拟 pack 的形式(`source: 'mcp'`)。
14. **Telemetry**:实现 §15.1 事件发射,写入现有 telemetry pipeline。
15. **Snapshot 测试**:每个 mode profile 拼出来的 system prompt 落地 snapshot 文件。
16. **删除旧路径**:`src/manifest/` 全部删除,`bundles/` 目录删除,旧 `appliesWhen` 字段删除,`manifest.permissions` 字段删除。

每一步切完跑测试,目标是没有任何 skill 还在引用 JSON 骨架字面量、没有任何 tool description 还在写 skill 用语、没有任何 manifest 还在内联 skill body、没有任何 profile 还在手写 permissions。

---

## 20. 一句话回答"为什么这么切"

> Schema 回答"长什么样",Tool 回答"能做什么",Skill 回答"该怎么思考和表达",Pack 回答"什么一起发布",Profile 回答"现在这个 agent 启用了什么"。一层只做一件事,引用永远单向,边界永远显式。
