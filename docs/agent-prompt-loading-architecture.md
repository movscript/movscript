# Agent 提示词与按需知识加载架构设计

本文定义 MovScript Agent 后续的提示词、skills、tools、knowledge/reference 资料的加载与注入架构。目标是让 Agent 保持稳定行为边界，同时避免把大量领域知识默认塞进模型上下文。

## 1. 背景

当前 Agent 已经有 catalog 体系：

- `pack` 负责注册一组 skills、tools、schemas。
- `profile` 负责启用 pack、选择 persona、设置 limits。
- `skill` 分为 `persona`、`policy`、`workflow`。
- runtime 每轮根据用户消息、UI context 和 trigger 选择 active workflows。
- prompt composer 只把 persona、policies、active workflows 编进 system prompt。

也就是说，当前并不是把整个 pack 都发送给模型，而是：

```text
启动/重载时：
  全量读取 enabled catalog resources 到内存 registry

每次 run：
  profile -> enabled packs -> candidate skills/tools
  message/context -> active workflows
  persona + policies + active workflows -> system prompt
```

这个设计已经避免了“整个 pack 直接进 prompt”，但还没有解决“大体量领域知识”的问题。一旦把分镜理论、短剧节奏、镜头语言等内容直接写进 workflow instruction，只要 workflow 被激活，这些大内容仍然会整段进入 prompt。

因此后续需要把 `skill` 和 `knowledge` 明确拆开：

```text
Skill = 任务行为、流程、边界、检索策略
Knowledge = 大体量领域资料，按需 search/read
```

## 2. 设计目标

1. Prompt 默认保持小而稳定。
2. Agent 总是知道当前能力边界、事实来源和工具使用规则。
3. 大体量知识不随 pack 或 workflow 默认进入 prompt。
4. 领域知识必须通过只读检索工具按需读取，并留下可追溯来源。
5. Workflow 只描述“什么时候需要查什么”，不嵌入大段知识正文。
6. Tool schema 和 tool result 仍然是运行时事实来源。
7. Profile 能控制默认能力面，workflow trigger 能控制任务行为面，knowledge retrieval 能控制资料面。

## 3. 分层模型

推荐把 Agent 上下文分为五层。

```text
Level 0 Runtime Contract
  沙箱、审批、工具调用、状态边界、命令契约

Level 1 Runtime Context
  当前页面、项目、production、selection、附件、memory index

Level 2 Behavior
  persona、policy、active workflow instruction

Level 3 Retrieved Context
  memory 内容、draft/model contract、项目只读查询结果、knowledge 检索结果

Level 4 Tool Results
  本轮工具调用返回的事实
```

各层职责：

| 层 | 进入 prompt 的方式 | 允许内容 | 不允许内容 |
| --- | --- | --- | --- |
| Level 0 | 每轮默认注入 | 运行规则、审批边界、工具协议 | 业务知识正文 |
| Level 1 | 每轮默认注入小摘要 | 当前 focus、selection、memory index | 大量项目数据 |
| Level 2 | 按 profile/trigger 注入 | persona、policy、workflow runbook | 大体量领域知识 |
| Level 3 | 按需工具读取 | 精确命中的资料片段和来源 | 未请求的大资料全集 |
| Level 4 | 工具调用后进入对话 | 工具结果事实 | 模型臆测的事实 |

## 4. Catalog 加载策略

Catalog 仍然可以启动时全量读取到内存 registry，因为 catalog 定义是轻量索引，不是模型上下文。

```text
loadAgentPluginCatalog()
  -> load packs
  -> load profiles
  -> load skill manifests + instruction files
  -> load tool manifests
  -> build layered registry
  -> lint catalog
```

这里的“加载”只表示 runtime 能发现、校验、选择资源，不表示发送给模型。

实际发送给模型的 prompt 应继续由 runtime selection 决定：

