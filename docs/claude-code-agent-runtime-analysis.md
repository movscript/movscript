# Claude Code Agent Runtime 架构借鉴分析

本文从 agent runtime 视角阅读 `claude-code-rev`，并对照 `apps/agent` 当前实现，提炼可吸收到 MovScript Agent 的设计结论。

`claude-code-rev` 是 source map 还原版，不应被当作可直接复制的上游源码。这里关注的是已经能从当前代码树证明的架构思想：模型循环、工具协议、权限管线、上下文管理、子 agent、运行状态与恢复。

## 结论概览

Claude Code 的本质不是 CLI，而是一个 agent kernel：

```text
user input
  -> context/runtime state projection
  -> model request
  -> tool_use parsing
  -> policy + permission + hooks
  -> tool execution
  -> tool_result shaping + context budget
  -> next model turn or terminal state
```

CLI、SDK、远程会话、子 agent 都围绕同一个 kernel 组织。UI 只是这个 kernel 的一个投影。

`apps/agent` 已经具备相似骨架：`executeRuntimeRun` 负责 run 生命周期，`runAgentGraph` 负责 `model -> policy -> execute` 循环，catalog/profile/pack 负责能力激活，context manager 负责 prompt 分层，tool policy 负责硬边界。真正值得吸收的不是 Claude Code 的庞大命令系统，而是它在工具协议、上下文预算、并发/中断、恢复语义、子 agent 组织上的细节。

## 代码量为什么差这么多

当前统计口径：只统计 TypeScript/JavaScript 源码文件，包含 `*.ts`、`*.tsx`、`*.js`、`*.jsx`、`*.mjs`、`*.cjs`；`apps/agent/catalog` 单独统计全部 catalog 文本资源。统计时间为当前工作树。

| 范围 | 行数 | 相对 Claude Code `src` |
| --- | ---: | ---: |
| `../claude-code-rev/src` | 516,097 | 100% |
| `apps/agent/src` 含测试 | 95,541 | 18.5% |
| `apps/agent/src` 不含 `*.test.ts` / `*.test.tsx` | 47,095 | 9.1% |
| `apps/agent/catalog` | 4,613 | 0.9% |
| `apps/agent/src` 不含测试 + `apps/agent/catalog` | 51,708 | 10.0% |

换句话说，如果只看运行时代码加 catalog，MovScript Agent 当前大约是 Claude Code `src` 的十分之一；如果把测试也算进去，大约是五分之一。

统计命令：

```bash
rg --files ../claude-code-rev/src -g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' -g '*.mjs' -g '*.cjs' | xargs wc -l | tail -1
rg --files apps/agent/src -g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' -g '*.mjs' -g '*.cjs' | xargs wc -l | tail -1
rg --files apps/agent/src -g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' -g '*.mjs' -g '*.cjs' -g '!*.test.ts' -g '!*.test.tsx' | xargs wc -l | tail -1
rg --files apps/agent/catalog | xargs wc -l | tail -1
```

Claude Code 长，不只是因为功能多，还因为它把“模型能操作真实本地环境”需要的产品细节都放进了 runtime：

| Claude Code 模块 | 约代码量 | 为什么长 |
| --- | ---: | --- |
| `src/utils` | 18.1 万行 | shell/bash/powershell 解析、权限、插件、settings、telemetry、swarm、git、sandbox、secure storage、native installer、Chrome/computer use 等大量跨切面基础设施。 |
| `src/components` | 8.2 万行 | 终端 UI 是完整产品：消息渲染、diff、权限弹窗、设置、MCP、memory、tasks、wizard、design system。 |
| `src/services` | 5.5 万行 | API provider、MCP、compact、analytics、LSP、plugins、settings sync、team memory、policy limits 等 runtime 服务。 |
| `src/tools` | 5.1 万行 | 每个工具都有 schema、prompt、权限、UI、执行、错误、进度、结果处理。Bash/PowerShell/AgentTool 单独就是大模块。 |
| `src/commands` | 2.7 万行 | CLI slash command/本地命令体系，覆盖 login、mcp、memory、review、diff、doctor、resume、status 等产品操作。 |
| `src/ink` + `src/screens` | 2.6 万行 | REPL/终端渲染、输入、布局、事件循环。 |
| `src/hooks` | 1.9 万行 | tool permission、notification、UI/runtime hook 组合。 |
| `src/bridge` + `src/remote` + `src/cli` | 2.6 万行 | remote control、session bridge、background session、headless/SDK transport。 |

