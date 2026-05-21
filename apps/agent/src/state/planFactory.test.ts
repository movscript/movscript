import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentPlan,
  buildCreatePlanPlannerRunInput,
  createPlanGoal,
  normalizeCreatePlanThreadId,
} from './planFactory.js'
import type { AgentPlan, AgentTask, AgentThread } from './types.js'

test('normalizeCreatePlanThreadId trims required thread id input', () => {
  assert.equal(normalizeCreatePlanThreadId(' thread_1 '), 'thread_1')
  assert.equal(normalizeCreatePlanThreadId('   '), undefined)
  assert.equal(normalizeCreatePlanThreadId(123), undefined)
})

test('createPlanGoal prefers explicit goal over message', () => {
  assert.equal(createPlanGoal({ goal: ' goal ', message: 'message' }), 'goal')
  assert.equal(createPlanGoal({ message: ' message ' }), 'message')
  assert.equal(createPlanGoal({ goal: ' ' }), undefined)
})

test('buildAgentPlan normalizes title status metadata and timestamps', () => {
  const plan = buildAgentPlan({
    id: 'plan_1',
    thread: makeThread(),
    planInput: {
      title: '  Launch plan  ',
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

  assert.equal(plan.id, 'plan_1')
  assert.equal(plan.threadId, 'thread_1')
  assert.equal(plan.title, 'Launch plan')
  assert.equal(plan.status, 'pending')
  assert.deepEqual(plan.metadata, {
    source: 'test',
    goal: 'Goal',
    plannerSource: 'generated',
    plannerWarnings: ['warning'],
    plannerAssessment: {
      difficulty: 'large',
      parallelStrategy: 'worker_split',
    },
  })
  assert.equal(plan.createdAt, '2026-01-01T00:00:00.000Z')
})

test('buildAgentPlan falls back to thread title and blocked status without tasks', () => {
  const plan = buildAgentPlan({
    id: 'plan_1',
    thread: makeThread({ title: 'Thread title' }),
    planInput: {},
    taskCount: 0,
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(plan.title, 'Thread title')
  assert.equal(plan.status, 'blocked')
  assert.deepEqual(plan.metadata, {})
})

test('buildAgentPlan stores independent metadata and planner warning snapshots', () => {
  const metadata = {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  }
  const plannerWarnings = ['warning']
  const plannerAssessment = {
    conflictRisks: ['src/a.ts'],
  }
  const plan = buildAgentPlan({
    id: 'plan_1',
    thread: makeThread(),
    planInput: {
      title: 'Plan',
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

  assert.deepEqual(plan.metadata, {
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
    plan: makePlan(),
    thread: makeThread(),
    inlinePlannerTask: makeTask(),
    planInput: {
      title: 'Plan only title',
      goal: 'Plan only goal',
      message: 'Plan only message',
      tasks: [],
      maxTasks: 3,
      createPlannerRun: true,
      agentManifest: { schema: 'movscript.agent.current' },
      clientInput: { message: 'client' },
      policy: { maxIterations: 4 },
      approvedToolNames: ['movscript_get_focus'],
      backendAuthToken: 'token',
      backendAPIBaseURL: 'http://backend',
      sandboxMode: true,
      metadata: { source: 'test' },
    },
  }), {
    threadId: 'thread_1',
    role: 'planner',
    planId: 'plan_1',
    taskId: 'task_1',
    progress: 0,
    agentManifest: { schema: 'movscript.agent.current' },
    clientInput: { message: 'client' },
    policy: { maxIterations: 4 },
    approvedToolNames: ['movscript_get_focus'],
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

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
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
