import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
import type { AgentTraceEvent } from '@/lib/localAgentClient'
import {
  APPROVAL_WORKER_RUN_ID,
  INPUT_WORKER_RUN_ID,
  PLANNER_PLAN_ID,
  PLANNER_RUN_ID,
  WORKER_RUN_ID,
  approvalWorkerRunFixture,
  buildPlannerAgentBootstrap,
  inputWorkerRunFixture,
  plannerPlanSnapshotFixture,
  plannerRunFixture,
  traceEventsFixture,
  traceSummaryFixture,
  workerRunFixture,
} from './agentPlannerSeed'
import { mockGenerationAppShell } from './generationAppShell'

test('planner run exposes plan overview and run detail drilldown', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page)

  await page.goto('/project/overview')

  await expect(page.getByTestId('agent-plan-overview')).toBeVisible()
  await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('0/4 个任务')
  await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('3 个执行器运行中')
  await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('1 个产物')
  await expect(page.getByTestId('agent-plan-status-explanation')).toContainText('3 个执行器运行中')
  await expect(page.getByTestId('agent-plan-artifact-summary')).toContainText('素材风险摘要')
  await expect(page.getByTestId('agent-plan-overview')).toContainText('Einstein')

  await page.goto(`/agent/runs/${PLANNER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-child-runs')).toContainText('Einstein')
  await expect(page.getByTestId('agent-run-child-runs')).toContainText('Hawking')
  await expect(page.getByTestId('agent-run-child-runs')).toContainText('Turing')
  await expect(page.getByRole('button', { name: '刷新 AgentRun 调试页面' })).toBeVisible()
  await page.getByTestId('agent-run-child-run').filter({ hasText: 'Einstein' }).click()
  await expect(page).toHaveURL(new RegExp(`/agent/runs/${WORKER_RUN_ID}$`))

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)

  await expect(page.getByTestId('agent-run-page')).toBeVisible()
  await expect(page.getByTestId('agent-run-header')).toContainText('Agent 运行')
  await expect(page.getByRole('button', { name: '打开上级运行' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开计划根运行' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回上一页' })).toBeVisible()
  await expect(page.getByTestId('agent-run-sidebar')).toContainText('Einstein')
  await expect(page.getByTestId('agent-run-plan-context')).toContainText('Planner 调度 E2E')
  await expect(page.getByTestId('agent-run-plan-context')).toContainText('素材风险审计')
  await expect(page.getByTestId('agent-run-task-artifacts')).toContainText('素材风险摘要')
  await expect(page.getByTestId('agent-run-trace-summary')).toContainText('6 个事件')

  await expect(page.getByRole('button', { name: '加载当前运行的事件' })).toBeVisible()
  await page.getByRole('button', { name: '加载当前运行的事件' }).click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await expect(page.getByTestId('agent-run-trace-loaded-count')).toContainText('已加载 6 / 6')
  await expect(page.getByTestId('agent-run-trace-event').first()).toContainText('执行器启动')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '组装模型上下文' })).toContainText('耗时 20ms')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toContainText('耗时 321ms')
  await expect(page.getByLabel('搜索运行事件')).toBeVisible()
  await expect(page.getByLabel('按事件类型筛选')).toBeVisible()
  await expect(page.getByLabel('按事件分类筛选')).toBeVisible()
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('调试覆盖')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('事件')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('6 / 6')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('请求负载')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('响应正文')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('上下文详情')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('历史写入')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('工具详情')
  await expect(page.getByTestId('agent-run-debug-readiness')).toContainText('诊断清单')
  await expect(page.getByTestId('agent-run-debug-readiness')).toContainText('事件完整性')
  await expect(page.getByTestId('agent-run-debug-readiness')).toContainText('请求负载可展开')
  await expect(page.getByTestId('agent-run-debug-readiness')).toContainText('已满足')
  await expect(page.getByTestId('agent-run-debug-readiness')).toContainText('下一步')
  await expect(page.getByTestId('agent-run-debug-readiness')).toContainText('展开“完整请求负载”和“请求消息”')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('信息完整')
  await expect(page.getByTestId('agent-run-debug-bundle-contract')).toContainText('movscript.agent-run-debug-bundle.v1')
  await expect(page.getByTestId('agent-run-debug-bundle-contract')).toContainText('10 项能力')
  await expect(page.getByTestId('agent-run-debug-bundle-contract')).toContainText('脱敏复制')
  await expect(page.getByTestId('agent-run-debug-field-guide')).toContainText('调试口径')
  await page.getByTestId('agent-run-debug-field-guide').getByText('调试口径').click()
  await expect(page.getByTestId('agent-run-debug-field-guide')).toContainText('模型请求')
  await expect(page.getByTestId('agent-run-debug-field-guide')).toContainText('模型响应')
  await expect(page.getByTestId('agent-run-debug-field-guide')).toContainText('历史写入')
  await expect(page.getByTestId('agent-run-debug-field-guide')).toContainText('缺失项')
  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-debug-overview')
  await expect(page.getByTestId('agent-run-debug-report-copy')).toContainText('复制摘要')
  await expect(page.getByRole('button', { name: '复制 AgentRun 调试摘要' })).toBeVisible()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: String(baseURL) })
  await page.getByTestId('agent-run-debug-report-copy').click()
  await expect(page.getByTestId('agent-run-debug-report-copy')).toContainText('已复制')
  await expect(page.getByTestId('agent-run-debug-report-copy-feedback')).toContainText('调试摘要已复制')
  await expect(page.getByTestId('agent-run-debug-report-copy-feedback')).toHaveAttribute('role', 'status')
  const debugReportText = await page.evaluate(() => navigator.clipboard.readText())
  expect(debugReportText).toContain('AgentRun 调试摘要')
  expect(debugReportText).toContain(`运行: ${WORKER_RUN_ID}`)
  expect(debugReportText).toContain('状态: 运行中')
  expect(debugReportText).toContain('角色: 执行器')
  expect(debugReportText).toContain('创建: 2026/05/12 17:00:04 (2026-05-12T09:00:04.000Z)')
  expect(debugReportText).toContain('事件: 6 / 6')
  expect(debugReportText).toContain('请求负载: 1')
  expect(debugReportText).toContain('历史写入: 1')
  expect(debugReportText).toContain('诊断清单:')
  expect(debugReportText).toContain('已满足 事件完整性')
  expect(debugReportText).toContain('已满足 请求负载可展开')
  expect(debugReportText).toContain('下一步: 展开“完整请求负载”和“请求消息”')
  expect(debugReportText).toContain('调试口径:')
  expect(debugReportText).toContain('模型请求: 发送给模型网关的 headers、payload、messages、tools。')
  expect(debugReportText).toContain('模型调用 1: 请求和响应完整')
  expect(debugReportText).toContain('请求负载已存')
  expect(debugReportText).toContain('响应正文已存')
  expect(debugReportText).toContain('请求上下文: 消息 2条')
  expect(debugReportText).toContain('工具定义 1个 (movscript_review_assets)')
  expect(debugReportText).toContain('轮次关联:')
  expect(debugReportText).toContain('关联方式 相邻事件窗口')
  expect(debugReportText).toContain('工具调用 1，历史写入 1')
  expect(debugReportText).toContain(`请求 trace_${WORKER_RUN_ID}_model_request`)
  expect(debugReportText).toContain(`响应 trace_${WORKER_RUN_ID}_model_response_http`)
  expect(debugReportText).toContain('历史: msg_einstein_risk_summary')
  expect(debugReportText).toContain('上下文详情:')
  expect(debugReportText).toContain('工具详情: 1 / 1')
  expect(debugReportText).toContain('工具调用:')
  expect(debugReportText).toContain('movscript_review_assets')
  expect(debugReportText).toContain('发现缺少主视觉覆盖。')
  expect(debugReportText).toContain('发现=missing_hero_visual')
  expect(debugReportText).toContain('authorization=[已脱敏]')
  expect(debugReportText).not.toContain('e2e-secret-token')
  expect(debugReportText).toContain('历史写入:')
  expect(debugReportText).toContain('msg_einstein_risk_summary')
  expect(debugReportText).toContain('内容: 发现缺少主视觉覆盖，已生成素材风险摘要。')
  expect(debugReportText).not.toContain('没有 assistant 历史写入')
  expect(debugReportText).toContain('运行契约 1段/420字')
  expect(debugReportText).toContain('页面焦点 1段/260字')
  expect(debugReportText).toContain('runtime.contract, focus.project')
  expect(debugReportText).toContain('最近事件:')
  expect(debugReportText).toContain('2026/05/12 17:00:04 (2026-05-12T09:00:04.000Z)')
  expect(debugReportText).toContain('模型调用 已完成，耗时 321ms')
  await expect(page.getByRole('button', { name: '复制脱敏 AgentRun 调试包' })).toBeVisible()
  await page.getByTestId('agent-run-debug-bundle-copy').click()
  await expect(page.getByTestId('agent-run-debug-bundle-copy')).toContainText('已复制')
  await expect(page.getByTestId('agent-run-debug-bundle-copy-feedback')).toContainText('脱敏调试包已复制')
  await expect(page.getByTestId('agent-run-debug-bundle-copy-feedback')).toHaveAttribute('role', 'status')
  const debugBundleText = await page.evaluate(() => navigator.clipboard.readText())
  expect(debugBundleText).toContain('"schema": "movscript.agent-run-debug-bundle.v1"')
  expect(debugBundleText).toContain('"schemaUrl": "https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json"')
  expect(debugBundleText).toContain('"generatedAt"')
  expect(debugBundleText).toContain('"capabilities"')
  expect(debugBundleText).toContain('"modelCallContexts"')
  expect(debugBundleText).toContain('"readinessChecklist"')
  expect(debugBundleText).toContain('"redactedDebugData"')
  expect(debugBundleText).toContain('"fieldGuide"')
  expect(debugBundleText).toContain('"id": "model_request"')
  expect(debugBundleText).toContain(`"runId": "${WORKER_RUN_ID}"`)
  expect(debugBundleText).toContain('"runSummary"')
  expect(debugBundleText).toContain('"statusLabel": "运行中"')
  expect(debugBundleText).toContain('"roleLabel": "执行器"')
  expect(debugBundleText).toContain('"coverage"')
  expect(debugBundleText).toContain('"readinessChecklist"')
  expect(debugBundleText).toContain('"label": "事件完整性"')
  expect(debugBundleText).toContain('"status": "ok"')
  expect(debugBundleText).toContain('"action"')
  expect(debugBundleText).toContain('"requestPayloadsLabel": "1"')
  expect(debugBundleText).toContain('"modelCalls"')
  expect(debugBundleText).toContain('"hasRequestPayload": true')
  expect(debugBundleText).toContain('"hasResponseBody": true')
  expect(debugBundleText).toContain('"modelCallContexts"')
  expect(debugBundleText).toContain('"correlationLabel": "相邻事件窗口"')
  expect(debugBundleText).toContain('"modelEventIds"')
  expect(debugBundleText).toContain(`"eventId": "trace_${WORKER_RUN_ID}_tool"`)
  expect(debugBundleText).toContain('"messageWrites"')
  expect(debugBundleText).toContain('"promptDetails"')
  expect(debugBundleText).toContain('"partGroups"')
  expect(debugBundleText).toContain('"partIds"')
  expect(debugBundleText).toContain('"runtime.contract"')
  expect(debugBundleText).toContain('"focus.project"')
  expect(debugBundleText).toContain('"messageWrites"')
  expect(debugBundleText).toContain('"messageId": "msg_einstein_risk_summary"')
  expect(debugBundleText).toContain('"contentPreview": "发现缺少主视觉覆盖，已生成素材风险摘要。"')
  expect(debugBundleText).toContain('"toolCalls"')
  expect(debugBundleText).toContain('"toolName": "movscript_review_assets"')
  expect(debugBundleText).toContain('"durationMs": 4000')
  expect(debugBundleText).toContain('"dataPreview"')
  expect(debugBundleText).toContain('"attentionEvents"')
  expect(debugBundleText).toContain('missing_hero_visual')
  expect(debugBundleText).toContain('"events"')
  expect(debugBundleText).not.toContain('"traceEvents"')
  expect(debugBundleText).toContain('[已脱敏]')
  expect(debugBundleText).not.toContain('e2e-response-secret')
  expect(debugBundleText).not.toContain('e2e-model-url-secret')
  expect(debugBundleText).not.toContain('e2e-secret-token')
  expect(debugBundleText).not.toContain('provider-e2e-api-key')
  expect(debugBundleText).not.toContain('e2e-signed-token')
  const httpCategoryFilter = page.getByTestId('agent-run-trace-category-filter').filter({ hasText: 'HTTP' })
  await expect(httpCategoryFilter).toHaveAttribute('aria-pressed', 'false')
  await httpCategoryFilter.click()
  await expect(httpCategoryFilter).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('agent-run-trace-visible-count')).toContainText('当前显示 2 个')
  await page.getByRole('button', { name: '清除运行事件筛选' }).click()
  await expect(httpCategoryFilter).toHaveAttribute('aria-pressed', 'false')
  const promptDetail = page.getByTestId('agent-run-prompt-detail')
  await expect(promptDetail).toContainText('模型上下文详情')
  await expect(promptDetail).toContainText('上下文层级')
  await expect(promptDetail).toContainText('上下文来源')
  await expect(promptDetail).toContainText('激活技能')
  await expect(promptDetail).toContainText('可用工具')
  await expect(page.getByTestId('agent-run-prompt-parts')).toContainText('runtime.contract')
  await expect(page.getByTestId('agent-run-prompt-parts')).toContainText('运行契约')
  await expect(page.getByTestId('agent-run-model-call-summary')).toContainText('大模型调用总览')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toHaveCount(1)
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('请求和响应完整')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('HTTP 200')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('请求负载已存')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('响应正文已存')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('历史写入 1')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('工具调用 1')
  await page.getByTestId('agent-run-model-call-summary-item').getByText('模型调用 1').click()
  await expect(page.getByTestId('agent-run-model-call-inline-debug')).toContainText('本轮详情')
  await expect(page.getByTestId('agent-run-model-call-inline-debug')).toContainText('相邻事件窗口')
  await expect(page.getByTestId('agent-run-model-call-inline-debug')).toContainText('大模型 HTTP 请求')
  await expect(page.getByTestId('agent-run-model-call-inline-debug')).toContainText('大模型 HTTP 详情')
  await expect(page.getByTestId('agent-run-model-call-inline-debug')).toContainText('历史写入')
  await expect(page.getByTestId('agent-run-model-call-inline-debug')).toContainText('历史消息详情')
  await expect(page.getByTestId('agent-run-model-call-inline-debug')).toContainText('工具调用详情')
  await expect(page.getByTestId('agent-run-model-call-summary-item').getByRole('button', { name: /定位模型调用 1的模型请求事件/ })).toBeVisible()
  await expect(page.getByTestId('agent-run-model-call-summary-item').getByRole('button', { name: /定位模型调用 1的模型响应事件/ })).toBeVisible()
  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-model-call-expanded')
  const httpModelDetail = page.getByTestId('agent-run-model-detail').filter({ hasText: '大模型 HTTP 详情' })
  await expect(httpModelDetail).toBeVisible()
  const requestModelDetail = page.getByTestId('agent-run-model-detail').filter({ hasText: '大模型 HTTP 请求' })
  await expect(requestModelDetail).toContainText('HTTP 请求')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-headers')).toContainText('请求头')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-headers')).toContainText('content-type')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-headers')).toContainText('[已脱敏]')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-headers')).not.toContainText('e2e-header-secret')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-payload')).toContainText('完整请求负载')
  await requestModelDetail.getByText('完整请求负载').click()
  await expect(requestModelDetail.getByTestId('agent-run-model-request-payload')).toContainText('model_config:e2e')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-messages')).toContainText('请求消息 (2)')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-messages')).toContainText('请检查当前项目素材风险。')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-tools')).toContainText('工具定义 (1)')
  await expect(requestModelDetail.getByTestId('agent-run-model-request-tools')).toContainText('movscript_review_assets')
  await expect(requestModelDetail).toContainText('[已脱敏]')
  await expect(requestModelDetail).not.toContainText('e2e-model-url-secret')
  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-http-request-detail')
  await expect(httpModelDetail.getByTestId('agent-run-model-http-response')).toContainText('HTTP 响应')
  await expect(httpModelDetail.getByTestId('agent-run-model-response-headers')).toContainText('响应头')
  await expect(httpModelDetail.getByTestId('agent-run-model-response-headers')).toContainText('x-trace-id')
  await expect(httpModelDetail.getByTestId('agent-run-model-response-headers')).toContainText('trace-e2e')
  await expect(httpModelDetail.getByTestId('agent-run-model-response-headers')).toContainText('[已脱敏]')
  await expect(httpModelDetail.getByTestId('agent-run-model-response-headers')).not.toContainText('e2e-response-cookie-secret')
  await expect(httpModelDetail.getByTestId('agent-run-model-request-messages')).toContainText('请求消息 (2)')
  await expect(httpModelDetail).toContainText('movscript_review_assets')
  await expect(httpModelDetail).toContainText('发现缺少主视觉覆盖。')
  await expect(httpModelDetail).toContainText('原始响应正文')
  await expect(httpModelDetail.getByTestId('agent-run-model-result')).toContainText('模型结果')
  await expect(httpModelDetail.getByTestId('agent-run-model-result')).toContainText('正常结束')
  await expect(httpModelDetail).toContainText('[已脱敏]')
  await expect(httpModelDetail).not.toContainText('e2e-response-secret')
  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-http-response-detail')
  const messageDetail = page.getByTestId('agent-run-message-detail')
  await expect(messageDetail).toContainText('历史消息详情')
  await expect(messageDetail).toContainText('msg_einstein_risk_summary')
  await expect(messageDetail).toContainText('发现缺少主视觉覆盖，已生成素材风险摘要。')
  await page.getByTestId('agent-run-trace-search').fill('正常结束')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toBeVisible()
  await expect(page.getByTestId('agent-run-trace-visible-count')).toContainText('当前显示 1 个')
  await expect(page.getByTestId('agent-run-clear-trace-filters-inline')).toBeVisible()
  await page.getByRole('button', { name: '清除运行事件筛选' }).click()
  await expect(page.getByTestId('agent-run-trace-search')).toHaveValue('')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await page.getByTestId('agent-run-trace-search').fill('请检查当前项目素材风险')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(2)
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '发起模型 HTTP 请求' })).toBeVisible()
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toBeVisible()
  await page.getByRole('button', { name: '清除运行事件筛选' }).click()
  await page.getByTestId('agent-run-trace-search').fill('model_config:e2e')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '发起模型 HTTP 请求' })).toBeVisible()
  await expect(page.getByTestId('agent-run-trace-visible-count')).toContainText('当前显示 1 个')
  await page.getByRole('button', { name: '清除运行事件筛选' }).click()
  await page.getByTestId('agent-run-trace-search').fill('trace-e2e')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(1)
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toBeVisible()
  await page.getByRole('button', { name: '清除运行事件筛选' }).click()
  await page.getByTestId('agent-run-trace-search').fill('已生成素材风险摘要')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(1)
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '写入历史消息' })).toBeVisible()
  await page.getByRole('button', { name: '清除运行事件筛选' }).click()
  await page.getByTestId('agent-run-trace-search').fill('review tool')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(1)
  await expect(page.getByTestId('agent-run-trace-event')).toContainText('素材风险审计工具调用')
  await expect(page.getByTestId('agent-run-trace-visible-count')).toContainText('当前显示 1 个')
  const rawDataToggle = page.getByRole('button', { name: '查看素材风险审计工具调用的原始数据' })
  await expect(rawDataToggle).toContainText('原始数据')
  await expect(rawDataToggle).toHaveAttribute('aria-expanded', 'false')
  await rawDataToggle.click()
  await expect(page.getByRole('button', { name: '隐藏素材风险审计工具调用的原始数据' })).toContainText('隐藏原始数据')
  await expect(page.getByRole('button', { name: '隐藏素材风险审计工具调用的原始数据' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('agent-run-trace-redaction-note')).toContainText('原始数据展示和复制时会自动脱敏')
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('missing_hero_visual')
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('artifact_einstein_risk')
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('[已脱敏]')
  await expect(page.getByTestId('agent-run-trace-event-details')).not.toContainText('e2e-secret-token')
  await expect(page.getByTestId('agent-run-trace-event-details')).not.toContainText('provider-e2e-api-key')
  await expect(page.getByTestId('agent-run-trace-event-details')).not.toContainText('e2e-signed-token')
  const toolDetail = page.getByTestId('agent-run-tool-detail')
  await expect(toolDetail).toContainText('工具调用详情')
  await expect(toolDetail).toContainText('movscript_review_assets')
  await expect(toolDetail).toContainText('发现')
  await expect(toolDetail).toContainText('missing_hero_visual')
  await expect(toolDetail).toContainText('产物 ID')
  await expect(toolDetail).toContainText('artifact_einstein_risk')
  await expect(toolDetail).toContainText('[已脱敏]')
  await expect(toolDetail).not.toContainText('e2e-secret-token')
  await page.getByRole('button', { name: '复制素材风险审计工具调用的原始数据' }).click()
  await expect(page.getByTestId('agent-run-trace-copy-feedback')).toContainText('数据已复制')
  await expect(page.getByTestId('agent-run-trace-copy-feedback')).toHaveAttribute('role', 'status')
  const copiedTraceData = await page.evaluate(() => navigator.clipboard.readText())
  expect(copiedTraceData).toContain('[已脱敏]')
  expect(copiedTraceData).toContain('missing_hero_visual')
  expect(copiedTraceData).not.toContain('e2e-secret-token')
  expect(copiedTraceData).not.toContain('provider-e2e-api-key')
  expect(copiedTraceData).not.toContain('e2e-signed-token')
  await page.getByRole('button', { name: '复制素材风险审计工具调用的事件链接' }).click()
  await expect(page.getByTestId('agent-run-trace-copy-feedback')).toContainText('链接已复制')
  await page.getByTestId('agent-run-trace-search').fill('no matching trace event')
  await expect(page.getByTestId('agent-run-trace-empty-state')).toContainText('没有符合当前筛选条件的事件')
  await expect(page.getByTestId('agent-run-trace-visible-count')).toContainText('当前显示 0 个')
  await page.getByTestId('agent-run-model-call-summary-item').getByRole('button', { name: '响应' }).click()
  await expect(page.getByTestId('agent-run-trace-search')).toHaveValue('')
  await expect(page.getByTestId('agent-run-trace-linked-event')).toContainText('已定位')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toBeVisible()
  await page.getByTestId('agent-run-trace-search').fill('no matching trace event')
  await expect(page.getByTestId('agent-run-trace-empty-state')).toContainText('没有符合当前筛选条件的事件')
  await page.getByRole('button', { name: '清除运行事件筛选并返回事件列表' }).click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await page.getByTestId('agent-run-trace-search').fill('no matching trace event')
  await page.evaluate((eventId) => {
    window.location.hash = `event-${encodeURIComponent(eventId)}`
  }, `trace_${WORKER_RUN_ID}_model_request`)
  await expect(page.getByTestId('agent-run-trace-search')).toHaveValue('')
  await expect(page.locator(`#agent-trace-event-trace_${WORKER_RUN_ID}_model_request`)).toContainText('已定位')
  const linkedTraceEventId = `trace_${WORKER_RUN_ID}_tool`
  await page.goto(`/agent/runs/${WORKER_RUN_ID}#event-${encodeURIComponent(linkedTraceEventId)}`)
  await expect(page.locator(`#agent-trace-event-${linkedTraceEventId}`)).toContainText('已定位')
  await expect(page.getByTestId('agent-run-trace-linked-event')).toContainText('已定位')
  await expect(page.locator(`#agent-trace-event-${linkedTraceEventId}`).getByTestId('agent-run-trace-event-details')).toContainText('missing_hero_visual')
  await page.goto(`/agent/runs/${WORKER_RUN_ID}#event-${encodeURIComponent('trace_missing_event')}`)
  await expect(page.getByTestId('agent-run-trace-deep-link-missing')).toContainText('这个运行里没有找到事件 trace_missing_event')
  await expect(page.getByTestId('agent-run-trace-deep-link-missing')).toHaveAttribute('role', 'alert')

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Einstein')
    await dialog.accept()
  })
  await page.getByRole('button', { name: '取消执行器 Einstein' }).click()
  await expect(page.getByTestId('agent-run-header')).toContainText('已取消')
  await expect(page.getByTestId('agent-run-plan-context')).toContainText('已取消')
  await expect(page.getByTestId('agent-run-cancel-worker')).toHaveCount(0)
})

