import assert from 'node:assert/strict'
import test from 'node:test'

import { loadRuntimeThreadProjection } from './agentRuntimeThreadHydration'
import type { AgentRun, AgentThread } from './localAgentClient'

const NOW = '2026-05-19T00:00:00.000Z'

test('loadRuntimeThreadProjection loads thread runs and merges ensured runs before projecting messages', async () => {
  const thread = makeThread()
  const listedRun = makeRun({ id: 'run_listed', input: { sourceMessageId: 'msg_user', userMessage: 'Use the tool' } })
  const ensuredRun = makeRun({ id: 'run_ensured', status: 'requires_action' })
  const result = await loadRuntimeThreadProjection({
    threadId: 'thread_1',
    existingMessages: [],
    ensureRuns: [ensuredRun],
  }, {
    client: {
      getThread: async () => thread,
      listRunsByThread: async () => ({ threadId: 'thread_1', runs: [listedRun] }),
    },
    fetchRunTraceEvents: async () => [],
  })

  assert.deepEqual(result.runs.map((run) => run.id), ['run_listed', 'run_ensured'])
  assert.equal(result.messages.some((message) => message.meta?.runtimeMessage?.runId === 'run_listed'), true)
  assert.equal(result.messages.some((message) => message.meta?.runtimeMessage?.runId === 'run_ensured'), true)
})

test('loadRuntimeThreadProjection prefers a combined thread runtime snapshot when available', async () => {
  const calls: string[] = []
  const thread = makeThread()
  const listedRun = makeRun({ id: 'run_listed', input: { sourceMessageId: 'msg_user', userMessage: 'Use the tool' } })

  const result = await loadRuntimeThreadProjection({
    threadId: 'thread_1',
    existingMessages: [],
  }, {
    client: {
      getThread: async () => {
        calls.push('getThread')
        return thread
      },
      listRunsByThread: async () => {
        calls.push('listRunsByThread')
        return { threadId: 'thread_1', runs: [] }
      },
      getThreadRuntime: async () => {
        calls.push('getThreadRuntime')
        return makeRuntimeSnapshot(thread, [listedRun], {
          runId: listedRun.id,
        })
      },
    },
    fetchRunTraceEvents: async () => [],
  })

  assert.deepEqual(calls, ['getThreadRuntime'])
  assert.deepEqual(result.runs.map((run) => run.id), ['run_listed'])
  assert.equal(result.currentRun?.id, 'run_listed')
})

test('loadRuntimeThreadProjection derives actionable runs from the authoritative snapshot', async () => {
  const thread = makeThread()
  const completedRun = makeRun({ id: 'run_completed', status: 'completed' })
  const pendingRun = makeRun({
    id: 'run_pending',
    status: 'requires_action',
    updatedAt: '2026-05-19T00:00:05.000Z',
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_pending',
      title: 'Confirm direction',
      question: 'Which direction?',
      inputType: 'choice',
      choices: [{ id: 'a', label: 'A' }],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-05-19T00:00:04.000Z',
      updatedAt: '2026-05-19T00:00:04.000Z',
    }],
  })

  const result = await loadRuntimeThreadProjection({
    threadId: 'thread_1',
    existingMessages: [],
  }, {
    client: {
      getThread: async () => thread,
      listRunsByThread: async () => ({ threadId: 'thread_1', runs: [] }),
      getThreadRuntime: async () => makeRuntimeSnapshot(thread, [completedRun, pendingRun], {
        runId: completedRun.id,
        actionableRunIds: [pendingRun.id],
        pendingInputRequestRefs: [{ runId: pendingRun.id, requestId: 'input_1' }],
      }),
    },
    fetchRunTraceEvents: async () => [],
  })

  assert.deepEqual(result.actionableRuns.map((run) => run.id), ['run_pending'])
  assert.equal(result.currentRun?.id, 'run_pending')
})

test('loadRuntimeThreadProjection falls back to ensured runs when thread run listing fails', async () => {
  const thread = makeThread()
  const ensuredRun = makeRun({ id: 'run_ensured', status: 'requires_action' })
  const result = await loadRuntimeThreadProjection({
    threadId: 'thread_1',
    thread,
    ensureRuns: [ensuredRun],
  }, {
    client: {
      getThread: async () => thread,
      listRunsByThread: async () => { throw new Error('unavailable') },
    },
    fetchRunTraceEvents: async () => [],
  })

  assert.deepEqual(result.runs.map((run) => run.id), ['run_ensured'])
  assert.equal(result.messages.some((message) => message.meta?.runtimeMessage?.runId === 'run_ensured'), true)
})

test('loadRuntimeThreadProjection passes abort signals to thread and run reads', async () => {
  const thread = makeThread()
  const controller = new AbortController()
  const seenSignals: Array<AbortSignal | undefined> = []

  await loadRuntimeThreadProjection({
    threadId: 'thread_1',
    signal: controller.signal,
  }, {
    client: {
      getThread: async (_threadId, signal) => {
        seenSignals.push(signal)
        return thread
      },
      listRunsByThread: async (_threadId, signal) => {
        seenSignals.push(signal)
        return { threadId: 'thread_1', runs: [] }
      },
    },
    fetchRunTraceEvents: async () => [],
  })

  assert.deepEqual(seenSignals, [controller.signal, controller.signal])
})

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    messages: [{
      id: 'msg_user',
      threadId: 'thread_1',
      role: 'user',
      content: 'Use the tool',
      createdAt: '2026-05-19T00:00:01.000Z',
    }],
  }
}

function makeRun(input: Partial<AgentRun> & { id: string }): AgentRun {
  return {
    ...input,
    id: input.id,
    threadId: 'thread_1',
    status: input.status ?? 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:02.000Z',
    updatedAt: '2026-05-19T00:00:03.000Z',
    steps: [],
  }
}

function makeRuntimeSnapshot(
  thread: AgentThread,
  runs: AgentRun[],
  options: {
    runId?: string
    actionableRunIds?: string[]
    pendingInputRequestRefs?: Array<{ runId: string; requestId: string }>
  } = {},
) {
  const currentRun = options.runId ? runs.find((run) => run.id === options.runId) : undefined
  return {
    schema: 'movscript.agent.thread-runtime-snapshot.v1' as const,
    updatedAt: thread.updatedAt,
    thread,
    runs,
    current: {
      ...(options.runId ? { runId: options.runId } : {}),
      ...(thread.status ? { threadStatus: thread.status } : {}),
      ...(currentRun?.status ? { runStatus: currentRun.status } : {}),
    },
    interactions: {
      actionableRunIds: options.actionableRunIds ?? [],
      pendingApprovalRefs: [],
      pendingInputRequestRefs: options.pendingInputRequestRefs ?? [],
    },
  }
}
