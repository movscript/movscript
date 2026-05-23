import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentConversationTabRuntimeTargets } from './useAgentConversationTabRuntimeStatusLights'
import type { Conversation } from '@/store/agentStore'

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

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: 'conv_1',
    title: 'Conversation',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}
