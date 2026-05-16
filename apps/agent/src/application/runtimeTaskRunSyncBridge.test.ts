import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimeTaskRunSyncBridge } from './runtimeTaskRunSyncBridge.js'

test('createRuntimeTaskRunSyncBridge syncs run state with runtime sinks', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker', status: 'completed', taskId: 'task_1', planId: 'plan_1' }))
  store.createPlan(makePlan({ rootRunId: 'run_root' }))
  store.createTask(makeTask({ id: 'task_1', status: 'running', ownerRunId: 'run_worker' }))
  const calls: string[] = []
  const bridge = createRuntimeTaskRunSyncBridge({
    store,
    now: () => '2026-01-01T00:00:01.000Z',
    recomputePlanStatus: (planId) => calls.push(`recompute:${planId}`),
    recordTrace: (_run, trace) => calls.push(`trace:${trace.title}`),
    emitPlanTaskEvent: (planId, task) => calls.push(`event:${planId}:${task.id}`),
  })

  const result = bridge.syncTaskFromRun('run_worker')

  assert.equal(result?.task.status, 'done')
  assert.deepEqual(calls, [
    'recompute:plan_1',
    'trace:Task completed',
    'trace:Task progress updated',
    'trace:Task artifact created',
    'event:plan_1:task_1',
  ])
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    planId: 'plan_1',
    status: 'in_progress',
    role: 'worker',
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
    title: 'Task',
    status: 'pending',
    progress: 0,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
