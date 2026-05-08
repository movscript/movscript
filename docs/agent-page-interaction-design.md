# Agent 与页面交互设计

本文档描述 MovScript 当前页面与 Agent 的交互方式、主要问题，以及后续应该收束成的目标模型。

## 现状

当前页面不是直接调用 Agent 得到结果，而是通过一个前端任务桥把任务投递到右侧 AI 面板，再由 AI 面板驱动 local runtime 完成一次运行。现有实现里，任务桥背后由 `agentSessionStore` 承载任务队列、会话运行态和本地 thread 绑定，避免只依赖一次性浏览器事件。

这只是当前过渡实现，不是最终状态。目标模型里，`apps/agent runtime` 是 thread、message、run、trace、draft、memory 的唯一持久化事实源；AI 面板只负责展示当前 thread 和发起 runtime 操作，不保存历史消息、草稿或 run 真相。`agentSessionStore` 只能保留短生命周期的 UI 路由、任务 claim、临时 pending 状态，不能成为第二套会话数据库。

在当前桌面端壳层里，业务页面和 `AIAgentPanel` 是并列区域：页面负责业务工作台，右侧 Agent 面板负责对话、运行、审批和调试展示。两者之间不通过组件 props 直接耦合，而是通过 `agentPanelBridge` 和 `agentSessionStore` 传递页面任务与运行结果。

典型链路如下：

1. 页面调用 `openAgentPanelDraft()`，传入 `message`、`clientInput`、`agentManifest`、`requestId` 等参数。
2. `AIAgentPanel` 监听事件，把这次任务包装成一次对话发送。
3. AI 面板构造 `clientInput.uiSnapshot`，把项目、选择项、标签等页面上下文带给 runtime。
4. local runtime 执行 `runMessage()` 或 `createToolRun()`。
5. run 完成后，AI 面板通过 `notifyAgentPanelRunSettled()` 把 `run/thread` 回传给页面。
6. 页面自己解析 assistant 文本，或者读取 runtime 生成的 draft/proposal 协议对象，再把结果写回本页面状态。
7. 运行中的 `run/thread/status` 目前会同步写入 `agentSessionStore`。目标实现应改成只保存 `requestId -> threadId/runId` 这类临时索引；恢复进度时必须回读 runtime 的 `/threads`、`/runs`、`/drafts`，不能依赖前端持久化快照。

相关代码：

- [agentPanelBridge.ts](../apps/frontend/src/lib/agentPanelBridge.ts)
- [AIAgentPanel.tsx](../apps/frontend/src/components/layout/AIAgentPanel.tsx)
- [WorkbenchPage.tsx](../apps/frontend/src/pages/workbench/WorkbenchPage.tsx)
- [ProductionOrchestratePage.tsx](../apps/frontend/src/pages/production/ProductionOrchestratePage.tsx)
- [CreativeWorkbenchPage.tsx](../apps/frontend/src/pages/creative-workbench/CreativeWorkbenchPage.tsx)

## 当前核心设计点

### 1. 页面拥有业务语义，Agent 拥有执行过程

页面知道“当前正在做什么业务”：剧本拆分、制作编排、创意头脑风暴、资源生成等。它负责收集页面输入、当前项目、当前选择项，并在 run 结束后把结果渲染成业务 UI。

Agent 不应该知道某个 React 页面内部怎么更新状态。Agent runtime 只接收结构化输入，执行工具、填充或修改页面拥有的草稿、返回 run/thread/draft/proposal 等协议对象。页面根据这些协议对象决定下一步 UI 状态。

### 2. `agentSessionStore` 是过渡任务索引，不是运行态真相

`agentPanelBridge` 只负责投递和通知，不应该成为长期状态容器。页面任务进入 `agentSessionStore.pageTasks` 后，会经历：

```
queued -> claimed -> building -> running -> completed | cancelled | error
```

这让页面任务可以跨面板折叠、重开、异步消费继续追踪。但这里的追踪只允许保存最小索引：`requestId`、`taskType`、`threadId`、`runId`、临时状态和错误。完整 run、thread、message、draft 内容必须从 local runtime 读取。

最终边界：

- `apps/agent runtime` 拥有 thread/run/draft 的完整状态。
- `AIAgentPanel` 根据当前 `threadId` 查询并展示状态。
- `agentSessionStore` 只帮助页面任务找到对应的 `threadId/runId`，不能持久化消息历史、完整 thread、完整 run、完整 draft。
- 如果前端刷新、面板重开或任务恢复，先用索引回读 runtime；索引失效时展示“运行记录不存在”，而不是用前端旧快照伪造结果。

