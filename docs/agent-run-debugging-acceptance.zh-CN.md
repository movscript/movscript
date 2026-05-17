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
- 调试包 schema 和 fixture 的机器校验、验收摘要 schema/fixture 的机器校验、capabilities 和文档入口。
- 静态 verifier 自测，包括 fixture 覆盖入口、同轮工具/历史回溯、pending 计数一致性、debug bundle schema raw event definition/status/roundSource/field definition drift、debug bundle schema modelCall/promptDetail field definition drift、debug bundle schema toolCall status drift、debug bundle schema attentionEvent enum drift、debug bundle schema pendingAction variant drift、debug bundle pendingAction filter/export field/contract doc drift、debug bundle schema fieldGuide/readiness id drift、debug bundle fixture coverage/modelCall type/promptDetail type/derived trace item/pendingAction variant/fieldGuide/readiness drift、debug bundle fixture raw event runId/kind/status drift、验收摘要 fixture schema 漂移、验收摘要截图清单漂移、验收摘要截图清单 schema 漂移、验收摘要 artifactRoot override schema 漂移、E2E runner 相对 artifact root 漂移、E2E runner 验收摘要写出前校验漂移、trace kind/status/roundSource/field 漂移、trace kind/status/category 中文标签缺失、旧 frontend 命令回归、中英文文档索引 schema 链接缺失、E2E 截图采集清单缺失、E2E 额外截图采集、artifact verifier 缺失/额外截图要求、artifact verifier 测试截图清单漂移和验收文档截图清单漂移场景。
- 截图 artifact 校验器的通过/失败行为，包括 PNG 签名、关键 chunk、CRC、最小尺寸和最小文件大小。
- 前端聚焦测试和类型检查。

CI 会通过 `.github/workflows/ci.yml` 的 `AgentRun debugging acceptance` job 执行同一套静态门禁和浏览器验收，失败或成功都会打印 `agent-run-debugging-acceptance-summary.json`，并同步写入 GitHub job summary 面板；同时上传 `agent-run-debugging-playwright-results` 附件用于查看截图、`test-results` 和 HTML report 失败上下文。
PR 模板也包含 AgentRun debugging changes 检查项，相关改动必须记录静态门禁、浏览器验收或 CI artifact 检查结果。

真实浏览器验收运行：

```bash
pnpm run test:agent-run-debugging:e2e
```

也可以通过 Makefile 入口运行同一套浏览器验收：

```bash
make test-agent-run-debugging-e2e
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
runner 还会在 `apps/frontend/test-results/agent-run-debugging-acceptance-summary.json` 写入机器可读验收摘要，字段包含 `schema`、`generatedAt`、`artifactRoot`、`environment`、`requiredScreenshots`、`screenshotDiagnostics`、`cleanArtifacts`、`browser`、`screenshotArtifacts` 和 `passed`，便于 CI artifact 下载后快速判断清理步骤、浏览器步骤与截图校验步骤的状态、运行环境、已生成/缺失/无效截图以及本次验收要求的截图清单。写出前 runner 会先校验摘要字段、运行环境、截图清单、截图诊断、步骤状态和 `passed` 逻辑；即使 artifact 清理失败，也会尽量写出摘要并标记后续步骤为 skipped。`artifactRoot` 会记录实际使用的 artifact 目录，支持 `AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT` 覆盖；`environment` 会记录是否使用外部 base URL、脱敏后的 base URL origin、预检端口和 artifact root 是否被覆盖，不写入用户名、密码、路径或查询参数。
下载 CI artifact 或复核本地产物时，可直接机器校验摘要。默认要求 `passed: true`；如果只想确认失败摘要的契约字段仍完整，可追加 `--allow-failed`：

```bash
node scripts/verify-agent-run-debugging-acceptance-summary.mjs apps/frontend/test-results/agent-run-debugging-acceptance-summary.json
node scripts/verify-agent-run-debugging-acceptance-summary.mjs apps/frontend/test-results/agent-run-debugging-acceptance-summary.json --allow-failed
```

也可以用 Makefile 入口复核本地或下载后的摘要；第一个目标要求 `passed: true`，第二个目标只检查失败摘要契约字段是否完整：

```bash
make verify-agent-run-debugging-summary AGENT_RUN_DEBUGGING_SUMMARY=apps/frontend/test-results/agent-run-debugging-acceptance-summary.json
make verify-agent-run-debugging-summary-contract AGENT_RUN_DEBUGGING_SUMMARY=apps/frontend/test-results/agent-run-debugging-acceptance-summary.json
```

根级 E2E 命令会在 Playwright 通过后自动运行截图附件校验：

```bash
node scripts/verify-agent-run-debugging-artifacts.mjs apps/frontend/test-results
```

截图校验默认要求文件不小于 `1024` bytes、尺寸不小于 `320x240`。如 CI 使用特殊截图尺寸，可通过 `AGENT_RUN_DEBUG_SCREENSHOT_MIN_BYTES`、`AGENT_RUN_DEBUG_SCREENSHOT_MIN_WIDTH`、`AGENT_RUN_DEBUG_SCREENSHOT_MIN_HEIGHT` 调整阈值。
如需要在并行 CI job 或脚本自测中隔离 Playwright 产物，可设置 `AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT=<dir>`；相对路径会按仓库根目录解析，runner 会把解析后的绝对路径传给 Playwright，runner 和 Playwright `outputDir` 会使用同一个目录，截图校验也会检查该目录。

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