`apps/agent` 当前代码量集中在：

| MovScript 模块 | 不含测试约代码量 | 当前承担 |
| --- | ---: | --- |
| `src/application` | 1.3 万行 | HTTP/service runtime 编排、run lifecycle、stream、recovery、thread/plan/draft bridge。 |
| `src/state` | 5.2 千行 | thread/run/plan/task/trace 状态模型和投影。 |
| `src/domains` | 4.6 千行 | 领域 tool handler 与 message/trace/domain logic。 |
| `src/contextManager` | 3.1 千行 | prompt 分层、context budget、tool result context、ledger。 |
| `src/orchestration` | 2.8 千行 | agent graph、tool execution、model trace、generation monitor。 |
| `src/catalog` | 2.5 千行 | profile/pack/manifest/tool/skill catalog。 |
| `src/tools` | 0.8 千行 | tool registry、policy、authorization、visibility。 |
| `src/runtimeWork` | 0.6 千行 | background work abstraction。 |

更直观的功能域对比：

| 功能域 | Claude Code 代码量信号 | MovScript 当前代码量信号 | 差异含义 |
| --- | ---: | ---: | --- |
| 工具 runtime | `src/tools` 约 5.1 万行，另有 `src/services/tools` 约 3.1 千行、`src/utils/bash` 约 1.2 万行、`src/utils/permissions` 约 9.4 千行 | `src/tools` 约 0.8 千行，`src/orchestration` 约 2.8 千行 | MovScript 有工具注册和 policy，但缺少大量 tool-specific execution、权限、shell/外部工具边界细节。 |
| 上下文/压缩 | `src/services/compact` 约 4.0 千行，加 query loop 内预算/compact/collapse 逻辑 | `src/contextManager` 约 3.1 千行 | MovScript prompt 分层清晰，但长期 summary、context collapse、prompt-too-long recovery 还轻。 |
| MCP/外部服务 | `src/services/mcp` 约 1.2 万行 | `src/adapters` 约 0.4 千行，`ports/tools` 很薄 | Claude Code 处理连接、auth、transport、resource、tool result 截断；MovScript 目前主要是 gateway 抽象。 |
| 子 agent/多 agent | `src/tools/AgentTool` 约 6.8 千行，`src/utils/swarm` 约 7.6 千行，`src/tasks` 约 3.3 千行 | `src/runtimeWork` 约 0.6 千行，`SubagentRunWorkProvider` 是轻量 provider | MovScript 已有正确抽象，但 progress、隔离、结果 artifact、恢复还需要补。 |
| UI/交互 | `src/components` 约 8.2 万行，`src/ink` + `src/screens` 约 2.6 万行 | Electron 前端在别处，agent 服务内没有对应大 UI 层 | 这部分不应在 `apps/agent` 复制，应该由 frontend runtime console/trace UI 承担。 |
| 命令系统 | `src/commands` 约 2.7 万行 | HTTP API + runtime bridge | 不需要照搬 slash command forest，但需要保留统一 run entrypoint 和 local command contract。 |
| 可观测性/恢复 | `src/utils/telemetry`、`services/analytics`、session storage、QueryEngine、remote/bridge 合计很大 | `src/telemetry` 约 1 千行，application trace/recovery 分散在 1.3 万行 application 内 | MovScript 已有 trace/metrics 骨架，但 debug bundle、replay、resume 防重复执行仍需加强。 |

这说明 `apps/agent` 现在的骨架已经不少，但很多“完善度”还在轻量层：

- 工具系统目前主要是 metadata + policy + handler dispatch，Claude Code 是完整 syscall runtime。
- 上下文系统已有产品语义边界，但还没有 Claude Code 那种多阶段 compact/collapse/recovery。
- 长任务已有 `RuntimeWorkManager`，但子 agent 进度、结果 ref、隔离、恢复还没到 Claude Code 级别。
- UI/CLI/terminal 复杂度不需要复制，因为 MovScript 主要由 Electron 产品承载。

所以差距不是“少写了几十万行业务逻辑”，而是 Claude Code 把大量边缘场景和跨平台运行细节都产品化了。MovScript 应该补 runtime 完善度，不应追求相同行数。

