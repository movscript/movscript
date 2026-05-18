# Agent 设置与调试边界

本文档固定 Agent 设置和 Agent 调试的产品职责，避免后续功能继续堆叠时两个页面发生交叉。

## 核心原则

- Agent 设置是控制面：管理会影响后续默认运行的持久配置。
- Agent 调试是观测面：只读查看 Runtime、上下文、预览和运行健康状态。
- 单次运行诊断属于对话详情：运行步骤、工具调用、审批等待和错误上下文从对话详情进入。
- 页面之间只通过跳转互相辅助，不共享写操作。

## 机器可读合同

- Debug Bundle schema：`contracts/agent/agent-debug-bundle-v1.schema.json`。
- Settings Snapshot schema：`contracts/agent/agent-settings-snapshot-v1.schema.json`。
- 静态门禁：`node --test tests/scripts/agent/verify-run-debugging.test.mjs`。

## Agent 设置负责什么

Agent 设置应该回答：以后 Agent 默认怎么运行。

已归属设置页的能力：

- 模型调用模式：后端网关、OpenAI Responses、OpenAI Chat Completions、Anthropic Messages，以及调用模式迁移指南。
- 模型用途路由：对话、规划等用途是否启用。
- Provider 模型 ID、Base URL、凭证就绪状态、敏感信息防护和按 Provider 区分的模型兼容性探测。
- Skills 管理：安装、卸载、重载目录、启用策略、依赖和冲突检查、版本覆盖、来源和信任状态。
- Profile / 工作模式：默认 Profile、Profile 切换影响、工具授权边界。
- 工具权限策略：允许、拒绝、审批策略、保存前 diff 预览、大目录搜索/筛选、已保存筛选预设、筛选结果批量编辑、不可保存草稿修复。
- 运行模板：新建、复制、删除自定义模板、权限模式、工具调用上限、迭代上限、计划 worker、超时和重试。
- 设置快照：导入、导出、dry-run、选择性应用配置段、影响预览、命名导入预设、导入前备份。
- 配置就绪度：模型、调用模式、凭证、路由、运行模板、Profile、Skills、工具策略和未保存变更。
- 配置待处理项：阻塞项优先、快速修复、原因、持久化提示和审计。
- 配置审计：保存、测试、清除、quick fix、失败操作和导入导出，并包含细分的 quick fix 审计分类。

设置页不应该展示单次运行内部步骤，也不应该复制 Agent 调试页的运行观测面板。

## Agent 调试负责什么

Agent 调试应该回答：当前 Runtime 和最近运行哪里不对。

已归属调试页的能力：

- Runtime 连接、catalog、capabilities、MCP 状态。
- 当前模型配置的只读视图和凭证状态。
- Prompt Preview、上下文摘要、计划和审批预览。
- 最近运行列表、失败/等待/进行中分组。
- 观测覆盖率：哪些诊断信号可用，哪些缺失。
- Triage：把运行失败、等待审批、警告信号聚合成排查入口。
- 只读修复建议：把下一步路由到 Agent 设置、运行详情、Prompt Preview
  或只读观察检查，不写入配置。
- Debug Bundle：复制或下载脱敏诊断包。
- 跳转到设置页修复持久配置问题。

调试页不应该保存模型、修改 Skills、修改 Profile、修改工具策略或写入运行模板。

## 对话详情负责什么

对话详情应该回答：这一次运行具体发生了什么。

对话详情保留：

- 单次运行步骤。
- 工具调用输入输出。
- 审批等待和用户确认。
- 单次运行错误栈、trace、上下文包和结果附件。

Agent 调试可以链接到运行详情，但不重复实现单次运行诊断。

## 后续成熟化缺口

- 恢复完整依赖安装，使 TS/TSX 契约测试和 typecheck 可运行。
- 等 Runtime 支持签名 Skill Bundle 后，增加加密签名校验。
- 等工作区级设置可用后，为运行模板增加团队共享模板能力。
- 在公开文档托管接入后，发布现有 schema reference 页面。