```text
resolveRuntimeLayers()
  -> resolve profile
  -> infer intents
  -> collect policies
  -> evaluate workflow triggers
  -> select active workflows by maxActiveWorkflows
  -> compose prompt parts
```

约束：

- Pack 可以注册很多 workflow，但每轮只激活有限数量。
- Policy 可以默认注入，但必须短小，负责边界和路由。
- Workflow instruction 必须保持 runbook 化，不写大知识库。
- `systemPromptCharLimit` 是最后保护，不是主要架构手段。

## 5. Skill 设计规范

### 5.1 Persona

Persona 只定义稳定角色视角：

- 关注什么。
- 如何判断优先级。
- 输出风格倾向。

Persona 不写：

- 具体 workflow 步骤。
- tool 参数。
- schema 字段字典。
- 领域知识正文。

### 5.2 Policy

Policy 定义跨任务的稳定 guardrails：

- 对象层级。
- 事实来源。
- 审批边界。
- draft / proposal / candidate / generation job / apply 的状态边界。
- 缺上下文时的回退链。
- 何时读取 memory、catalog、knowledge、project context。

Policy 不写：

- 某个任务的详细执行步骤。
- 大量案例。
- 领域教材。

### 5.3 Workflow

Workflow 是某一类任务的 runbook：

- 目标。
- 输入锚点。
- 前置条件。
- 允许工具。
- 缺口判断。
- 执行步骤。
- 输出合同。
- 禁止事项。
- 知识检索策略。

Workflow 可以写“查什么”，但不要写“全部知识正文”。

示例：

```md
知识检索：
- 如果用户要求优化分镜节奏、镜头节拍、钩子或情绪推进，先用 `movscript_search_knowledge` 查询 domain=storyboard。
- 查询词应包含当前任务层级、片段类型、用户目标，例如 `storyboard hook pacing short drama opening`。
- 只读取 top 3 命中片段；引用结果中的 `knowledgeId` 和 `title`。
- 如果没有命中，不得编造分镜理论，改为标记为建议或向用户询问风格偏好。
```

## 6. Knowledge / Reference 层

新增独立的 knowledge/reference 层，负责大体量资料。

### 6.1 资源形态

建议文件结构：

```text
apps/agent/catalog/knowledge/
  storyboard/
    index.knowledge.json
    chunks/
      storyboard-rhythm.md
      shot-size-system.md
      hook-patterns.md
  short-drama/
    index.knowledge.json
    chunks/
      episode-opening.md
      reversal-patterns.md
```

也可以放在用户目录：

```text
$MOVSCRIPT_AGENT_KNOWLEDGE_DIR/
```

### 6.2 Knowledge manifest

```json
{
  "id": "movscript.knowledge.storyboard",
  "version": "1.0.0",
  "name": "Storyboard Knowledge",
  "domain": "storyboard",
  "description": "分镜、镜头节拍、关键帧和内容单元规划知识。",
  "resources": [
    "chunks/storyboard-rhythm.md",
    "chunks/shot-size-system.md",
    "chunks/hook-patterns.md"
  ],
  "tags": ["storyboard", "shot", "content_unit", "keyframe"]
}
```

### 6.3 Knowledge chunk

每个 chunk 需要可索引、可追踪、可裁剪。

```md
---
id: storyboard.rhythm.basic
domain: storyboard
title: 分镜节奏基础
tags:
  - rhythm
  - content_unit
  - hook
summary: 用于判断短剧内容单元中的节奏推进、信息释放和情绪转折。
---

正文内容...
```

### 6.4 索引字段

runtime 应把每个 chunk 解析成：

```ts
interface KnowledgeChunk {
  id: string
  packId?: string
  domain: string
  title: string
  tags: string[]
  summary: string
  content: string
  sourcePath?: string
  updatedAt?: string
}
```

第一版可以用关键词和 CJK n-gram 搜索；后续再加 embedding/vector index。

## 7. Knowledge 工具

