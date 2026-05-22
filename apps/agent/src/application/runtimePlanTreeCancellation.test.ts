import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentRun } from '../state/types.js'
import {
  applyRuntimeTaskGraphTreeCancellationRequest,
  resolveRuntimeTaskGraphTreeCancellationRoot,
} from './runtimePlanTreeCancellation.js'

test('resolveRuntimeTaskGraphTreeCancellationRoot accepts only the attached root planner run', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph())
  store.createRun(makeRun({ id: 'run_root', role: 'planner', taskGraphId: 'task_graph_1' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker', taskGraphId: 'task_graph_1' }))
  store.createRun(makeRun({ id: 'run_second_planner', role: 'planner', taskGraphId: 'task_graph_1' }))
  store.createRun(makeRun({ id: 'run_unattached', role: 'planner' }))

  assert.equal(resolveRuntimeTaskGraphTreeCancellationRoot({ store, runId: 'run_root' }), 'run_root')
  assert.throws(() => resolveRuntimeTaskGraphTreeCancellationRoot({ store, runId: 'run_worker' }), /is not a planner run/)
  assert.throws(() => resolveRuntimeTaskGraphTreeCancellationRoot({ store, runId: 'run_second_planner' }), /is not the root planner/)
  assert.throws(() => resolveRuntimeTaskGraphTreeCancellationRoot({ store, runId: 'run_unattached' }), /is not attached to a task graph/)
})

test('applyRuntimeTaskGraphTreeCancellationRequest resolves the root and delegates subtree cancellation', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph())
  store.createRun(makeRun({ id: 'run_root', role: 'planner', taskGraphId: 'task_graph_1' }))
  const calls: string[] = []

  const result = applyRuntimeTaskGraphTreeCancellationRequest({
    store,
    runId: 'run_root',
    cancelSubtree: (runId) => {
      calls.push(`subtree:${runId}`)
      return { cancelledRunIds: [runId] }
    },
  })

  assert.deepEqual(result.cancelledRunIds, ['run_root'])
  assert.deepEqual(calls, ['subtree:run_root'])
})

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    rootRunId: 'run_root',
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