### 3. `clientInput.uiSnapshot` 是页面上下文入口

页面传给 Agent 的上下文不应该是整页状态，也不应该是自然语言拼接出的隐藏说明。当前核心上下文入口是 `AgentClientInput.uiSnapshot`：

- `route`：当前页面位置。
- `project` / `productionId`：项目与制作上下文。
- `selection`：当前选中的业务实体。
- `recentResources` / `attachments`：用户显式带入的资源。
- `labels`：页面任务标签，例如 `script-split-workbench`、`production-orchestrate`、`creative-workbench`。

runtime 基于这些最小上下文构建 prompt 和工具边界；更多业务数据应通过工具按需读取，而不是启动时整包塞入。

### 4. `agentManifest` 是单次页面任务的能力边界

页面任务可以传入专用 `agentManifest`，例如剧本拆分或制作编排任务使用更窄的工具、技能和输出契约。这样页面不是通过 prompt 暗示 Agent 行为，而是通过 manifest 明确限定：

- 允许或拒绝哪些工具。
- 哪些工具需要审批。
- 使用哪些技能与输出约束。
- 必要时指定模型偏好。

这也是“同一个右侧 Agent 面板支持多类页面任务”的关键机制。

### 5. Draft / Proposal 是跨层协议，不是正式领域实体

`AgentDraft`、`production_proposal`、candidate 等对象用于连接 runtime 和客户端审阅流程。它们承载 AI 输出、来源 run/thread、目标项目和应用元数据，但不等于后端正式数据。

页面可以把这些协议对象渲染成业务词汇，例如“拆分草稿”“编排提案”“候选素材”。正式写入仍由页面或审批流调用后端 apply API 完成。

当前 AI 面板里的“产物”不再作为独立概念使用。实现上 `AgentTaskArtifactRef` 只是页面任务对 `AgentDraft` 的轻量引用，目的是告诉页面“这次 run 产出了哪个可审阅草稿”。如果未来引入图片、文件、生成任务结果等非草稿输出，再扩展 artifact 类型；在此之前，产品文案应统一称为“草稿”或具体业务草稿，避免让用户理解成另一套实体。

默认交互模型是一个页面任务绑定一个主草稿。需要同时提出多个业务变更时，应优先放进同一个复合 draft，例如编排工作台的 `production_proposal` 内部包含 segment、scene moment、creative reference usage 和 asset need 节点，而不是让 Agent 同时修改多个并列 draft。内容单元、关键帧、台词定稿和运镜表属于下游制作工作台，不应作为编排工作台的默认 proposal 节点。只有当用户明确发起多个互相独立的工作流，或不同页面/实体的应用边界完全独立时，才应该出现多个 draft。

草稿不跟随 AI 面板会话，也不跟随前端 conversation。草稿是 runtime 持久化的审阅协议对象，按 `projectId`、`kind`、`status`、`sourceThreadId/createdByThreadId`、`sourceRunId/createdByRunId`、目标实体和页面上下文组织。

因此需要两个明确的产品入口：

1. **当前 thread 草稿区**：AI 面板只展示当前 thread 涉及的草稿。匹配条件是草稿的来源 thread/run 属于当前 thread，或草稿 metadata/source/target 明确引用当前页面上下文。它不展示全局历史草稿。
2. **AI 历史草稿页**：独立页面展示所有 AI 草稿，支持按项目、类型、状态、来源 thread、来源 run、目标实体、创建时间筛选，并提供打开来源 thread、跳转目标页面、预览、修改、应用、拒绝、归档等操作。

AI 面板可以链接到历史草稿页，但不能把历史草稿库塞进面板，也不能把草稿列表保存到面板 store。

### 6. Assistant 文本只是 fallback

当前还有页面会解析 assistant 文本，例如创意工作台和部分制作编排 fallback。设计方向是把自然语言回复降级为调试和兼容通道，主通道改为结构化草稿/工具结果：

1. draft / proposal / candidate。
2. tool result。
3. assistant 文本。

这能避免页面把大模型的表达格式当成 API。

## 页面与 Agent 的关系模型

当前更准确的关系不是“页面调用 Agent 组件”，而是：

