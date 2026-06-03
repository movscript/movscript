import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentConversationTabRuntimeTargets, runtimeStatusLightForTargetKeys } from './useAgentConversationTabRuntimeStatusLights'
import type { Conversation } from '@/features/agent/state/agentStore'

test('buildAgentConversationTabRuntimeTargets prefers session anchors and keeps thread fallback', () => {
  const targets = buildAgentConversationTabRuntimeTargets({
    conversations: [
      conversation({
        id: 'conv_session',
        runtimeSessionId: 'session_persisted',
        runtimeThreadId: 'thread_persisted',
      }),
      conversation({
        id: 'conv_legacy',
        runtimeThreadId: 'thread_legacy',
      }),
    ],
    localThreadIdsByConversation: {
      conv_session: 'thread_local',
    },
    sessionIdsByConversation: {
      conv_session: 'session_local',
    },
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_session',
      sessionId: 'session_local',
      threadId: 'thread_local',
    },
    {
      conversationId: 'conv_legacy',
      threadId: 'thread_legacy',
    },
  ])
})

test('buildAgentConversationTabRuntimeTargets leaves unanchored conversations disconnected', () => {
  const targets = buildAgentConversationTabRuntimeTargets({
    conversations: [
      conversation({ id: 'conv_empty' }),
    ],
    localThreadIdsByConversation: {},
    sessionIdsByConversation: {},
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_empty',
      threadId: '',
    },
  ])
})

test('runtimeStatusLightForTargetKeys prefers non-stopped lights across session and thread targets', () => {
  assert.equal(runtimeStatusLightForTargetKeys({
    'session:session_1': {
      state: 'stopped',
      label: '停止',
      detail: 'Runtime 当前不会自行触发新的 run。',
    },
    'thread:thread_1': {
      state: 'active',
      label: '运行',
      detail: 'Runtime 正在触发 run 循环。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'active')

  assert.equal(runtimeStatusLightForTargetKeys({}, ['session:session_1']).state, 'stopped')
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
