import assert from 'node:assert/strict'
import test from 'node:test'

import {
  conversationIdForRuntimeThread,
  restoreRuntimeThreadConversation,
  type RestoreRuntimeThreadConversationDeps,
} from './index'
import type { AgentChatMessage, AgentThread } from '@movscript/protocol'

test('conversationIdForRuntimeThread resolves direct mappings first', () => {
  assert.equal(conversationIdForRuntimeThread({
    threadId: 'thread_1',
    localThreadIdsByConversation: {
      conv_direct: 'thread_1',
    },
    conversationRuntimes: {
      conv_runtime: {
        threadId: 'thread_1',
        updatedAt: 2000,
      },
    },
  }), 'conv_direct')
})

test('conversationIdForRuntimeThread falls back to the latest runtime mapping', () => {
  assert.equal(conversationIdForRuntimeThread({
    threadId: 'thread_1',
    localThreadIdsByConversation: {},
    conversationRuntimes: {
      conv_old: {
        threadId: 'thread_1',
        updatedAt: 1000,
      },
      conv_new: {
        threadId: 'thread_1',
        updatedAt: 2000,
      },
      conv_other: {
        threadId: 'thread_2',
        updatedAt: 3000,
      },
    },
  }), 'conv_new')
})

test('restoreRuntimeThreadConversation activates an existing runtime conversation', async () => {
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
    projection: {
      thread: thread({ id: 'thread_3', title: 'Runtime thread' }),
      messages: [message({ id: 'runtime_msg_1' })],
    },
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
    conversations?: TestConversation[]
    localThreadIdsByConversation?: Record<string, string>
    projection?: { thread: AgentThread; messages: AgentChatMessage[] }
  } = {},
): RestoreRuntimeThreadConversationDeps<AgentChatMessage, NonNullable<AgentChatMessage['meta']>, TestConversation, AgentThread> {
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
      return options.projection ?? { thread: thread({ id: threadId }), messages: [message()] }
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

interface TestConversation {
  id: string
  runtimeThreadId?: string
}

function conversation(overrides: Partial<TestConversation> = {}): TestConversation {
  return {
    id: 'conv_1',
    ...overrides,
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

function message(overrides: Partial<AgentChatMessage> = {}): AgentChatMessage {
  return {
    id: 'runtime_msg_1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  }
}