```
业务页面
  |  openAgentPanelDraft(PageAgentTask)
  v
agentPanelBridge
  |  enqueue requestId / notify settled
  v
AIAgentPanel
  |  build AgentClientInput + AgentManifest
  v
localAgentClient
  |  POST /threads, /threads/:id/messages, /runs
  v
apps/agent runtime
  |  owns thread / message / run / trace / draft / memory
  v
AIAgentPanel
  |  read current thread/run/drafts and render
  v
业务页面
  |  read structured draft/result by id / apply / update page state
```

各层职责如下：

| 层 | 拥有什么 | 不应该做什么 |
| --- | --- | --- |
| 业务页面 | 业务输入、页面状态、结果渲染、正式 apply 入口 | 依赖 Agent 内部 step 顺序，或解析 runtime 私有实现 |
| `agentPanelBridge` | 任务投递、`requestId` 回调分发 | 持久化运行态 |
| `agentSessionStore` | 过渡期的页面任务索引、`requestId -> threadId/runId` 临时绑定 | 持久化完整 run/thread/message/draft，或成为会话真相 |
| `AIAgentPanel` | 当前 thread UI、发送构建、模型配置同步、run 订阅/轮询、审批展示、thread 内草稿展示 | 保存历史消息、保存草稿、成为某个业务页面的状态管理器 |
| `apps/agent runtime` | Thread/Run、工具策略、manifest/skill、draft、memory、assistant 输出 | 直接操作 React 页面状态 |
| Go backend | 正式项目实体、资源、语义数据、model gateway | 承载本地 Agent 会话状态 |

这个模型的核心是解耦：页面可以发起任务并消费结果，Agent 面板可以统一展示和运行，runtime 可以独立演进工具与策略。

## 现有问题

1. 页面任务和聊天任务混在同一个面板里，用户不容易分辨这是“页面工作流”还是“普通聊天”。
2. 多数页面仍依赖解析 assistant 文本，结构化程度不够。
3. `agentPanelBridge` 已从全局单例事件桥升级为任务入口，但页面结果回调仍需要继续收束成结构化草稿/结果协议。
4. 页面功能依赖右侧面板的手工模型选择，闭环不够顺。
5. Draft 面板更像调试工具，不像业务功能。
6. 前端 `agentStore` 和 `agentSessionStore` 仍在持久化面板 conversation、消息、thread 绑定和 run 摘要，和 runtime thread 形成双写。
7. AI 面板里的草稿入口还没有和“当前 thread 草稿”及“历史草稿库”分开，用户容易误以为草稿属于当前聊天会话。

## 目标模型

页面和 Agent 的关系应该收束为：

**页面发起结构化任务，Agent 负责执行与生成，页面接收结构化结果并渲染。**

核心原则：

- 页面只描述任务，不关心 Agent 内部消息流。
- 任务只通过 `agentPanelBridge` 和最小索引进入 AI 面板；运行态、thread、message、draft 的真相都在 local runtime。
- AI 面板只是当前 thread 的展示和操作入口，不拥有会话真相，不保存历史消息或草稿。
- 结果优先走结构化草稿或工具结果，不要依赖自然语言解析。
- Draft / proposal / candidate 是 runtime 和客户端之间的协议对象，页面展示成业务化术语。
- AI 面板保留为统一执行壳，但不承担页面业务语义本身，也不承担草稿资产库职责。
- 历史草稿进入独立 AI 草稿页；AI 面板只展示当前 thread 涉及的草稿。

## Draft 定义

这里的 `AgentDraft` 不是后端正式领域实体，也不是最终项目数据。它是 local runtime 和客户端之间通信用的审阅协议结构，承载：

- AI 建议的内容或结构化提案。
- 来源 run/thread、项目、目标实体等上下文引用。
- 客户端预览、修改、拒绝、应用所需的生命周期状态。
- 后续 apply 流程需要的 target/review metadata。

因此，`movscript_propose_production_entities` 的含义是创建一个本地 `production_proposal` draft，让页面审阅；它不直接写后端。真正写入项目实体发生在页面或审批流调用后端 apply API 时。

草稿的展示规则必须和 thread 边界分开：

- AI 面板：读取当前 `threadId`，只展示和该 thread/run 直接相关的草稿。
- 历史草稿页：读取 `/drafts`，展示跨 thread 的草稿库。
- 业务页面：按当前页面上下文读取可审阅草稿，并负责用户确认后的 apply。
- 前端 store：不能把草稿内容作为长期状态保存；最多保存当前选中 `draftId`、筛选条件和展开状态。