## Claude Code 的核心分层

### 1. 启动层：快速分流，避免全量加载

`../claude-code-rev/src/entrypoints/cli.tsx` 在加载完整 CLI 前先处理 fast path：

- `--version`
- Chrome / Computer Use MCP server
- remote-control / bridge
- daemon / background session
- template job
- worktree + tmux
- `--bare` simple mode

设计思想：入口层只做分流和最低限度初始化，真正 runtime 延后加载。这样 CLI 工具可以拥有大量能力，但常见快速命令不会付出完整启动成本。

对 MovScript 的启发：`apps/agent` 是常驻 HTTP 服务，不需要照搬 CLI fast path；但可以借鉴“按路径延迟初始化”的思想。例如 `/health`、`/tools`、`/capabilities` 不应触发 model/auth/heavy MCP 初始化；run 执行路径才加载完整上下文。

### 2. Agent loop：query generator 是运行时中心

Claude Code 的核心是 `../claude-code-rev/src/query.ts` 中的 `query()` 异步生成器。它不是一次性函数，而是事件流：

- yield request start、assistant streaming、tool progress、tool result、compact boundary、terminal state。
- 每轮开始构建 message view。
- 先做 tool result budget、history snip、microcompact、context collapse、autocompact。
- 调模型。
- 如果模型返回 tool use，则执行工具并把结果写回消息流。
- 如果没有 tool use，则结束。

关键思想：

- agent turn 是可观察的事件流，不只是函数返回值。
- 模型上下文是每轮动态投影，不等于原始 transcript。
- 压缩、预算、恢复、工具结果摘要都是 loop 的内建职责。

MovScript 对应机制：

- `apps/agent/src/application/runtimeRunExecution.ts` 是 run 生命周期入口。
- `apps/agent/src/orchestration/agentGraph.ts` 用 LangGraph 明确拆成 `model -> policy -> execute`。
- `apps/agent/src/application/runtimeRunStreamEvents.ts`、`runtimeStreamBridge.ts`、trace/step 体系承担事件流投影。

判断：MovScript 的结构更产品化、更适合服务端；Claude Code 的 `query()` 更成熟地处理流式工具执行、压缩和错误恢复。

### 3. Tool 协议：工具是 agent 的 syscall

Claude Code 的 `Tool` 类型在 `../claude-code-rev/src/Tool.ts`，包含：

- `inputSchema` / `inputJSONSchema` / `outputSchema`
- `call()`
- `description()` 和 `prompt()`
- `isConcurrencySafe()`
- `isReadOnly()`
- `isDestructive()`
- `interruptBehavior()`
- `validateInput()`
- `checkPermissions()`
- `maxResultSizeChars`
- `shouldDefer` / `alwaysLoad`
- MCP metadata

这说明 Claude Code 不把 tool 当简单 function call，而是当 runtime syscall。工具元信息被多个系统使用：

- prompt 暴露
- tool search / deferred loading
- 权限判断
- 并发执行
- 中断处理
- 结果持久化和摘要
- UI 展示
- telemetry

MovScript 当前对应：

- `apps/agent/src/tools/toolRegistry.ts` 已有 `risk`、`permission`、`projectScoped`、`requiresApprovalByDefault`、`defaults`、`source`、`allowedRunRoles`、`requiresSkills`。
- 但缺少 Claude Code 式执行语义字段：`isConcurrencySafe`、`isReadOnly`、`isDestructive` 的细粒度函数、`interruptBehavior`、`maxResultSizeChars`、tool-level validation hook。

建议：保持 JSON catalog 作为产品能力声明，但在 runtime registry 派生更强的 execution metadata：

```text
RegisteredTool
  + execution:
      readOnly: boolean | predicate
      concurrencySafe: boolean | predicate
      destructive: boolean | predicate
      interruptBehavior: "cancel" | "block"
      maxResultChars: number
      timeoutMs: number
      validateInput?: runtime handler
```

### 4. 工具执行管线：执行前后都有 runtime 控制

Claude Code 的 `../claude-code-rev/src/services/tools/toolExecution.ts` 将一次工具调用拆成固定流程：

```text
find tool
  -> zod safeParse
  -> tool.validateInput
  -> pre-tool hooks
  -> permission resolution
  -> telemetry decision events
  -> tool.call
  -> result processing / persistence / truncation
  -> post-tool hooks
  -> tool_result message
```

