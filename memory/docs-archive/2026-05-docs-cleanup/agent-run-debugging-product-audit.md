# AgentRun 调试产品成熟度审计

更新日期：2026-05-17

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
| 机器可读调试包 | `copyDebugBundle` 输出 `schema`、`schemaUrl`、`generatedAt`、`capabilities`、`run`、`runSummary`、`fieldGuide`、`coverage`、`readinessChecklist`、`modelCalls`、`modelCallContexts`、`promptDetails`、`messageWrites`、`toolCalls`、`attentionEvents`、`pendingActions`、`events`；运行基础信息未加载时禁用复制按钮并显示原因，按钮通过 `aria-describedby` 关联禁用原因；页面展示调试包版本和能力数；旧 run 缺少角色字段时 `runSummary.role` 固定落为 `unknown`；`docs/agent-run-debug-bundle-v1.schema.json` 将 `schemaUrl`、`generatedAt`、`run`、`runSummary` 等固定输出字段列为必填，并要求 run 快照至少包含 `id/threadId/status/createdAt`，且 `run.status` 与 `runSummary.status` 必须落在 AgentRun 状态枚举内；`modelCalls.status` 与 `modelCallContexts.status` 必须落在同一组模型调用状态枚举内；`toolCalls/toolCallRef/attentionEvents` 的 kind/status 绑定到 trace 枚举；`pendingActions` 每项至少包含 `type/id/createdAt`，类型限定为 `approval/input`，并按 approval/input variant 要求审批和输入字段；fixture 固化复制契约；`scripts/verify-agent-run-debugging.mjs` 会按 schema 机器校验 fixture，检查 fixture 的 `runId/run/runSummary/trace/modelCalls/modelCallContexts/eventIds` 互相一致，要求同轮 `modelCallContexts.toolCalls/messageWrites` 必须能回溯到顶层 `toolCalls/messageWrites`，并要求 `runSummary.pendingApprovals/pendingInputs` 与 `pendingActions` 类型计数一致；同时严格校验 `generatedAt`、run 时间、runSummary 时间、pending action 时间和 attention event 时间的 date-time，并要求页面 `DEBUG_BUNDLE_CAPABILITIES`、fixture capabilities 与 schema enum 精确一致 | 已满足 |
| 调试包消费契约已发布 | `docs/agent-run-debug-bundle-v1.zh-CN.md` 说明版本识别、核心字段、读取顺序、脱敏边界、旧运行限制和兼容策略；`docs/README.zh-CN.md` 已链接 | 已满足 |
| 旧运行限制可解释 | 页面诊断清单给出缺失数据下一步；`docs/agent-run-debug-bundle-v1.zh-CN.md` 说明旧 run 缺失 request payload、response body、context、history write、tool detail 时不能事后补齐 | 已满足 |
| 浏览器验收标准明确 | `docs/agent-run-debugging-acceptance.zh-CN.md` 定义 Playwright 命令、外部 base URL 复跑方式、CI job、通过标准、截图附件清单、调试包验收和失败处理；`docs/agent-run-debugging-acceptance-summary-v1.schema.json` 与 fixture 固化 E2E 机器可读摘要契约，并由静态 verifier 按 schema 校验；PR 模板和发布清单要求 AgentRun 调试改动跑门禁并检查 CI artifact；`docs/README.zh-CN.md` 与 `docs/README.md` 已链接 | 已满足 |
| 后端持久化模型 HTTP 和历史写入 | `apps/agent/src/application/runtimeRouter.test.ts`、`runtimeRunExecutionPreflight.test.ts` 已覆盖模型 HTTP request/response persistence 和 assistant history writes | 已满足 |
| 回归保护 | `localAgentClient.test.ts`、`agentRunUiView.test.ts`、`agentGenerationUiContract.test.tsx`、`agent-planner.spec.ts` 覆盖 trace 客户端读取契约、UI hook、报告、调试包、脱敏、模型详情、异常入口 | 已满足 |

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
| “直到成熟产品” | 成熟度审计、验收清单、文档入口、PR 检查项、发布检查项、Makefile 默认测试入口、静态质量门、CI 浏览器 E2E、可复用外部服务的浏览器 E2E、默认 Playwright Chromium、旧 artifact 清理、自动截图附件校验及其行为测试、浏览器失败后仍执行 artifact 校验的 E2E runner、机器可读 E2E 验收摘要、独立 acceptance summary verifier、调试包静态 verifier 自测 | `docs/agent-run-debugging-product-audit.md`、`docs/agent-run-debugging-acceptance.zh-CN.md`、`docs/README.zh-CN.md`、`docs/README.md`、`docs/release-checklist.zh-CN.md`、`docs/release-checklist.md`、`.github/pull_request_template.md`、`.github/workflows/ci.yml`、`Makefile`、`apps/frontend/playwright.config.ts`、`scripts/run-agent-run-debugging-e2e.mjs`、`scripts/clean-agent-run-debugging-artifacts.mjs`、`scripts/verify-agent-run-debugging.mjs`、`scripts/verify-agent-run-debugging.test.mjs`、`scripts/verify-agent-run-debugging-artifacts.mjs`、`scripts/verify-agent-run-debugging-artifacts.test.mjs`、`scripts/verify-agent-run-debugging-acceptance-summary.mjs`、`pnpm run test:agent-run-debugging` | 未完成：缺真实浏览器执行证据 |

