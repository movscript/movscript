import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentRun } from '../state/types.js'
import {
  attachPlannerRunToRuntimeTaskGraph,
  findRuntimeThreadTaskGraph,
  requireRuntimePlannerRun,
  resolveRuntimePlannerRunPlanId,
} from './runtimePlanBinding.js'
import { requireRuntimeTaskGraph } from './runtimeStoreLookup.js'

test('requireRuntimePlannerRun resolves planner runs and rejects workers', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner', role: 'planner' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker' }))

  assert.equal(requireRuntimePlannerRun(store, 'run_planner').id, 'run_planner')
  assert.throws(() => requireRuntimePlannerRun(store, 'run_worker'), /is not a planner run/)
  assert.throws(() => requireRuntimePlannerRun(store, 'missing'), /run not found: missing/)
})

test('requireRuntimeTaskGraph and findRuntimeThreadTaskGraph read plans through the store boundary', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph({ id: 'task_graph_1', threadId: 'thread_1' }))
  store.createTaskGraph(makeTaskGraph({ id: 'task_graph_2', threadId: 'thread_2' }))

  assert.equal(requireRuntimeTaskGraph(store, 'task_graph_1').id, 'task_graph_1')
  assert.equal(findRuntimeThreadTaskGraph(store, 'thread_2')?.id, 'task_graph_2')
  assert.equal(findRuntimeThreadTaskGraph(store, 'thread_missing'), undefined)
  assert.throws(() => requireRuntimeTaskGraph(store, 'missing'), /taskGraph not found: missing/)
})

test('attachPlannerRunToRuntimeTaskGraph persists run binding and repairs stale taskGraph root', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_1' }))
  store.createTaskGraph(makeTaskGraph({ id: 'task_graph_1', rootRunId: 'stale_run' }))

  const attached = attachPlannerRunToRuntimeTaskGraph({
    store,
    runId: 'run_1',
    taskGraphId: 'task_graph_1',
    source: 'tool',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(attached.taskGraphId, 'task_graph_1')
  assert.equal(store.getRun('run_1')?.taskGraphId, 'task_graph_1')
  assert.equal(store.getRun('run_1')?.metadata?.attachedPlanByTool, 'tool')
  assert.equal(store.getTaskGraph('task_graph_1')?.rootRunId, 'run_1')
})

test('resolveRuntimePlannerRunPlanId selects and attaches taskGraph within planner boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_1' }))
  store.createTaskGraph(makeTaskGraph({ id: 'task_graph_1' }))

  const taskGraphId = resolveRuntimePlannerRunPlanId({
    store,
    plannerRun: requireRuntimePlannerRun(store, 'run_1'),
    source: 'tool',
    action: 'inspect',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(taskGraphId, 'task_graph_1')
  assert.equal(store.getRun('run_1')?.taskGraphId, 'task_graph_1')
})

test('resolveRuntimePlannerRunPlanId rejects plans outside the planner thread', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1' }))
  store.createTaskGraph(makeTaskGraph({ id: 'task_graph_2', threadId: 'thread_2' }))

  assert.throws(() => resolveRuntimePlannerRunPlanId({
    store,
    plannerRun: requireRuntimePlannerRun(store, 'run_1'),
    inputPlanId: 'task_graph_2',
    source: 'tool',
    action: 'inspect',
    now: '2026-01-01T00:00:01.000Z',
  }), /cannot inspect task graph task_graph_2/)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    role: 'planner',
    status: 'queued',
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
    status: 'pending',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