关键细节：

- schema 错误会回传给模型，并在 deferred tool 未加载时提示先调用 ToolSearch。
- Bash 权限 classifier 会提前 speculative start，与 hook/permission 并行。
- hooks 可以改写 input、拒绝执行、追加上下文、阻止 continuation。
- 权限结果会被标准化为 allow / ask / deny。
- tool result 会经过 `processToolResultBlock`，大型结果可持久化并只给模型 preview。

MovScript 当前对应：

- `apps/agent/src/orchestration/toolExecutor.ts` 目前是：sandbox intercept -> runtime handler -> external/MCP gateway。
- `apps/agent/src/tools/toolPolicy.ts` 在执行前做授权、审批、projectScoped 补齐。
- `apps/agent/src/contextManager/toolResultContext.ts` 做 tool result context boundary 与摘要。

差距：

- 当前 tool executor 还不是完整“管线”：schema validation、tool-level validate、pre/post hooks、result persistence、permission decision telemetry 还比较分散或缺失。
- policy 在 graph 节点，executor 在执行节点；这是好事，但 executor 可以补足防御性二次校验。

建议：引入 `ToolExecutionPipeline`，保留现有 `executeTool` 作为内部执行阶段：

```text
normalize call
  -> validate schema
  -> validate runtime input
  -> apply policy decision
  -> maybe create interaction
  -> execute runtime/external
  -> shape result for model
  -> record trace/ledger
```

### 5. 并发与流式工具执行

Claude Code 有两套工具执行模式：

- `runTools()`：把 tool calls 分区，连续 concurrency-safe 工具并发，非安全工具串行。
- `StreamingToolExecutor`：模型流式输出 tool call 时即可入队执行；结果按工具出现顺序缓冲输出。

关键设计：

- 只读/搜索类工具可以并发。
- 写入类工具独占执行。
- Bash 失败会 abort sibling subprocess，但不直接 abort 整个 query。
- 用户中断时，根据 `interruptBehavior` 决定取消还是阻塞。
- 流式 fallback 时丢弃已启动工具结果，避免污染 transcript。

MovScript 当前对应：

- `runAgentGraph` 当前以模型轮次为单位执行工具。
- `apps/agent/src/orchestration/agentGraphExecutionPolicy.ts` 已有基础并发策略：`risk=read`、`core_work_get`、`core_work_list`、`core_work_wait` 可以并发。
- `RuntimeWorkManager` 支持 background work、wait、observe、cancel，适合长任务和子 agent。

建议：

- 把现有并发策略升级为 tool metadata 驱动：read/draft/ui 可并发，write/generate/destructive 串行。
- 对 generation/subagent 继续使用 `RuntimeWorkManager`，不要阻塞主 graph。
- 在 tool metadata 中表达 `interruptBehavior`，让取消 run 和用户补充输入有一致语义。

### 6. 上下文管理：prompt 是 runtime 构造的可信视图

Claude Code 在 query loop 内处理：

- relevant memory prefetch
- skill discovery prefetch
- tool result budget
- history snip
- microcompact
- context collapse
- autocompact
- prompt-too-long / max-output recovery

它的核心思想是：transcript 是事实记录，model context 是 runtime 投影。二者不是同一个东西。

MovScript 当前对应：

- `apps/agent/src/contextManager/modelContextBuilder.ts` 已经有清晰 prompt 层：
  - Runtime Contract
  - Source Boundary
  - Focus
  - Thread Continuity
  - Thread Runtime State
  - Command contract
  - Tool use
  - Skill Discovery
  - Activated Behavior
  - Runtime warnings
- `contextBudgeter.ts` 支持按优先级丢弃低优先级 skill、workflow、examples。
- `toolResultContext.ts` 对 oversized tool result 做 summary，并加 `contextBoundary` 防 prompt injection。
- `contextManager.ts` 有 context ledger、prompt hash、context bundle、retrieved refs。

判断：MovScript 的上下文架构方向比 Claude Code 更“产品语义化”，尤其 source/evidence boundary 很适合影视创作数据。需要补的是 Claude Code 式动态压缩、恢复与 tool-result 持久化策略。

建议：

