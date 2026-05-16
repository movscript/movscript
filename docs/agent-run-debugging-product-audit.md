# AgentRun 调试产品成熟度审计

更新日期：2026-05-16

## 目标

把 `/agent/runs/:runId` 做成可用于调试 agent 运行过程的成熟产品界面。用户应能回答：

- 这次 run 的上下文是怎么组成的，agent 当时看到了什么。
- 每一轮大模型 HTTP 请求发送了哪些 messages、tools、headers、payload。
- 大模型 HTTP 响应、模型结果、assistant 历史写入是否都被保存和关联。
- agent 做了哪些行为，这些行为造成了什么影响。
- 工具调用、审批、输入等待、失败/阻塞事件是否能被快速定位。
- 调试信息是否能复制成脱敏摘要和机器可读调试包。

## 当前证据

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| `/agent/runs/:runId` 有运行轨迹入口 | `apps/frontend/src/pages/agent/AIAgentRunPage.tsx` 渲染 `agent-run-trace-panel`、事件筛选、搜索、加载全部、deep link | 已满足 |
| UI 中文化 | `apps/frontend/src/lib/agentRunUi.ts` 提供 `traceKindLabel`、`traceCategoryLabel`、`runStatusLabel`、`traceTitle` 等中文映射；`agentRunUiView.test.ts` 覆盖中文文案 | 已满足 |
| 行为和影响分开 | `agentTraceView` 输出 `behavior` 与 `impact`；页面以 `TraceDetailLine` 分开展示；测试 `agentTraceView keeps behavior and impact separated` | 已满足 |
| 模型上下文可解释 | `tracePromptDetail` 暴露上下文层级、来源、片段、技能、工具；页面 `agent-run-prompt-detail` 展示 | 已满足 |
| 模型 HTTP 请求可展开 | `traceModelDetail` 提取请求 method/url/model/headers/payload/messages/tools/tool_choice/stream；页面 `ModelCallDetail` 展示完整请求负载和消息分组 | 已满足 |
| 模型 HTTP 响应可展开 | `traceModelDetail` 提取响应 headers/content/bodyText/parsedId/result usage；页面展示 HTTP 响应和原始响应正文 | 已满足 |
| 请求、响应、结果可按轮次关联 | `buildModelCallSummaries` 与 `buildModelCallDebugContext(s)` 关联模型事件、工具调用、历史写入；页面 `agent-run-model-call-inline-debug` 展示本轮详情 | 已满足 |
| assistant 历史写入可见 | `traceMessageDetail` 展示 messageId/source/content；报告和调试包包含 `messageWrites` | 已满足 |
| 工具调用结构化详情 | `traceToolDetail` 展示工具、状态、来源、沙箱、耗时、结果字段；报告和调试包包含 `toolCalls` | 已满足 |
| 异常/需关注事件集中入口 | `buildDebugAttentionEvents`、页面 `agent-run-attention-events` 和“只看需关注”快捷筛选 | 已满足 |
| 调试覆盖和诊断清单 | `buildDebugCoverageSummary` 与 `buildDebugReadinessChecklist` 输出覆盖指标、缺口、诊断项和下一步动作；页面、报告、调试包均包含 | 已满足 |
| 调试口径可理解 | 页面 `agent-run-debug-field-guide`、复制摘要和调试包 `fieldGuide` 解释模型请求、模型响应、历史写入和缺失项判断口径 | 已满足 |
| 脱敏复制摘要 | `buildDebugReportText` 输出运行元信息、覆盖、诊断清单、模型调用、轮次关联、上下文、工具、历史、异常事件；测试覆盖敏感信息不泄露 | 已满足 |
| 机器可读调试包 | `copyDebugBundle` 输出 `schema`、`schemaUrl`、`generatedAt`、`capabilities`、`run`、`runSummary`、`fieldGuide`、`coverage`、`readinessChecklist`、`modelCalls`、`modelCallContexts`、`promptDetails`、`messageWrites`、`toolCalls`、`attentionEvents`、`pendingActions`、`events`；运行基础信息未加载时禁用复制按钮并显示原因，按钮通过 `aria-describedby` 关联禁用原因；页面展示调试包版本和能力数；`docs/agent-run-debug-bundle-v1.schema.json` 将 `schemaUrl`、`generatedAt`、`run`、`runSummary` 等固定输出字段列为必填，并要求 run 快照至少包含 `id/threadId/status/createdAt`；fixture 固化复制契约；`scripts/verify-agent-run-debugging.mjs` 会按 schema 机器校验 fixture，严格校验 `generatedAt`、run 时间、runSummary 时间和 attention event 时间的 date-time，并要求页面 `DEBUG_BUNDLE_CAPABILITIES`、fixture capabilities 与 schema enum 精确一致 | 已满足 |
| 调试包消费契约已发布 | `docs/agent-run-debug-bundle-v1.zh-CN.md` 说明版本识别、核心字段、读取顺序、脱敏边界、旧运行限制和兼容策略；`docs/README.zh-CN.md` 已链接 | 已满足 |
| 旧运行限制可解释 | 页面诊断清单给出缺失数据下一步；`docs/agent-run-debug-bundle-v1.zh-CN.md` 说明旧 run 缺失 request payload、response body、context、history write、tool detail 时不能事后补齐 | 已满足 |
| 浏览器验收标准明确 | `docs/agent-run-debugging-acceptance.zh-CN.md` 定义 Playwright 命令、外部 base URL 复跑方式、CI job、通过标准、截图附件清单、调试包验收和失败处理；PR 模板和发布清单要求 AgentRun 调试改动跑门禁并检查 CI artifact；`docs/README.zh-CN.md` 与 `docs/README.md` 已链接 | 已满足 |
| 后端持久化模型 HTTP 和历史写入 | `apps/agent/src/application/agentRuntime.test.ts`、`runtimeRunExecutionPreflight.test.ts` 已覆盖模型 HTTP request/response persistence 和 assistant history writes | 已满足 |
| 回归保护 | `agentRunUiView.test.ts`、`agentGenerationUiContract.test.tsx`、`agent-planner.spec.ts` 覆盖 UI hook、报告、调试包、脱敏、模型详情、异常入口 | 已满足 |

