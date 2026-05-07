# Agent 与页面交互设计

本文档描述 MovScript 当前页面与 Agent 的交互方式、主要问题，以及后续应该收束成的目标模型。

## 现状

当前页面不是直接调用 Agent 得到结果，而是通过一个前端任务桥把任务投递到右侧 AI 面板，再由 AI 面板驱动 local runtime 完成一次运行。任务桥背后由 `agentSessionStore` 承载任务队列、会话运行态和本地 thread 绑定，避免只依赖一次性浏览器事件。

在当前桌面端壳层里，业务页面和 `AIAgentPanel` 是并列区域：页面负责业务工作台，右侧 Agent 面板负责对话、运行、审批和调试展示。两者之间不通过组件 props 直接耦合，而是通过 `agentPanelBridge` 和 `agentSessionStore` 传递页面任务与运行结果。

典型链路如下：

1. 页面调用 `openAgentPanelDraft()`，传入 `message`、`clientInput`、`agentManifest`、`requestId` 等参数。
2. `AIAgentPanel` 监听事件，把这次任务包装成一次对话发送。
3. AI 面板构造 `clientInput.uiSnapshot`，把项目、选择项、标签等页面上下文带给 runtime。
4. local runtime 执行 `runMessage()` 或 `createToolRun()`。
5. run 完成后，AI 面板通过 `notifyAgentPanelRunSettled()` 把 `run/thread` 回传给页面。
6. 页面自己解析 assistant 文本，或者读取 runtime 生成的 draft/proposal 协议对象，再把结果写回本页面状态。
7. 运行中的 `run/thread/status` 同步写入 `agentSessionStore`，面板折叠、重开或延后消费任务时仍能恢复进度。

相关代码：

- [agentPanelBridge.ts](/Users/zhaoqian/Code/Github/migua/movscript/movscript/apps/frontend/src/lib/agentPanelBridge.ts)
- [AIAgentPanel.tsx](/Users/zhaoqian/Code/Github/migua/movscript/movscript/apps/frontend/src/components/layout/AIAgentPanel.tsx)
- [WorkbenchPage.tsx](/Users/zhaoqian/Code/Github/migua/movscript/movscript/apps/frontend/src/pages/workbench/WorkbenchPage.tsx)
- [ProductionOrchestratePage.tsx](/Users/zhaoqian/Code/Github/migua/movscript/movscript/apps/frontend/src/pages/production/ProductionOrchestratePage.tsx)
- [CreativeWorkbenchPage.tsx](/Users/zhaoqian/Code/Github/migua/movscript/movscript/apps/frontend/src/pages/creative-workbench/CreativeWorkbenchPage.tsx)

## 当前核心设计点

### 1. 页面拥有业务语义，Agent 拥有执行过程

页面知道“当前正在做什么业务”：剧本拆分、制作编排、创意头脑风暴、资源生成等。它负责收集页面输入、当前项目、当前选择项，并在 run 结束后把结果渲染成业务 UI。

Agent 不应该知道某个 React 页面内部怎么更新状态。Agent runtime 只接收结构化输入，执行工具、生成草稿、返回 run/thread/draft/proposal 等协议对象。页面根据这些协议对象决定下一步 UI 状态。

### 2. `agentSessionStore` 是页面任务的运行态真相

`agentPanelBridge` 只负责投递和通知，不应该成为长期状态容器。页面任务进入 `agentSessionStore.pageTasks` 后，会经历：

```
queued -> claimed -> building -> running -> completed | cancelled | error
```

这让页面任务可以跨面板折叠、重开、异步消费继续追踪。`AIAgentPanel` 消费 store 中的任务并更新 run 状态；页面通过 `requestId` 注册回调或读取任务状态。

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

### 6. Assistant 文本只是 fallback

当前还有页面会解析 assistant 文本，例如创意工作台和部分制作编排 fallback。设计方向是把自然语言回复降级为调试和兼容通道，主通道改为结构化 artifact：

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
  |  enqueue / notify
  v
agentSessionStore
  |  claim queued task
  v
