# Unified Agent Chat SDK Runtime 架构

Unified Agent Chat Runtime 把 Agent 对话、工具调用、服务端请求、线程同步和运行状态聚合为一套 provider-neutral 状态机。Frontend 负责渲染、路由和用户输入，Core Runtime 负责协议归一、事件推进和可测试的状态转换。

## 存储边界

桌面端所有可迁移业务状态进入 MovScript Home 管理目录。Agent 会话、provider session 索引、桌面 UI 状态和工作区上下文都必须以 MovScript Home 为权威来源。

不得用 Electron `userData` 或 browser storage 承载业务状态。Electron `userData` 只保留 Chromium profile、runtime cache 和历史兼容用途；browser storage 只允许作为 web fallback 或旧数据迁移来源。

## 运行时边界

- Core Runtime 只处理 provider-neutral 协议、消息事件、server request 和工具结果。
- Frontend shell 只负责把 workspace、project、route 和 window lifecycle 接入 runtime。
- Provider credential、route binding、model catalog 和 capability probe 走明确 application service，不在组件里拼接临时协议。

## 验证策略

架构约束通过边界测试维护：组件不得直接越过 runtime 写 provider 状态，桌面业务状态不得回退到 Electron profile，renderer 不得绕开 MovScript Home bridge 持久化核心业务数据。
