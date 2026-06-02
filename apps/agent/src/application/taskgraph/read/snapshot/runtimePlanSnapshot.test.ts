import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../../../../state/shared/types.js'
import { getRuntimeTaskGraphSnapshot } from './runtimePlanSnapshot.js'

test('getRuntimeTaskGraphSnapshot builds a product-safe taskGraph snapshot from store state', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph())
  store.createTask(makeTask({ id: 'task_1', status: 'done', progress: 1 }))
  store.createRun(makeRun({
    id: 'run_worker',
    taskGraphId: 'task_graph_1',
    taskId: 'task_1',
    role: 'worker',
    status: 'completed',
  }))

  const snapshot = getRuntimeTaskGraphSnapshot({ store, taskGraphId: 'task_graph_1' })

  assert.equal(snapshot.taskGraph.id, 'task_graph_1')
  assert.equal(snapshot.tasks.length, 1)
  assert.equal(snapshot.runs.length, 1)
  assert.equal(snapshot.runs[0]?.id, 'run_worker')
  assert.ok(snapshot.summary)
  assert.equal(snapshot.summary.taskCount, 1)
  assert.equal(snapshot.summary.workerCount, 1)
})

test('getRuntimeTaskGraphSnapshot uses stable not-found errors', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => getRuntimeTaskGraphSnapshot({
    store,
    taskGraphId: 'missing_taskGraph',
  }), /taskGraph not found: missing_taskGraph/)
})

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'running',
    progress: 0,
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
    role: 'worker',
    runtimeLimits: { approvalMode: 'interactive',
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
    taskGraphId: 'task_graph_1',
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