test('planner run detail remains usable on mobile width', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page)

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-header')).toBeVisible()
  await expect(page.getByTestId('agent-run-sidebar')).toContainText('Einstein')
  await expect(page.getByTestId('agent-run-trace-panel')).toBeVisible()
  await page.getByRole('button', { name: '加载当前运行的事件' }).click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await expect(page.getByTestId('agent-run-model-detail').filter({ hasText: '大模型 HTTP 详情' })).toBeVisible()

  const horizontalOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(2)
})

test('planner worker cancel failure is visible on run detail', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failCancel: true })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-cancel-worker')).toBeVisible()
  await expect(page.getByRole('button', { name: '取消执行器 Einstein' })).toBeVisible()

  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: '取消执行器 Einstein' }).click()
  await expect(page.getByTestId('agent-run-cancel-error')).toContainText('cancel rejected by runtime')
  await expect(page.getByTestId('agent-run-cancel-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-cancel-worker')).toBeVisible()
})

test('planner run detail can load all paginated trace events', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { longWorkerTrace: true })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-trace-summary')).toContainText('34 个事件')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(25)
  await expect(page.getByTestId('agent-run-trace-loaded-count')).toContainText('已加载 25 / 34')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('需补全')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('还有未加载运行事件')
  await expect(page.getByTestId('agent-run-load-all-trace-events')).toBeVisible()
  await expect(page.getByRole('button', { name: '加载当前运行的全部事件' })).toBeVisible()
  await expect(page.getByTestId('agent-run-debug-load-all')).toBeVisible()
  await expect(page.getByRole('button', { name: '加载全部运行事件用于调试覆盖统计' })).toBeVisible()
  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-missing-data')

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: String(baseURL) })
  await page.getByRole('button', { name: '复制脱敏 AgentRun 调试包' }).click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(34)
  await expect(page.getByTestId('agent-run-trace-loaded-count')).toContainText('已加载 34 / 34')
  await expect(page.getByTestId('agent-run-load-all-trace-events')).toHaveCount(0)
  await expect(page.getByTestId('agent-run-debug-load-all')).toHaveCount(0)
  await expect(page.getByTestId('agent-run-debug-bundle-copy-feedback')).toContainText('脱敏调试包已复制')
  const debugBundleText = await page.evaluate(() => navigator.clipboard.readText())
  expect(debugBundleText).toContain('"loaded": 34')
  expect(debugBundleText).toContain('"hasMore": false')
})

