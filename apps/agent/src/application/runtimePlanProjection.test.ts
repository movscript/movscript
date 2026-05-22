import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../state/types.js'
import {
  applyRuntimeTaskGraphStatusRecomputeRequest,
  recomputeRuntimeTaskGraphStatus,
} from './runtimePlanProjection.js'

test('recomputeRuntimeTaskGraphStatus projects task state onto a stored taskGraph', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph({ status: 'running', progress: 0 }))
  store.createTask(makeTask({ id: 'task_1', status: 'done', progress: 1 }))
  store.createTask(makeTask({ id: 'task_2', status: 'done', progress: 0.5 }))

  const result = recomputeRuntimeTaskGraphStatus({
    store,
    taskGraphId: 'task_graph_1',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result?.projection.completedNow, true)
  assert.equal(result?.tasks.length, 2)
  assert.equal(result?.taskGraph.status, 'done')
  assert.equal(store.getTaskGraph('task_graph_1')?.status, 'done')
  assert.equal(store.getTaskGraph('task_graph_1')?.progress, 0.75)
})

test('recomputeRuntimeTaskGraphStatus ignores missing plans', () => {
  const store = new InMemoryAgentStore()
  assert.equal(recomputeRuntimeTaskGraphStatus({
    store,
    taskGraphId: 'missing_taskGraph',
    now: '2026-01-01T00:00:01.000Z',
  }), undefined)
})

test('applyRuntimeTaskGraphStatusRecomputeRequest records completion trace when a taskGraph first completes', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', taskGraphId: 'task_graph_1' }))
  store.createTaskGraph(makeTaskGraph({ rootRunId: 'run_root', status: 'running', progress: 0 }))
  store.createTask(makeTask({
    id: 'task_1',
    status: 'done',
    progress: 1,
    artifacts: [{ id: 'draft_1', type: 'draft', createdAt: '2026-01-01T00:00:00.000Z' }],
  }))
  const traces: string[] = []

  const result = applyRuntimeTaskGraphStatusRecomputeRequest({
    store,
    taskGraphId: 'task_graph_1',
    now: '2026-01-01T00:00:01.000Z',
    recordTrace: (run, trace) => traces.push(`${run.id}:${trace.kind}:${trace.status}:${String((trace.data as any)?.artifactCount)}`),
  })

  assert.equal(result?.taskGraph.status, 'done')
  assert.deepEqual(traces, ['run_root:taskGraph:completed:1'])
})

test('applyRuntimeTaskGraphStatusRecomputeRequest skips completion trace for missing plans', () => {
  const store = new InMemoryAgentStore()
  const traces: string[] = []

  const result = applyRuntimeTaskGraphStatusRecomputeRequest({
    store,
    taskGraphId: 'missing_taskGraph',
    now: '2026-01-01T00:00:01.000Z',
    recordTrace: () => traces.push('trace'),
  })

  assert.equal(result, undefined)
  assert.deepEqual(traces, [])
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