- 把 thread summary / compacted history 做成 run 可复用的恢复资产，而不是每次仅在 prompt 阶段临时裁剪。
- 对 tool result 使用“inline summary + ref”模式：大结果写入 agent file/context store，模型只拿摘要和可重读 ref。
- 在 context bundle 中记录每次降级原因，前端可以解释“为什么某个 skill/history 没进上下文”。

### 7. Tool Search 与按需能力暴露

Claude Code 用 `ToolSearchTool` 和工具字段 `shouldDefer` / `alwaysLoad` 控制大工具集暴露。工具太多时，不把所有 schema 一次塞给模型，而是让模型先 search/select。

MovScript 当前对应：

- catalog/profile/pack 已经能从 enabled packs 推导可用工具和 skills。
- `core_skill_update` 支持运行中加载/卸载 agent skills。
- `Skill Discovery` prompt layer 已经列出 available/active skills。

建议：

- 把 `core_skill_update` 扩展成更完整的“能力发现/激活”协议。
- 区分三类能力：
  - always loaded：核心安全工具、plan、input。
  - discoverable：workflow/expertise。
  - hidden until activated：大量生成、候选、专业领域工具。
- 对未激活工具调用返回 repair hint，当前 `agentGraphSkillActivationRepair` 已经是正确方向。

### 8. 权限与审批：requires_action 是一等状态

Claude Code 的权限体系不是 prompt 约束，而是 runtime 强制：

- permission mode
- deny/allow/ask rules
- tool-specific `checkPermissions`
- classifier
- hooks
- interactive prompt / SDK prompt
- denial tracking

MovScript 当前对应：

- `applyToolPolicy` 支持 approval mode、sandbox mode、manifest grants、project scoped、run role。
- `requires_action` 可携带 `pendingApprovals` 和 `pendingInputRequests`。
- `/interactions/:id/approve`、`/interactions/:id/reject` 是服务化入口。

判断：MovScript 的审批状态比 Claude Code 更适合前端产品；Claude Code 的优势是权限判定链更细，且与工具执行强绑定。

建议：

- 把 `approval_required`、`input_required`、`auth_required`、`model_retry_required` 统一为 interaction 类型。
- 工具执行层即使收到已 policy allow 的调用，也应进行二次安全校验，避免未来绕过 graph policy。
- 对 destructive/generate 工具保留硬性不可自动批准规则，避免被 profile 配置误放大。

### 9. 子 agent 与后台任务

Claude Code 的 `AgentTool` 是一个特殊工具：主 agent 可以启动子 agent，同步/异步执行，支持 background、worktree 隔离、remote、teammate、progress、output file。

MovScript 当前对应：

- `RuntimeWorkManager` 抽象了 background work。
- `SubagentRunWorkProvider` 把子 agent run 作为 `subagent_run` work 创建、observe、cancel。
- `core_work_start/get/list/wait/cancel` 已把子 agent 和 generation job 纳入统一 runtime work。

判断：MovScript 这部分方向很好，甚至比 Claude Code 更贴合产品运行时。建议继续坚持“长任务都是 runtime work”，而不是把生成任务或 worker agent 伪装成普通同步 tool result。

可吸收点：

- 子 agent 输出要有稳定的 summary/result ref。
- planner 与 worker 权限不同，worker 默认更窄。
- 子 agent cancellation 应取消 subtree，而不是只取消 work handle。
- 子 agent progress 应进入 trace/stream，不只进入最终 result。

### 10. SDK/CLI/REPL 共享内核

Claude Code 用 `QueryEngine` 把 headless/SDK 会话状态从 UI 中抽出来：一个 conversation 一个 engine，多次 submitMessage 共享 messages、file cache、usage、permission denials。

MovScript 当前对应：

- 常驻服务天然有 `AgentStore`、thread/run/state。
- `runtimeRunExecution` 已经把 run 执行从 HTTP handler 中抽离。

建议：

- 不需要再引入 QueryEngine 类，但要保持“HTTP 层薄、runtime 层厚”。
- Preview、diagnostic single-tool run、normal run、resume run 都应进入同一套 runtime execution path。README 已说明 `/threads/:id/runs` 是唯一 public run entrypoint，这个方向正确。

## MovScript 当前机制对照