test('planner run detail stops debug bundle copy when full trace load fails', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { longWorkerTrace: true, failTraceAfterCursorOnce: true })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(25)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: String(baseURL) })
  await page.evaluate(() => navigator.clipboard.writeText('previous clipboard value'))
  await page.getByRole('button', { name: '复制脱敏 AgentRun 调试包' }).click()
  await expect(page.getByTestId('agent-run-debug-bundle-copy-error')).toContainText('运行事件未能加载完整')
  await expect(page.getByTestId('agent-run-debug-bundle-copy-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-debug-bundle-copy-feedback')).toHaveCount(0)
  await expect(page.getByTestId('agent-run-trace-load-error')).toContainText('trace unavailable')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('previous clipboard value')
})

test('planner run detail surfaces failed model call summary', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failedModelTrace: true })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-attention-events')).toContainText('异常/需关注事件')
  await expect(page.getByTestId('agent-run-attention-event')).toContainText('模型请求失败')
  await expect(page.getByTestId('agent-run-attention-event')).toContainText('HTTP 429')
  await expect(page.getByTestId('agent-run-attention-event').getByRole('button', { name: /定位需关注事件 模型请求失败/ })).toBeVisible()
  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-attention-events')
  await page.getByRole('button', { name: '只查看需关注运行事件' }).click()
  await expect(page.getByTestId('agent-run-trace-category-filter').filter({ hasText: '需关注' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('模型请求失败')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('重试 1 次')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('错误 HTTP 429')
  await expect(page.getByTestId('agent-run-model-call-summary-item')).toContainText('模型 HTTP 调用失败')
})

test('planner run detail can retry after trace load failure', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failTraceOnce: true })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-trace-load-error')).toContainText('trace unavailable')
  await expect(page.getByTestId('agent-run-trace-load-error')).toHaveAttribute('role', 'alert')
  await page.getByTestId('agent-run-trace-retry').click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await expect(page.getByTestId('agent-run-trace-load-error')).toHaveCount(0)
})

