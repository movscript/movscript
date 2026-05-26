import assert from 'node:assert/strict'
import test from 'node:test'

import { handleSendAbort, handleSendFailure, type SendErrorCleanupDeps, type SendFailureDeps } from './agentSendError'

test('handleSendAbort removes streaming assistant state and reports cancellation', () => {
  const calls: string[] = []
  handleSendAbort(new Error('stopped'), cleanupDeps(calls, { streamingMessageId: 'stream_1', requestId: 'req_1' }))

  assert.deepEqual(calls, [
    'remove:stream_1',
    'pending:null',
    'http:0',
    'resetStreaming',
    'runtime:loading=false:building=false:stopping=false:stop=false:error=',
    'settled:req_1:cancelled:stopped',
  ])
})

test('handleSendFailure clears streaming state, shows error content, and reports failure', () => {
  const calls: string[] = []
  handleSendFailure('offline', failureDeps(calls, { streamingMessageId: null }))

  assert.deepEqual(calls, [
    'toast:offline',
    'pending:null',
    'http:0',
    'resetStreaming',
    'add:本地 Agent 暂不可用。offline',
    'runtime:loading=false:building=false:stopping=undefined:stop=undefined:error=offline',
    'settled:undefined:error:offline',
  ])
})

function cleanupDeps(
  calls: string[],
  options: { streamingMessageId: string | null; requestId?: string },
): SendErrorCleanupDeps {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    ...(options.requestId ? { requestId: options.requestId } : {}),
    streamingMessageId: () => options.streamingMessageId,
    messageStore: {
      removeMessage: (_userId, _conversationId, messageId) => {
        calls.push(`remove:${messageId}`)
      },
    },
    setPendingAssistantState: (state) => {
      calls.push(`pending:${state}`)
    },
    setPendingHttpEvents: (events) => {
      calls.push(`http:${events.length}`)
    },
    resetStreamingAssistant: () => {
      calls.push('resetStreaming')
    },
    setConversationRuntime: (_conversationId, patch) => {
      calls.push(`runtime:loading=${patch.loading}:building=${patch.building}:stopping=${patch.stopping}:stop=${patch.stopRequested}:error=${patch.error ?? ''}`)
    },
    notifyRunSettled: (payload) => {
      calls.push(`settled:${payload.requestId}:${payload.status}:${payload.error}`)
    },
  }
}

function failureDeps(
  calls: string[],
  options: { streamingMessageId: string | null; requestId?: string },
): SendFailureDeps {
  return {
    ...cleanupDeps(calls, options),
    messageStore: {
      removeMessage: (_userId, _conversationId, messageId) => {
        calls.push(`remove:${messageId}`)
      },
      addMessage: (_userId, _conversationId, message) => {
        calls.push(`add:${message.content}`)
        return 'error_msg'
      },
    },
    toastError: (error) => {
      calls.push(`toast:${String(error)}`)
    },
    assistantErrorContent: (message) => `本地 Agent 暂不可用。${message}`,
  }
}
