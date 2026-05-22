import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertDispatchTaskGraphnerRunForTaskGraph,
  assertDispatchRequestedTasks,
  buildDispatchWorkerRunInput,
  normalizeDispatchTaskGraphControls,
  normalizeDispatchTaskGraphId,
} from './planDispatchInput.js'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from './types.js'

test('normalizeDispatchTaskGraphId requires a non-empty task graph id', () => {
  assert.equal(normalizeDispatchTaskGraphId(' task_graph_1 '), 'task_graph_1')
  assert.throws(() => normalizeDispatchTaskGraphId('   '), /taskGraphId is required/)
})

test('normalizeDispatchTaskGraphControls resolves planner run and execution controls', () => {
  assert.deepEqual(normalizeDispatchTaskGraphControls({
    taskIds: [' task_1 ', 'task_1', '', 'task_2'],
    maxWorkers: '3',
    maxTaskAttempts: '2',
    retryFailed: true,
    workerTimeoutMs: '500',
  }, makeTaskGraph({ rootRunId: 'run_root' })), {
    plannerRunId: 'run_root',
    maxTaskAttempts: 2,
    retryFailed: true,
    requestedTaskIds: ['task_1', 'task_2'],
    maxWorkers: 3,
    workerTimeoutMs: 500,
  })
  assert.equal(normalizeDispatchTaskGraphControls({ plannerRunId: ' run_input ' }, makeTaskGraph()).plannerRunId, 'run_input')
  assert.throws(() => normalizeDispatchTaskGraphControls({}, makeTaskGraph()), /has no plannerRunId/)
})

test('assertDispatchTaskGraphnerRunForTaskGraph rejects planner runs attached elsewhere', () => {
  assert.doesNotThrow(() => assertDispatchTaskGraphnerRunForTaskGraph(makeRun({ taskGraphId: 'task_graph_1' }), makeTaskGraph()))
  assert.doesNotThrow(() => assertDispatchTaskGraphnerRunForTaskGraph(makeRun(), makeTaskGraph()))
  assert.throws(() => assertDispatchTaskGraphnerRunForTaskGraph(makeRun({ taskGraphId: 'task_graph_2' }), makeTaskGraph()), /does not belong/)
})

test('assertDispatchRequestedTasks requires existing tasks in the taskGraph', () => {
  assert.doesNotThrow(() => assertDispatchRequestedTasks({
    taskGraphId: 'task_graph_1',
    taskIds: ['task_1'],
    getTask: () => makeTask(),
  }))
  assert.throws(() => assertDispatchRequestedTasks({
    taskGraphId: 'task_graph_1',
    taskIds: ['task_missing'],
    getTask: () => undefined,
  }), /task not found/)
  assert.throws(() => assertDispatchRequestedTasks({
    taskGraphId: 'task_graph_1',
    taskIds: ['task_1'],
    getTask: () => makeTask({ taskGraphId: 'task_graph_2' }),
  }), /does not belong/)
})

test('buildDispatchWorkerRunInput binds worker runs to planner, taskGraph, task, and dispatch overrides', () => {
  const plannerRun = makeRun({
    id: 'run_planner',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 11,
      allowNetwork: false,
      allowFileBytes: false,
    },
  })
  const input = buildDispatchWorkerRunInput({
    taskGraph: makeTaskGraph({ title: 'Launch TaskGraph' }),
    plannerRun,
    task: makeTask({
      id: 'task_worker',
      title: 'Write brief',
      description: 'Summarize taskGraph',
      metadata: { expectedArtifacts: ['brief.md'] },
    }),
    subagentName: 'Researcher',
    dispatchInput: {
      approvedToolNames: ['movscript_project_script_read'],
      backendAuthToken: 'token',
      backendAPIBaseURL: 'http://backend',
      sandboxMode: true,
    },
  })

  assert.equal(input.threadId, 'thread_1')
  assert.equal(input.role, 'worker')
  assert.equal(input.parentRunId, 'run_planner')
  assert.equal(input.taskGraphId, 'task_graph_1')
  assert.equal(input.taskId, 'task_worker')
  assert.equal(input.progress, 0)
  assert.deepEqual(input.metadata, { subagentName: 'Researcher' })
  assert.deepEqual(input.agentManifest, DEFAULT_AGENT_MANIFEST)
  assert.deepEqual(input.policy, plannerRun.policy)
  assert.deepEqual(input.approvedToolNames, ['movscript_project_script_read'])
  assert.equal(input.backendAuthToken, 'token')
  assert.equal(input.backendAPIBaseURL, 'http://backend')
  assert.equal(input.sandboxMode, true)
  assert.match(String(input.userMessage), /TaskGraph: Launch TaskGraph/)
  assert.match(String(input.userMessage), /Task: Write brief/)
  assert.deepEqual(input.task, {
    id: 'task_worker',
    title: 'Write brief',
    description: 'Summarize taskGraph',
    instructions: 'Execute this worker task and report durable artifacts, blockers, and completion status.',
    expectedArtifacts: ['brief.md'],
  })
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

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    taskGraphId: 'task_graph_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
