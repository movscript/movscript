import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import {
  applyRuntimePlanStatusRecomputeRequest,
  recomputeRuntimePlanStatus,
} from './runtimePlanProjection.js'

test('recomputeRuntimePlanStatus projects task state onto a stored plan', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan({ status: 'running', progress: 0 }))
  store.createTask(makeTask({ id: 'task_1', status: 'done', progress: 1 }))
  store.createTask(makeTask({ id: 'task_2', status: 'done', progress: 0.5 }))

  const result = recomputeRuntimePlanStatus({
    store,
    planId: 'plan_1',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result?.projection.completedNow, true)
  assert.equal(result?.tasks.length, 2)
  assert.equal(result?.plan.status, 'done')
  assert.equal(store.getPlan('plan_1')?.status, 'done')
  assert.equal(store.getPlan('plan_1')?.progress, 0.75)
})

test('recomputeRuntimePlanStatus ignores missing plans', () => {
  const store = new InMemoryAgentStore()
  assert.equal(recomputeRuntimePlanStatus({
    store,
    planId: 'missing_plan',
    now: '2026-01-01T00:00:01.000Z',
  }), undefined)
})

test('applyRuntimePlanStatusRecomputeRequest records completion trace when a plan first completes', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', planId: 'plan_1' }))
  store.createPlan(makePlan({ rootRunId: 'run_root', status: 'running', progress: 0 }))
  store.createTask(makeTask({
    id: 'task_1',
    status: 'done',
    progress: 1,
    artifacts: [{ id: 'draft_1', type: 'draft', createdAt: '2026-01-01T00:00:00.000Z' }],
  }))
  const traces: string[] = []

  const result = applyRuntimePlanStatusRecomputeRequest({
    store,
    planId: 'plan_1',
    now: '2026-01-01T00:00:01.000Z',
    recordTrace: (run, trace) => traces.push(`${run.id}:${trace.kind}:${trace.status}:${String((trace.data as any)?.artifactCount)}`),
  })

  assert.equal(result?.plan.status, 'done')
  assert.deepEqual(traces, ['run_root:plan:completed:1'])
})

test('applyRuntimePlanStatusRecomputeRequest skips completion trace for missing plans', () => {
  const store = new InMemoryAgentStore()
  const traces: string[] = []

  const result = applyRuntimePlanStatusRecomputeRequest({
    store,
    planId: 'missing_plan',
    now: '2026-01-01T00:00:01.000Z',
    recordTrace: () => traces.push('trace'),
  })

  assert.equal(result, undefined)
  assert.deepEqual(traces, [])
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
