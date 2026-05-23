import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWorkflowRunsByResultMessageId } from '@/components/agent/useAgentChatWorkflowState'
import { buildAgentConversationMessageItems } from '@/lib/agentConversationThreadItems'
import { loadRuntimeThreadProjection } from './agentRuntimeThreadHydration'
import type { AgentRun, AgentRuntimeSnapshotV2, AgentThread } from './localAgentClient'

const NOW = '2026-05-19T00:00:00.000Z'

test('loadRuntimeThreadProjection loads thread runs and merges ensured runs before projecting messages', async () => {
  const thread = makeThread()
  const listedRun = makeRun({ id: 'run_listed', input: runInput({ sourceMessageId: 'msg_user', userMessage: 'Use the tool' }) })
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
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(result.runs.map((run) => run.id), ['run_listed', 'run_ensured'])
  assert.equal(result.messages.some((message) => message.meta?.runtimeMessage?.runId === 'run_listed'), true)
  assert.equal(result.messages.some((message) => message.meta?.runtimeMessage?.runId === 'run_ensured'), true)
})

test('loadRuntimeThreadProjection prefers a combined thread runtime snapshot when available', async () => {
  const calls: string[] = []
  const thread = makeThread()
  const listedRun = makeRun({ id: 'run_listed', input: runInput({ sourceMessageId: 'msg_user', userMessage: 'Use the tool' }) })

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
          activeRunIds: [listedRun.id],
        })
      },
    },
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(calls, ['getThreadRuntime'])
  assert.deepEqual(result.runs.map((run) => run.id), ['run_listed'])
  assert.equal(result.currentRun?.id, 'run_listed')
})

