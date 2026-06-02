import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type { AgentRun, AgentTaskGraph, AgentTaskGraphSnapshot, AgentThread } from '../../../state/shared/types.js'
import { createRuntimeSnapshotBridge } from './runtimeSnapshotBridge.js'

test('createRuntimeSnapshotBridge reconciles thread snapshots and includes displayed worker state', async () => {
  const store = new InMemoryAgentStore()
  const root = baseThread({ id: 'thread_root', sessionId: 'session_1' })
  const workerRun = baseRun({
    id: 'run_worker',
    threadId: 'thread_worker',
    sessionId: 'session_1',
    status: 'requires_action',
    pendingInputRequests: [{ id: 'input_1', displayThreadId: root.id }] as AgentRun['pendingInputRequests'],
  })
  const reconciled: string[] = []
  store.createThread(root)
  store.createRun(workerRun)
  store.createRuntimeWork({
    id: 'work_worker',
    threadId: 'thread_worker',
    runId: workerRun.id,
    kind: 'generation_job',
    mode: 'async',
    status: 'waiting',
    request: {},
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  })

  const snapshot = await createRuntimeSnapshotBridge({
    store,
    reconcileThread: async (threadId) => {
      reconciled.push(threadId)
    },
    getTaskGraphSnapshot: emptyTaskGraphSnapshot,
  }).getThreadRuntimeSnapshot(root.id)

  assert.deepEqual(reconciled, [root.id])
  assert.deepEqual(snapshot?.runs.map((run) => run.id), [workerRun.id])
  assert.deepEqual(snapshot?.works.map((work) => work.id), ['work_worker'])
})

test('createRuntimeSnapshotBridge reconciles session threads before assembling the session snapshot', async () => {
  const store = new InMemoryAgentStore()
  const session = {
    id: 'session_1',
    rootThreadId: 'thread_root',
    interactiveThreadId: 'thread_root',
    activeThreadId: 'thread_worker',
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  }
  store.createSession(session)
  store.createThread(baseThread({ id: 'thread_root', sessionId: session.id }))
  store.createThread(baseThread({ id: 'thread_worker', sessionId: session.id }))
  store.createTaskGraph({
    id: 'task_graph_1',
    threadId: 'thread_root',
    sessionId: session.id,
    title: 'Plan',
    status: 'running',
    tasks: [],
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  } as unknown as AgentTaskGraph)
  const reconciled: string[] = []

  const snapshot = await createRuntimeSnapshotBridge({
    store,
    reconcileThread: async (threadId) => {
      reconciled.push(threadId)
    },
    getTaskGraphSnapshot: emptyTaskGraphSnapshot,
  }).getSessionRuntimeSnapshot(session.id)

  assert.deepEqual(reconciled, ['thread_root', 'thread_worker'])
  assert.deepEqual(snapshot?.threads.map((thread) => thread.id), ['thread_root', 'thread_worker'])
  assert.deepEqual(snapshot?.taskGraphs.map((taskGraph) => taskGraph.taskGraph.id), ['task_graph_1'])
})

function baseThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_root',
    status: 'idle',
    archived: false,
    messages: [],
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_root',
    status: 'queued',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function emptyTaskGraphSnapshot(taskGraphId: string): AgentTaskGraphSnapshot {
  return {
    taskGraph: {
      id: taskGraphId,
      threadId: 'thread_root',
      title: 'Plan',
      status: 'running',
      createdAt: '2026-05-23T00:00:00.000Z',
      updatedAt: '2026-05-23T00:00:00.000Z',
    },
    tasks: [],
    current: {
      runningTaskIds: [],
      blockedTaskIds: [],
      needsReviewTaskIds: [],
      failedTaskIds: [],
    },
  } as unknown as AgentTaskGraphSnapshot
}