| 领域 | Claude Code 机制 | MovScript 当前机制 | 结论 |
| --- | --- | --- | --- |
| 主循环 | `query()` async generator | `runAgentGraph(model -> policy -> execute)` | MovScript 结构清晰，需补流式工具和恢复细节 |
| 工具定义 | 强 `Tool` 协议 | JSON catalog + `RegisteredTool` | 增加 execution metadata |
| 工具执行 | validation/hooks/permission/call/result shaping | `executeTool` + `applyToolPolicy` | 建议收敛为 pipeline |
| 权限 | permission modes + rules + hooks + classifier | manifest grants + approvalMode + interactions | MovScript 状态好，判定链可增强 |
| 上下文 | dynamic projection + compact/collapse | prompt layers + budgeter + ledger | MovScript 语义好，需补长期压缩资产 |
| 大结果 | result budget + persistence | summary + contextBoundary | 增加 ref-based reread |
| 工具并发 | concurrency-safe 分区、streaming executor | runtime work 支持长任务 | 普通工具可补并发策略 |
| 技能/工具发现 | ToolSearch + deferred tools | pack/profile + skill discovery + skill update | 建议形成 discover/activate 协议 |
| 子 agent | AgentTool + background/worktree/remote | RuntimeWork + SubagentRunWorkProvider | MovScript 方向正确，完善 progress/result refs |
| 恢复 | session transcript + QueryEngine state | RuntimeRecoveryBridge + store | 继续把 interrupted/requires_action 作为可恢复状态 |
| 可观测性 | telemetry/logEvent/tracing | metrics + trace + logs | MovScript 已更产品化 |

## 优先借鉴清单

### P0：工具执行协议补强

目标：让 tool 不只是 catalog entry，而是 runtime 可调度、可中断、可恢复的 syscall。

建议落点：

- `src/tools/toolRegistry.ts`
- `src/orchestration/toolExecutor.ts`
- `src/orchestration/agentGraph.ts`

建议字段：

- `readOnly`
- `concurrencySafe`
- `destructive`
- `interruptBehavior`
- `maxResultChars`
- `timeoutMs`
- `validation`

### P0：统一 ToolExecutionPipeline

把当前分散的 policy、executor、tool result context 串成一条明确管线。这样未来加 MCP、插件、生成、候选、draft apply，都能共享安全边界。

最小形态：

```text
ToolCall
  -> normalize
  -> schema validate
  -> runtime validate
  -> policy authorize
  -> execute
  -> shape result
  -> record trace + ledger
```

### P1：上下文 ref 化和长期压缩

当前 `toolResultContext` 已能摘要大结果，但缺少完整的“摘要 + 可重读 ref”模式。Claude Code 的 tool result budget/persistence 可借鉴。

建议：

- 大 tool result 写入 retrieved context store 或 agent file。
- prompt 中只放 summary、ref、读取建议。
- 后续模型必须通过 read/search 工具按 ref 局部读取。

### P1：普通工具并发策略

对 read-only 工具并发可以显著提升 agent 效率。MovScript 不应让 write/generate/destructive 并发。

建议：

- 在 `execute` 节点按 tool metadata 分组。
- read/draft/ui 可并发。
- write/generate/destructive 串行。
- 同 project/entity 写入可进一步加 key-level lock。

### P1：能力发现/激活协议

Claude Code 的 ToolSearch 解决“大工具集上下文爆炸”。MovScript 的 pack/profile 更强，但需要模型可操作的发现协议。

建议：

- 保留核心工具 always loaded。
- `core_catalog_inspect` 负责发现。
- `core_skill_update` 负责激活。
- 未激活工具调用返回结构化 repair result，而不只是 warning。

### P2：更强的恢复与 replay

MovScript 已有 `RuntimeRecoveryBridge`，应继续强化：

- 每个 `requires_action` 都可安全恢复。
- 每个 tool call 有 step id、input hash、result/ref。
- resume 不重复执行已完成 destructive tool。
- interrupted run 重建 context 时能引用之前 context bundle。

## 要做到 Claude Code 式完善度，需要补哪些工作

下面不是“照搬 Claude Code”的任务列表，而是把 Claude Code 代码量背后的功能成熟度拆成 MovScript 可执行的工程包。

### A. Tool syscall 化

当前状态：

- `RegisteredTool` 有产品侧 metadata。
- `applyToolPolicy` 能按 manifest、approval、project、run role 拦截。
- `executeTool` 能 dispatch runtime handler 或 external/MCP。

