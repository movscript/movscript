import assert from 'node:assert/strict'
import test from 'node:test'

import { bindAcceptedSourceProviderSessionScope } from '@/features/agent/application/agentSendCommit'

test('bindAcceptedSourceProviderSessionScope binds thread and session as soon as provider session accepts the source message', () => {
  const calls: string[] = []

  bindAcceptedSourceProviderSessionScope({
    message: { threadId: 'thread_1' },
    run: { sessionId: 'session_1' },
    deps: scopeDeps(calls, { newBindingApi: true }),
  })

  assert.deepEqual(calls, [
    'providerSessionTree:session_1',
    'providerSession:session_1',
    'providerThreadBinding:thread_1',
    'providerThread:thread_1',
  ])
})

test('bindAcceptedSourceProviderSessionScope falls back to legacy binding setters', () => {
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
    deps: scopeDeps(calls, { newBindingApi: true }),
  })

  assert.deepEqual(calls, [
    'providerThreadBinding:thread_1',
    'providerThread:thread_1',
  ])
})

function scopeDeps(calls: string[], options: { newBindingApi?: boolean } = {}) {
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
    ...(options.newBindingApi ? {
      setConversationProviderSessionTreeId: (_conversationId: string, providerSessionTreeId: string) => {
        calls.push(`providerSessionTree:${providerSessionTreeId}`)
      },
      setConversationProviderThreadBindingId: (_conversationId: string, providerThreadId: string) => {
        calls.push(`providerThreadBinding:${providerThreadId}`)
      },
    } : {}),
    setConversationProviderThreadId: (_userId: string, _conversationId: string, threadId: string) => {
      calls.push(`providerThread:${threadId}`)
    },
  }
}
