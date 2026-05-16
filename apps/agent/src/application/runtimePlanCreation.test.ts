import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultRunPolicy } from '../state/runPolicy.js'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentThread, CreateRunInput } from '../state/types.js'
import {
  applyRuntimePlanCreationFlow,
  applyRuntimePlanCreationRootRun,
  createRuntimePlanWithTasks,
  prepareRuntimePlanCreation,
  resolveRuntimePlanCreationTasks,
} from './runtimePlanCreation.js'

test('prepareRuntimePlanCreation validates thread ownership and normalizes plan inputs', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())

  const preparation = prepareRuntimePlanCreation({
    store,
    planInput: {
      threadId: ' thread_1 ',
      title: 'Launch plan',
      goal: ' Ship the feature ',
      tasks: [{ id: 'task_1', title: 'Draft' }],
    },
  })

  assert.equal(preparation.thread.id, 'thread_1')
  assert.equal(preparation.goal, 'Ship the feature')
  assert.deepEqual(preparation.taskInputs, [{ id: 'task_1', title: 'Draft' }])
})

test('prepareRuntimePlanCreation rejects missing thread ids and duplicate thread plans', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())
  store.createPlan(makePlan())

  assert.throws(() => prepareRuntimePlanCreation({
    store,
    planInput: {},
  }), /threadId is required/)
  assert.throws(() => prepareRuntimePlanCreation({
    store,
    planInput: { threadId: 'thread_1' },
  }), /thread thread_1 already has plan plan_1/)
})

test('resolveRuntimePlanCreationTasks keeps explicit tasks without invoking planner generation', async () => {
  const result = await resolveRuntimePlanCreationTasks({
    preparation: {
      thread: makeThread(),
      taskInputs: [{ id: 'task_1', title: 'Draft' }],
      goal: 'Launch',
    },
    planInput: { title: 'Launch plan' },
    generatePlanTasks: async () => {
      throw new Error('generatePlanTasks should not be called')
    },
  })

  assert.deepEqual(result, {
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    plannerWarnings: [],
  })
})

test('resolveRuntimePlanCreationTasks builds planner generation input from a goal', async () => {
  const calls: unknown[] = []
  const result = await resolveRuntimePlanCreationTasks({
    preparation: {
      thread: makeThread(),
      taskInputs: [],
      goal: 'Ship the feature',
    },
    planInput: {
      title: ' Launch plan ',
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
      }
    },
  })

  assert.deepEqual(result, {
    taskInputs: [{ id: 'task_generated', title: 'Generated task' }],
    plannerSource: 'model',
    plannerWarnings: ['used planner model'],
  })
  assert.deepEqual(calls, [{
    goal: 'Ship the feature',
    title: 'Launch plan',
    maxTasks: 3,
    auth: {
      backendAuthToken: 'token_1',
      backendAPIBaseURL: 'https://model.example.test',
    },
  }])
})

test('createRuntimePlanWithTasks persists a plan and validated tasks', () => {
  const store = new InMemoryAgentStore()
  const result = createRuntimePlanWithTasks({
    store,
    planId: 'plan_1',
    thread: makeThread(),
    planInput: { title: 'Launch plan', metadata: { source: 'test' } },
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    now: '2026-01-01T00:00:00.000Z',
    goal: 'Launch',
    plannerSource: 'fallback',
    plannerWarnings: ['limited context'],
  })

  assert.equal(result.plan.id, 'plan_1')
  assert.equal(result.plan.status, 'pending')
  assert.equal(result.plan.metadata?.goal, 'Launch')
  assert.equal(result.plan.metadata?.plannerSource, 'fallback')
  assert.deepEqual(result.plan.metadata?.plannerWarnings, ['limited context'])
  assert.equal(result.tasks.length, 1)
  assert.equal(result.tasks[0]?.id, 'task_1')
  assert.equal(store.getPlan('plan_1')?.title, 'Launch plan')
  assert.equal(store.getTask('task_1')?.planId, 'plan_1')
})

test('createRuntimePlanWithTasks validates tasks before writing plan state', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => createRuntimePlanWithTasks({
    store,
    planId: 'plan_1',
    thread: makeThread(),
    planInput: { title: 'Invalid plan' },
    taskInputs: [
      { id: 'task_1', title: 'Depends on missing', deps: ['missing_task'] },
    ],
    now: '2026-01-01T00:00:00.000Z',
  }), /task not found: missing_task/)
  assert.equal(store.getPlan('plan_1'), undefined)
})

