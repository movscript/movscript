import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentConversationTabProviderSessionTargets, providerSessionStatusLightForTargetKeys } from './useAgentConversationTabProviderSessionStatusLights'
import type { Conversation } from '@/features/agent/state/agentStore'

test('buildAgentConversationTabProviderSessionTargets prefers session anchors and keeps thread fallback', () => {
  const targets = buildAgentConversationTabProviderSessionTargets({
    conversations: [
      conversation({
        id: 'conv_session',
        providerSessionId: 'session_persisted',
        providerThreadId: 'thread_persisted',
      }),
      conversation({
        id: 'conv_compat',
        providerThreadId: 'thread_compat',
      }),
    ],
    conversationThreadBindings: {
      conv_session: {
        conversationId: 'conv_session',
        providerThreadId: 'thread_binding',
        providerSessionTreeId: 'session_tree_binding',
        updatedAt: 1,
      },
    },
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_session',
      sessionId: 'session_tree_binding',
      threadId: 'thread_binding',
    },
    {
      conversationId: 'conv_compat',
      threadId: 'thread_compat',
    },
  ])
})

test('buildAgentConversationTabProviderSessionTargets leaves unanchored conversations disconnected', () => {
  const targets = buildAgentConversationTabProviderSessionTargets({
    conversations: [
      conversation({ id: 'conv_empty' }),
    ],
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_empty',
      threadId: '',
    },
  ])
})

test('providerSessionStatusLightForTargetKeys prefers non-stopped lights across session and thread targets', () => {
  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': {
      state: 'stopped',
      label: '停止',
      detail: 'Provider 会话当前不会自行触发新的 run。',
    },
    'thread:thread_1': {
      state: 'active',
      label: '运行',
      detail: 'Provider 会话正在触发 run 循环。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'active')

  assert.equal(providerSessionStatusLightForTargetKeys({}, ['session:session_1']).state, 'stopped')
})

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: 'conv_1',
    title: 'Conversation',
    transcriptMessages: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}
