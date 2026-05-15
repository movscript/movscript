import { expect, test, type Page, type Route } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
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

  await page.goto('/project-home')

  await expect(page.getByTestId('agent-plan-overview')).toBeVisible()
  await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('0/4 tasks')
  await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('3 active workers')
  await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('1 artifact')
  await expect(page.getByTestId('agent-plan-status-explanation')).toContainText('3 active workers')
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
  await expect(page.getByTestId('agent-run-trace-summary')).toContainText('4 个事件')

  await page.getByTestId('agent-run-load-trace-events').click()
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(4)
  await expect(page.getByTestId('agent-run-trace-event').first()).toContainText('Worker started')
  await expect(page.getByTestId('agent-run-model-detail')).toBeVisible()
  await expect(page.getByTestId('agent-run-model-detail')).toContainText('大模型 HTTP 详情')
  await expect(page.getByTestId('agent-run-model-detail')).toContainText('请求消息')
  await expect(page.getByTestId('agent-run-model-detail')).toContainText('movscript_review_assets')
  await expect(page.getByTestId('agent-run-model-detail')).toContainText('发现缺少主视觉覆盖。')
  await page.getByTestId('agent-run-trace-search').fill('review tool')
  await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(1)
  await expect(page.getByTestId('agent-run-trace-event')).toContainText('Asset review tool call')
  await page.getByTestId('agent-run-trace-event-details-toggle').click()
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('missing_hero_visual')
  await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('artifact_einstein_risk')

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Einstein')
    await dialog.accept()
  })
  await page.getByTestId('agent-run-cancel-worker').click()
  await expect(page.getByTestId('agent-run-header')).toContainText('已取消')
  await expect(page.getByTestId('agent-run-plan-context')).toContainText('已取消')
  await expect(page.getByTestId('agent-run-cancel-worker')).toHaveCount(0)
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
  await page.getByTestId('agent-run-approval-action').filter({ hasText: 'Approve' }).click()
  await expect(page.getByTestId('agent-run-header')).toContainText('in progress')
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
  await page.getByTestId('agent-run-approval-action').filter({ hasText: 'Reject' }).click()
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
  await expect(page.getByTestId('agent-run-header')).toContainText('queued')
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

async function mockPlannerAgentRuntime(page: Page, options: { failCancel?: boolean; failApproval?: boolean; failInput?: boolean } = {}) {
  let snapshot = plannerPlanSnapshotFixture()
  let workerRun = workerRunFixture()
  let approvalWorkerRun = approvalWorkerRunFixture()
  let inputWorkerRun = inputWorkerRunFixture()
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
      await fulfillJSON(route, traceSummaryFixture(decodeURIComponent(traceSummaryMatch[1])))
      return
    }
    const traceMatch = url.pathname.match(/^\/runs\/([^/]+)\/trace$/)
    if (traceMatch) {
      await fulfillJSON(route, {
        runId: decodeURIComponent(traceMatch[1]),
        events: traceEventsFixture(decodeURIComponent(traceMatch[1])),
      })
      return
    }
    await fulfillJSON(route, { error: 'not found' }, 404)
  })
}

async function fulfillJSON(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
