import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acceptPlanTaskReviewAction,
  cancelPlanTreeAction,
  dispatchPlanAction,
  rejectPlanTaskReviewAction,
  replanPlanAction,
  reworkPlanTaskReviewAction,
  type AgentPlanActionDeps,
  type PlanDispatchSettings,
} from './agentPlanActions'
import type { AgentPlanSnapshot, AgentRun, AgentTask, DispatchPlanResult, ReplanRunResult } from './localAgentClient'

const settings: PlanDispatchSettings = {
  maxWorkers: 3,
  maxTaskAttempts: 4,
  workerTimeoutMs: 12_000,
}

test('dispatchPlanAction dispatches with planner run settings and stores latest planner run', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  const plannerRun = makeRun({ id: 'run_planner', planId: 'plan_1', status: 'completed' })
  deps.getRun = async () => {
    calls.push('getRun')
    return plannerRun
  }
  deps.dispatchPlan = async (_planId, input) => {
    calls.push(`dispatch:${input.plannerRunId}:${input.maxWorkers}:${input.maxTaskAttempts}:${input.workerTimeoutMs}`)
    return {
      plan: makeSnapshot().plan,
      spawnedRuns: [makeRun({ id: 'run_worker', status: 'in_progress' })],
      blockedTaskIds: [],
      retriedTaskIds: [],
      timedOutRunIds: [],
    }
  }

  const handled = await dispatchPlanAction({
    run: makeRun({ id: 'run_planner', planId: 'plan_1', status: 'requires_action' }),
    snapshot: makeSnapshot(),
    settings,
    deps,
  })

  assert.equal(handled, true)
  assert.deepEqual(calls, [
    'busy:true',
    'dispatch:run_planner:3:4:12000',
    'getRun',
    'setRun:run_planner:true',
    'refetch',
    'busy:false',
  ])
})

test('replanPlanAction resets blocked review and failed task states', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.replanRun = async (_runId, input) => {
    calls.push(`replan:${input.resetBlocked}:${input.resetNeedsReview}:${input.resetFailed}:${input.resetCancelled}:${input.retryFailed}`)
    return makeReplanResult({ spawnedRuns: [] })
  }

  await replanPlanAction({
    run: makeRun({ id: 'run_planner', planId: 'plan_1' }),
    snapshot: makeSnapshot(),
    settings,
    deps,
  })

  assert.equal(calls.includes('replan:true:true:true:true:true'), true)
  assert.equal(calls.includes('setRun:run_planner:false'), true)
})

test('review actions write deterministic task updates', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  const now = () => new Date('2026-05-19T10:00:00.000Z')

  await acceptPlanTaskReviewAction({ taskId: 'task_1', deps, now })
  await rejectPlanTaskReviewAction({ taskId: 'task_2', deps, now })

  assert.equal(calls.includes('updateTask:task_1:done:accepted:2026-05-19T10:00:00.000Z'), true)
  assert.equal(calls.includes('updateTask:task_2:cancelled:rejected:2026-05-19T10:00:00.000Z'), true)
})

test('reworkPlanTaskReviewAction replans only the requested task', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.replanRun = async (_runId, input) => {
    calls.push(`rework:${input.resetTaskIds?.join(',')}:${input.maxWorkers}:${input.retryFailed}`)
    return makeReplanResult({ spawnedRuns: [makeRun({ id: 'run_worker' })] })
  }

  await reworkPlanTaskReviewAction({
    taskId: 'task_review',
    run: makeRun({ id: 'run_planner', planId: 'plan_1' }),
    snapshot: makeSnapshot(),
    settings,
    deps,
  })

  assert.equal(calls.includes('rework:task_review:1:true'), true)
  assert.equal(calls.includes('setRun:run_planner:true'), true)
})

test('cancelPlanTreeAction cancels root run and clears loading state', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  await cancelPlanTreeAction({
    run: makeRun({ id: 'run_planner', planId: 'plan_1' }),
    snapshot: makeSnapshot(),
    deps,
  })

  assert.deepEqual(calls, [
    'busy:true',
    'cancel:run_planner:用户停止了当前计划树。',
    'getRun',
    'setRun:run_planner:false',
    'refetch',
    'busy:false',
  ])
})

test('plan actions report failures through assistant messages and clear busy state', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.dispatchPlan = async () => {
    throw new Error('backend offline')
  }

  const handled = await dispatchPlanAction({
    run: makeRun({ id: 'run_planner', planId: 'plan_1' }),
    snapshot: makeSnapshot(),
    settings,
    deps,
  })

  assert.equal(handled, false)
  assert.deepEqual(calls, [
    'busy:true',
    'assistant:计划调度失败：backend offline',
    'busy:false',
  ])
})

function depsFixture(calls: string[]): AgentPlanActionDeps {
  return {
    setBusy: (busy) => {
      calls.push(`busy:${busy}`)
    },
    setConversationRun: (run, patch) => {
      calls.push(`setRun:${run.id}:${patch.loading === true}`)
    },
    addAssistantMessage: (message) => {
      calls.push(`assistant:${message.content}`)
    },
    dispatchPlan: async (_planId, input) => {
      calls.push(`dispatch:${input.plannerRunId}`)
      return {
        plan: makeSnapshot().plan,
        spawnedRuns: [],
        blockedTaskIds: [],
        retriedTaskIds: [],
        timedOutRunIds: [],
      } satisfies DispatchPlanResult
    },
    replanRun: async (_runId, input) => {
      calls.push(`replan:${input.resetTaskIds?.join(',') ?? 'all'}`)
      return makeReplanResult({ spawnedRuns: [] })
    },
    updateTask: async (taskId, input) => {
      const metadata = input.metadata as { reviewOutcome?: string; reviewedAt?: string } | undefined
      calls.push(`updateTask:${taskId}:${input.status}:${metadata?.reviewOutcome}:${metadata?.reviewedAt}`)
      return makeTask({ id: taskId, ...input })
    },
    cancelRunTree: async (runId, input) => {
      calls.push(`cancel:${runId}:${input.reason}`)
    },
    getRun: async () => {
      calls.push('getRun')
      return makeRun({ id: 'run_planner', planId: 'plan_1' })
    },
    refetchPlanSnapshot: async () => {
      calls.push('refetch')
    },
  }
}

function makeReplanResult(options: { spawnedRuns: AgentRun[] }): ReplanRunResult {
  return {
    plan: makeSnapshot().plan,
    createdTaskIds: [],
    updatedTaskIds: [],
    resetTaskIds: [],
    dispatch: {
      plan: makeSnapshot().plan,
      spawnedRuns: options.spawnedRuns,
      blockedTaskIds: [],
      retriedTaskIds: [],
      timedOutRunIds: [],
    },
  }
}

function makeSnapshot(): AgentPlanSnapshot {
  return {
    plan: {
      id: 'plan_1',
      threadId: 'thread_1',
      rootRunId: 'run_planner',
      title: 'Plan',
      status: 'running',
      progress: 0.5,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
    },
    tasks: [makeTask()],
    runs: [makeRun({ id: 'run_planner', planId: 'plan_1' })],
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'needs_review',
    progress: 0,
    artifacts: [],
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}
