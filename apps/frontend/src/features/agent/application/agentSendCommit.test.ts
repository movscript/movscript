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
    'providerSessionTree:session_1',
    'providerThreadBinding:thread_1',
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
    'providerThreadBinding:thread_1',
  ])
})

function scopeDeps(calls: string[]) {
  return {
    conversationId: 'conv_1',
    setConversationProviderSessionTreeId: (_conversationId: string, providerSessionTreeId: string) => {
      calls.push(`providerSessionTree:${providerSessionTreeId}`)
    },
    setConversationProviderThreadBindingId: (_conversationId: string, providerThreadId: string) => {
      calls.push(`providerThreadBinding:${providerThreadId}`)
    },
  }
}
