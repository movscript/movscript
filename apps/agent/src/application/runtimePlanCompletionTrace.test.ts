import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import {
  applyRuntimePlanCompletionTrace,
  type RuntimePlanCompletionTraceInput,
} from './runtimePlanCompletionTrace.js'

test('applyRuntimePlanCompletionTrace records completion on the root run', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner' }))
  const traces: RuntimePlanCompletionTraceInput[] = []

  const run = applyRuntimePlanCompletionTrace({
    store,
    plan: makePlan({ rootRunId: 'run_root' }),
    tasks: [
      makeTask({ id: 'task_1' }),
      makeTask({
        id: 'task_2',
        artifacts: [{
          id: 'artifact_1',
          type: 'draft',
          title: 'Draft',
          createdAt: '2026-01-01T00:00:00.000Z',
        }],
      }),
    ],
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(run?.id, 'run_root')
  assert.equal(traces[0]?.title, 'Plan completed')
  assert.equal(traces[0]?.summary, '2 task(s) completed.')
  assert.equal((traces[0]?.data as any)?.eventType, 'plan_completed')
  assert.equal((traces[0]?.data as any)?.artifactCount, 1)
  assert.deepEqual((traces[0]?.data as any)?.completedTaskIds, ['task_1', 'task_2'])
})

test('applyRuntimePlanCompletionTrace falls back to a planner run when rootRunId is absent', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner', role: 'planner' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker' }))

  const run = applyRuntimePlanCompletionTrace({
    store,
    plan: makePlan({ rootRunId: undefined }),
    tasks: [makeTask()],
    recordTrace: () => {},
  })

  assert.equal(run?.id, 'run_planner')
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    planId: 'plan_1',
    status: 'completed',
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
    rootRunId: 'run_root',
    title: 'Plan',
    status: 'done',
    progress: 1,
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
    status: 'done',
    progress: 1,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