AIAgentPanel
  |  build AgentClientInput + AgentManifest + Thread/Run
  v
localAgentClient
  |  HTTP
  v
apps/agent runtime
  |  tools / draft / proposal / assistant message
  v
AIAgentPanel
  |  notifyAgentPanelRunSettled(requestId, run, thread)
  v
业务页面
  |  read artifact / apply / update page state
```

各层职责如下：

| 层 | 拥有什么 | 不应该做什么 |
| --- | --- | --- |
| 业务页面 | 业务输入、页面状态、结果渲染、正式 apply 入口 | 依赖 Agent 内部 step 顺序，或解析 runtime 私有实现 |
| `agentPanelBridge` | 任务投递、`requestId` 回调分发 | 持久化运行态 |
| `agentSessionStore` | 页面任务队列、run/thread 绑定、会话运行态 | 理解具体业务结果内容 |
| `AIAgentPanel` | 对话 UI、发送构建、模型配置同步、run 轮询、审批展示 | 成为某个业务页面的状态管理器 |
| `apps/agent runtime` | Thread/Run、工具策略、manifest/skill、draft、memory、assistant 输出 | 直接操作 React 页面状态 |
| Go backend | 正式项目实体、资源、语义数据、model gateway | 承载本地 Agent 会话状态 |

这个模型的核心是解耦：页面可以发起任务并消费结果，Agent 面板可以统一展示和运行，runtime 可以独立演进工具与策略。

## 现有问题

1. 页面任务和聊天任务混在同一个面板里，用户不容易分辨这是“页面工作流”还是“普通聊天”。
2. 多数页面仍依赖解析 assistant 文本，结构化程度不够。
3. `agentPanelBridge` 已从全局单例事件桥升级为任务入口，但页面结果回调仍需要继续收束成结构化 artifact 协议。
4. 页面功能依赖右侧面板的手工模型选择，闭环不够顺。
5. Draft 面板更像调试工具，不像业务功能。

## 目标模型

页面和 Agent 的关系应该收束为：

**页面发起结构化任务，Agent 负责执行与生成，页面接收结构化结果并渲染。**

核心原则：

- 页面只描述任务，不关心 Agent 内部消息流。
- 任务和运行态先进入 `agentSessionStore`，AI 面板只是消费和展示，不拥有会话真相。
- 结果优先走结构化 artifact，不要依赖自然语言解析。
- Draft / proposal / candidate 是 runtime 和客户端之间的协议对象，页面展示成业务化术语。
- AI 面板保留为统一执行壳，但不承担页面业务语义本身。

## Draft 定义

这里的 `AgentDraft` 不是后端正式领域实体，也不是最终项目数据。它是 local runtime 和客户端之间通信用的审阅协议结构，承载：

- AI 建议的内容或结构化提案。
- 来源 run/thread、项目、目标实体等上下文引用。
- 客户端预览、修改、拒绝、应用所需的生命周期状态。
- 后续 apply 流程需要的 target/review metadata。

因此，`movscript_propose_production_entities` 的含义是创建一个本地 `production_proposal` draft，让页面审阅；它不直接写后端。真正写入项目实体发生在页面或审批流调用后端 apply API 时。

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
3. 回传 settled event 或 result artifact。

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
4. 给 `agentPanelBridge` 增加更稳定的任务存储或任务队列，避免只靠单次事件。当前已由 `agentSessionStore` 承接。
5. 把 Draft 面板改成业务术语展示，不再直接暴露内部状态名。
6. 后续再收束 page tool、result artifact、approval flow 的统一协议。

## 不做的事

- 不把 Agent 彻底改成纯聊天。
- 不在页面里直接拼接 runtime 内部实现细节。
- 不强迫普通用户理解 `draftId`、`entityType`、`requestId` 这些内部字段。
- 不优先扩展新的 AI 入口，先收束已有链路。

## 当前结论

当前设计可以工作，但更像“调试态的工作流接线”。当前代码已把主干收束为“页面任务 -> session store -> Agent 执行 -> 结构化结果回写”，下一步应继续把更多页面结果从 assistant 文本解析迁移到结构化 artifact。
