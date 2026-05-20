import assert from 'node:assert/strict'
import test from 'node:test'

import { restoreRuntimeThreadConversation, type RestoreRuntimeThreadDeps } from './agentRuntimeThreadRestore'
import type { RuntimeThreadHydrationResult } from './agentRuntimeThreadHydration'
import type { AgentRun, AgentThread } from './localAgentClient'
import type { ChatMessage, Conversation } from '@/store/agentStore'

test('restoreRuntimeThreadConversation activates a conversation with a persisted runtime thread id', async () => {
  const calls: string[] = []
  const result = await restoreRuntimeThreadConversation('thread_1', depsFixture(calls, {
    conversations: [conversation({ id: 'conv_1', runtimeThreadId: 'thread_1' })],
  }))

  assert.deepEqual(result, {
    conversationId: 'conv_1',
    threadId: 'thread_1',
    reusedExistingConversation: true,
    restoredMessageCount: 0,
  })
  assert.deepEqual(calls, ['active:conv_1'])
})

test('restoreRuntimeThreadConversation reuses session thread mappings before loading runtime state', async () => {
  const calls: string[] = []
  const result = await restoreRuntimeThreadConversation('thread_2', depsFixture(calls, {
    conversations: [conversation({ id: 'conv_2' })],
    localThreadIdsByConversation: { conv_2: 'thread_2' },
  }))

  assert.equal(result.conversationId, 'conv_2')
  assert.equal(result.reusedExistingConversation, true)
  assert.deepEqual(calls, ['active:conv_2'])
})

test('restoreRuntimeThreadConversation creates a restored conversation from runtime projection', async () => {
  const calls: string[] = []
  const result = await restoreRuntimeThreadConversation('thread_3', depsFixture(calls, {
    projection: runtimeProjection({
      thread: thread({ id: 'thread_3', title: 'Runtime thread' }),
      messages: [message({ id: 'runtime_msg_1' })],
    }),
  }))

  assert.deepEqual(result, {
    conversationId: 'created_conv',
    threadId: 'thread_3',
    reusedExistingConversation: false,
    restoredMessageCount: 1,
  })
  assert.deepEqual(calls, [
    'load:thread_3',
    'create',
    'title:created_conv:Runtime thread',
    'message:created_conv:runtime_msg_1:Restored',
    'localThread:created_conv:thread_3',
    'runtimeThread:created_conv:thread_3',
    'active:created_conv',
  ])
})

function depsFixture(
  calls: string[],
  options: {
    conversations?: Conversation[]
    localThreadIdsByConversation?: Record<string, string>
    projection?: RuntimeThreadHydrationResult
  } = {},
): RestoreRuntimeThreadDeps {
  return {
    userId: 'user_1',
    conversations: options.conversations ?? [],
    sessionState: {
      localThreadIdsByConversation: options.localThreadIdsByConversation ?? {},
      conversationRuntimes: {},
    },
    restoredLabel: 'Restored',
    titleForThread: (thread) => thread.title || thread.id,
    loadProjection: async (threadId) => {
      calls.push(`load:${threadId}`)
      return options.projection ?? runtimeProjection({ thread: thread({ id: threadId }) })
    },
    createConversation: () => {
      calls.push('create')
      return 'created_conv'
    },
    setActiveConversation: (_userId, conversationId) => {
      calls.push(`active:${conversationId}`)
    },
    updateConversationTitle: (_userId, conversationId, title) => {
      calls.push(`title:${conversationId}:${title}`)
    },
    messageStore: {
      upsertMessage: (_userId, conversationId, messageId, item) => {
        calls.push(`message:${conversationId}:${messageId}:${item.meta?.contextLabels?.[0]}`)
      },
    },
    setLocalThreadId: (conversationId, threadId) => {
      calls.push(`localThread:${conversationId}:${threadId}`)
    },
    setConversationRuntimeThreadId: (_userId, conversationId, threadId) => {
      calls.push(`runtimeThread:${conversationId}:${threadId}`)
    },
  }
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv_1',
    title: '',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function runtimeProjection(overrides: Partial<RuntimeThreadHydrationResult> = {}): RuntimeThreadHydrationResult {
  const runtimeThread = overrides.thread ?? thread()
  return {
    thread: runtimeThread,
    runs: overrides.runs ?? [run({ threadId: runtimeThread.id })],
    currentRun: overrides.currentRun,
    actionableRuns: overrides.actionableRuns ?? [],
    messages: overrides.messages ?? [message()],
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
    id: 'runtime_msg_1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  }
}