要补：

- 为每个工具建立 execution metadata：并发、安全、超时、结果预算、中断行为、schema validation 策略。
- runtime handler 返回统一 envelope：`result/error/errorData/ref/supplementalMessages/rollback/telemetry`。
- 工具执行层做二次安全校验，不只依赖 graph policy。
- 为 write/generate/destructive 工具建立 idempotency key 或 replay guard，resume 时避免重复执行。

可落点：

- `apps/agent/src/tools/toolRegistry.ts`
- `apps/agent/src/orchestration/toolExecutor.ts`
- 新增 `apps/agent/src/orchestration/toolExecutionPipeline.ts`

### B. 权限与 interaction 状态统一

当前状态：

- `requires_action` 支持 approval/input。
- approval/reject endpoint 已存在。
- model call failure 会生成 retry input request。

要补：

- 将 approval、input、auth、model retry、external MCP auth 统一成 interaction 类型。
- 每个 interaction 有明确 resume contract：恢复时从哪个 run/step/context bundle 继续。
- permission decision 形成审计记录：谁批准、批准范围、是否一次性、是否持久。
- 自动模式保留 hard deny：destructive 永不静默自动执行。

可落点：

- `apps/agent/src/application/runtimeInteractions.ts`
- `apps/agent/src/state/runInteractionState.ts`
- `apps/agent/src/tools/toolPolicy.ts`

### C. Context lifecycle 完整化

当前状态：

- 已有 Runtime Contract、Source Boundary、prompt layers、budgeter、ledger、tool result summary。

要补：

- transcript 与 model context 明确分离：原始消息永久保留，prompt 每轮投影。
- thread summary 成为持久资产，能被后续 run/recovery 复用。
- tool result 大对象写入 context store 或 agent file，prompt 只放 summary + ref。
- compact/degrade 结果写入 trace，前端可解释“哪些上下文被压缩/丢弃”。
- 对 prompt-too-long/model-output-too-long 做 recovery path，而不是直接失败。

可落点：

- `apps/agent/src/contextManager/`
- `apps/agent/src/context/runtimeThreadContextSummary.ts`
- `apps/agent/src/state/runTrace.ts`

### D. MCP/外部工具完善

当前状态：

- agent 通过 MCP-shaped desktop endpoint 获取 context/tools。
- `ExternalToolGatewayPort` 能执行外部工具。

要补：

- MCP connection lifecycle：list tools/resources 缓存、断线恢复、auth required、server unavailable 的结构化状态。
- external tool result 截断/持久化/二进制处理。
- external tool schema 与 catalog tool 的一致性校验。
- MCP 工具的权限映射：server/tool 级 allow/deny，而不是只按工具名。

可落点：

- `apps/agent/src/adapters/mcp`
- `apps/agent/src/ports/tools/externalToolGatewayPort.ts`
- `apps/agent/src/tools/toolAuthorization.ts`

### E. 子 agent / RuntimeWork 成熟化

当前状态：

- `RuntimeWorkManager` 和 `SubagentRunWorkProvider` 已有 start/observe/wait/cancel。
- planner/worker run role 已存在。

要补：

- worker manifest 默认收窄：只授予必要 read/draft/generate 子集。
- 子 agent progress 持续流入 parent trace，不只 observe 最终状态。
- 子 agent result 存为 summary + artifact refs。
- 取消 parent 时取消 subtree；恢复 parent 时重连 child work。
- 可选隔离策略：独立 draft namespace、临时工作区、只读上下文快照。

可落点：

- `apps/agent/src/runtimeWork/providers/subagentRunWorkProvider.ts`
- `apps/agent/src/state/subagent*.ts`
- `apps/agent/src/application/runtimeWorksBridge.ts`

### F. 生成任务产品化

Claude Code 的工具复杂度里有大量“真实世界副作用”处理。MovScript 的生成任务也会走向类似复杂度。

当前状态：

- generation tools/catalog/work provider 已有基础。
- generation event 能从 tool result 生成状态。

要补：

- generation job create/monitor/cancel/retry 的标准 runtime work lifecycle。
- 生成输出 resource 与 candidate/keyframe/asset-slot 的 ref 化绑定。
- 生成失败的可恢复策略：参数修正、模型切换、重试预算。
- 生成审批边界：planning 只准备，execution 才创建任务，formal apply 仍需用户确认。