## Prompt-to-artifact 检查表

| 用户问题/要求 | 对应产物 | 验证证据 | 当前判断 |
| --- | --- | --- | --- |
| “contextManager 记录了什么信息” | `tracePromptDetail`、`PromptDetail`、`promptDetails` 调试包字段、`fieldGuide` | `agentTraceView translates prompt composition into readable Chinese summary`；`agent-run-prompt-detail` UI hook；调试包 fixture 包含 `promptDetails` | 已覆盖 |
| “有没有 UI 方式看每一次 run agent 都干什么了” | `/agent/runs/:runId` 轨迹面板、事件筛选、搜索、deep link、加载全部事件 | `agent-run-trace-panel`、`agent-run-trace-event`、`agent-run-load-all-trace-events`；Playwright 断言已写入 | 代码/测试覆盖，真实浏览器待验收 |
| “/agent/runs/:runId 有按钮入口吗” | Agent 面板和运行详情入口、child run drilldown | `agentGenerationUiContract.test.tsx` 检查 `agentRunPath(child.id)`、`agent-run-child-run`；页面有返回/刷新/上级运行入口 | 已覆盖 |
| “AgentRun 看不懂，是否需要中文化” | `traceKindLabel`、`traceCategoryLabel`、`runStatusLabel`、`traceTitle`、中文 UI 文案 | `agentRunUiView.test.ts` 覆盖中文标签；页面文案均为中文 | 已覆盖 |
| “行为和影响没区分开” | `AgentTraceView.behavior` 与 `impact`、`TraceDetailLine` | `agentTraceView keeps behavior and impact separated`；UI 分别展示“行为”“影响” | 已覆盖 |
| “HTTP 调用携带的上下文没有分类展开” | `ModelCallDetail` 展示 HTTP 请求、完整 payload、消息分组、tools、HTTP 响应和结果 | `agent-run-model-request-messages`、`agent-run-model-request-tools`、`agent-run-model-http-response`；E2E 断言已写入 | 代码/测试覆盖，真实浏览器待验收 |
| “没有存储历史消息的 HTTP 回复” | `messageWrites`、`traceMessageDetail`、同轮 `modelCallContexts.messageWrites` | `buildDebugCoverageSummary warns when model replies have no assistant history write`；调试包 fixture 包含 `messageWrites` | 已覆盖 |
| “大模型请求详情还没来得及做详情展开” | `traceModelDetail`、`ModelCallInlineDebug`、`ModelCallDetail` | `agentTraceView exposes HTTP response and final model result separately`；`agent-run-model-call-inline-http-detail`；E2E 断言已写入 | 代码/测试覆盖，真实浏览器待验收 |
| “复制出来方便调试” | `buildDebugReportText`、`copyDebugBundle`、schema/fixture/contract doc | `test:agent-run-debugging`；调试包 v1 schema、fixture、契约文档；fixture 按 schema 机器校验通过 | 已覆盖 |
| “直到成熟产品” | 成熟度审计、验收清单、文档入口、PR 检查项、发布检查项、Makefile 默认测试入口、静态质量门、CI 浏览器 E2E、可复用外部服务的浏览器 E2E、默认 Playwright Chromium、旧 artifact 清理、自动截图附件校验及其行为测试、浏览器失败后仍执行 artifact 校验的 E2E runner | `docs/agent-run-debugging-product-audit.md`、`docs/agent-run-debugging-acceptance.zh-CN.md`、`docs/README.zh-CN.md`、`docs/README.md`、`docs/release-checklist.zh-CN.md`、`docs/release-checklist.md`、`.github/pull_request_template.md`、`.github/workflows/ci.yml`、`Makefile`、`apps/frontend/playwright.config.ts`、`scripts/run-agent-run-debugging-e2e.mjs`、`scripts/clean-agent-run-debugging-artifacts.mjs`、`scripts/verify-agent-run-debugging-artifacts.mjs`、`scripts/verify-agent-run-debugging-artifacts.test.mjs`、`pnpm run test:agent-run-debugging` | 未完成：缺真实浏览器执行证据 |

