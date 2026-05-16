import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRunPlanDebugContext, buildSubagentSnapshotView } from './planContextView.js'
import type { AgentDebugContextPanel, AgentPlan, AgentRun, AgentTask } from './types.js'

test('buildRunPlanDebugContext adds compact plan state to debug context', () => {
  const context = debugContext()
  const plan = makePlan()
  const task = makeTask({ id: 'task_1', metadata: { subagentName: 'Writer' }, ownerRunId: 'run_worker' })
  const run = makeRun({ id: 'run_planner', role: 'planner', planId: plan.id })
  const worker = makeRun({ id: 'run_worker', role: 'worker', parentRunId: run.id, planId: plan.id, taskId: task.id })

  const result = buildRunPlanDebugContext({ context, run, plan, tasks: [task], runs: [run, worker] })

  assert.equal(result.agentPlan?.id, plan.id)
  assert.equal(result.agentPlan?.tasks[0]?.subagentName, 'Writer')
  assert.equal(result.agentPlan?.workers[0]?.id, worker.id)
  assert.equal(result.agentPlan?.summary?.taskCount, 1)
})

test('buildRunPlanDebugContext leaves context unchanged without a plan', () => {
  const context = debugContext()

  assert.equal(buildRunPlanDebugContext({
    context,
    run: makeRun({ planId: undefined }),
    tasks: [],
    runs: [],
  }), context)
})

test('buildSubagentSnapshotView exposes workers, artifacts, and summary', () => {
  const plan = makePlan()
  const task = makeTask({
    id: 'task_1',
    metadata: { subagentName: 'Writer' },
    artifacts: [{ id: 'artifact_1', type: 'draft', title: 'Draft', createdAt: '2026-01-01T00:00:00.000Z' }],
  })
  const planner = makeRun({ id: 'run_planner', role: 'planner', planId: plan.id })
  const worker = makeRun({ id: 'run_worker', role: 'worker', parentRunId: planner.id, planId: plan.id, taskId: task.id })

  const result = buildSubagentSnapshotView({
    snapshot: { plan, tasks: [task], runs: [planner, worker] },
    plannerRunId: planner.id,
  })

  assert.equal((result.workers as any[])[0]?.subagentName, 'Writer')
  assert.equal((result.artifacts as any[])[0]?.id, 'artifact_1')
  assert.equal((result.summary as any).workerCount, 1)
})

function debugContext(): AgentDebugContextPanel {
  return {
    route: { pathname: '/' },
    projects: [],
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'running',
    progress: 0,
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
