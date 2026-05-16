import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimePlanStatusBridge } from './runtimePlanStatusBridge.js'

test('createRuntimePlanStatusBridge recomputes plans with runtime time and trace sinks', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', planId: 'plan_1' }))
  store.createPlan(makePlan({ rootRunId: 'run_root', status: 'running', progress: 0 }))
  store.createTask(makeTask({ status: 'done', progress: 1 }))
  const traces: string[] = []
  const bridge = createRuntimePlanStatusBridge({
    store,
    now: () => '2026-01-01T00:00:01.000Z',
    recordTrace: (run, trace) => traces.push(`${run.id}:${trace.title}`),
  })

  const result = bridge.recomputePlanStatus('plan_1')

  assert.equal(result?.plan.status, 'done')
  assert.equal(store.getPlan('plan_1')?.completedAt, '2026-01-01T00:00:01.000Z')
  assert.deepEqual(traces, ['run_root:Plan completed'])
})

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

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_root',
    threadId: 'thread_1',
    role: 'planner',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
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