## 已运行验证

最近一次前端聚焦验证：

```bash
pnpm --dir movscript/apps/frontend exec node --import tsx --test src/lib/agentRunUiView.test.ts src/lib/agentGenerationUiContract.test.tsx src/lib/agentTraceDebugData.test.ts src/lib/agentPlanUi.test.ts
```

结果：55 passed。

最近一次前端类型检查：

```bash
pnpm --dir movscript/apps/frontend exec tsc --noEmit --pretty false
```

结果：passed。

最近一次 AgentRun 调试产品静态质量门（2026-05-16）：

```bash
pnpm run test:agent-run-debugging
```

结果：verifier passed，artifact cleanup/verifier/E2E runner tests 9 passed，frontend focused tests 55 passed，frontend typecheck passed。

Makefile 入口复核：

```bash
make test-agent-run-debugging
```

结果：通过，执行同一套 `pnpm run test:agent-run-debugging` 门禁。

默认 Makefile 测试入口复核：

```bash
make test
```

结果：未通过，且未执行到 `test-agent-run-debugging`；失败发生在 `test-backend` 阶段，包括 Go build cache `operation not permitted`，以及当前后端 relation/canvas/resource/migration 测试失败。该失败不来自 AgentRun 调试门禁。

CI 验收入口：

`.github/workflows/ci.yml` 已新增 `AgentRun debugging acceptance` job，会执行 `pnpm run test:agent-run-debugging`、安装 Playwright Chromium、执行 `pnpm run test:agent-run-debugging:e2e`，并上传 `agent-run-debugging-playwright-results` artifact，保留 14 天。CI 支持 `workflow_dispatch` 手动触发；Playwright reporter 会同时输出 GitHub annotations 和 HTML report，便于在 artifact 中查看截图与失败上下文。

