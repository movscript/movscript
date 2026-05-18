# Agent Schema 参考

本文档说明 issue 上报、支持诊断包和设置迁移使用的稳定 Agent schema。
JSON Schema 的权威文件仍位于 `contracts/agent/`；本文档解释职责归属和兼容规则。

## Agent Debug Bundle v1

- Schema 文件：`contracts/agent/agent-debug-bundle-v1.schema.json`。
- Fixture 文件：`contracts/agent/agent-debug-bundle-v1.fixture.json`。
- 稳定 schema URL：`https://movscript.dev/schemas/agent-debug-bundle-v1.schema.json`。
- 生产者：Agent 调试页。
- 消费意图：只读支持诊断和 issue triage 诊断包。

必需顶层字段：

- `schema`、`schemaVersion`、`schemaUrl`、`redacted`、`exportedAt`。
- Runtime 上下文：`baseURL`、`currentProject`、`runtime`、`lastUpdated`。
- 模型上下文：`modelConfig`、`modelConfigError`。
- 观测上下文：`observationCoverage`、`evidenceChecklist`、`triageItems`、
  `remediationPlan`、`runSummary`、`runIssueGroups`、`warnings`、
  `warningGroups`、`preview`。

兼容规则：

- 复制或下载前必须脱敏。
- 消费方应把未知额外字段视为向前兼容扩展。
- 单次运行步骤细节仍属于对话详情；Debug Bundle 只汇总 Runtime、最近运行健康状态和只读下一步路由。

## Agent Settings Snapshot v1

- Schema 文件：`contracts/agent/agent-settings-snapshot-v1.schema.json`。
- Fixture 文件：`contracts/agent/agent-settings-snapshot-v1.fixture.json`。
- 稳定 schema URL：`https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json`。
- 生产者：Agent 设置页。
- 消费意图：设置备份、迁移、dry-run 导入和选择性配置段应用。

必需顶层字段：

- `schema`、`schemaVersion`、`schemaUrl`、`exportedAt`。

可选迁移配置段：

- `modelConfig`：模型 ID、可选后端配置 ID、API 模式、Base URL、对话/规划路由开关。
- `defaultProfileId`：后续运行默认 Profile。
- `skillPolicy`：Skill 启用和禁用规则。
- `toolPolicy`：工具允许/拒绝规则和审批策略。
- `runPresets` 与 `activeRunPresetId`：本地运行模板和已选择模板。

兼容规则：

- Snapshot 会拒绝未知顶层属性。
- 导入必须先通过 preflight 校验，才能写入 Runtime 或本地默认配置。
- 导入 UI 可以用命名预设选择配置段，但实际写入仍需要 dry-run/import 操作。
- 导出不得包含 provider API key、Bearer token 或 URL 密钥凭据。

## 静态门禁

运行：

```bash
node --test tests/scripts/agent/verify-run-debugging.test.mjs
```

该门禁检查 schema ID、fixture、页面职责、文档链接，以及 Settings/Debug 边界规则。