test('planner run detail shows debug report copy failure', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('clipboard denied by test')
        },
        readText: async () => '',
      },
    })
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page)

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await page.getByTestId('agent-run-debug-report-copy').click()
  await expect(page.getByTestId('agent-run-debug-report-copy-error')).toContainText('clipboard denied by test')
  await expect(page.getByTestId('agent-run-debug-report-copy-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-debug-report-copy')).toContainText('复制摘要')
  await page.getByTestId('agent-run-trace-event').filter({ hasText: '组装模型上下文' }).getByTestId('agent-run-trace-event-data-copy').click()
  await expect(page.getByTestId('agent-run-trace-copy-error')).toContainText('clipboard denied by test')
  await expect(page.getByTestId('agent-run-trace-copy-error')).toHaveAttribute('role', 'alert')
})

test('planner run detail can retry after trace summary failure', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failTraceSummaryOnce: true })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-trace-summary-error')).toContainText('统计加载失败')
  await expect(page.getByTestId('agent-run-trace-summary-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await page.getByRole('button', { name: '重新加载运行事件统计' }).click()
  await expect(page.getByTestId('agent-run-trace-summary')).toContainText('6 个事件')
  await expect(page.getByTestId('agent-run-trace-summary-error')).toHaveCount(0)
})

test('planner run detail exposes plan context load failures as alerts', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failPlanSnapshotTimes: 2 })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-plan-context-error')).toContainText('plan snapshot unavailable')
  await expect(page.getByTestId('agent-run-plan-context-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-plan-context-retry')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新加载计划上下文' })).toBeVisible()
  await page.getByRole('button', { name: '重新加载计划上下文' }).click()
  await expect(page.getByTestId('agent-run-plan-context')).toContainText('Planner 调度 E2E')
  await expect(page.getByTestId('agent-run-plan-context-error')).toHaveCount(0)
})

