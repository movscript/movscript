import assert from 'node:assert/strict'
import test from 'node:test'

import {
  conversationIdForRuntimeSession,
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

test('conversationIdForRuntimeSession falls back to direct and latest runtime session mappings', () => {
  assert.equal(conversationIdForRuntimeSession({
    sessionId: 'session_1',
    localThreadIdsByConversation: {},
    sessionIdsByConversation: {
      conv_direct: 'session_1',
    },
    conversationRuntimes: {
      conv_runtime: {
        sessionId: 'session_1',
        updatedAt: 2000,
      },
    },
  }), 'conv_direct')

  assert.equal(conversationIdForRuntimeSession({
    sessionId: 'session_2',
    localThreadIdsByConversation: {},
    conversationRuntimes: {
      conv_old: {
        sessionId: 'session_2',
        updatedAt: 1000,
      },
      conv_new: {
        sessionId: 'session_2',
        updatedAt: 2000,
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

test('restoreRuntimeThreadConversation reuses an existing runtime session conversation after loading projection', async () => {
  const calls: string[] = []
  const result = await restoreRuntimeThreadConversation('thread_worker', depsFixture(calls, {
    conversations: [conversation({ id: 'conv_root', runtimeSessionId: 'session_1' })],
    projection: {
      thread: thread({ id: 'thread_worker', sessionId: 'session_1', title: 'Worker thread' }),
      messages: [message({ id: 'runtime_msg_worker' })],
    },
  }))

  assert.deepEqual(result, {
    conversationId: 'conv_root',
    threadId: 'thread_worker',
    reusedExistingConversation: true,
    restoredMessageCount: 0,
  })
  assert.deepEqual(calls, [
    'load:thread_worker',
    'active:conv_root',
  ])
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

test('restoreRuntimeThreadConversation persists restored session and thread anchors', async () => {
  const calls: string[] = []
  await restoreRuntimeThreadConversation('thread_3', depsFixture(calls, {
    projection: {
      thread: thread({ id: 'thread_3', sessionId: 'session_3', title: 'Runtime thread' }),
      messages: [message({ id: 'runtime_msg_1' })],
    },
  }))

  assert.equal(calls.includes('session:created_conv:session_3'), true)
  assert.equal(calls.includes('runtimeSession:created_conv:session_3'), true)
  assert.equal(calls.includes('runtimeThread:created_conv:thread_3'), true)
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
    setConversationSessionId: (conversationId, sessionId) => {
      calls.push(`session:${conversationId}:${sessionId}`)
    },
    setConversationRuntimeSessionId: (_userId, conversationId, sessionId) => {
      calls.push(`runtimeSession:${conversationId}:${sessionId}`)
    },
    setConversationRuntimeThreadId: (_userId, conversationId, threadId) => {
      calls.push(`runtimeThread:${conversationId}:${threadId}`)
    },
  }
}

interface TestConversation {
  id: string
  runtimeSessionId?: string
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
