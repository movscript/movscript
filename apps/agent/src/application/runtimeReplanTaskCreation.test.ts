import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import { buildRuntimeReplanTasksToCreate } from './runtimeReplanTaskCreation.js'

test('buildRuntimeReplanTasksToCreate builds new replan tasks with store-backed validation', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_existing' }))

  const tasks = buildRuntimeReplanTasksToCreate({
    store,
    planId: 'plan_1',
    now: '2026-01-01T00:00:01.000Z',
    inputs: [{
      id: 'task_new',
      title: 'New task',
      deps: ['task_existing'],
      metadata: { subagentName: 'Writer' },
    }],
  })

  assert.equal(tasks[0]?.id, 'task_new')
  assert.equal(tasks[0]?.title, 'New task')
  assert.deepEqual(tasks[0]?.deps, ['task_existing'])
  assert.equal(tasks[0]?.metadata?.subagentName, 'Writer')
})

test('buildRuntimeReplanTasksToCreate rejects duplicate subagent names against stored task and run state', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_existing', metadata: { subagentName: 'Writer' } }))
  store.createRun(makeRun({ id: 'run_worker', metadata: { subagentName: 'Director' } }))

  assert.throws(() => buildRuntimeReplanTasksToCreate({
    store,
    planId: 'plan_1',
    now: '2026-01-01T00:00:01.000Z',
    inputs: [{ id: 'task_new', title: 'New task', subagentName: 'Writer' }],
  }), /subagent name already exists in plan plan_1: Writer/)

  assert.throws(() => buildRuntimeReplanTasksToCreate({
    store,
    planId: 'plan_1',
    now: '2026-01-01T00:00:01.000Z',
    inputs: [{ id: 'task_other', title: 'Other task', subagentName: 'Director' }],
  }), /subagent name already exists in plan plan_1: Director/)
})

test('buildRuntimeReplanTasksToCreate rejects references outside the plan', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_foreign', planId: 'plan_2' }))

  assert.throws(() => buildRuntimeReplanTasksToCreate({
    store,
    planId: 'plan_1',
    now: '2026-01-01T00:00:01.000Z',
    inputs: [{ id: 'task_new', title: 'New task', deps: ['task_foreign'] }],
  }), /dependency task task_foreign does not belong to plan plan_1/)
})

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

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    planId: 'plan_1',
    role: 'worker',
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
