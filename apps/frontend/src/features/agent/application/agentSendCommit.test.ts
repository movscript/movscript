import assert from 'node:assert/strict'
import test from 'node:test'

import { bindAcceptedSourceProviderSessionScope } from '@/features/agent/application/agentSendCommit'

test('bindAcceptedSourceProviderSessionScope binds thread and session as soon as provider session accepts the source message', () => {
  const calls: string[] = []

  bindAcceptedSourceProviderSessionScope({
    message: { threadId: 'thread_1' },
    run: { sessionId: 'session_1' },
    deps: scopeDeps(calls),
  })

  assert.deepEqual(calls, [
    'session:session_1',
    'providerSession:session_1',
    'providerThread:thread_1',
    'providerThread:thread_1',
  ])
})

test('bindAcceptedSourceProviderSessionScope binds thread without writing an empty session', () => {
  const calls: string[] = []

  bindAcceptedSourceProviderSessionScope({
    message: { threadId: 'thread_1' },
    run: {},
    deps: scopeDeps(calls),
  })

  assert.deepEqual(calls, [
    'providerThread:thread_1',
    'providerThread:thread_1',
  ])
})

function scopeDeps(calls: string[]) {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    setConversationSessionId: (_conversationId: string, sessionId: string) => {
      calls.push(`session:${sessionId}`)
    },
    setConversationProviderSessionId: (_userId: string, _conversationId: string, sessionId: string) => {
      calls.push(`providerSession:${sessionId}`)
    },
    setProviderThreadId: (_conversationId: string, threadId: string) => {
      calls.push(`providerThread:${threadId}`)
    },
    setConversationProviderThreadId: (_userId: string, _conversationId: string, threadId: string) => {
      calls.push(`providerThread:${threadId}`)
    },
  }
}