新增两个只读 runtime tools。

### 7.1 `movscript_search_knowledge`

用途：返回知识命中摘要，不返回长正文。

Input:

```json
{
  "query": "分镜 钩子 开场 节奏",
  "domain": "storyboard",
  "tags": ["hook", "rhythm"],
  "limit": 5
}
```

Output:

```json
{
  "results": [
    {
      "id": "storyboard.rhythm.basic",
      "domain": "storyboard",
      "title": "分镜节奏基础",
      "summary": "用于判断短剧内容单元中的节奏推进、信息释放和情绪转折。",
      "score": 12.5,
      "tags": ["rhythm", "content_unit", "hook"]
    }
  ]
}
```

### 7.2 `movscript_get_knowledge`

用途：按 id 读取知识片段正文，可限制字符数。

Input:

```json
{
  "id": "storyboard.rhythm.basic",
  "maxChars": 4000
}
```

Output:

```json
{
  "id": "storyboard.rhythm.basic",
  "domain": "storyboard",
  "title": "分镜节奏基础",
  "summary": "用于判断短剧内容单元中的节奏推进、信息释放和情绪转折。",
  "content": "正文内容...",
  "sourcePath": "apps/agent/catalog/knowledge/storyboard/chunks/storyboard-rhythm.md"
}
```

### 7.3 Tool 可见性

有两种选择：

方案 A：作为基础检索工具始终可见。

适合知识查询是 Agent 通用能力时使用。需要把两个工具加入 `BASE_RETRIEVAL_TOOLS`。

方案 B：仅在相关 workflow 激活时可见。

适合控制工具面更窄的情况。把工具放进这些 workflow 的 `toolRefs`：

- `movscript.workflow.content-unit-proposal`
- `movscript.workflow.content-unit-media-proposal`
- `movscript.workflow.storyboard-gap-review`
- 未来新增的 `movscript.workflow.storyboard-proposal`

推荐第一阶段用方案 B，避免所有任务都看到知识工具。

## 8. Pack 与 Knowledge 的关系

Pack 不应直接把 knowledge 正文注入 prompt。Pack 只注册 knowledge collection 的存在和工具权限。

建议扩展 `CapabilityPack`：

```ts
interface CapabilityPack {
  resources?: {
    skills?: string[]
    tools?: string[]
    knowledge?: string[]
  }
  knowledge?: string[]
}
```

示例：

```json
{
  "id": "movscript.pack.storyboard",
  "version": "1.0.0",
  "name": "Storyboard Planning",
  "resources": {
    "skills": ["movscript/workflow/proposal/storyboard"],
    "tools": ["agent-core/knowledge"],
    "knowledge": ["storyboard"]
  },
  "tools": [
    "movscript_search_knowledge",
    "movscript_get_knowledge"
  ],
  "skills": [
    "movscript.workflow.storyboard-proposal"
  ],
  "knowledge": [
    "movscript.knowledge.storyboard"
  ]
}
```

加载含义：

- `resources.knowledge` 只告诉 runtime 去哪里建索引。
- `knowledge` 只注册 collection id。
- 模型只有在调用 search/get 工具后才看到具体知识内容。

## 9. Prompt 注入规则

### 9.1 默认注入

每轮默认注入：

- runtime contract
- focus snapshot
- tool use principle
- persona
- policies
- active workflows
- runtime warnings

不要默认注入：

- 全量 pack 内容。
- 未触发 workflow。
- knowledge 正文。
- memory 正文。
- 项目全量数据。
- draft 全量列表和正文。

### 9.2 按需注入

以下内容只通过工具按需进入：

- `movscript_search_memories` / `movscript_get_memory`
- `movscript_get_draft_model`
- `movscript_read_project_scripts`
- `movscript_query_production_context`
- `movscript_query_creative_references`
- `movscript_query_asset_slots`
- `movscript_search_knowledge`
- `movscript_get_knowledge`

