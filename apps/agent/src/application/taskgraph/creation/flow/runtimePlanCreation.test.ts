import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultRuntimeLimits } from '../../../../state/run/core/limits/runtimeLimits.js'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentTaskGraphSnapshot, AgentRun, AgentThread, CreateRunInput } from '../../../../state/shared/types.js'
import {
  applyRuntimeTaskGraphCreationFlow,
  applyRuntimeTaskGraphCreationRequest,
  applyRuntimeTaskGraphCreationRootRun,
  createRuntimePlanWithTasks,
  prepareRuntimeTaskGraphCreation,
  resolveRuntimeTaskGraphCreationTasks,
} from './runtimePlanCreation.js'

test('prepareRuntimeTaskGraphCreation validates thread ownership and normalizes taskGraph inputs', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())

  const preparation = prepareRuntimeTaskGraphCreation({
    store,
    planInput: {
      threadId: ' thread_1 ',
      title: 'Launch taskGraph',
      goal: ' Ship the feature ',
      tasks: [{ id: 'task_1', title: 'Draft' }],
    },
  })

  assert.equal(preparation.thread.id, 'thread_1')
  assert.equal(preparation.goal, 'Ship the feature')
  assert.deepEqual(preparation.taskInputs, [{ id: 'task_1', title: 'Draft' }])
})

test('prepareRuntimeTaskGraphCreation rejects missing thread ids and duplicate thread plans', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())
  store.createTaskGraph(makeTaskGraph())

  assert.throws(() => prepareRuntimeTaskGraphCreation({
    store,
    planInput: {},
  }), /threadId is required/)
  assert.throws(() => prepareRuntimeTaskGraphCreation({
    store,
    planInput: { threadId: 'thread_1' },
  }), /thread thread_1 already has taskGraph task_graph_1/)
})

test('resolveRuntimeTaskGraphCreationTasks keeps explicit tasks without invoking planner generation', async () => {
  const result = await resolveRuntimeTaskGraphCreationTasks({
    preparation: {
      thread: makeThread(),
      taskInputs: [{ id: 'task_1', title: 'Draft' }],
      goal: 'Launch',
    },
    planInput: { title: 'Launch taskGraph' },
    generatePlanTasks: async () => {
      throw new Error('generatePlanTasks should not be called')
    },
  })

  assert.deepEqual(result, {
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    plannerWarnings: [],
  })
})

test('resolveRuntimeTaskGraphCreationTasks builds planner generation input from a goal', async () => {
  const calls: unknown[] = []
  const result = await resolveRuntimeTaskGraphCreationTasks({
    preparation: {
      thread: makeThread(),
      taskInputs: [],
      goal: 'Ship the feature',
    },
    planInput: {
      title: ' Launch taskGraph ',
      maxTasks: 3,
      backendAuthToken: ' token_1 ',
      backendAPIBaseURL: ' https://model.example.test ',
    },
    generatePlanTasks: async (input) => {
      calls.push(input)
      return {
        tasks: [{ id: 'task_generated', title: 'Generated task' }],
        source: 'model',
        warnings: ['used planner model'],
        assessment: {
          difficulty: 'moderate',
          parallelStrategy: 'planner_with_sidecars',
        },
      }
    },
  })

  assert.deepEqual(result, {
    taskInputs: [{ id: 'task_generated', title: 'Generated task' }],
    plannerSource: 'model',
    plannerWarnings: ['used planner model'],
    plannerAssessment: {
      difficulty: 'moderate',
      parallelStrategy: 'planner_with_sidecars',
    },
  })
  assert.deepEqual(calls, [{
    goal: 'Ship the feature',
    title: 'Launch taskGraph',
    maxTasks: 3,
    auth: {
      backendAuthToken: 'token_1',
      backendAPIBaseURL: 'https://model.example.test',
    },
  }])
})

