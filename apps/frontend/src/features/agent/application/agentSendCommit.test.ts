import assert from 'node:assert/strict'
import test from 'node:test'

import { bindAcceptedSourceRuntimeScope } from '@/features/agent/application/agentSendCommit'

test('bindAcceptedSourceRuntimeScope binds thread and session as soon as runtime accepts the source message', () => {
  const calls: string[] = []

  bindAcceptedSourceRuntimeScope({
    message: { threadId: 'thread_1' },
    run: { sessionId: 'session_1' },
    deps: scopeDeps(calls),
  })

  assert.deepEqual(calls, [
    'session:session_1',
    'runtimeSession:session_1',
    'localThread:thread_1',
    'runtimeThread:thread_1',
  ])
})

test('bindAcceptedSourceRuntimeScope binds thread without writing an empty session', () => {
  const calls: string[] = []

  bindAcceptedSourceRuntimeScope({
    message: { threadId: 'thread_1' },
    run: {},
    deps: scopeDeps(calls),
  })

  assert.deepEqual(calls, [
    'localThread:thread_1',
    'runtimeThread:thread_1',
  ])
})

function scopeDeps(calls: string[]) {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    setConversationSessionId: (_conversationId: string, sessionId: string) => {
      calls.push(`session:${sessionId}`)
    },
    setConversationRuntimeSessionId: (_userId: string, _conversationId: string, sessionId: string) => {
      calls.push(`runtimeSession:${sessionId}`)
    },
    setLocalThreadId: (_conversationId: string, threadId: string) => {
      calls.push(`localThread:${threadId}`)
    },
    setConversationRuntimeThreadId: (_userId: string, _conversationId: string, threadId: string) => {
      calls.push(`runtimeThread:${threadId}`)
    },
  }
}
