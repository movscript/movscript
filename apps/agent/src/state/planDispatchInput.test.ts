import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertDispatchPlannerRunForPlan,
  assertDispatchRequestedTasks,
  buildDispatchWorkerRunInput,
  normalizeDispatchPlanControls,
  normalizeDispatchPlanId,
} from './planDispatchInput.js'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentPlan, AgentRun, AgentTask } from './types.js'

test('normalizeDispatchPlanId requires a non-empty plan id', () => {
  assert.equal(normalizeDispatchPlanId(' plan_1 '), 'plan_1')
  assert.throws(() => normalizeDispatchPlanId('   '), /planId is required/)
})

test('normalizeDispatchPlanControls resolves planner run and execution controls', () => {
  assert.deepEqual(normalizeDispatchPlanControls({
    taskIds: [' task_1 ', 'task_1', '', 'task_2'],
    maxWorkers: '3',
    maxTaskAttempts: '2',
    retryFailed: true,
    workerTimeoutMs: '500',
  }, makePlan({ rootRunId: 'run_root' })), {
    plannerRunId: 'run_root',
    maxTaskAttempts: 2,
    retryFailed: true,
    requestedTaskIds: ['task_1', 'task_2'],
    maxWorkers: 3,
    workerTimeoutMs: 500,
  })
  assert.equal(normalizeDispatchPlanControls({ plannerRunId: ' run_input ' }, makePlan()).plannerRunId, 'run_input')
  assert.throws(() => normalizeDispatchPlanControls({}, makePlan()), /has no plannerRunId/)
})

test('assertDispatchPlannerRunForPlan rejects planner runs attached elsewhere', () => {
  assert.doesNotThrow(() => assertDispatchPlannerRunForPlan(makeRun({ planId: 'plan_1' }), makePlan()))
  assert.doesNotThrow(() => assertDispatchPlannerRunForPlan(makeRun(), makePlan()))
  assert.throws(() => assertDispatchPlannerRunForPlan(makeRun({ planId: 'plan_2' }), makePlan()), /does not belong/)
})

test('assertDispatchRequestedTasks requires existing tasks in the plan', () => {
  assert.doesNotThrow(() => assertDispatchRequestedTasks({
    planId: 'plan_1',
    taskIds: ['task_1'],
    getTask: () => makeTask(),
  }))
  assert.throws(() => assertDispatchRequestedTasks({
    planId: 'plan_1',
    taskIds: ['task_missing'],
    getTask: () => undefined,
  }), /task not found/)
  assert.throws(() => assertDispatchRequestedTasks({
    planId: 'plan_1',
    taskIds: ['task_1'],
    getTask: () => makeTask({ planId: 'plan_2' }),
  }), /does not belong/)
})

test('buildDispatchWorkerRunInput binds worker runs to planner, plan, task, and dispatch overrides', () => {
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
    plan: makePlan({ title: 'Launch Plan' }),
    plannerRun,
    task: makeTask({
      id: 'task_worker',
      title: 'Write brief',
      description: 'Summarize plan',
      metadata: { expectedArtifacts: ['brief.md'] },
    }),
    subagentName: 'Researcher',
    dispatchInput: {
      approvedToolNames: ['movscript_read_project_scripts'],
      backendAuthToken: 'token',
      backendAPIBaseURL: 'http://backend',
      sandboxMode: true,
    },
  })

  assert.equal(input.threadId, 'thread_1')
  assert.equal(input.role, 'worker')
  assert.equal(input.parentRunId, 'run_planner')
  assert.equal(input.planId, 'plan_1')
  assert.equal(input.taskId, 'task_worker')
  assert.equal(input.progress, 0)
  assert.deepEqual(input.metadata, { subagentName: 'Researcher' })
  assert.deepEqual(input.agentManifest, DEFAULT_AGENT_MANIFEST)
  assert.deepEqual(input.policy, plannerRun.policy)
  assert.deepEqual(input.approvedToolNames, ['movscript_read_project_scripts'])
  assert.equal(input.backendAuthToken, 'token')
  assert.equal(input.backendAPIBaseURL, 'http://backend')
  assert.equal(input.sandboxMode, true)
  assert.match(String(input.userMessage), /Plan: Launch Plan/)
  assert.match(String(input.userMessage), /Task: Write brief/)
  assert.deepEqual(input.task, {
    id: 'task_worker',
    title: 'Write brief',
    description: 'Summarize plan',
    instructions: 'Execute this worker task and report durable artifacts, blockers, and completion status.',
    expectedArtifacts: ['brief.md'],
  })
})

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
