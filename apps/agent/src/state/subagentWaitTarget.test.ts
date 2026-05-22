import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSubagentWaitTarget } from './subagentWaitTarget.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from './types.js'

test('resolveSubagentWaitTarget resolves run targets with summary status', () => {
  const task = makeTask({ metadata: { subagentName: 'Writer' } })
  const run = makeRun({ status: 'completed', taskId: task.id })
  const result = resolveSubagentWaitTarget({
    taskGraphId: 'task_graph_1',
    runId: run.id,
    getRun: () => run,
    getTask: () => task,
    getTaskGraph: () => undefined,
  })

  assert.equal(result.done, true)
  assert.equal(result.status, 'completed')
  assert.equal(result.target.kind, 'run')
  assert.equal((result.target.run as any).subagentName, 'Writer')
})

test('resolveSubagentWaitTarget resolves task targets and blocked completion', () => {
  const task = makeTask({ status: 'blocked', metadata: { subagentName: 'Writer' } })
  const result = resolveSubagentWaitTarget({
    taskGraphId: 'task_graph_1',
    taskId: task.id,
    getRun: () => undefined,
    getTask: () => task,
    getTaskGraph: () => undefined,
  })

  assert.equal(result.done, true)
  assert.equal(result.status, 'blocked')
  assert.equal((result.target.task as any).subagentName, 'Writer')
})

test('resolveSubagentWaitTarget resolves taskGraph targets by default', () => {
  const taskGraph = makeTaskGraph({ status: 'needs_review' })
  const result = resolveSubagentWaitTarget({
    taskGraphId: taskGraph.id,
    getRun: () => undefined,
    getTask: () => undefined,
    getTaskGraph: () => taskGraph,
  })

  assert.equal(result.done, false)
  assert.equal(result.status, 'needs_review')
  assert.equal(result.target.kind, 'taskGraph')
})

test('resolveSubagentWaitTarget enforces taskGraph boundaries', () => {
  assert.throws(() => resolveSubagentWaitTarget({
    taskGraphId: 'task_graph_1',
    runId: 'run_other',
    getRun: () => makeRun({ id: 'run_other', taskGraphId: 'task_graph_other' }),
    getTask: () => undefined,
    getTaskGraph: () => undefined,
  }), /does not belong to taskGraph/)

  assert.throws(() => resolveSubagentWaitTarget({
    taskGraphId: 'task_graph_1',
    taskId: 'task_other',
    getRun: () => undefined,
    getTask: () => makeTask({ id: 'task_other', taskGraphId: 'task_graph_other' }),
    getTaskGraph: () => undefined,
  }), /does not belong to taskGraph/)
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

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    taskGraphId: 'task_graph_1',
    deps: [],
    title: 'Task',
    status: 'running',
    progress: 0,
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
    status: 'in_progress',
    role: 'worker',
    taskGraphId: 'task_graph_1',
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
