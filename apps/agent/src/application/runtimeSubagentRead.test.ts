import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentPlanSnapshot, AgentRun, AgentTask } from '../state/types.js'
import {
  listRuntimeSubagents,
  waitRuntimeSubagent,
} from './runtimeSubagentRead.js'

const now = '2026-01-01T00:00:01.000Z'

test('listRuntimeSubagents resolves the planner plan and returns a subagent snapshot', () => {
  const store = makeStore()

  const result = listRuntimeSubagents({
    store,
    plannerRunId: 'run_planner',
    now,
    getPlanSnapshot: (planId) => snapshot(store, planId),
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.planId, 'plan_1')
  assert.equal(result.plannerRunId, 'run_planner')
  assert.equal((result.snapshot.summary as Record<string, unknown>).taskCount, 1)
})

test('waitRuntimeSubagent resolves named task targets without touching trace state', async () => {
  const store = makeStore()

  const result = await waitRuntimeSubagent({
    store,
    plannerRunId: 'run_planner',
    request: { subagentName: 'Einstein', timeoutMs: 0 },
    now,
    getPlanSnapshot: (planId) => snapshot(store, planId),
  })

  assert.equal(result.status, 'completed')
  assert.equal(result.done, true)
  assert.equal(result.planId, 'plan_1')
  assert.equal(result.target.kind, 'run')
  assert.equal((result.target.run as Record<string, unknown>).id, 'run_worker')
})

test('waitRuntimeSubagent polls until the target is done or the deadline is reached', async () => {
  const store = makeStore({ taskStatus: 'running', runStatus: 'in_progress' })
  let current = 0
  let sleepCalls = 0

  const result = await waitRuntimeSubagent({
    store,
    plannerRunId: 'run_planner',
    request: { runId: 'run_worker', timeoutMs: 200 },
    now,
    currentTimeMs: () => current,
    sleep: async () => {
      sleepCalls += 1
      current += 100
      if (sleepCalls === 1) {
        store.updateRun(makeRun({
          id: 'run_worker',
          role: 'worker',
          parentRunId: 'run_planner',
          planId: 'plan_1',
          taskId: 'task_1',
          status: 'completed',
        }))
      }
    },
    getPlanSnapshot: (planId) => snapshot(store, planId),
  })

  assert.equal(sleepCalls, 1)
  assert.equal(result.status, 'completed')
  assert.equal(result.done, true)
  assert.equal((result.target.run as Record<string, unknown>).id, 'run_worker')
})

function makeStore(input: {
  taskStatus?: AgentTask['status']
  runStatus?: AgentRun['status']
} = {}): InMemoryAgentStore {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan())
  store.createTask(makeTask({ status: input.taskStatus ?? 'done' }))
  store.createRun(makeRun({ id: 'run_planner', role: 'planner', planId: 'plan_1' }))
  store.createRun(makeRun({
    id: 'run_worker',
    role: 'worker',
    parentRunId: 'run_planner',
    planId: 'plan_1',
    taskId: 'task_1',
    status: input.runStatus ?? 'completed',
  }))
  return store
}

function snapshot(store: InMemoryAgentStore, planId: string): AgentPlanSnapshot {
  const plan = store.getPlan(planId)
  assert.ok(plan)
  return {
    plan,
    tasks: store.listTasks(planId),
    runs: store.listRuns({ planId }),
  }
}

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    rootRunId: 'run_planner',
    title: 'Plan',
    status: 'running',
    progress: 0.5,
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
    status: 'done',
    progress: 1,
    ownerRunId: 'run_worker',
    artifacts: [],
    metadata: { subagentName: 'Einstein' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
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
