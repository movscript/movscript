import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimeTaskUpdateBridge } from './runtimeTaskUpdateBridge.js'

test('createRuntimeTaskUpdateBridge wires task update callbacks and returns the updated task', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner', taskId: undefined }))
  store.createTaskGraph(makeTaskGraph({ rootRunId: 'run_root' }))
  store.createTask(makeTask({ id: 'task_1', status: 'pending', progress: 0 }))
  const calls: string[] = []
  const bridge = createRuntimeTaskUpdateBridge({
    store,
    now: () => '2026-01-01T00:00:01.000Z',
    recomputePlanStatus: (taskGraphId) => calls.push(`recompute:${taskGraphId}`),
    recordTrace: (_run, trace) => calls.push(`trace:${trace.title}`),
    emitPlanTaskEvent: (taskGraphId, task) => calls.push(`event:${taskGraphId}:${task.id}`),
  })

  const task = bridge.updateTask('task_1', { status: 'blocked', blockedReason: 'needs input' })

  assert.equal(task.status, 'blocked')
  assert.equal(task.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.deepEqual(calls, [
    'recompute:task_graph_1',
    'trace:Task blocked',
    'event:task_graph_1:task_1',
  ])
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    taskGraphId: 'task_graph_1',
    status: 'queued',
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