### 9.3 检索结果使用规则

Agent 使用 knowledge 时必须：

- 说明使用了哪些 knowledge id 或 title。
- 区分知识建议和项目事实。
- 不把知识库内容当成当前项目已经存在的设定。
- 不把通用分镜方法当成用户已确认风格。
- 如果知识结果互相冲突，以当前项目标准、用户输入、工具结果优先。

## 10. Runtime 流程

推荐最终流程：

```text
Server startup
  -> load catalog packs/profiles/skills/tools
  -> load knowledge manifests
  -> build knowledge index
  -> build layered registry

Run setup
  -> get focus
  -> load memory index only
  -> resolve runtime layers
  -> resolve visible tools
  -> build system prompt

Model execution
  -> model decides whether context is enough
  -> model calls narrow read/search tools
  -> retrieved content returns as tool result
  -> model creates draft / answer / generation job

Final answer
  -> report source boundaries
  -> report artifacts and ids
  -> preserve unresolved questions
```

## 11. 分镜知识示例接入

新增 pack：

```text
apps/agent/catalog/packs/storyboard.pack.json
```

新增 workflow：

```text
apps/agent/catalog/skills/movscript/workflow/proposal/storyboard/storyboard-proposal/
  skill.workflow.json
  instruction.md
```

新增 knowledge：

```text
apps/agent/catalog/knowledge/storyboard/
  index.knowledge.json
  chunks/
    rhythm.md
    shot-size.md
    hook.md
    keyframe.md
```

Workflow instruction 中只写：

```md
知识检索：
- 涉及镜头节奏、分镜结构、关键帧、钩子设计时，先搜索 domain=storyboard。
- 先 search，只有命中摘要不足以完成判断时才 get。
- 最多读取 3 条，每条 maxChars 4000。
- 输出时注明使用的知识标题，并说明这是通用建议，不是项目事实。
```

不要写：

```md
这里开始粘贴完整分镜教材...
```

## 12. 迁移计划

第一阶段：文档和约束

1. 明确 skill instruction 不允许嵌入大知识正文。
2. 给 content-unit 和 storyboard-gap-review workflow 增加“知识检索策略”段落。
3. 在 policy 中补充 knowledge/source 边界。

第二阶段：只读知识工具

1. 新增 knowledge loader。
2. 新增 `KnowledgeStore` / `KnowledgeManager`。
3. 新增 `movscript_search_knowledge`。
4. 新增 `movscript_get_knowledge`。
5. 加入 tool catalog 和 runtime executor。

第三阶段：pack 集成

1. 扩展 pack schema 支持 `resources.knowledge`。
2. 扩展 loader 记录 knowledge resource paths。
3. 扩展 catalog inspection，允许查看 knowledge collection summary。
4. 默认 profile 可选择是否启用 storyboard pack。

第四阶段：质量和检索升级

1. 加关键词 scoring 和 CJK n-gram。
2. 加 chunk size lint。
3. 加 prompt/result char limit。
4. 后续可加 embedding index。

## 13. 验收标准

一个正确的实现应满足：

- 默认 chat 不包含分镜知识正文。
- 未触发分镜/content-unit workflow 时，不暴露或不建议分镜知识工具。
- 触发相关 workflow 时，prompt 只包含检索策略，不包含知识全集。
- Agent 能通过 search/get 读取分镜知识片段。
- 工具结果包含 knowledge id、title、summary、source。
- 最终回复能说明哪些结论来自项目事实，哪些来自知识建议。
- `systemPromptCharLimit` 不再因为知识正文而频繁触发。
- catalog inspection 能说明 pack 注册了哪些 knowledge collection，但不会返回全部知识正文。

## 14. 核心原则

最终原则可以压缩成一句话：

```text
Pack 决定能力可发现性，profile 决定能力启用面，trigger 决定本轮行为面，tool 决定事实读取面，knowledge 只通过检索结果进入上下文。
```

