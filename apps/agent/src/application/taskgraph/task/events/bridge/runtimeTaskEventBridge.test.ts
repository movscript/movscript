import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../../../../../state/shared/types.js'
import {
  applyRuntimeTaskEventBridgeRequest,
  createRuntimeTaskEventBridge,
} from './runtimeTaskEventBridge.js'

test('applyRuntimeTaskEventBridgeRequest records task protocol traces before task graph task events', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner' }))
  store.createTaskGraph(makeTaskGraph({ rootRunId: 'run_root' }))
  const calls: string[] = []

  const run = applyRuntimeTaskEventBridgeRequest({
    store,
    task: makeTask({ id: 'task_1', status: 'blocked', blockedReason: 'needs input' }),
    previous: makeTask({ id: 'task_1', status: 'pending' }),
    recordTrace: (_run, trace) => calls.push(`trace:${trace.title}`),
    emitPlanTaskEvent: (taskGraphId, task) => calls.push(`event:${taskGraphId}:${task.id}`),
  })

  assert.equal(run?.id, 'run_root')
  assert.deepEqual(calls, [
    'trace:Task blocked',
    'event:task_graph_1:task_1',
  ])
})

test('applyRuntimeTaskEventBridgeRequest can record task protocol traces without stream events', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner' }))
  store.createTaskGraph(makeTaskGraph({ rootRunId: 'run_root' }))
  const calls: string[] = []

  applyRuntimeTaskEventBridgeRequest({
    store,
    task: makeTask({ id: 'task_1', title: 'Workspace outline' }),
    recordTrace: (_run, trace) => calls.push(`trace:${trace.title}:${trace.summary}`),
  })

  assert.deepEqual(calls, ['trace:Task created:Workspace outline'])
})

test('createRuntimeTaskEventBridge provides reusable trace and trace-plus-event callbacks', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner' }))
  store.createTaskGraph(makeTaskGraph({ rootRunId: 'run_root' }))
  const calls: string[] = []
  const bridge = createRuntimeTaskEventBridge({
    store,
    recordTrace: (_run, trace) => calls.push(`trace:${trace.title}`),
    emitPlanTaskEvent: (taskGraphId, task) => calls.push(`event:${taskGraphId}:${task.id}`),
  })

  bridge.recordTaskProtocolEvents(makeTask({ id: 'task_a', title: 'A' }))
  bridge.recordTaskProtocolAndPlanEvent(
    makeTask({ id: 'task_b', status: 'done', progress: 1 }),
    makeTask({ id: 'task_b', status: 'running', progress: 0.5 }),
  )

  assert.deepEqual(calls, [
    'trace:Task created',
    'trace:Task completed',
    'trace:Task progress updated',
    'event:task_graph_1:task_b',
  ])
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    taskGraphId: 'task_graph_1',
    status: 'in_progress',
    role: 'planner',
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