test('createRuntimePlanWithTasks persists a taskGraph and validated tasks', () => {
  const store = new InMemoryAgentStore()
  const result = createRuntimePlanWithTasks({
    store,
    taskGraphId: 'task_graph_1',
    thread: makeThread(),
    planInput: { title: 'Launch taskGraph', metadata: { source: 'test' } },
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    now: '2026-01-01T00:00:00.000Z',
    goal: 'Launch',
    plannerSource: 'fallback',
    plannerWarnings: ['limited context'],
    plannerAssessment: {
      difficulty: 'simple',
      parallelStrategy: 'planner_only',
    },
  })

  assert.equal(result.taskGraph.id, 'task_graph_1')
  assert.equal(result.taskGraph.status, 'pending')
  assert.equal(result.taskGraph.metadata?.goal, 'Launch')
  assert.equal(result.taskGraph.metadata?.plannerSource, 'fallback')
  assert.deepEqual(result.taskGraph.metadata?.plannerWarnings, ['limited context'])
  assert.deepEqual(result.taskGraph.metadata?.plannerAssessment, {
    difficulty: 'simple',
    parallelStrategy: 'planner_only',
  })
  assert.equal(result.tasks.length, 1)
  assert.equal(result.tasks[0]?.id, 'task_1')
  assert.equal(store.getTaskGraph('task_graph_1')?.title, 'Launch taskGraph')
  assert.equal(store.getTask('task_1')?.taskGraphId, 'task_graph_1')
})

test('createRuntimePlanWithTasks validates tasks before writing taskGraph state', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => createRuntimePlanWithTasks({
    store,
    taskGraphId: 'task_graph_1',
    thread: makeThread(),
    planInput: { title: 'Invalid taskGraph' },
    taskInputs: [
      { id: 'task_1', title: 'Depends on missing', deps: ['missing_task'] },
    ],
    now: '2026-01-01T00:00:00.000Z',
  }), /task not found: missing_task/)
  assert.equal(store.getTaskGraph('task_graph_1'), undefined)
})

test('applyRuntimeTaskGraphCreationRootRun creates root planner run and assigns inline task', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  store.createThread(thread)
  const creation = createRuntimePlanWithTasks({
    store,
    taskGraphId: 'task_graph_1',
    thread,
    planInput: { threadId: thread.id, title: 'Launch taskGraph' },
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    now: '2026-01-01T00:00:00.000Z',
  })
  const calls: string[] = []

  const result = applyRuntimeTaskGraphCreationRootRun({
    store,
    taskGraph: creation.taskGraph,
    thread,
    planInput: { threadId: thread.id, title: 'Launch taskGraph' },
    tasks: creation.tasks,
    now: '2026-01-01T00:00:01.000Z',
    createRun: (runInput) => {
      calls.push(`create:${runInput.role}:${runInput.taskGraphId}:${runInput.taskId}`)
      const run = makeRunFromInput(runInput, { id: 'run_1' })
      store.createRun(run)
      return run
    },
    onInlineTaskAssigned: (task, previousTask) => {
      calls.push(`assign:${previousTask.status}:${task.status}:${task.ownerRunId}`)
    },
  })

  assert.equal(result.rootRun?.id, 'run_1')
  assert.equal(result.inlineTaskAssignment?.task.id, 'task_1')
  assert.deepEqual(calls, [
    'create:planner:task_graph_1:task_1',
    'assign:pending:running:run_1',
  ])
  assert.equal(store.getTaskGraph('task_graph_1')?.rootRunId, 'run_1')
  assert.equal(store.getTaskGraph('task_graph_1')?.status, 'running')
  assert.equal(store.getTaskGraph('task_graph_1')?.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.equal(store.getTask('task_1')?.ownerRunId, 'run_1')
  assert.equal(store.getTask('task_1')?.metadata?.executionMode, 'planner_inline')
})

test('applyRuntimeTaskGraphCreationRootRun skips root run when disabled', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const creation = createRuntimePlanWithTasks({
    store,
    taskGraphId: 'task_graph_1',
    thread,
    planInput: { threadId: thread.id, createPlannerRun: false },
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    now: '2026-01-01T00:00:00.000Z',
  })
  const result = applyRuntimeTaskGraphCreationRootRun({
    store,
    taskGraph: creation.taskGraph,
    thread,
    planInput: { threadId: thread.id, createPlannerRun: false },
    tasks: creation.tasks,
    now: '2026-01-01T00:00:01.000Z',
    createRun: () => {
      throw new Error('createRun should not be called')
    },
  })

  assert.deepEqual(result, {})
  assert.equal(store.getTaskGraph('task_graph_1')?.rootRunId, undefined)
  assert.equal(store.getTask('task_1')?.ownerRunId, undefined)
})