## 推荐接口

建议把当前的“投递一条消息”升级为“投递一个页面任务”：

```ts
type PageAgentTask = {
  requestId: string
  taskType: string
  title?: string
  input: unknown
  clientInput?: AgentClientInput
  agentManifest?: AgentManifest
  projectId?: number
  autoSend?: boolean
  timeoutMs?: number
  renderMode?: 'chat' | 'panel' | 'page'
}
```

页面侧只做三件事：

1. 创建任务。
2. 注册结果回调。
3. 按业务对象更新本页状态。

AI 面板侧只做三件事：

1. 收到任务后组装 runtime 输入。
2. 执行 run 并收集结构化结果。
3. 回传 settled event 和结构化草稿/结果引用。

## 结果优先级

后续页面结果读取应按以下优先级处理：

1. 结构化 draft / proposal / candidate 协议对象。
2. runtime tool result。
3. assistant 文本 fallback。

不要把 assistant 文本作为主通道，只保留兼容逻辑。

## 迁移步骤

1. 统一页面任务入口，抽出 `PageAgentTask` 或同等抽象。
2. 为现有页面任务补结构化输出契约。
3. 把剧本拆分、制作编排、创意工作台这三条链路改成优先读结构化结果。
4. 把 `agentPanelBridge` 和 `agentSessionStore` 收束为最小任务索引，不再持久化完整会话、消息、thread、run、draft。
5. 把 AI 面板的 Draft 面板改成“当前 thread 草稿”，只查询当前 thread/run 涉及的草稿。
6. 增加独立“AI 历史草稿”页面，作为跨 thread 的草稿库。
7. 把前端 `agentStore` 中的面板 conversation 持久化迁移为 runtime thread 读取；面板刷新后从 runtime 恢复消息历史。
8. 后续再收束 page tool、结构化结果、approval flow 的统一协议。

## 不做的事

- 不把 Agent 彻底改成纯聊天。
- 不在页面里直接拼接 runtime 内部实现细节。
- 不强迫普通用户理解 `draftId`、`entityType`、`requestId` 这些内部字段。
- 不优先扩展新的 AI 入口，先收束已有链路。

## 当前结论

当前设计可以工作，但更像“调试态的工作流接线”。当前代码已把主干收束为“页面任务 -> session store -> Agent 执行 -> 结构化结果回写”，下一步应继续把更多页面结果从 assistant 文本解析迁移到结构化草稿或工具结果。

## 职责边界总结

如果把当前系统拆成四个角色，可以这样理解：

### 1. 后端

后端是正式数据的权威来源，负责项目实体、语义结构、资源、权限和最终写入。它决定“什么数据算真数据”，也决定草稿最终如何落到正式实体。

### 2. 前端

前端负责收集业务上下文、组织页面任务、展示 Agent 结果，并在用户确认后发起 apply。它不是 thread/run/draft 的持久化事实源；AI 面板只能维护短生命周期 UI 状态，例如输入框、筛选条件、当前选中 `threadId/draftId`、展开状态和临时 streaming 文本。

### 3. Agent

Agent 负责推演、填充、修改和校验页面拥有的草稿或提案，管理 run/thread/memory/tool 过程。它产出的 draft/proposal 内容是审阅协议对象，不是后端正式实体。

### 4. 人

人负责最终确认，决定草稿是否接受、修改、拒绝，并触发正式 apply。换句话说，人拥有业务判断，前端承接操作，Agent 提供建议，后端负责落库。

### 对应链路

```text
后端：正式数据源与落库权威
前端：任务入口 + 当前 thread/草稿展示 + 审阅/提交
Agent：填充、修改和校验草稿
人：确认草稿并触发最终写入
```

### 设计思想

这套设计不是让 Agent 直接替代业务系统，而是把系统拆成三层权威：

1. **业务权威在前端和人手里**，前端表达意图，人做最终判断。
2. **生成权威在 Agent 手里**，负责把意图变成结构化候选结果。
3. **数据权威在后端手里**，只接受经过确认的正式写入。

这样做的目标是让自然语言回复退居辅助位置，让结构化 draft/proposal 成为主通道，同时避免 Agent 直接接管正式数据。
