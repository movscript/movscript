import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSubagentWaitTarget } from './subagentWaitTarget.js'
import type { AgentPlan, AgentRun, AgentTask } from './types.js'

test('resolveSubagentWaitTarget resolves run targets with summary status', () => {
  const task = makeTask({ metadata: { subagentName: 'Writer' } })
  const run = makeRun({ status: 'completed', taskId: task.id })
  const result = resolveSubagentWaitTarget({
    planId: 'plan_1',
    runId: run.id,
    getRun: () => run,
    getTask: () => task,
    getPlan: () => undefined,
  })

  assert.equal(result.done, true)
  assert.equal(result.status, 'completed')
  assert.equal(result.target.kind, 'run')
  assert.equal((result.target.run as any).subagentName, 'Writer')
})

test('resolveSubagentWaitTarget resolves task targets and blocked completion', () => {
  const task = makeTask({ status: 'blocked', metadata: { subagentName: 'Writer' } })
  const result = resolveSubagentWaitTarget({
    planId: 'plan_1',
    taskId: task.id,
    getRun: () => undefined,
    getTask: () => task,
    getPlan: () => undefined,
  })

  assert.equal(result.done, true)
  assert.equal(result.status, 'blocked')
  assert.equal((result.target.task as any).subagentName, 'Writer')
})

test('resolveSubagentWaitTarget resolves plan targets by default', () => {
  const plan = makePlan({ status: 'needs_review' })
  const result = resolveSubagentWaitTarget({
    planId: plan.id,
    getRun: () => undefined,
    getTask: () => undefined,
    getPlan: () => plan,
  })

  assert.equal(result.done, false)
  assert.equal(result.status, 'needs_review')
  assert.equal(result.target.kind, 'plan')
})

test('resolveSubagentWaitTarget enforces plan boundaries', () => {
  assert.throws(() => resolveSubagentWaitTarget({
    planId: 'plan_1',
    runId: 'run_other',
    getRun: () => makeRun({ id: 'run_other', planId: 'plan_other' }),
    getTask: () => undefined,
    getPlan: () => undefined,
  }), /does not belong to plan/)

  assert.throws(() => resolveSubagentWaitTarget({
    planId: 'plan_1',
    taskId: 'task_other',
    getRun: () => undefined,
    getTask: () => makeTask({ id: 'task_other', planId: 'plan_other' }),
    getPlan: () => undefined,
  }), /does not belong to plan/)
})

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
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
    planId: 'plan_1',
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
    planId: 'plan_1',
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
