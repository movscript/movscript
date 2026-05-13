# MovScript Agent 架构指南

本文档描述当前 `apps/agent` 的实现状态。设计依据见 `docs/agent-design.md`。

## 系统分层

```
Frontend / Electron
  -> POST /threads, /runs, /runs/preview
  -> apps/agent (Node.js)
  -> MCP-shaped movscript.* tools
  -> Go backend APIs for formal entity writes after approval
```

- 前端负责收集用户输入、当前 route/project/selection 快照，并展示 run、step、approval、当前 thread 草稿和历史草稿页。前端不是 thread/run/draft 的持久化事实源。
- `apps/agent` 负责 Thread/Run 生命周期、agentic loop、工具策略、sandbox、草稿、记忆和模型回复，是 thread、message、run、trace、draft、memory 的本地事实源。
- Agent 动态更新只覆盖 profile、policy、prompt、tool catalog、skill catalog 等行为配置；runtime code 更新必须走签名应用更新器，详见 `docs/agent-dynamic-update-architecture.md`。
- Go backend 负责正式项目实体、语义数据、资源和 model gateway。
- 子 Agent 机制的实现规划见 [Agent subagent mechanism plan](agent-subagent-mechanism-plan.md)。

## 核心概念

- Thread：对话线程，包含多条消息。
- Run：一次用户消息的执行实例，包含 policy、steps、warnings、pendingApprovals。
- Step：Run 的可见执行记录，类型只有 `tool_call` 和 `message`。
- Draft / Proposal：本地可审阅提案。agent 只负责创建和修改；用户确认后的应用由 UI/应用层 apply API 写入正式实体。草稿不属于前端 conversation；AI 面板只展示当前 thread 涉及的草稿，跨 thread 草稿进入独立历史草稿页。proposal kind 和 schema id 来自共享 draft schema registry，skills/tools 只引用它，不拥有 schema。
- Memory：本地记忆，按 global/project/thread 作用域加载和写入。默认 prompt 只携带短索引；正文需要通过 memory tools 检索。
- Profile：运行时绑定 persona、always-on policies、候选 workflows、tool grants、model preference 和 prompt limits。
- Manifest：运行时 tool grants/model 的投影。`skills` 只作为历史输入字段保留，不参与正常 skill 选择。
- Policy：定义审批模式、sandbox、工具调用上限和运行边界。
- Update Policy：定义 agent 行为配置更新的分级、签名、审计和回滚要求。

## Run 流程

1. `createRun()` 创建 Run，保存 `AgentRunPolicy`。
2. `executeRun()` 调用 `movscript_get_focus` 获取紧凑上下文包。
3. 加载 memory 短索引，解析 profile、layered catalog、triggered workflows、tools/capabilities。
4. `contextBuilder.buildContext()` 生成分层 system messages 和 debug prompt stats。
5. agentic loop 选择下一批 tool calls。
6. `applyToolPolicy()` 注入 projectId，检查授权和审批。
7. sandbox 模式拦截 `write`、`generate`、`destructive` 风险工具并记录 `sandboxed: true`。
8. 允许的工具立即执行，每个工具调用记录为 `tool_call` step。
9. 如果需要审批，Run 进入 `requires_action`；用户 approve 后同一个 Run 继续。
10. 生成 assistant message，提取并写入 memories，Run 完成。

## Sandbox 模式

`POST /runs`、`POST /runs/tool`、`POST /runs/preview` 支持 `sandboxMode: true`。

Sandbox 会完整运行到结束，但在实际写入前拦截高风险工具：

- `write`
- `generate`
- `destructive`

被拦截的 step 包含 `sandboxed: true`，结果形如：

```json
{
  "sandboxed": true,
  "wouldHaveExecuted": {
    "name": "movscript.create_generation_job",
    "args": {}
  },
  "simulatedResult": "写入/生成工具已模拟执行（sandbox 模式，未实际写入）",
  "interceptedAt": "2026-05-03T00:00:00.000Z"
}
```

草稿 apply 不进入 agent runtime tool 层；它是 UI/应用层的审阅提交动作。

## 前端展示边界

- AI 面板以 `threadId` 为边界，从 runtime 读取当前 thread 的 messages、runs、trace、approvals 和相关 drafts。
- AI 面板不得持久化历史消息、完整 run、完整 thread 或草稿内容；只能保存输入框、展开状态、选中 id、筛选条件和 streaming 文本等临时 UI 状态。
- 页面任务桥只能保存 `requestId -> threadId/runId` 的最小索引。恢复任务时必须回读 runtime。
- 历史草稿页从 `/drafts` 查询跨 thread 草稿库，并提供筛选、预览、打开来源 thread、跳转目标页面、应用、拒绝和归档。

## 文件入口

| 文件 | 作用 |
| --- | --- |
| `apps/agent/src/server.ts` | HTTP API |
| `apps/agent/src/application/agentRuntime.ts` | Run 生命周期和 agentic loop |
| `apps/agent/src/state/types.ts` | Agent API 类型 |
| `apps/agent/src/orchestration/contextBuilder.ts` | 分层系统提示、tool schemas 和 prompt preview |
| `apps/agent/src/skills/runtimeLayerResolver.ts` | profile 解析和按 trigger 激活 skills |
| `apps/agent/src/skills/triggerEvaluator.ts` | workflow trigger 评估和 trace |
| `apps/agent/src/catalog/loader.ts` | layered catalog 加载 |
| `apps/agent/src/profiles/resolveProfile.ts` | profile/mode alias 解析 |
| `apps/agent/src/application/assistantMessage.ts` | Assistant 回复生成 |
| `apps/agent/src/tools/toolRegistry.ts` | 工具注册和风险级别 |
| `apps/agent/src/tools/toolPolicy.ts` | 授权、审批和 projectId 注入 |
| `apps/agent/src/drafts/draftStore.ts` | 草稿存储 |
| `apps/agent/src/drafts/draftApply.ts` | 草稿 apply preview 和生命周期 |
| `apps/agent/src/drafts/backendApplyClient.ts` | 后端 PATCH 写入客户端 |
| `apps/agent/src/state/fileStore.ts` | Run/Thread 文件存储 |
| `apps/agent/src/memory/` | 记忆系统 |

## 状态路径

默认本地状态目录为 `.movscript-agent`：

- state：`.movscript-agent/state.json`
- memories：`.movscript-agent/state.memories.json`
- drafts：由 draft store 路径解析得到
- model config：由 `MOVSCRIPT_AGENT_MODEL_CONFIG_PATH` 或 state path 派生

## 已移除概念

当前实现不再包含独立 Planner 层：

- 无 `planner.ts`
- 无 `modelPlanner.ts`
- 无 `AgentTaskPlan`
- 无 `AgentPlanTask`
- 无 `AgentInputEnvelope`
- Run step 不再包含 `planning` 或 `subagent`