可落点：

- `apps/agent/src/runtimeWork/providers/generationJobWorkProvider.ts`
- `apps/agent/src/generation/`
- `apps/agent/catalog/tools/generation`

### G. 可观测性与调试体验

当前状态：

- 已有 Prometheus metrics、trace、diagnostic logs、runtime telemetry endpoint。

要补：

- 每个 model round/tool call/interaction/recovery 都有稳定 event schema。
- prompt/context bundle 可重放：给定 run + round 能重建当时模型输入摘要。
- tool decision、context drop、retry、resume 都进入 trace。
- debug bundle：导出一次 run 的 messages、context bundle、tool calls、results、trace、catalog snapshot。

可落点：

- `apps/agent/src/telemetry`
- `apps/agent/src/domains/trace`
- `contracts/agent-run-debugging`

### H. 测试矩阵

Claude Code 代码长还有一个隐性原因：真实 agent runtime 的边界场景多。MovScript 如果要接近同等完善度，测试要覆盖状态机，不只是 happy path。

建议补齐：

- tool policy matrix：risk x approvalMode x runRole x projectScoped x sandbox。
- resume/replay：requires_action 后恢复不重复执行工具。
- context budget：超长 history/tool result/skills 的降级顺序稳定。
- MCP unavailable/auth required：不会让模型误以为工具成功。
- subagent/runtime work：parent cancel、child failed、wait timeout、observe after restart。
- generation lifecycle：created/running/completed/failed/cancelled/retry。

## 阶段性路线图

### Phase 1：先补内核硬边界

- Tool execution pipeline。
- execution metadata。
- interaction 类型统一。
- tool result ref 化。
- destructive replay guard。

### Phase 2：补上下文与恢复

- 持久 thread summary。
- context bundle replay。
- prompt-too-long recovery。
- requires_action/resume 合约测试。

### Phase 3：补外部生态和长任务

- MCP lifecycle/auth/resource handling。
- subagent runtime work progress/ref/cancel/reconnect。
- generation work lifecycle 完整化。

### Phase 4：补调试和产品体验

- run debug bundle。
- 前端 trace 解释。
- context drop/skill activation/permission decision 可视化。
- catalog/profile/tool health inspection。

## 不建议照搬的部分

- 不照搬 Claude Code 的 CLI command forest。MovScript 是本地服务 + Electron 产品，HTTP/runtime API 比 slash command 更合适。
- 不照搬 `USER_TYPE === ant`、GrowthBook feature gate、内部 telemetry 名称。
- 不照搬大量恢复版 shim。`claude-code-rev` 的 shims 是还原工程产物，不是架构目标。
- 不把 prompt 文本当安全边界。Claude Code 的核心安全点在 runtime policy 和 tool execution，不在模型自觉。

## 建议的目标架构

MovScript Agent 可以演进成以下内核：

```text
HTTP / Desktop bridge
  -> RuntimeRunExecution
    -> ContextPackageResolver
    -> CatalogSnapshotResolver
    -> AgentGraph
      -> ModelNode
      -> ToolPolicyNode
      -> ToolExecutionPipeline
        -> RuntimeToolHandlers
        -> External/MCP Gateway
        -> RuntimeWorkManager
    -> ResultHandling
    -> Recovery/Trace/Projection
```

其中：

- catalog/profile/pack 继续负责产品能力组合。
- manifest/policy 继续负责 run 边界。
- context manager 负责可信上下文投影。
- tool execution pipeline 负责 syscall 安全。
- runtime work 负责长任务、子 agent、生成任务。
- store/trace/stream 负责产品 UI 投影和恢复。

## 最终判断

`apps/agent` 不需要重构成 Claude Code。它已经有更适合 MovScript 产品的服务化骨架、catalog 分层、context boundary、runtime work 和 trace。应该吸收的是 Claude Code 在“长期运行的 agent kernel”上的工程经验：

1. 工具协议更强。
2. 执行管线更硬。
3. 上下文预算更动态。
4. 工具结果可 ref 化重读。
5. 并发和中断语义进入 runtime。
6. 所有暂停点都变成可恢复状态。

这样 MovScript Agent 会保持自己的产品架构，同时获得 Claude Code 作为通用 coding agent runtime 的成熟机制。
