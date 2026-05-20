import assert from 'node:assert/strict'
import test from 'node:test'

import { hydrateRuntimeThreadConversation, type HydrateRuntimeThreadConversationDeps } from './agentRuntimeThreadConversationHydration'
import type { RuntimeThreadHydrationResult } from './agentRuntimeThreadHydration'
import type { AgentRun, AgentThread } from './localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

test('hydrateRuntimeThreadConversation projects runtime thread into the conversation store', async () => {
  const calls: string[] = []
  const status = await hydrateRuntimeThreadConversation({
    userId: 'user_1',
    conversationId: 'conv_1',
    threadId: 'thread_1',
    existingMessages: [message({ id: 'local_user', role: 'user' })],
    hydratedKeys: new Set(),
    signal: new AbortController().signal,
  }, depsFixture(calls, {
    projection: projection({
      thread: thread({ id: 'thread_1', title: ' Runtime title ' }),
      messages: [message({ id: 'runtime_assistant', meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1' } } })],
    }),
  }))

  assert.equal(status, 'hydrated')
  assert.deepEqual(calls, [
    'load:thread_1:1:false',
    'localThread:conv_1:thread_1',
    'runtimeThread:conv_1:thread_1',
    'run:conv_1:run_1:completed',
    'title:conv_1:Runtime title',
    'messages:conv_1:2',
  ])
})

test('hydrateRuntimeThreadConversation restores the current run from the agent snapshot', async () => {
  const calls: string[] = []
  const pendingRun = run({
    id: 'run_pending',
    status: 'requires_action',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_pending',
      toolName: 'movscript_test_tool',
      reason: 'Needs approval',
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    }],
  })
  const status = await hydrateRuntimeThreadConversation({
    userId: 'user_1',
    conversationId: 'conv_1',
    threadId: 'thread_1',
    existingMessages: [],
    hydratedKeys: new Set(),
    signal: new AbortController().signal,
  }, depsFixture(calls, {
    projection: projection({
      thread: thread({ id: 'thread_1' }),
      runs: [pendingRun],
      currentRun: pendingRun,
      actionableRuns: [pendingRun],
    }),
  }))

  assert.equal(status, 'hydrated')
  assert.equal(calls.includes('run:conv_1:run_pending:requires_action'), true)
})

test('hydrateRuntimeThreadConversation skips duplicate hydration keys', async () => {
  const calls: string[] = []
  const hydratedKeys = new Set(['conv_1:thread_1'])
  const status = await hydrateRuntimeThreadConversation({
    userId: 'user_1',
    conversationId: 'conv_1',
    threadId: 'thread_1',
    existingMessages: [],
    hydratedKeys,
    signal: new AbortController().signal,
  }, depsFixture(calls))

  assert.equal(status, 'skipped')
  assert.deepEqual(calls, [])
})

test('hydrateRuntimeThreadConversation releases the hydration key when aborted before commit', async () => {
  const calls: string[] = []
  const hydratedKeys = new Set<string>()
  const controller = new AbortController()
  const status = await hydrateRuntimeThreadConversation({
    userId: 'user_1',
    conversationId: 'conv_1',
    threadId: 'thread_1',
    existingMessages: [],
    hydratedKeys,
    signal: controller.signal,
  }, depsFixture(calls, {
    loadProjection: async (input) => {
      calls.push(`load:${input.threadId}`)
      controller.abort()
      return projection({ thread: thread({ id: input.threadId }) })
    },
  }))

  assert.equal(status, 'cancelled')
  assert.equal(hydratedKeys.has('conv_1:thread_1'), false)
  assert.deepEqual(calls, ['load:thread_1'])
})

function depsFixture(
  calls: string[],
  options: {
    projection?: RuntimeThreadHydrationResult
    loadProjection?: HydrateRuntimeThreadConversationDeps['loadProjection']
  } = {},
): HydrateRuntimeThreadConversationDeps {
  return {
    loadProjection: options.loadProjection ?? (async (input) => {
      calls.push(`load:${input.threadId}:${input.existingMessages.length}:${input.signal.aborted}`)
      return options.projection ?? projection({ thread: thread({ id: input.threadId }) })
    }),
    setLocalThreadId: (conversationId, threadId) => {
      calls.push(`localThread:${conversationId}:${threadId}`)
    },
    setConversationRuntimeThreadId: (_userId, conversationId, threadId) => {
      calls.push(`runtimeThread:${conversationId}:${threadId}`)
    },
    setConversationRun: (conversationId, run) => {
      calls.push(`run:${conversationId}:${run.id}:${run.status}`)
    },
    updateConversationTitle: (_userId, conversationId, title) => {
      calls.push(`title:${conversationId}:${title}`)
    },
    messageStore: {
      setConversationMessages: (_userId, conversationId, messages) => {
        calls.push(`messages:${conversationId}:${messages.length}`)
      },
    },
  }
}

function projection(overrides: Partial<RuntimeThreadHydrationResult> = {}): RuntimeThreadHydrationResult {
  const runtimeThread = overrides.thread ?? thread()
  return {
    thread: runtimeThread,
    runs: overrides.runs ?? [run({ threadId: runtimeThread.id })],
    currentRun: overrides.currentRun ?? overrides.runs?.[0] ?? run({ threadId: runtimeThread.id }),
    actionableRuns: overrides.actionableRuns ?? [],
    messages: overrides.messages ?? [message({ meta: { runtimeMessage: { threadId: runtimeThread.id, messageId: 'msg_1' } } })],
  }
}

function thread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    messages: [],
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}
