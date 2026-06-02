import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentTask } from '../../../../state/shared/types.js'
import {
  getRuntimeTaskGraph,
  getRuntimeTaskTree,
  listRuntimePlans,
} from './runtimePlanRead.js'

test('runtime taskGraph read helpers return plans and task trees from the store', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph({ id: 'task_graph_1' }))
  store.createTask(makeTask({ id: 'task_1', taskGraphId: 'task_graph_1' }))

  assert.deepEqual(listRuntimePlans({ store }).map((taskGraph) => taskGraph.id), ['task_graph_1'])
  assert.equal(getRuntimeTaskGraph({ store, taskGraphId: 'task_graph_1' })?.id, 'task_graph_1')
  assert.deepEqual(getRuntimeTaskTree({ store, taskGraphId: 'task_graph_1' }).map((task) => task.id), ['task_1'])
})

test('getRuntimeTaskTree validates taskGraph existence', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => getRuntimeTaskTree({
    store,
    taskGraphId: 'missing_taskGraph',
  }), /taskGraph not found: missing_taskGraph/)
})

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'pending',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
