import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../../../../../state/shared/types.js'
import { createRuntimeTaskGraphStatusBridge } from './runtimePlanStatusBridge.js'

test('createRuntimeTaskGraphStatusBridge recomputes plans with runtime time and trace sinks', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', taskGraphId: 'task_graph_1' }))
  store.createTaskGraph(makeTaskGraph({ rootRunId: 'run_root', status: 'running', progress: 0 }))
  store.createTask(makeTask({ status: 'done', progress: 1 }))
  const traces: string[] = []
  const bridge = createRuntimeTaskGraphStatusBridge({
    store,
    now: () => '2026-01-01T00:00:01.000Z',
    recordTrace: (run, trace) => traces.push(`${run.id}:${trace.title}`),
  })

  const result = bridge.recomputePlanStatus('task_graph_1')

  assert.equal(result?.taskGraph.status, 'done')
  assert.equal(store.getTaskGraph('task_graph_1')?.completedAt, '2026-01-01T00:00:01.000Z')
  assert.deepEqual(traces, ['run_root:TaskGraph completed'])
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
    id: 'run_root',
    threadId: 'thread_1',
    role: 'planner',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
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