## 已运行验证

最近一次前端聚焦验证（2026-05-17）：

```bash
pnpm --filter movscript-frontend exec node --import tsx --test src/lib/localAgentClient.test.ts src/lib/agentRunActivity.test.ts src/lib/agentRunUiView.test.ts src/lib/agentGenerationUiContract.test.tsx src/lib/agentTraceDebugData.test.ts src/lib/agentPlanUi.test.ts src/lib/jsonValue.test.ts src/lib/agentArtifacts.test.ts src/store/agentStore.test.ts
```

结果：71 passed。

最近一次前端全量测试（2026-05-17）：

```bash
pnpm --filter movscript-frontend test
```

结果：288 passed。

最近一次前端类型检查（2026-05-17）：

```bash
pnpm --filter movscript-frontend typecheck
```

结果：passed。

最近一次 Agent 全量测试（2026-05-17）：

```bash
pnpm --filter movscript-agent test
```

结果：1028 passed。

最近一次 Agent 类型检查（2026-05-17）：

```bash
pnpm --filter movscript-agent typecheck
```

结果：passed。

最近一次仓库级类型检查（2026-05-17）：

```bash
pnpm run typecheck
```

结果：passed，覆盖 packages、agent、frontend、admin 等 workspace 的 typecheck。

最近一次 Agent 构建（2026-05-17）：

```bash
pnpm --filter movscript-agent build
```

结果：passed，包含 `@movscript/draft-schemas` 构建、agent TypeScript build 和 server bundle 构建。

最近一次前端生产构建（2026-05-17）：

```bash
pnpm --filter movscript-frontend build
```

结果：passed，包含 `prepare-agent-deploy` 触发的 agent build、Electron main/preload build 和 renderer build。

最近一次 Admin 测试（2026-05-17）：

```bash
pnpm --filter movscript-admin test
```

结果：69 passed。

最近一次 Admin 类型检查（2026-05-17）：

```bash
pnpm --filter movscript-admin typecheck
```

结果：passed。

根 workspace 测试脚本清单（2026-05-17）：

```bash
node -e "const fs=require('fs'); const files=['package.json',...fs.readdirSync('apps').map(d=>'apps/'+d+'/package.json'),...fs.readdirSync('packages').map(d=>'packages/'+d+'/package.json')].filter(f=>fs.existsSync(f)); for (const f of files){const p=JSON.parse(fs.readFileSync(f,'utf8')); if(p.scripts&&p.scripts.test) console.log(f+': '+p.name+' -> '+p.scripts.test)}"
```

结果：根 `pnpm -r --if-present test` 只会触达 `movscript-admin`、`movscript-agent`、`movscript-frontend` 三个 workspace；这三块测试均已有通过记录。

最近一次根级测试（2026-05-17）：

```bash
pnpm run test
```

