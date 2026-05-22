import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentTaskGraph,
  buildCreatePlanPlannerRunInput,
  createTaskGraphGoal,
  normalizeCreatePlanThreadId,
} from './planFactory.js'
import type { AgentTaskGraph, AgentTask, AgentThread } from './types.js'

test('normalizeCreatePlanThreadId trims required thread id input', () => {
  assert.equal(normalizeCreatePlanThreadId(' thread_1 '), 'thread_1')
  assert.equal(normalizeCreatePlanThreadId('   '), undefined)
  assert.equal(normalizeCreatePlanThreadId(123), undefined)
})

test('createTaskGraphGoal prefers explicit goal over message', () => {
  assert.equal(createTaskGraphGoal({ goal: ' goal ', message: 'message' }), 'goal')
  assert.equal(createTaskGraphGoal({ message: ' message ' }), 'message')
  assert.equal(createTaskGraphGoal({ goal: ' ' }), undefined)
})

test('buildAgentTaskGraph normalizes title status metadata and timestamps', () => {
  const taskGraph = buildAgentTaskGraph({
    id: 'task_graph_1',
    thread: makeThread(),
    planInput: {
      title: '  Launch taskGraph  ',
      metadata: { source: 'test' },
    },
    taskCount: 2,
    now: '2026-01-01T00:00:00.000Z',
    goal: 'Goal',
    plannerSource: 'generated',
    plannerWarnings: ['warning'],
    plannerAssessment: {
      difficulty: 'large',
      parallelStrategy: 'worker_split',
    },
  })

  assert.equal(taskGraph.id, 'task_graph_1')
  assert.equal(taskGraph.threadId, 'thread_1')
  assert.equal(taskGraph.title, 'Launch taskGraph')
  assert.equal(taskGraph.status, 'pending')
  assert.deepEqual(taskGraph.metadata, {
    source: 'test',
    goal: 'Goal',
    plannerSource: 'generated',
    plannerWarnings: ['warning'],
    plannerAssessment: {
      difficulty: 'large',
      parallelStrategy: 'worker_split',
    },
  })
  assert.equal(taskGraph.createdAt, '2026-01-01T00:00:00.000Z')
})

test('buildAgentTaskGraph falls back to thread title and blocked status without tasks', () => {
  const taskGraph = buildAgentTaskGraph({
    id: 'task_graph_1',
    thread: makeThread({ title: 'Thread title' }),
    planInput: {},
    taskCount: 0,
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(taskGraph.title, 'Thread title')
  assert.equal(taskGraph.status, 'blocked')
  assert.deepEqual(taskGraph.metadata, {})
})

test('buildAgentTaskGraph stores independent metadata and planner warning snapshots', () => {
  const metadata = {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  }
  const plannerWarnings = ['warning']
  const plannerAssessment = {
    conflictRisks: ['src/a.ts'],
  }
  const taskGraph = buildAgentTaskGraph({
    id: 'task_graph_1',
    thread: makeThread(),
    planInput: {
      title: 'TaskGraph',
      metadata,
    },
    taskCount: 1,
    now: '2026-01-01T00:00:00.000Z',
    plannerWarnings,
    plannerAssessment,
  })

  metadata.nested.value = 'changed'
  metadata.list[0]!.id = 'changed'
  plannerWarnings[0] = 'changed'
  plannerAssessment.conflictRisks[0] = 'changed'

  assert.deepEqual(taskGraph.metadata, {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
    plannerWarnings: ['warning'],
    plannerAssessment: {
      conflictRisks: ['src/a.ts'],
    },
  })
})

test('buildCreatePlanPlannerRunInput forwards root planner run controls explicitly', () => {
  assert.deepEqual(buildCreatePlanPlannerRunInput({
    taskGraph: makeTaskGraph(),
    thread: makeThread(),
    inlinePlannerTask: makeTask(),
    planInput: {
      title: 'TaskGraph only title',
      goal: 'TaskGraph only goal',
      message: 'TaskGraph only message',
      tasks: [],
      maxTasks: 3,
      createPlannerRun: true,
      agentManifest: { schema: 'movscript.agent.current' },
      clientInput: { message: 'client' },
      policy: { maxIterations: 4 },
      approvedToolNames: ['movscript_focus_get'],
      backendAuthToken: 'token',
      backendAPIBaseURL: 'http://backend',
      sandboxMode: true,
      metadata: { source: 'test' },
    },
  }), {
    threadId: 'thread_1',
    role: 'planner',
    taskGraphId: 'task_graph_1',
    taskId: 'task_1',
    progress: 0,
    agentManifest: { schema: 'movscript.agent.current' },
    clientInput: { message: 'client' },
    policy: { maxIterations: 4 },
    approvedToolNames: ['movscript_focus_get'],
    backendAuthToken: 'token',
    backendAPIBaseURL: 'http://backend',
    sandboxMode: true,
    metadata: { source: 'test' },
  })
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
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