test('applyRuntimeTaskGraphCreationFlow persists taskGraph, records created tasks, then applies root run', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const calls: string[] = []

  const result = applyRuntimeTaskGraphCreationFlow({
    store,
    taskGraphId: 'task_graph_1',
    preparation: {
      thread,
      taskInputs: [{ id: 'task_1', title: 'Draft' }],
      goal: 'Launch',
    },
    planInput: { threadId: thread.id, title: 'Launch taskGraph' },
    resolvedTasks: {
      taskInputs: [{ id: 'task_1', title: 'Draft' }],
      plannerSource: 'fallback',
      plannerWarnings: ['planner unavailable'],
    },
    now: '2026-01-01T00:00:01.000Z',
    createRun: (runInput) => {
      calls.push(`root:${runInput.taskGraphId}:${runInput.taskId}`)
      const run = makeRunFromInput(runInput, { id: 'run_root' })
      store.createRun(run)
      return run
    },
    onTaskCreated: (task) => calls.push(`created:${task.id}`),
    onInlineTaskAssigned: (task, previousTask) => calls.push(`assigned:${previousTask.status}->${task.status}:${task.ownerRunId}`),
  })

  assert.equal(result.taskGraph.id, 'task_graph_1')
  assert.equal(result.rootRun?.id, 'run_root')
  assert.deepEqual(calls, [
    'created:task_1',
    'root:task_graph_1:task_1',
    'assigned:pending->running:run_root',
  ])
  assert.equal(store.getTaskGraph('task_graph_1')?.metadata?.goal, 'Launch')
  assert.equal(store.getTaskGraph('task_graph_1')?.metadata?.plannerSource, 'fallback')
  assert.deepEqual(store.getTaskGraph('task_graph_1')?.metadata?.plannerWarnings, ['planner unavailable'])
  assert.equal(store.getTask('task_1')?.ownerRunId, 'run_root')
})

test('applyRuntimeTaskGraphCreationRequest resolves tasks, persists taskGraph, and returns the snapshot', async () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  store.createThread(thread)
  const calls: string[] = []

  const snapshot = await applyRuntimeTaskGraphCreationRequest({
    store,
    taskGraphId: 'task_graph_1',
    planInput: { threadId: thread.id, goal: 'Launch the agent workstream' },
    now: '2026-01-01T00:00:01.000Z',
    generatePlanTasks: async (input) => {
      calls.push(`generate:${input.goal}`)
      return {
        tasks: [{ id: 'task_generated', title: 'Generated task' }],
        source: 'model',
        warnings: [],
      }
    },
    createRun: (runInput) => {
      calls.push(`run:${runInput.taskGraphId}:${runInput.taskId}`)
      const run = makeRunFromInput(runInput, { id: 'run_root' })
      store.createRun(run)
      return run
    },
    getTaskGraphSnapshot: (taskGraphId) => {
      calls.push(`snapshot:${taskGraphId}`)
      return makeSnapshot(store, taskGraphId)
    },
    onTaskCreated: (task) => calls.push(`created:${task.id}`),
    onInlineTaskAssigned: (task, previousTask) => calls.push(`assigned:${previousTask.status}->${task.status}:${task.ownerRunId}`),
  })

  assert.equal(snapshot.taskGraph.id, 'task_graph_1')
  assert.deepEqual(calls, [
    'generate:Launch the agent workstream',
    'created:task_generated',
    'run:task_graph_1:task_generated',
    'assigned:pending->running:run_root',
    'snapshot:task_graph_1',
  ])
  assert.equal(store.getTaskGraph('task_graph_1')?.rootRunId, 'run_root')
  assert.equal(store.getTask('task_generated')?.ownerRunId, 'run_root')
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

function makeRunFromInput(input: CreateRunInput, overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: typeof input.threadId === 'string' ? input.threadId : 'thread_1',
    role: input.role === 'planner' || input.role === 'worker' ? input.role : undefined,
    taskGraphId: typeof input.taskGraphId === 'string' ? input.taskGraphId : undefined,
    taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
    progress: typeof input.progress === 'number' ? input.progress : undefined,
    status: 'queued',
    runtimeLimits: defaultRuntimeLimits({ override: input.runtimeLimits }),
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    steps: [],
    ...overrides,
  }
}

function makeSnapshot(store: InMemoryAgentStore, taskGraphId: string): AgentTaskGraphSnapshot {
  const taskGraph = store.getTaskGraph(taskGraphId)
  assert.ok(taskGraph)
  return {
    taskGraph,
    tasks: store.listTasks(taskGraphId),
    runs: store.listRuns({ taskGraphId }),
  }
}