结果：通过，覆盖 backend unit、backend architecture、AgentRun debugging gate，以及 `movscript-admin`、`movscript-agent`、`movscript-frontend` workspace tests；其中 agent workspace 为 1028 passed，frontend workspace 为 288 passed，admin workspace 为 69 passed。

最近一次 AgentRun 调试产品静态质量门（2026-05-17）：

```bash
pnpm run test:agent-run-debugging
```

结果：verifier passed，static verifier tests 68 passed，artifact cleanup/verifier/E2E runner tests 23 passed，frontend focused tests 71 passed，frontend typecheck passed。

Makefile 入口复核（2026-05-17）：

```bash
make test-agent-run-debugging
```

结果：通过，执行同一套 `pnpm run test:agent-run-debugging` 门禁。

Makefile 验收摘要复核入口（2026-05-17）：

```bash
make verify-agent-run-debugging-summary AGENT_RUN_DEBUGGING_SUMMARY=docs/agent-run-debugging-acceptance-summary-v1.fixture.json
```

结果：通过，执行 `scripts/verify-agent-run-debugging-acceptance-summary.mjs` 并确认 fixture summary 契约有效且 `passed: true`。

Makefile 浏览器验收入口 dry-run（2026-05-17）：

```bash
make -n test-agent-run-debugging-e2e
```

结果：输出 `pnpm run test:agent-run-debugging:e2e`，确认 Makefile 入口指向同一套浏览器验收命令；当前沙箱不实际执行该目标，避免触发本地端口监听 `EPERM`。

Makefile 失败摘要契约复核入口（2026-05-17）：

```bash
make verify-agent-run-debugging-summary-contract
```

结果：通过，执行 `scripts/verify-agent-run-debugging-acceptance-summary.mjs apps/frontend/test-results/agent-run-debugging-acceptance-summary.json --allow-failed`，确认当前沙箱失败 E2E 产出的 summary 契约字段完整。

默认 Makefile 测试入口复核：

```bash
make test
```

结果：通过，覆盖 `test-backend`、workspace typecheck 和 `test-agent-run-debugging`。其中 AgentRun debugging gate 继续通过 verifier、91 个 Node 自测、71 个前端聚焦测试和前端 typecheck。

CI 验收入口：

`.github/workflows/ci.yml` 已新增 `AgentRun debugging acceptance` job，会执行 `pnpm run test:agent-run-debugging`、安装 Playwright Chromium、执行 `pnpm run test:agent-run-debugging:e2e`，E2E 成功后再运行 `pnpm run verify:agent-run-debugging-summary` 机器复核 `passed: true`；`always()` 步骤打印 summary 前也会用 `--allow-failed` 复核失败摘要契约，随后打印 `agent-run-debugging-acceptance-summary.json`、写入 GitHub job summary，并上传 `agent-run-debugging-playwright-results` artifact，保留 14 天。CI 支持 `workflow_dispatch` 手动触发；Playwright reporter 会同时输出 GitHub annotations 和 HTML report，便于在 artifact 中查看截图与失败上下文。

PR 检查入口：

`.github/pull_request_template.md` 已新增 AgentRun debugging changes 检查项，要求相关改动确认 `pnpm run test:agent-run-debugging` 通过，并跑 `pnpm run test:agent-run-debugging:e2e` 或检查 CI `agent-run-debugging-playwright-results` artifact，且确认 `agent-run-debugging-acceptance-summary.json` 显示 `passed: true`。根 `pnpm test` 和 `Makefile` 的默认 `make test` 均已包含 `test-agent-run-debugging`，并提供 `make test-agent-run-debugging-e2e` 运行同一套浏览器验收、`make verify-agent-run-debugging-summary AGENT_RUN_DEBUGGING_SUMMARY=<summary-path>` 复核通过摘要、`make verify-agent-run-debugging-summary-contract AGENT_RUN_DEBUGGING_SUMMARY=<summary-path>` 只复核失败摘要契约字段。

发布检查入口：

`docs/release-checklist.zh-CN.md` 与 `docs/release-checklist.md` 已加入 AgentRun 调试门禁，要求发布前运行 `pnpm run test:agent-run-debugging`，且 AgentRun 调试页或 Agent 运行链路变更时需要浏览器验收通过、归档 `agent-run-debugging-playwright-results`，并确认 `agent-run-debugging-acceptance-summary.json` 显示 `passed: true`。根 `release:check` 也已串入 `pnpm run test:agent-run-debugging`。