test('planner run detail exposes missing run load failures as alerts', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page)

  await page.goto('/agent/runs/run_missing_e2e')
  await expect(page.getByTestId('agent-run-detail-error')).toContainText('run not found')
  await expect(page.getByTestId('agent-run-detail-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-detail-retry')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新加载 AgentRun 运行详情' })).toBeVisible()
})

test('planner run detail can retry after run detail load failure', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failRunOnce: true })

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-detail-error')).toContainText('run detail unavailable')
  await expect(page.getByTestId('agent-run-detail-error')).toHaveAttribute('role', 'alert')
  await page.getByRole('button', { name: '重新加载 AgentRun 运行详情' }).click()
  await expect(page.getByTestId('agent-run-sidebar')).toContainText('Einstein')
  await expect(page.getByTestId('agent-run-detail-error')).toHaveCount(0)
})

test('planner worker approval can be resolved from run detail', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page)

  await page.goto(`/agent/runs/${APPROVAL_WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-sidebar')).toContainText('Hawking')
  await expect(page.getByTestId('agent-run-pending-approval')).toContainText('movscript_publish_assets')
  await expect(page.getByTestId('agent-run-pending-approval')).toContainText('写入')
  await expect(page.getByTestId('agent-run-pending-approval')).toContainText('项目素材写入')
  await expect(page.getByTestId('agent-run-pending-approval')).toContainText('影响：批准后会写入项目数据。')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: String(baseURL) })
  await page.getByTestId('agent-run-debug-report-copy').click()
  const approvalDebugReportText = await page.evaluate(() => navigator.clipboard.readText())
  expect(approvalDebugReportText).toContain('待处理:')
  expect(approvalDebugReportText).toContain('待审批 movscript_publish_assets')
  expect(approvalDebugReportText).toContain('权限 项目素材写入')
  expect(approvalDebugReportText).toContain('原因 Publish reviewed asset metadata back to the project.')
  await page.getByTestId('agent-run-debug-bundle-copy').click()
  const approvalDebugBundleText = await page.evaluate(() => navigator.clipboard.readText())
  expect(approvalDebugBundleText).toContain('"pendingActions"')
  expect(approvalDebugBundleText).toContain('"type": "approval"')
  expect(approvalDebugBundleText).toContain('"toolName": "movscript_publish_assets"')
  expect(approvalDebugBundleText).toContain('"permission": "project.assets.write"')
  expect(approvalDebugBundleText).toContain('"pendingApprovals": 1')
  await expect(page.getByRole('button', { name: '同意执行movscript_publish_assets' })).toBeVisible()
  await page.getByRole('button', { name: '同意执行movscript_publish_assets' }).click()
  await expect(page.getByTestId('agent-run-header')).toContainText('运行中')
  await expect(page.getByTestId('agent-run-pending-approval')).toHaveCount(0)
})

test('planner worker approval failure is visible on run detail', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failApproval: true })

  await page.goto(`/agent/runs/${APPROVAL_WORKER_RUN_ID}`)
  await expect(page.getByRole('button', { name: '拒绝执行movscript_publish_assets' })).toBeVisible()
  await page.getByRole('button', { name: '拒绝执行movscript_publish_assets' }).click()
  await expect(page.getByTestId('agent-run-approval-error')).toContainText('approval rejected by runtime')
  await expect(page.getByTestId('agent-run-approval-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-pending-approval')).toContainText('movscript_publish_assets')
})

test('planner worker input can be answered from run detail', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page)

  await page.goto(`/agent/runs/${INPUT_WORKER_RUN_ID}`)
  await expect(page.getByTestId('agent-run-sidebar')).toContainText('Turing')
  await expect(page.getByTestId('agent-run-pending-input')).toContainText('确认素材范围')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: String(baseURL) })
  await page.getByTestId('agent-run-debug-report-copy').click()
  const inputDebugReportText = await page.evaluate(() => navigator.clipboard.readText())
  expect(inputDebugReportText).toContain('待处理:')
  expect(inputDebugReportText).toContain('待输入 确认素材范围')
  expect(inputDebugReportText).toContain('类型 选择')
  expect(inputDebugReportText).toContain('选项 包含占位素材, 不包含占位素材')
  await page.getByTestId('agent-run-debug-bundle-copy').click()
  const inputDebugBundleText = await page.evaluate(() => navigator.clipboard.readText())
  expect(inputDebugBundleText).toContain('"pendingActions"')
  expect(inputDebugBundleText).toContain('"type": "input"')
  expect(inputDebugBundleText).toContain('"title": "确认素材范围"')
  expect(inputDebugBundleText).toContain('"question": "这次风险审计是否包含临时占位素材？"')
  expect(inputDebugBundleText).toContain('"pendingInputs": 1')
  await expect(page.getByRole('button', { name: '回答确认素材范围: 包含占位素材' })).toBeVisible()
  await page.getByRole('button', { name: '回答确认素材范围: 包含占位素材' }).click()
  await expect(page.getByTestId('agent-run-header')).toContainText('排队中')
  await expect(page.getByTestId('agent-run-pending-input')).toHaveCount(0)
})

test('planner worker input failure is visible on run detail', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('planner E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildPlannerAgentBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await mockPlannerAgentRuntime(page, { failInput: true })

  await page.goto(`/agent/runs/${INPUT_WORKER_RUN_ID}`)
  await page.getByTestId('agent-run-input-text').fill('只看正式素材')
  await expect(page.getByRole('button', { name: '提交确认素材范围的自定义答案' })).toBeVisible()
  await page.getByRole('button', { name: '提交确认素材范围的自定义答案' }).click()
  await expect(page.getByTestId('agent-run-input-error')).toContainText('input rejected by runtime')
  await expect(page.getByTestId('agent-run-input-error')).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('agent-run-pending-input')).toContainText('确认素材范围')
})

async function mockPlannerAgentRuntime(page: Page, options: { failCancel?: boolean; failApproval?: boolean; failInput?: boolean; longWorkerTrace?: boolean; failedModelTrace?: boolean; failRunOnce?: boolean; failTraceOnce?: boolean; failTraceAfterCursorOnce?: boolean; failTraceSummaryOnce?: boolean; failPlanSnapshot?: boolean; failPlanSnapshotOnce?: boolean; failPlanSnapshotTimes?: number } = {}) {
  let snapshot = plannerPlanSnapshotFixture()
  let workerRun = workerRunFixture()
  let approvalWorkerRun = approvalWorkerRunFixture()
  let inputWorkerRun = inputWorkerRunFixture()
  let traceFailureInjected = false
  let traceSummaryFailureInjected = false
  let planSnapshotFailureCount = 0
  let runFailureInjected = false
  const runs = new Map([
    [PLANNER_RUN_ID, plannerRunFixture()],
    [WORKER_RUN_ID, workerRun],
    [APPROVAL_WORKER_RUN_ID, approvalWorkerRun],
    [INPUT_WORKER_RUN_ID, inputWorkerRun],
  ])

  await page.route('http://127.0.0.1:28765/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/health' || url.pathname === '/inspect' || url.pathname === '/capabilities') {
      await route.fallback()
      return
    }
    if (url.pathname === `/plans/${PLANNER_PLAN_ID}`) {
      if (options.failPlanSnapshot) {
        await fulfillJSON(route, { error: 'plan snapshot unavailable' }, 500)
        return
      }
      const planSnapshotFailureLimit = options.failPlanSnapshotTimes ?? (options.failPlanSnapshotOnce ? 1 : 0)
      if (planSnapshotFailureCount < planSnapshotFailureLimit) {
        planSnapshotFailureCount += 1
        await fulfillJSON(route, { error: 'plan snapshot unavailable' }, 500)
        return
      }
      await fulfillJSON(route, snapshot)
      return
    }
    const cancelTreeMatch = url.pathname.match(/^\/runs\/([^/]+)\/cancel-tree$/)
    if (cancelTreeMatch && route.request().method() === 'POST') {
      const runId = decodeURIComponent(cancelTreeMatch[1])
      if (runId !== WORKER_RUN_ID) {
        await fulfillJSON(route, { error: 'run not found' }, 404)
        return
      }
      if (options.failCancel) {
        await fulfillJSON(route, { error: 'cancel rejected by runtime' }, 500)
        return
      }
      workerRun = {
        ...workerRun,
        status: 'cancelled',
        progress: 0.62,
        cancelledAt: '2026-05-12T09:01:00.000Z',
        updatedAt: '2026-05-12T09:01:00.000Z',
      }
      runs.set(WORKER_RUN_ID, workerRun)
      snapshot = {
        ...snapshot,
        plan: { ...snapshot.plan, status: 'cancelled', updatedAt: '2026-05-12T09:01:00.000Z', cancelledAt: '2026-05-12T09:01:00.000Z' },
        tasks: snapshot.tasks.map((task) => task.id === 'task_einstein_audit'
          ? { ...task, status: 'cancelled', cancelledAt: '2026-05-12T09:01:00.000Z', updatedAt: '2026-05-12T09:01:00.000Z' }
          : task),
        runs: snapshot.runs.map((run) => run.id === WORKER_RUN_ID ? workerRun : run),
        summary: snapshot.summary ? {
          ...snapshot.summary,
          taskStatusCounts: { pending: 1, running: 0, blocked: 1, needs_review: 0, done: 0, failed: 0, cancelled: 1 },
          activeWorkerCount: 1,
        } : undefined,
      }
      await fulfillJSON(route, { cancelledRunIds: [WORKER_RUN_ID] })
      return
    }
    const approveMatch = url.pathname.match(/^\/runs\/([^/]+)\/approve$/)
    const rejectMatch = url.pathname.match(/^\/runs\/([^/]+)\/reject$/)
    if ((approveMatch || rejectMatch) && route.request().method() === 'POST') {
      const runId = decodeURIComponent((approveMatch ?? rejectMatch)![1])
      if (runId !== APPROVAL_WORKER_RUN_ID) {
        await fulfillJSON(route, { error: 'run not found' }, 404)
        return
      }
      if (options.failApproval) {
        await fulfillJSON(route, { error: 'approval rejected by runtime' }, 500)
        return
      }
      approvalWorkerRun = {
        ...approvalWorkerRun,
        status: 'in_progress',
        pendingApprovals: approvalWorkerRun.pendingApprovals?.map((approval) => ({
          ...approval,
          status: approveMatch ? 'approved' : 'rejected',
          updatedAt: '2026-05-12T09:01:20.000Z',
          ...(approveMatch ? { approvedAt: '2026-05-12T09:01:20.000Z' } : { rejectedAt: '2026-05-12T09:01:20.000Z' }),
        })),
        updatedAt: '2026-05-12T09:01:20.000Z',
      }
      runs.set(APPROVAL_WORKER_RUN_ID, approvalWorkerRun)
      snapshot = {
        ...snapshot,
        tasks: snapshot.tasks.map((task) => task.id === 'task_approval_review'
          ? { ...task, status: 'running', blockedReason: undefined, updatedAt: '2026-05-12T09:01:20.000Z' }
          : task),
        runs: snapshot.runs.map((run) => run.id === APPROVAL_WORKER_RUN_ID ? approvalWorkerRun : run),
        summary: snapshot.summary ? {
          ...snapshot.summary,
          taskStatusCounts: { pending: 1, running: 2, blocked: 0, needs_review: 0, done: 0, failed: 0, cancelled: 0 },
          blockedTaskIds: [],
        } : undefined,
      }
      await fulfillJSON(route, approvalWorkerRun, approveMatch ? 202 : 200)
      return
    }
    const inputMatch = url.pathname.match(/^\/runs\/([^/]+)\/input$/)
    if (inputMatch && route.request().method() === 'POST') {
      const runId = decodeURIComponent(inputMatch[1])
      if (runId !== INPUT_WORKER_RUN_ID) {
        await fulfillJSON(route, { error: 'run not found' }, 404)
        return
      }
      if (options.failInput) {
        await fulfillJSON(route, { error: 'input rejected by runtime' }, 500)
        return
      }
      inputWorkerRun = {
        ...inputWorkerRun,
        status: 'queued',
        pendingInputRequests: inputWorkerRun.pendingInputRequests?.map((request) => ({
          ...request,
          status: 'answered',
          answer: { choiceIds: ['include_placeholders'] },
          answeredAt: '2026-05-12T09:01:40.000Z',
          updatedAt: '2026-05-12T09:01:40.000Z',
        })),
        updatedAt: '2026-05-12T09:01:40.000Z',
      }
      runs.set(INPUT_WORKER_RUN_ID, inputWorkerRun)
      snapshot = {
        ...snapshot,
        tasks: snapshot.tasks.map((task) => task.id === 'task_input_review'
          ? { ...task, status: 'pending', blockedReason: undefined, updatedAt: '2026-05-12T09:01:40.000Z' }
          : task),
        runs: snapshot.runs.map((run) => run.id === INPUT_WORKER_RUN_ID ? inputWorkerRun : run),
        summary: snapshot.summary ? {
          ...snapshot.summary,
          taskStatusCounts: { pending: 2, running: 1, blocked: 1, needs_review: 0, done: 0, failed: 0, cancelled: 0 },
          blockedTaskIds: ['task_approval_review'],
        } : undefined,
      }
      await fulfillJSON(route, inputWorkerRun, 202)
      return
    }
    const childrenMatch = url.pathname.match(/^\/runs\/([^/]+)\/children$/)
    if (childrenMatch && route.request().method() === 'GET') {
      const runId = decodeURIComponent(childrenMatch[1])
      await fulfillJSON(route, {
        runId,
        children: runId === PLANNER_RUN_ID
          ? [workerRun, approvalWorkerRun, inputWorkerRun]
          : [],
      })
      return
    }
    const runMatch = url.pathname.match(/^\/runs\/([^/]+)$/)
    if (runMatch) {
      if (options.failRunOnce && !runFailureInjected) {
        runFailureInjected = true
        await fulfillJSON(route, { error: 'run detail unavailable' }, 500)
        return
      }
      const run = runs.get(decodeURIComponent(runMatch[1]))
      if (!run) {
        await fulfillJSON(route, { error: 'run not found' }, 404)
        return
      }
      await fulfillJSON(route, run)
      return
    }
    const traceSummaryMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace\/summary$/)
    if (traceSummaryMatch) {
      if (options.failTraceSummaryOnce && !traceSummaryFailureInjected) {
        traceSummaryFailureInjected = true
        await fulfillJSON(route, { error: 'trace summary unavailable' }, 500)
        return
      }
      const runId = decodeURIComponent(traceSummaryMatch[1])
      const events = traceEventsForRun(runId, options)
      await fulfillJSON(route, traceSummaryForEvents(runId, events))
      return
    }
    const traceMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace$/)
    if (traceMatch) {
      const runId = decodeURIComponent(traceMatch[1])
      if (options.failTraceOnce && !traceFailureInjected) {
        traceFailureInjected = true
        await fulfillJSON(route, { error: 'trace unavailable' }, 500)
        return
      }
      if (options.failTraceAfterCursorOnce && url.searchParams.has('cursor') && !traceFailureInjected) {
        traceFailureInjected = true
        await fulfillJSON(route, { error: 'trace unavailable' }, 500)
        return
      }
      const events = traceEventsForRun(runId, options)
      const page = paginatedTraceEvents(events, url)
      await fulfillJSON(route, {
        runId,
        events: page.events,
        total: page.total,
        hasMore: page.hasMore,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      })
      return
    }
    await fulfillJSON(route, { error: 'not found' }, 404)
  })
}

function traceEventsForRun(runId: string, options: { longWorkerTrace?: boolean; failedModelTrace?: boolean }): AgentTraceEvent[] {
  if (options.longWorkerTrace && runId === WORKER_RUN_ID) return longWorkerTraceEvents()
  if (options.failedModelTrace && runId === WORKER_RUN_ID) return failedModelTraceEvents()
  return traceEventsFixture(runId)
}

function paginatedTraceEvents(events: AgentTraceEvent[], url: URL): { events: AgentTraceEvent[]; total: number; hasMore: boolean; nextCursor?: string } {
  const kind = url.searchParams.get('kind')
  const cursor = url.searchParams.get('cursor')
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : events.length
  const filtered = events.filter((event) => !kind || event.kind === kind)
  const cursorIndex = cursor ? filtered.findIndex((event) => event.id === cursor) : -1
  if (cursor && cursorIndex < 0) return { events: [], total: filtered.length, hasMore: false }
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0
  const pageLimit = Number.isFinite(limit) && limit > 0 ? limit : filtered.length
  const pageEvents = filtered.slice(start, start + pageLimit)
  const hasMore = start + pageEvents.length < filtered.length
  const nextCursor = hasMore ? pageEvents.at(-1)?.id : undefined
  return {
    events: pageEvents,
    total: filtered.length,
    hasMore,
    ...(nextCursor ? { nextCursor } : {}),
  }
}

function traceSummaryForEvents(runId: string, events: AgentTraceEvent[]) {
  const byKind: Record<string, number> = {}
  for (const event of events) byKind[event.kind] = (byKind[event.kind] ?? 0) + 1
  return {
    ...traceSummaryFixture(runId),
    total: events.length,
    byKind,
    latestEvent: events.at(-1),
  }
}

function longWorkerTraceEvents(): AgentTraceEvent[] {
  const baseEvents = traceEventsFixture(WORKER_RUN_ID)
  const extraEvents = Array.from({ length: 28 }, (_, index): AgentTraceEvent => ({
    id: `trace_${WORKER_RUN_ID}_extra_${index + 1}`,
    runId: WORKER_RUN_ID,
    kind: index % 2 === 0 ? 'tool_call' : 'context',
    title: index % 2 === 0 ? `Tool completed: movscript_trace_probe_${index + 1}` : 'Context ledger updated',
    status: 'completed',
    ...(index % 2 === 0 ? { toolName: `movscript_trace_probe_${index + 1}` } : {}),
    summary: `长 trace 事件 ${index + 1}`,
    data: index % 2 === 0
      ? { source: 'runtime', durationMs: index + 10, sandboxed: false }
      : { eventType: 'context.ledger_updated', retrievedCount: index + 1, artifactRefCount: 1 },
    createdAt: `2026-05-12T09:00:${String(13 + index).padStart(2, '0')}.000Z`,
    completedAt: `2026-05-12T09:00:${String(13 + index).padStart(2, '0')}.200Z`,
  }))
  return [...baseEvents, ...extraEvents]
}

function failedModelTraceEvents(): AgentTraceEvent[] {
  const baseEvents = traceEventsFixture(WORKER_RUN_ID).filter((event) => event.kind !== 'model_call')
  const failedEvents: AgentTraceEvent[] = [
    {
      id: `trace_${WORKER_RUN_ID}_model_failed_request`,
      runId: WORKER_RUN_ID,
      kind: 'model_call',
      title: 'Model HTTP request sent',
      status: 'started',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: {
        phase: 'request',
        request: { body: { model: 'model_config:e2e', messages: [{ role: 'user', content: '请检查当前项目素材风险。' }] } },
      },
      createdAt: '2026-05-12T09:00:03.000Z',
    },
    {
      id: `trace_${WORKER_RUN_ID}_model_retry`,
      runId: WORKER_RUN_ID,
      kind: 'model_call',
      title: 'Model retry scheduled',
      status: 'info',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: {
        phase: 'retry',
        retry: { nextAttempt: 2, maxAttempts: 3, delayMs: 1000 },
      },
      createdAt: '2026-05-12T09:00:04.000Z',
    },
    {
      id: `trace_${WORKER_RUN_ID}_model_error`,
      runId: WORKER_RUN_ID,
      kind: 'model_call',
      title: 'Model HTTP call failed',
      status: 'failed',
      roundIndex: 1,
      roundLabel: '第 1 轮',
      data: {
        phase: 'error',
        error: 'HTTP 429',
      },
      createdAt: '2026-05-12T09:00:05.000Z',
      completedAt: '2026-05-12T09:00:05.100Z',
    },
  ]
  return [
    ...baseEvents.slice(0, 2),
    ...failedEvents,
    ...baseEvents.slice(2),
  ]
}

async function fulfillJSON(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function captureAgentRunAcceptanceScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath('agent-run-acceptance', `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}
