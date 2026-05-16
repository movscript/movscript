import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import { assignRuntimeTaskToPlannerRun } from './runtimeTaskAssignment.js'

test('assignRuntimeTaskToPlannerRun persists planner inline ownership and returns previous snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner', role: 'planner' }))
  store.createTask(makeTask({ id: 'task_1', status: 'pending', progress: 0 }))

  const result = assignRuntimeTaskToPlannerRun({
    store,
    taskId: 'task_1',
    runId: 'run_planner',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.previousTask.status, 'pending')
  assert.equal(result.task.status, 'running')
  assert.equal(result.task.ownerRunId, 'run_planner')
  assert.equal(result.task.metadata?.executionMode, 'planner_inline')
  assert.equal(store.getTask('task_1')?.ownerRunId, 'run_planner')
})

test('assignRuntimeTaskToPlannerRun rejects worker runs and missing entities', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_worker', role: 'worker' }))
  store.createTask(makeTask({ id: 'task_1' }))

  assert.throws(() => assignRuntimeTaskToPlannerRun({
    store,
    taskId: 'task_1',
    runId: 'run_worker',
    now: '2026-01-01T00:00:01.000Z',
  }), /run run_worker is not a planner run/)

  assert.throws(() => assignRuntimeTaskToPlannerRun({
    store,
    taskId: 'missing_task',
    runId: 'run_worker',
    now: '2026-01-01T00:00:01.000Z',
  }), /task not found: missing_task/)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    role: 'planner',
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
