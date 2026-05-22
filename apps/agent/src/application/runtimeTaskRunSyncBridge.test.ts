import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimeTaskRunSyncBridge } from './runtimeTaskRunSyncBridge.js'

test('createRuntimeTaskRunSyncBridge syncs run state with runtime sinks', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker', status: 'completed', taskId: 'task_1', taskGraphId: 'task_graph_1' }))
  store.createTaskGraph(makeTaskGraph({ rootRunId: 'run_root' }))
  store.createTask(makeTask({ id: 'task_1', status: 'running', ownerRunId: 'run_worker' }))
  const calls: string[] = []
  const bridge = createRuntimeTaskRunSyncBridge({
    store,
    now: () => '2026-01-01T00:00:01.000Z',
    recomputePlanStatus: (taskGraphId) => calls.push(`recompute:${taskGraphId}`),
    recordTrace: (_run, trace) => calls.push(`trace:${trace.title}`),
    emitPlanTaskEvent: (taskGraphId, task) => calls.push(`event:${taskGraphId}:${task.id}`),
  })

  const result = bridge.syncTaskFromRun('run_worker')

  assert.equal(result?.task.status, 'done')
  assert.deepEqual(calls, [
    'recompute:task_graph_1',
    'trace:Task completed',
    'trace:Task progress updated',
    'trace:Task artifact created',
    'event:task_graph_1:task_1',
  ])
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    taskGraphId: 'task_graph_1',
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