CI workflow 语法校验：

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml'); puts 'ci workflow yaml ok'"
```

结果：`ci workflow yaml ok`。

Release 脚本回归验证（2026-05-17）：

```bash
pnpm run test:release-scripts
```

结果：108 passed，覆盖 release workflow、artifact collection、desktop package、ffmpeg staging/audit/download、admin asset copy 和 build-lock 脚本回归。

Playwright 用例发现校验：

```bash
pnpm --filter movscript-frontend exec playwright test src/e2e/agent-planner.spec.ts --project=chromium --list
```

结果：通过，`agent-planner.spec.ts` 在 `chromium` project 下可发现 16 个用例。当前剩余失败点不是用例发现，而是当前沙箱的端口监听和浏览器启动权限。

E2E runner 诊断兜底：

`scripts/run-agent-run-debugging-e2e.mjs` 已成为 `test:agent-run-debugging:e2e` 的唯一入口。它会先清理旧 artifact，再运行 Playwright，随后无论浏览器是否失败都会继续运行 `scripts/verify-agent-run-debugging-artifacts.mjs`，最后同时报告清理、浏览器和截图 artifact 校验退出码，并写入 `apps/frontend/test-results/agent-run-debugging-acceptance-summary.json` 作为机器可读验收摘要；即使 artifact 清理失败，runner 也会尽量写出摘要并将后续步骤标记为 skipped。写出前 runner 会校验摘要字段、环境字段、截图清单、步骤结果和 `passed` 逻辑。`docs/agent-run-debugging-acceptance-summary-v1.schema.json` 与 fixture 会被静态 verifier 按 schema 校验，并固化 `environment`、`cleanArtifacts`、`screenshotDiagnostics`、`requiredScreenshots` 清单和 `minItems/maxItems`，同时允许 `artifactRoot` 记录 override 后的实际目录；`screenshotDiagnostics` 会记录 present、missing 和 invalid 截图，invalid 项包含截图名和 PNG 校验失败原因；`environment.baseURLOrigin` 只记录 origin，不写入用户名、密码、路径或查询参数。`scripts/verify-agent-run-debugging-acceptance-summary.mjs` 是独立 acceptance summary verifier，默认要求摘要契约有效且 `passed: true`，也支持 `--allow-failed` 只复核失败摘要的契约字段。runner 和 Playwright config 都支持 `AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT` artifact root override；相对路径会按仓库根目录解析，并以绝对路径传入浏览器子进程，使脚本自测或特殊 CI 可使用隔离目录，避免多个门禁并行时互相清理默认 Playwright 产物。`scripts/verify-agent-run-debugging.test.mjs` 已覆盖静态 verifier 的 fixture 覆盖入口、同轮工具调用回溯、同轮历史写入回溯、pending 计数一致性失败场景、debug bundle schema raw event definition/status drift 场景、debug bundle schema trace event roundSource drift 场景、debug bundle schema trace event field definition drift 场景、debug bundle schema modelCall field definition drift 场景、debug bundle schema promptDetail field definition drift 场景、debug bundle schema toolCall status drift 场景、debug bundle schema attentionEvent enum drift 场景、debug bundle schema pendingAction variant drift 场景、debug bundle pendingAction filter drift 场景、debug bundle pendingAction export field drift 场景、debug bundle pendingAction contract doc drift 场景、debug bundle schema fieldGuide id drift 场景、debug bundle schema readiness id drift 场景、debug bundle fixture coverage drift 场景、debug bundle fixture modelCall type drift 场景、debug bundle fixture promptDetail type drift 场景、debug bundle fixture derived trace item drift 场景、debug bundle fixture pendingAction variant drift 场景、debug bundle fixture fieldGuide drift 场景、debug bundle fixture readiness drift 场景、debug bundle fixture raw event runId/kind/status drift 场景、acceptance summary fixture schema drift 场景、acceptance summary loose object schema drift 场景、acceptance summary screenshot list drift 场景、acceptance summary screenshot list schema drift 场景、acceptance summary artifactRoot override schema drift 场景、acceptance summary environment schema drift 场景、E2E runner relative artifact root override drift 场景、E2E runner acceptance summary validation drift 场景、前端多出 trace kind 的失败场景、后端新增 trace kind 但前端未跟进的失败场景、trace status 漂移场景、trace roundSource 漂移场景、trace field 漂移场景、trace kind/status/category 中文标签缺失场景、旧 frontend workspace 命令回归场景、根 `pnpm test` 门禁串联缺失场景、Makefile 浏览器验收入口缺失场景、Makefile 浏览器验收 dry-run 证据缺失场景、Makefile 失败摘要契约复核入口缺失场景、中英文文档索引 schema 链接缺失场景、E2E 截图采集清单缺失场景、E2E 额外截图采集场景、artifact verifier 测试截图清单漂移场景、验收文档截图清单漂移场景、artifact verifier 缺失截图要求漂移场景，以及 artifact verifier 额外截图要求漂移场景；`scripts/verify-agent-run-debugging-artifacts.test.mjs` 已覆盖截图根目录不存在时仍列出必需截图、artifact 清理失败时仍写出 E2E 验收摘要并跳过后续步骤、浏览器命令失败时仍输出缺失截图清单、artifact root override 不清理默认产物、relative artifact root override 会按仓库根目录解析并传入浏览器子进程、部分截图生成时 summary 区分 present/missing、无效截图生成时 summary 记录 invalid 原因、浏览器命令无法启动时输出 spawn 错误、浏览器被 signal 终止时输出 signal 名称、local web server preflight 失败诊断、失败时写出 E2E 验收摘要、外部 base URL 只记录脱敏 origin、截图校验通过时写出 `passed: true` 摘要、acceptance summary verifier 默认拒绝失败摘要、`--allow-failed` 只做契约复核，以及 summary contract drift 拒绝行为。

补丁空白检查：

```bash
git diff --check -- .github/pull_request_template.md .github/workflows/ci.yml Makefile apps/frontend/playwright.config.ts package.json scripts/clean-agent-run-debugging-artifacts.mjs scripts/verify-agent-run-debugging-artifacts.mjs scripts/verify-agent-run-debugging-artifacts.test.mjs scripts/verify-agent-run-debugging.mjs scripts/verify-agent-run-debugging.test.mjs docs/README.md docs/README.zh-CN.md docs/release-checklist.md docs/release-checklist.zh-CN.md docs/agent-run-debugging-acceptance.zh-CN.md docs/agent-run-debugging-product-audit.md
```

结果：通过，无尾随空格或补丁空白问题。

最近一次浏览器 E2E 尝试（2026-05-17）：

```bash
pnpm run test:agent-run-debugging:e2e
```

结果：命令先通过 `scripts/run-agent-run-debugging-e2e.mjs` 清理旧产物，然后在本地 web server preflight 阶段被当前沙箱拦住，错误为 `local web server listen blocked by environment on 127.0.0.1:4179 (EPERM)`。runner 随后继续执行截图 artifact 校验，并明确报告 artifact root 不存在，同时列出缺少 `agent-run-debug-overview.png`、`agent-run-model-call-expanded.png`、`agent-run-http-request-detail.png`、`agent-run-http-response-detail.png`、`agent-run-attention-events.png`、`agent-run-missing-data.png`；最终同时报告 browser acceptance preflight failure 和 screenshot artifact verification exit code 1，并写出 `agent-run-debugging-acceptance-summary.json`，其中 `cleanArtifacts.status` 为 0，`environment.preflightPort` 为 4179，`screenshotDiagnostics.missingScreenshots` 记录全部 6 张必需截图，`browser.failure` 记录 EPERM remediation，`screenshotArtifacts.status` 为 1，`passed` 为 `false`。已补充 `MOVSCRIPT_E2E_BASE_URL` 外部服务入口，便于在本机或 CI 中绕过 Playwright 自启动 Vite 的限制；默认浏览器改为 Playwright 自带 Chromium，必要时可用 `MOVSCRIPT_E2E_BROWSER_CHANNEL=chrome` 切回系统 Chrome。

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
