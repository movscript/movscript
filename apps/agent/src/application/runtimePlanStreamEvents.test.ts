import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AgentPlan,
  AgentPlanSnapshot,
  AgentPlanStreamEvent,
  AgentRun,
  AgentRunStreamEvent,
  AgentTask,
} from '../state/types.js'
import {
  emitRuntimePlanRunStreamEvent,
  emitRuntimePlanStreamEvent,
  emitRuntimePlanTaskStreamEvent,
  replayRuntimePlanStream,
} from './runtimePlanStreamEvents.js'

test('replayRuntimePlanStream emits snapshot and done for terminal plans', () => {
  const events: AgentPlanStreamEvent[] = []
  replayRuntimePlanStream({
    planId: 'plan_1',
    getPlanSnapshot: () => snapshot({ status: 'done' }),
    listener: (event) => events.push(event),
  })

  assert.deepEqual(events.map((event) => event.type), ['snapshot', 'done'])
})

test('emitRuntimePlanRunStreamEvent projects run and trace events into plan stream events', () => {
  const events: Array<{ planId: string; event: AgentPlanStreamEvent }> = []
  const run = makeRun({ id: 'run_1', planId: 'plan_1' })
  const traceEvent: AgentRunStreamEvent = {
    type: 'trace',
    runId: run.id,
    event: {
      id: 'trace_1',
      runId: run.id,
      kind: 'task',
      title: 'Task started',
      status: 'started',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  }

  emitRuntimePlanRunStreamEvent({
    event: { type: 'run', run },
    getRun: () => undefined,
    hasPlanSubscribers: () => true,
    getPlanSnapshot: () => snapshot(),
    emitPlanStreamEvent: (planId, event) => events.push({ planId, event }),
  })
  emitRuntimePlanRunStreamEvent({
    event: traceEvent,
    getRun: () => run,
    hasPlanSubscribers: () => true,
    getPlanSnapshot: () => snapshot(),
    emitPlanStreamEvent: (planId, event) => events.push({ planId, event }),
  })

  assert.deepEqual(events.map((item) => item.event.type), ['run', 'trace'])
  assert.equal(events[0]?.planId, 'plan_1')
  assert.equal((events[1]?.event as Extract<AgentPlanStreamEvent, { type: 'trace' }>).runId, 'run_1')
})

test('emitRuntimePlanTaskStreamEvent emits task events only when plan has subscribers', () => {
  const events: AgentPlanStreamEvent[] = []
  emitRuntimePlanTaskStreamEvent({
    planId: 'plan_1',
    task: makeTask(),
    hasPlanSubscribers: () => false,
    getPlanSnapshot: () => snapshot(),
    emitPlanStreamEvent: (_planId, event) => events.push(event),
  })
  emitRuntimePlanTaskStreamEvent({
    planId: 'plan_1',
    task: makeTask(),
    hasPlanSubscribers: () => true,
    getPlanSnapshot: () => snapshot(),
    emitPlanStreamEvent: (_planId, event) => events.push(event),
  })

  assert.deepEqual(events.map((event) => event.type), ['task'])
})

test('emitRuntimePlanStreamEvent closes terminal snapshots', () => {
  const events: AgentPlanStreamEvent[] = []
  const closed: string[] = []

  emitRuntimePlanStreamEvent({
    planId: 'plan_1',
    event: { type: 'snapshot', snapshot: snapshot({ status: 'done' }) },
    emit: (_planId, event) => {
      events.push(event)
      return true
    },
    close: (planId) => closed.push(planId),
  })

  assert.deepEqual(events.map((event) => event.type), ['snapshot', 'done'])
  assert.deepEqual(closed, ['plan_1'])
})

function snapshot(planOverrides: Partial<AgentPlan> = {}): AgentPlanSnapshot {
  const plan = makePlan(planOverrides)
  const tasks = [makeTask()]
  return {
    plan,
    tasks,
    runs: [],
    summary: {
      taskCount: tasks.length,
      taskStatusCounts: {
        pending: 0,
        running: 0,
        blocked: 0,
        needs_review: 0,
        done: tasks.length,
        failed: 0,
        cancelled: 0,
      },
      workerCount: 0,
      activeWorkerCount: 0,
      artifactCount: 0,
      nameConflictCount: 0,
      blockedTaskIds: [],
      needsReviewTaskIds: [],
      failedTaskIds: [],
    },
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
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

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0.5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    title: 'Task',
    status: 'done',
    progress: 1,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