test('applyRuntimePlanCreationRootRun creates root planner run and assigns inline task', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  store.createThread(thread)
  const creation = createRuntimePlanWithTasks({
    store,
    planId: 'plan_1',
    thread,
    planInput: { threadId: thread.id, title: 'Launch plan' },
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    now: '2026-01-01T00:00:00.000Z',
  })
  const calls: string[] = []

  const result = applyRuntimePlanCreationRootRun({
    store,
    plan: creation.plan,
    thread,
    planInput: { threadId: thread.id, title: 'Launch plan' },
    tasks: creation.tasks,
    now: '2026-01-01T00:00:01.000Z',
    createRun: (runInput) => {
      calls.push(`create:${runInput.role}:${runInput.planId}:${runInput.taskId}`)
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
    'create:planner:plan_1:task_1',
    'assign:pending:running:run_1',
  ])
  assert.equal(store.getPlan('plan_1')?.rootRunId, 'run_1')
  assert.equal(store.getPlan('plan_1')?.status, 'running')
  assert.equal(store.getPlan('plan_1')?.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.equal(store.getTask('task_1')?.ownerRunId, 'run_1')
  assert.equal(store.getTask('task_1')?.metadata?.executionMode, 'planner_inline')
})

test('applyRuntimePlanCreationRootRun skips root run when disabled', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const creation = createRuntimePlanWithTasks({
    store,
    planId: 'plan_1',
    thread,
    planInput: { threadId: thread.id, createPlannerRun: false },
    taskInputs: [{ id: 'task_1', title: 'Draft' }],
    now: '2026-01-01T00:00:00.000Z',
  })
  const result = applyRuntimePlanCreationRootRun({
    store,
    plan: creation.plan,
    thread,
    planInput: { threadId: thread.id, createPlannerRun: false },
    tasks: creation.tasks,
    now: '2026-01-01T00:00:01.000Z',
    createRun: () => {
      throw new Error('createRun should not be called')
    },
  })

  assert.deepEqual(result, {})
  assert.equal(store.getPlan('plan_1')?.rootRunId, undefined)
  assert.equal(store.getTask('task_1')?.ownerRunId, undefined)
})

test('applyRuntimePlanCreationFlow persists plan, records created tasks, then applies root run', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const calls: string[] = []

  const result = applyRuntimePlanCreationFlow({
    store,
    planId: 'plan_1',
    preparation: {
      thread,
      taskInputs: [{ id: 'task_1', title: 'Draft' }],
      goal: 'Launch',
    },
    planInput: { threadId: thread.id, title: 'Launch plan' },
    resolvedTasks: {
      taskInputs: [{ id: 'task_1', title: 'Draft' }],
      plannerSource: 'fallback',
      plannerWarnings: ['planner unavailable'],
    },
    now: '2026-01-01T00:00:01.000Z',
    createRun: (runInput) => {
      calls.push(`root:${runInput.planId}:${runInput.taskId}`)
      const run = makeRunFromInput(runInput, { id: 'run_root' })
      store.createRun(run)
      return run
    },
    onTaskCreated: (task) => calls.push(`created:${task.id}`),
    onInlineTaskAssigned: (task, previousTask) => calls.push(`assigned:${previousTask.status}->${task.status}:${task.ownerRunId}`),
  })

  assert.equal(result.plan.id, 'plan_1')
  assert.equal(result.rootRun?.id, 'run_root')
  assert.deepEqual(calls, [
    'created:task_1',
    'root:plan_1:task_1',
    'assigned:pending->running:run_root',
  ])
  assert.equal(store.getPlan('plan_1')?.metadata?.goal, 'Launch')
  assert.equal(store.getPlan('plan_1')?.metadata?.plannerSource, 'fallback')
  assert.deepEqual(store.getPlan('plan_1')?.metadata?.plannerWarnings, ['planner unavailable'])
  assert.equal(store.getTask('task_1')?.ownerRunId, 'run_root')
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

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
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
    planId: typeof input.planId === 'string' ? input.planId : undefined,
    taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
    progress: typeof input.progress === 'number' ? input.progress : undefined,
    status: 'queued',
    policy: defaultRunPolicy({ policy: input.policy }),
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    steps: [],
    ...overrides,
  }
}
