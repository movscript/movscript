# AgentRun 调试产品验收清单

本清单用于在可启动前端 dev server 且可启动浏览器的环境里验收 `/agent/runs/:runId`。当前沙箱环境会在 Vite 监听 `127.0.0.1:4179` 时返回 `listen EPERM`；改用外部 base URL 和 Playwright 自带 Chromium 后，headless shell 仍会因为 macOS Mach port 权限失败而 `SIGTRAP`，因此浏览器验收需要在本机或 CI 中执行。

## 自动化验收

当前环境可执行的静态质量门：

```bash
pnpm run test:agent-run-debugging
```

它会检查：

- 调试页关键 UI hook。
- 调试报告和调试包字段。
- schema 和 fixture 的机器校验、capabilities 和文档入口。
- 截图 artifact 校验器的通过/失败行为，包括 PNG 签名、关键 chunk、CRC、最小尺寸和最小文件大小。
- 前端聚焦测试和类型检查。

CI 会通过 `.github/workflows/ci.yml` 的 `AgentRun debugging acceptance` job 执行同一套静态门禁和浏览器验收，并上传 `agent-run-debugging-playwright-results` 附件用于查看截图、`test-results` 和 HTML report 失败上下文。
PR 模板也包含 AgentRun debugging changes 检查项，相关改动必须记录静态门禁、浏览器验收或 CI artifact 检查结果。

真实浏览器验收运行：

```bash
pnpm run test:agent-run-debugging:e2e
```

如果测试环境已经自行启动了前端服务，或当前进程不允许 Playwright 启动 Vite，可以改用外部地址：

```bash
MOVSCRIPT_E2E_BASE_URL=http://127.0.0.1:4179 pnpm run test:agent-run-debugging:e2e
```

默认浏览器使用 Playwright 自带 Chromium，减少对系统 Chrome 的依赖。如需强制使用系统 Chrome，可设置：

```bash
MOVSCRIPT_E2E_BROWSER_CHANNEL=chrome pnpm run test:agent-run-debugging:e2e
```

该命令会先清理旧的 `test-results` 和 `playwright-report`，通过后会把关键状态截图作为 Playwright 附件保存到测试结果目录，截图名称与下方清单一致。
它由 `scripts/run-agent-run-debugging-e2e.mjs` 执行：即使浏览器验收失败也会继续执行截图附件校验，最终同时报告浏览器退出码、启动失败原因或终止信号，以及截图 artifact 校验退出码。
根级 E2E 命令会在 Playwright 通过后自动运行截图附件校验：

```bash
node scripts/verify-agent-run-debugging-artifacts.mjs apps/frontend/test-results
```

截图校验默认要求文件不小于 `1024` bytes、尺寸不小于 `320x240`。如 CI 使用特殊截图尺寸，可通过 `AGENT_RUN_DEBUG_SCREENSHOT_MIN_BYTES`、`AGENT_RUN_DEBUG_SCREENSHOT_MIN_WIDTH`、`AGENT_RUN_DEBUG_SCREENSHOT_MIN_HEIGHT` 调整阈值。

通过标准：

- 运行详情页能打开并展示 `agent-run-trace-panel`。
- 调试覆盖展示事件、模型调用、HTTP 响应、请求负载、响应正文、上下文详情、历史写入和工具详情。
- 诊断清单展示状态、详情和下一步动作。
- 调试口径展示模型请求、模型响应、历史写入和缺失项。
- 大模型调用总览能展开同轮请求、响应、工具调用和历史写入。
- 模型 HTTP 请求能展开 headers、完整 request payload、messages 和 tools。
- 模型 HTTP 响应能展开 headers、原始 body 和模型结果。
- 复制调试摘要包含运行元信息、诊断清单、调试口径、轮次关联、上下文、工具和历史写入。
- 复制调试包包含 `schema`、`schemaUrl`、`generatedAt`、`capabilities`、`fieldGuide`、`readinessChecklist`、`modelCallContexts` 和脱敏事件。
- 敏感信息不会出现在 UI、摘要或调试包中。

## 手工截图验收

至少保存以下状态截图；自动化 E2E 会在对应状态下生成同名 Playwright 附件，手工验收时也按同名文件保存：

| 截图 | 必须包含 |
| --- | --- |
| `agent-run-debug-overview` | 调试覆盖、调试包版本、调试口径、诊断清单。 |
| `agent-run-model-call-expanded` | 大模型调用总览展开后的本轮详情、请求/响应定位按钮、历史写入和工具调用。 |
| `agent-run-http-request-detail` | HTTP 请求、请求头、完整请求负载、请求消息分组、工具定义。 |
| `agent-run-http-response-detail` | HTTP 响应、响应头、原始响应正文、模型结果。 |
| `agent-run-attention-events` | 异常/需关注事件面板，或无异常时的正常状态。 |
| `agent-run-missing-data` | 有缺失数据时的诊断清单、缺口提示和下一步动作。 |

## 调试包验收

复制调试包后确认：

1. JSON 能被 `JSON.parse` 解析。
2. `schema` 为 `movscript.agent-run-debug-bundle.v1`。
3. `capabilities` 至少包含 `fieldGuide`、`modelCallContexts`、`readinessChecklist`、`redactedDebugData`。
4. `readinessChecklist[*].action` 存在。
5. `modelCallContexts` 能把模型事件、工具调用和历史写入关联到同一轮。
6. 搜索 `authorization`、`api_key`、`token`、`secret`、`cookie` 等敏感词时，只能看到脱敏后的值或字段名，不能看到真实密钥值。

## 未通过时的处理

- 如果页面未显示完整调试信息，先点击“加载全部事件”。
- 如果点击复制调试包失败，检查是否仍有未加载事件或浏览器剪贴板权限错误。
- 如果 E2E 不能启动 dev server，记录端口、命令和错误文本；若已有外部前端服务，使用 `MOVSCRIPT_E2E_BASE_URL` 复跑。
- 如果 E2E 通过但截图校验失败，检查 `apps/frontend/test-results` 下是否缺少同名 PNG 附件，或截图文件是否被占位文件替换、PNG 结构损坏、尺寸低于 `320x240`、文件小于 `1024` bytes。
- 如果旧 run 缺少 request payload 或 response body，按诊断清单记录为历史采集缺口，不视为当前 UI 回归。
