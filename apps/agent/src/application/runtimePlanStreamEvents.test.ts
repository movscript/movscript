import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AgentTaskGraph,
  AgentTaskGraphSnapshot,
  AgentTaskGraphStreamEvent,
  AgentRun,
  AgentInternalRunSignal,
  AgentTask,
} from '../state/types.js'
import {
  emitRuntimePlanRunStreamEvent,
  emitRuntimePlanStreamEvent,
  emitRuntimeTaskGraphTaskStreamEvent,
  replayRuntimePlanStream,
} from './runtimePlanStreamEvents.js'

test('replayRuntimePlanStream emits snapshot and done for terminal plans', () => {
  const events: AgentTaskGraphStreamEvent[] = []
  replayRuntimePlanStream({
    taskGraphId: 'task_graph_1',
    getTaskGraphSnapshot: () => snapshot({ status: 'done' }),
    listener: (event) => events.push(event),
  })

  assert.deepEqual(events.map((event) => event.type), ['snapshot', 'done'])
})

test('emitRuntimePlanRunStreamEvent projects run and trace events into taskGraph stream events', () => {
  const events: Array<{ taskGraphId: string; event: AgentTaskGraphStreamEvent }> = []
  const run = makeRun({ id: 'run_1', taskGraphId: 'task_graph_1' })
  const traceEvent: AgentInternalRunSignal = {
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
    getTaskGraphSnapshot: () => snapshot(),
    emitPlanStreamEvent: (taskGraphId, event) => events.push({ taskGraphId, event }),
  })
  emitRuntimePlanRunStreamEvent({
    event: traceEvent,
    getRun: () => run,
    hasPlanSubscribers: () => true,
    getTaskGraphSnapshot: () => snapshot(),
    emitPlanStreamEvent: (taskGraphId, event) => events.push({ taskGraphId, event }),
  })

  assert.deepEqual(events.map((item) => item.event.type), ['run', 'trace'])
  assert.equal(events[0]?.taskGraphId, 'task_graph_1')
  assert.equal((events[1]?.event as Extract<AgentTaskGraphStreamEvent, { type: 'trace' }>).runId, 'run_1')
})

test('emitRuntimeTaskGraphTaskStreamEvent emits task events only when taskGraph has subscribers', () => {
  const events: AgentTaskGraphStreamEvent[] = []
  emitRuntimeTaskGraphTaskStreamEvent({
    taskGraphId: 'task_graph_1',
    task: makeTask(),
    hasPlanSubscribers: () => false,
    getTaskGraphSnapshot: () => snapshot(),
    emitPlanStreamEvent: (_taskGraphId, event) => events.push(event),
  })
  emitRuntimeTaskGraphTaskStreamEvent({
    taskGraphId: 'task_graph_1',
    task: makeTask(),
    hasPlanSubscribers: () => true,
    getTaskGraphSnapshot: () => snapshot(),
    emitPlanStreamEvent: (_taskGraphId, event) => events.push(event),
  })

  assert.deepEqual(events.map((event) => event.type), ['task'])
})

test('emitRuntimePlanStreamEvent closes terminal snapshots', () => {
  const events: AgentTaskGraphStreamEvent[] = []
  const closed: string[] = []

  emitRuntimePlanStreamEvent({
    taskGraphId: 'task_graph_1',
    event: { type: 'snapshot', snapshot: snapshot({ status: 'done' }) },
    emit: (_taskGraphId, event) => {
      events.push(event)
      return true
    },
    close: (taskGraphId) => closed.push(taskGraphId),
  })

  assert.deepEqual(events.map((event) => event.type), ['snapshot', 'done'])
  assert.deepEqual(closed, ['task_graph_1'])
})

function snapshot(planOverrides: Partial<AgentTaskGraph> = {}): AgentTaskGraphSnapshot {
  const taskGraph = makeTaskGraph(planOverrides)
  const tasks = [makeTask()]
  return {
    taskGraph,
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

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
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
    taskGraphId: 'task_graph_1',
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