test('loadRuntimeThreadProjection keeps worker runs displayed on the interactive thread', async () => {
  const thread = makeThread()
  const workerRun = makeRun({
    id: 'run_worker',
    threadId: 'thread_worker',
    role: 'worker',
    status: 'requires_action',
    parentRunId: 'run_root',
    pendingInputRequests: [{
      id: 'input_worker',
      runId: 'run_worker',
      displayThreadId: thread.id,
      displayAnchor: {
        threadId: thread.id,
        runId: 'run_worker',
        messageId: 'msg_user',
        placement: 'after',
        reason: 'run_source_message',
      },
      title: 'Confirm',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [{ id: 'yes', label: 'Yes' }],
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
      getThreadRuntime: async () => makeRuntimeSnapshot(thread, [workerRun], {
        waitingRunIds: [workerRun.id],
      }),
    },
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(result.runs.map((run) => run.id), ['run_worker'])
  assert.deepEqual(result.actionableRuns.map((run) => run.id), ['run_worker'])
  assert.equal(result.currentRun?.id, 'run_worker')
})

test('loadRuntimeThreadProjection prefers session runtime and projects the interactive thread', async () => {
  const rootThread = makeThread({ id: 'thread_root', sessionId: 'session_1' })
  const workerRun = makeRun({
    id: 'run_worker',
    sessionId: 'session_1',
    threadId: 'thread_worker',
    role: 'worker',
    status: 'requires_action',
    pendingInputRequests: [{
      id: 'input_worker',
      runId: 'run_worker',
      displayThreadId: rootThread.id,
      displayAnchor: {
        threadId: rootThread.id,
        runId: 'run_worker',
        messageId: 'msg_user',
        placement: 'after',
        reason: 'run_source_message',
      },
      title: 'Confirm',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [{ id: 'yes', label: 'Yes' }],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-05-19T00:00:04.000Z',
      updatedAt: '2026-05-19T00:00:04.000Z',
    }],
  })
  const calls: string[] = []

  const result = await loadRuntimeThreadProjection({
    threadId: 'thread_root',
    sessionId: 'session_1',
    existingMessages: [],
  }, {
    client: {
      getThread: async () => {
        calls.push('getThread')
        return rootThread
      },
      listRunsByThread: async () => {
        calls.push('listRunsByThread')
        return { threadId: 'thread_root', runs: [] }
      },
      getThreadRuntime: async () => {
        calls.push('getThreadRuntime')
        return makeRuntimeSnapshot(rootThread, [])
      },
      getSessionRuntime: async () => {
        calls.push('getSessionRuntime')
        return makeSessionRuntimeSnapshot(rootThread, [workerRun])
      },
    },
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(calls, ['getSessionRuntime'])
  assert.equal(result.thread.id, 'thread_root')
  assert.deepEqual(result.runs.map((run) => run.id), ['run_worker'])
  assert.equal(result.currentRun?.id, 'run_worker')
})

test('loadRuntimeThreadProjection still loads session runtime when a thread object is provided', async () => {
  const rootThread = makeThread({ id: 'thread_root', sessionId: 'session_1' })
  const calls: string[] = []

  await loadRuntimeThreadProjection({
    threadId: 'thread_root',
    sessionId: 'session_1',
    thread: rootThread,
    existingMessages: [],
  }, {
    client: {
      getThread: async () => rootThread,
      listRunsByThread: async () => ({ threadId: 'thread_root', runs: [] }),
      getThreadRuntime: async () => {
        calls.push('getThreadRuntime')
        return makeRuntimeSnapshot(rootThread, [])
      },
      getSessionRuntime: async () => {
        calls.push('getSessionRuntime')
        return makeSessionRuntimeSnapshot(rootThread, [])
      },
    },
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(calls, ['getSessionRuntime'])
})

test('session runtime projection anchors worker confirmations after the interactive user message', async () => {
  const rootThread = makeThread({ id: 'thread_root', sessionId: 'session_1' })
  const workerRun = makeRun({
    id: 'run_worker',
    sessionId: 'session_1',
    threadId: 'thread_worker',
    role: 'worker',
    status: 'requires_action',
    parentRunId: 'run_root',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Worker task',
      sourceMessageId: 'msg_user',
      executionMode: 'worker',
      createdAt: NOW,
    },
    pendingApprovals: [{
      id: 'approval_worker',
      runId: 'run_worker',
      displayThreadId: rootThread.id,
      displayAnchor: {
        threadId: rootThread.id,
        runId: 'run_worker',
        messageId: 'msg_user',
        placement: 'after',
        reason: 'run_source_message',
      },
      toolName: 'generation_job_create',
      reason: 'Needs approval',
      status: 'pending',
      createdAt: '2026-05-19T00:00:04.000Z',
      updatedAt: '2026-05-19T00:00:04.000Z',
    }],
  })

  const projection = await loadRuntimeThreadProjection({
    threadId: 'thread_root',
    sessionId: 'session_1',
    existingMessages: [],
  }, {
    client: {
      getThread: async () => rootThread,
      listRunsByThread: async () => ({ threadId: 'thread_root', runs: [] }),
      getSessionRuntime: async () => makeSessionRuntimeSnapshot(rootThread, [workerRun]),
    },
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })
  const workflowRunsByResultMessageId = buildWorkflowRunsByResultMessageId({
    messages: projection.messages,
    workflowRuns: projection.actionableRuns,
  })
  const items = buildAgentConversationMessageItems({
    messages: projection.messages,
    workflowAnswerEchoes: new Set(),
    workflowRunsByResultMessageId,
  })

  assert.deepEqual(projection.messages.map((message) => message.id), ['runtime:msg_user'])
  assert.equal(items[0]?.message.id, 'runtime:msg_user')
  assert.deepEqual(items[0]?.beforeMessageWorkflowRuns.map((run) => run.id), [])
  assert.deepEqual(items[0]?.afterMessageWorkflowRuns.map((run) => run.id), ['run_worker'])
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
        activeRunIds: [completedRun.id],
        interactions: [{
          id: 'interaction_input_1',
          threadId: 'thread_1',
          runId: pendingRun.id,
          kind: 'input',
          status: 'pending',
          payload: { requestId: 'input_1' },
          createdAt: '2026-05-19T00:00:04.000Z',
          updatedAt: '2026-05-19T00:00:04.000Z',
        }],
      }),
    },
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(result.actionableRuns.map((run) => run.id), ['run_pending'])
  assert.equal(result.currentRun?.id, 'run_pending')
})

test('loadRuntimeThreadProjection exposes continuation resume interactions as actionable approvals', async () => {
  const thread = makeThread()
  const completedRun = makeRun({ id: 'run_completed', status: 'completed' })

  const result = await loadRuntimeThreadProjection({
    threadId: 'thread_1',
    existingMessages: [],
  }, {
    client: {
      getThread: async () => thread,
      listRunsByThread: async () => ({ threadId: 'thread_1', runs: [] }),
      getThreadRuntime: async () => makeRuntimeSnapshot(thread, [completedRun], {
        interactions: [{
          id: 'interaction_continuation_work_1_resume',
          threadId: 'thread_1',
          runId: completedRun.id,
          workId: 'work_1',
          kind: 'selection',
          status: 'pending',
          payload: {
            type: 'runtime_continuation_resume',
            continuationId: 'continuation_work_1',
            workIds: ['work_1'],
            summary: '异步任务已完成，是否继续？',
          },
          createdAt: '2026-05-19T00:00:04.000Z',
          updatedAt: '2026-05-19T00:00:04.000Z',
        }],
      }),
    },
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(result.actionableRuns.map((run) => run.id), ['run_completed'])
  const approval = result.actionableRuns[0]?.pendingApprovals?.[0]
  assert.equal(approval?.interactionId, 'interaction_continuation_work_1_resume')
  assert.equal(approval?.toolName, 'runtime_continuation_resume')
  assert.equal(approval?.status, 'pending')
  assert.deepEqual(approval?.args, {
    continuationId: 'continuation_work_1',
    workIds: ['work_1'],
  })
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
    fetchRunGenerationView: async () => emptyGenerationReplay(),
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
    fetchRunGenerationView: async () => emptyGenerationReplay(),
  })

  assert.deepEqual(seenSignals, [controller.signal, controller.signal])
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  const id = overrides.id ?? 'thread_1'
  return {
    id,
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    messages: [{
      id: 'msg_user',
      threadId: id,
      role: 'user',
      content: 'Use the tool',
      createdAt: '2026-05-19T00:00:01.000Z',
    }],
    ...overrides,
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

function runInput(input: { sourceMessageId: string; userMessage: string }): NonNullable<AgentRun['input']> {
  return {
    schema: 'movscript.agent.run-input.v1',
    userMessage: input.userMessage,
    sourceMessageId: input.sourceMessageId,
    executionMode: 'chat',
    createdAt: NOW,
  }
}

function makeRuntimeSnapshot(
  thread: AgentThread,
  runs: AgentRun[],
  options: {
    activeRunIds?: string[]
    waitingRunIds?: string[]
    interactions?: Array<{
      id: string
      threadId: string
      runId: string
      workId?: string
      kind: 'approval' | 'input' | 'selection'
      status: 'pending' | 'approved' | 'rejected' | 'answered' | 'cancelled'
      payload: unknown
      result?: unknown
      createdAt: string
      updatedAt: string
      resolvedAt?: string
    }>
  } = {},
) : AgentRuntimeSnapshotV2 {
  const activeRunIds = options.activeRunIds ?? []
  const waitingRunIds = options.waitingRunIds ?? []
  const interactions = options.interactions ?? []
  return {
    schema: 'movscript.agent.runtime-snapshot.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'thread', id: thread.id },
    cursor: `snapshot:${thread.id}:0`,
    ordinal: 0,
    generatedAt: thread.updatedAt,
    entities: {
      threads: [thread],
      runs: runs.map((run) => (
        activeRunIds.includes(run.id)
          ? { ...run, status: 'in_progress' }
          : waitingRunIds.includes(run.id)
            ? { ...run, status: 'requires_action' }
            : run
      )),
      interactions,
      works: [],
      continuations: [],
    },
  }
}

function makeSessionRuntimeSnapshot(
  rootThread: AgentThread,
  runs: AgentRun[],
): AgentRuntimeSnapshotV2 {
  return {
    schema: 'movscript.agent.runtime-snapshot.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'session', id: 'session_1' },
    cursor: 'snapshot:session_1:0',
    ordinal: 0,
    generatedAt: rootThread.updatedAt,
    entities: {
      sessions: [{
        id: 'session_1',
        rootThreadId: rootThread.id,
        interactiveThreadId: rootThread.id,
        activeThreadId: 'thread_worker',
        createdAt: NOW,
        updatedAt: rootThread.updatedAt,
      }],
      threads: [
        rootThread,
        {
          id: 'thread_worker',
          sessionId: 'session_1',
          agentRole: 'worker',
          parentThreadId: rootThread.id,
          status: 'requires_action',
          createdAt: NOW,
          updatedAt: rootThread.updatedAt,
          messages: [],
        },
      ],
      runs,
      interactions: [],
      works: [],
      continuations: [],
    },
  }
}

function emptyGenerationReplay() {
  return {
    jobs: [],
    latestJob: null,
    outputResourceIds: [],
    outputResources: [],
    metadataByResourceId: new Map(),
    active: 0,
    terminal: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    timeout: 0,
  }
}
