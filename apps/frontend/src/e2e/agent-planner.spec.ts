import { expect, test, type Page, type Route } from '@playwright/test'

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
  await page.getByTestId('agent-run-child-run').filter({ hasText: 'Einstein' }).click()
  await expect(page).toHaveURL(new RegExp(`/agent/runs/${WORKER_RUN_ID}$`))

  await page.goto(`/agent/runs/${WORKER_RUN_ID}`)

  await expect(page.getByTestId('agent-run-page')).toBeVisible()
  await expect(page.getByTestId('agent-run-header')).toContainText('Agent 运行')
  await expect(page.getByTestId('agent-run-sidebar')).toContainText('Einstein')
  await expect(page.getByTestId('agent-run-plan-context')).toContainText('Planner 调度 E2E')
  await expect(page.getByTestId('agent-run-plan-context')).toContainText('素材风险审计')
  await expect(page.getByTestId('agent-run-task-artifacts')).toContainText('素材风险摘要')
  await expect(page.getByTestId('agent-run-trace-summary')).toContainText('6 个事件')

  await page.getByTestId('agent-run-load-trace-events').click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await expect(page.getByTestId('agent-run-trace-loaded-count')).toContainText('已加载 6 / 6')
  await expect(page.getByTestId('agent-run-trace-event').first()).toContainText('执行器启动')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '组装模型上下文' })).toContainText('耗时 20ms')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toContainText('耗时 321ms')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('调试覆盖')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('事件')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('6 / 6')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('上下文详情')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('历史写入')
  await expect(page.getByTestId('agent-run-debug-coverage')).toContainText('信息完整')
  await expect(page.getByTestId('agent-run-debug-report-copy')).toContainText('复制摘要')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: String(baseURL) })
  await page.getByTestId('agent-run-debug-report-copy').click()
  await expect(page.getByTestId('agent-run-debug-report-copy')).toContainText('已复制')
  const debugReportText = await page.evaluate(() => navigator.clipboard.readText())
  expect(debugReportText).toContain('AgentRun 调试摘要')
  expect(debugReportText).toContain(`运行: ${WORKER_RUN_ID}`)
  expect(debugReportText).toContain('事件: 6 / 6')
  expect(debugReportText).toContain('模型调用 1: 请求和响应完整')
  expect(debugReportText).toContain('最近事件:')
  expect(debugReportText).toContain('2026/05/12 17:00:04 (2026-05-12T09:00:04.000Z)')
  expect(debugReportText).toContain('模型调用 已完成，耗时 321ms')
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
  const httpModelDetail = page.getByTestId('agent-run-model-detail').filter({ hasText: '大模型 HTTP 详情' })
  await expect(httpModelDetail).toBeVisible()
  await expect(page.getByTestId('agent-run-model-detail').filter({ hasText: '大模型 HTTP 请求' })).toContainText('HTTP 请求')
  await expect(httpModelDetail.getByTestId('agent-run-model-http-response')).toContainText('HTTP 响应')
  await expect(httpModelDetail).toContainText('请求消息')
  await expect(httpModelDetail).toContainText('movscript_review_assets')
  await expect(httpModelDetail).toContainText('发现缺少主视觉覆盖。')
  await expect(httpModelDetail).toContainText('原始响应正文')
  const messageDetail = page.getByTestId('agent-run-message-detail')
  await expect(messageDetail).toContainText('历史消息详情')
  await expect(messageDetail).toContainText('msg_einstein_risk_summary')
  await expect(messageDetail).toContainText('发现缺少主视觉覆盖，已生成素材风险摘要。')
  await page.getByTestId('agent-run-trace-search').fill('正常结束')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toBeVisible()
  await page.getByTestId('agent-run-trace-search').fill('review tool')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(1)
  await expect(page.getByTestId('agent-run-trace-event')).toContainText('素材风险审计工具调用')
  await page.getByTestId('agent-run-trace-event-details-toggle').click()
  await expect(page.getByTestId('agent-run-trace-redaction-note')).toContainText('原始数据展示和复制时会自动脱敏')
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('missing_hero_visual')
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('artifact_einstein_risk')
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('[已脱敏]')
  await expect(page.getByTestId('agent-run-trace-event-details')).not.toContainText('e2e-secret-token')
  await expect(page.getByTestId('agent-run-trace-event-details')).not.toContainText('provider-e2e-api-key')
  await expect(page.getByTestId('agent-run-trace-event-details')).not.toContainText('e2e-signed-token')
  await page.getByTestId('agent-run-trace-event-data-copy').click()
  await expect(page.getByTestId('agent-run-trace-copy-feedback')).toContainText('数据已复制')
  const copiedTraceData = await page.evaluate(() => navigator.clipboard.readText())
  expect(copiedTraceData).toContain('[已脱敏]')
  expect(copiedTraceData).toContain('missing_hero_visual')
  expect(copiedTraceData).not.toContain('e2e-secret-token')
  expect(copiedTraceData).not.toContain('provider-e2e-api-key')
  expect(copiedTraceData).not.toContain('e2e-signed-token')
  await page.getByTestId('agent-run-trace-event').getByRole('button', { name: '链接' }).click()
  await expect(page.getByTestId('agent-run-trace-copy-feedback')).toContainText('链接已复制')
  await page.getByTestId('agent-run-trace-search').fill('no matching trace event')
  await expect(page.getByTestId('agent-run-trace-empty-state')).toContainText('没有符合当前筛选条件的事件')
  await page.getByTestId('agent-run-model-call-summary-item').getByRole('button', { name: '响应' }).click()
  await expect(page.getByTestId('agent-run-trace-search')).toHaveValue('')
  await expect(page.getByTestId('agent-run-trace-linked-event')).toContainText('已定位')
  await expect(page.getByTestId('agent-run-trace-event').filter({ hasText: '收到模型 HTTP 响应' })).toBeVisible()
  await page.getByTestId('agent-run-trace-search').fill('no matching trace event')
  await expect(page.getByTestId('agent-run-trace-empty-state')).toContainText('没有符合当前筛选条件的事件')
  await page.getByTestId('agent-run-clear-trace-filters').click()
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

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Einstein')
    await dialog.accept()
  })
  await page.getByTestId('agent-run-cancel-worker').click()
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
  await page.getByTestId('agent-run-load-trace-events').click()
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

  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByTestId('agent-run-cancel-worker').click()
  await expect(page.getByTestId('agent-run-cancel-error')).toContainText('cancel rejected by runtime')
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
  await expect(page.getByTestId('agent-run-debug-load-all')).toBeVisible()

  await page.getByTestId('agent-run-debug-load-all').click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(34)
  await expect(page.getByTestId('agent-run-trace-loaded-count')).toContainText('已加载 34 / 34')
  await expect(page.getByTestId('agent-run-load-all-trace-events')).toHaveCount(0)
  await expect(page.getByTestId('agent-run-debug-load-all')).toHaveCount(0)
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
  await expect(page.getByTestId('agent-run-debug-report-copy')).toContainText('复制摘要')
  await page.getByTestId('agent-run-trace-event').filter({ hasText: '组装模型上下文' }).getByTestId('agent-run-trace-event-data-copy').click()
  await expect(page.getByTestId('agent-run-trace-copy-error')).toContainText('clipboard denied by test')
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
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(6)
  await page.getByTestId('agent-run-trace-summary-retry').click()
  await expect(page.getByTestId('agent-run-trace-summary')).toContainText('6 个事件')
  await expect(page.getByTestId('agent-run-trace-summary-error')).toHaveCount(0)
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
  await page.getByTestId('agent-run-approval-action').filter({ hasText: '同意' }).click()
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
  await page.getByTestId('agent-run-approval-action').filter({ hasText: '拒绝' }).click()
  await expect(page.getByTestId('agent-run-approval-error')).toContainText('approval rejected by runtime')
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
  await page.getByRole('button', { name: /^包含占位素材/ }).click()
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
  await page.getByTestId('agent-run-input-submit').click()
  await expect(page.getByTestId('agent-run-input-error')).toContainText('input rejected by runtime')
  await expect(page.getByTestId('agent-run-pending-input')).toContainText('确认素材范围')
})

async function mockPlannerAgentRuntime(page: Page, options: { failCancel?: boolean; failApproval?: boolean; failInput?: boolean; longWorkerTrace?: boolean; failedModelTrace?: boolean; failTraceOnce?: boolean; failTraceSummaryOnce?: boolean } = {}) {
  let snapshot = plannerPlanSnapshotFixture()
  let workerRun = workerRunFixture()
  let approvalWorkerRun = approvalWorkerRunFixture()
  let inputWorkerRun = inputWorkerRunFixture()
  let traceFailureInjected = false
  let traceSummaryFailureInjected = false
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
