import assert from 'node:assert/strict'
import test from 'node:test'

import { restoreRuntimeThreadConversation, type RestoreRuntimeThreadDeps } from '@/features/agent/application/agentRuntimeThreadRestore'
import type { AgentThread } from '@/shared/infrastructure/localAgentClient'
import type { Conversation } from '@/features/agent/state/agentStore'

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

test('restoreRuntimeThreadConversation creates a restored conversation from runtime thread identity', async () => {
  const calls: string[] = []
  const result = await restoreRuntimeThreadConversation('thread_3', depsFixture(calls, {
    thread: thread({ id: 'thread_3', title: 'Runtime thread' }),
  }))

  assert.deepEqual(result, {
    conversationId: 'thread_3',
    threadId: 'thread_3',
    reusedExistingConversation: false,
    restoredMessageCount: 0,
  })
  assert.deepEqual(calls, [
    'loadThread:thread_3',
    'createRuntime:thread_3:Runtime thread',
    'title:thread_3:Runtime thread',
    'localThread:thread_3:thread_3',
    'runtimeThread:thread_3:thread_3',
    'active:thread_3',
  ])
})

test('restoreRuntimeThreadConversation reports restored messages loaded with the runtime thread shell', async () => {
  const calls: string[] = []
  const result = await restoreRuntimeThreadConversation('thread_4', depsFixture(calls, {
    thread: thread({
      id: 'thread_4',
      title: 'Paged runtime thread',
      messages: [{
        id: 'msg_1',
        threadId: 'thread_4',
        role: 'user',
        content: 'hello',
        createdAt: '2026-05-19T00:00:00.000Z',
      }, {
        id: 'msg_2',
        threadId: 'thread_4',
        role: 'assistant',
        content: 'done',
        createdAt: '2026-05-19T00:00:01.000Z',
      }],
    }),
  }))

  assert.equal(result.conversationId, 'thread_4')
  assert.equal(result.reusedExistingConversation, false)
  assert.equal(result.restoredMessageCount, 2)
  assert.deepEqual(calls.slice(0, 2), [
    'loadThread:thread_4',
    'createRuntime:thread_4:Paged runtime thread',
  ])
})

function depsFixture(
  calls: string[],
  options: {
    conversations?: Conversation[]
    localThreadIdsByConversation?: Record<string, string>
    thread?: AgentThread
  } = {},
): RestoreRuntimeThreadDeps {
  return {
    userId: 'user_1',
    conversations: options.conversations ?? [],
    sessionState: {
      localThreadIdsByConversation: options.localThreadIdsByConversation ?? {},
      conversationRuntimes: {},
    },
    titleForThread: (thread) => thread.title || thread.id,
    loadThread: async (threadId) => {
      calls.push(`loadThread:${threadId}`)
      return options.thread ?? thread({ id: threadId })
    },
    createRuntimeConversation: (_userId, input) => {
      calls.push(`createRuntime:${input.threadId}:${input.title}`)
      return input.threadId
    },
    setActiveConversation: (_userId, conversationId) => {
      calls.push(`active:${conversationId}`)
    },
    updateConversationTitle: (_userId, conversationId, title) => {
      calls.push(`title:${conversationId}:${title}`)
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
    transcriptMessages: [],
    createdAt: 1,
    updatedAt: 1,
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
