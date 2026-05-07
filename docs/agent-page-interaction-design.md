# Agent 与页面交互设计

本文档描述 MovScript 当前页面与 Agent 的交互方式、主要问题，以及后续应该收束成的目标模型。

## 现状

当前页面不是直接调用 Agent 得到结果，而是通过一个前端任务桥把任务投递到右侧 AI 面板，再由 AI 面板驱动 local runtime 完成一次运行。任务桥背后由 `agentSessionStore` 承载任务队列、会话运行态和本地 thread 绑定，避免只依赖一次性浏览器事件。

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
3. 把剧本拆分、分集编排、创意工作台这三条链路改成优先读结构化结果。
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