PR 检查入口：

`.github/pull_request_template.md` 已新增 AgentRun debugging changes 检查项，要求相关改动确认 `pnpm run test:agent-run-debugging` 通过，并跑 `pnpm run test:agent-run-debugging:e2e` 或检查 CI `agent-run-debugging-playwright-results` artifact。`Makefile` 的默认 `make test` 也已包含 `test-agent-run-debugging`。

发布检查入口：

`docs/release-checklist.zh-CN.md` 与 `docs/release-checklist.md` 已加入 AgentRun 调试门禁，要求发布前运行 `pnpm run test:agent-run-debugging`，且 AgentRun 调试页或 Agent 运行链路变更时需要浏览器验收通过并归档 `agent-run-debugging-playwright-results`。根 `release:check` 也已串入 `pnpm run test:agent-run-debugging`。

CI workflow 语法校验：

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml'); puts 'ci workflow yaml ok'"
```

结果：`ci workflow yaml ok`。

Playwright 用例发现校验：

```bash
pnpm --filter movscript-frontend exec playwright test src/e2e/agent-planner.spec.ts --project=chromium --list
```

结果：通过，`agent-planner.spec.ts` 在 `chromium` project 下可发现 16 个用例。当前剩余失败点不是用例发现，而是当前沙箱的端口监听和浏览器启动权限。

E2E runner 诊断兜底：

`scripts/run-agent-run-debugging-e2e.mjs` 已成为 `test:agent-run-debugging:e2e` 的唯一入口。它会先清理旧 artifact，再运行 Playwright，随后无论浏览器是否失败都会继续运行 `scripts/verify-agent-run-debugging-artifacts.mjs`，最后同时报告浏览器退出码、启动失败原因或终止信号，以及截图 artifact 校验退出码。`scripts/verify-agent-run-debugging-artifacts.test.mjs` 已覆盖浏览器命令失败时仍输出缺失截图清单、浏览器命令无法启动时输出 spawn 错误、浏览器被 signal 终止时输出 signal 名称的行为。

补丁空白检查：

```bash
git diff --check -- .github/pull_request_template.md .github/workflows/ci.yml Makefile apps/frontend/playwright.config.ts package.json scripts/clean-agent-run-debugging-artifacts.mjs scripts/verify-agent-run-debugging-artifacts.mjs scripts/verify-agent-run-debugging-artifacts.test.mjs scripts/verify-agent-run-debugging.mjs docs/README.md docs/README.zh-CN.md docs/release-checklist.md docs/release-checklist.zh-CN.md docs/agent-run-debugging-acceptance.zh-CN.md docs/agent-run-debugging-product-audit.md
```

结果：通过，无尾随空格或补丁空白问题。

最近一次浏览器 E2E 尝试（2026-05-16）：

```bash
pnpm run test:agent-run-debugging:e2e
```

结果：命令先通过 `scripts/run-agent-run-debugging-e2e.mjs` 清理旧产物，然后成功调起 Playwright，但 Vite web server 启动失败，`listen EPERM: operation not permitted 127.0.0.1:4179`。runner 随后继续执行截图 artifact 校验，并明确列出缺少 `agent-run-debug-overview.png`、`agent-run-model-call-expanded.png`、`agent-run-http-request-detail.png`、`agent-run-http-response-detail.png`、`agent-run-attention-events.png`、`agent-run-missing-data.png`；最终同时报告 browser acceptance exit code 1 和 screenshot artifact verification exit code 1。已补充 `MOVSCRIPT_E2E_BASE_URL` 外部服务入口，便于在本机或 CI 中绕过 Playwright 自启动 Vite 的限制；默认浏览器改为 Playwright 自带 Chromium，必要时可用 `MOVSCRIPT_E2E_BROWSER_CHANNEL=chrome` 切回系统 Chrome。

最小本地监听复核：

```bash
node -e "require('node:http').createServer((_, res) => res.end('ok')).listen(0, '127.0.0.1', function () { console.log('listening', this.address().port); this.close() })"
```

结果：失败，`Error: listen EPERM: operation not permitted 127.0.0.1`。这说明当前沙箱禁止本地端口监听，E2E 的 dev server 失败不是 Vite 配置问题。

外部 base URL 复核（2026-05-16）：

```bash
MOVSCRIPT_E2E_BASE_URL=http://127.0.0.1:4179 pnpm run test:agent-run-debugging:e2e
```

结果：没有再触发 Vite `listen EPERM`，说明 Playwright 已跳过内置 web server；但当前沙箱中的系统 Chrome headless 在启动后 `SIGABRT`，仍未进入页面断言或截图采集。

默认 Playwright Chromium 复核（2026-05-16）：

```bash
MOVSCRIPT_E2E_BASE_URL=http://127.0.0.1:4179 pnpm --filter movscript-frontend exec playwright test src/e2e/agent-planner.spec.ts --project=chromium --grep "planner run exposes plan overview"
```

结果：浏览器路径已切到 Playwright 缓存的 `chromium_headless_shell`，不再依赖系统 Chrome；但当前沙箱仍因 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer... Permission denied (1100)` 触发 `SIGTRAP`，未进入页面断言。

截图附件校验：

```bash
node scripts/verify-agent-run-debugging-artifacts.mjs apps/frontend/test-results
```

该校验已串入 `pnpm run test:agent-run-debugging:e2e`，命令会先清理旧 `test-results` 和 `playwright-report`，再在浏览器断言通过后确认关键状态截图 PNG 存在，且满足 PNG 签名、关键 chunk、CRC、最小尺寸 `320x240` 和最小文件大小 `1024` bytes。这样可以拦截空文件、占位二进制文件和异常小的截图。

当前沙箱直接运行该校验的结果：失败，缺少 `agent-run-debug-overview.png`、`agent-run-model-call-expanded.png`、`agent-run-http-request-detail.png`、`agent-run-http-response-detail.png`、`agent-run-attention-events.png`、`agent-run-missing-data.png`。这符合当前浏览器未能启动、未生成截图附件的状态。

## 剩余缺口

| 缺口 | 影响 | 建议 |
| --- | --- | --- |
| Playwright E2E 在当前沙箱环境未实际跑通 | 浏览器级交互断言和验收清单已写入，但本环境无法证明真实浏览器渲染和点击链路全绿 | 在允许 dev server 监听端口且可启动 Chrome/Chromium 的环境运行 `pnpm run test:agent-run-debugging:e2e`；如服务已外部启动，使用 `MOVSCRIPT_E2E_BASE_URL=<url>` |
| 没有真实产品验收截图 | E2E 已自动采集并校验关键状态截图附件，但当前环境无法启动浏览器产出实际图片 | 在可运行环境执行 `pnpm run test:agent-run-debugging:e2e` 并归档 Playwright 附件 |

## 当前结论

AgentRun 调试能力已经覆盖主要产品需求：可读、可展开、可关联、可复制、可诊断、可脱敏。

但由于浏览器 E2E 未在当前环境实际跑通，本审计不建议将“成熟产品”目标标记为完成。下一步应优先在可监听端口的环境补齐真实浏览器验收，并归档自动生成的关键状态截图附件。

## 完成判定

| 判定项 | 当前状态 |
| --- | --- |
| 静态质量门 `pnpm run test:agent-run-debugging` | 通过 |
| Makefile 入口 `make test-agent-run-debugging` | 通过 |
| Playwright 用例发现 | 通过，16 个用例可发现 |
| 浏览器 E2E `pnpm run test:agent-run-debugging:e2e` | 未通过，当前沙箱无法监听端口或启动 headless Chromium |
| 截图 artifact 校验 | 未通过，当前沙箱未生成截图 |

最终判定：未完成。只有当浏览器 E2E 和截图 artifact 校验在本机或 CI 中实际通过后，才可以把 AgentRun 调试产品目标标记为完成。
