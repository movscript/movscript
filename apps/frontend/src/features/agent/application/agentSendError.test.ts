import assert from 'node:assert/strict'
import test from 'node:test'

import { handleSendAbort, handleSendFailure, type SendErrorCleanupDeps, type SendFailureDeps } from './agentSendError'

test('handleSendAbort removes streaming assistant state and reports cancellation', () => {
  const calls: string[] = []
  handleSendAbort(new Error('stopped'), cleanupDeps(calls, { requestId: 'req_1' }))

  assert.deepEqual(calls, [
    'pending:null',
    'http:0',
    'resetStreaming',
    'providerSession:loading=false:building=false:stopping=false:stop=false:error=',
    'settled:req_1:cancelled:stopped',
  ])
})

test('handleSendFailure clears streaming state, shows error content, and reports failure', () => {
  const calls: string[] = []
  handleSendFailure('offline', failureDeps(calls))

  assert.deepEqual(calls, [
    'toast:offline',
    'pending:null',
    'http:0',
    'resetStreaming',
    'providerSession:loading=false:building=false:stopping=undefined:stop=undefined:error=当前提供方暂不可用。offline',
    'settled:undefined:error:offline',
  ])
})

function cleanupDeps(
  calls: string[],
  options: { requestId?: string },
): SendErrorCleanupDeps {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    ...(options.requestId ? { requestId: options.requestId } : {}),
    setPendingAssistantState: (state) => {
      calls.push(`pending:${state}`)
    },
    setPendingHttpEvents: (events) => {
      calls.push(`http:${events.length}`)
    },
    resetStreamingAssistant: () => {
      calls.push('resetStreaming')
    },
    setConversationProviderSessionState: (_conversationId, patch) => {
      calls.push(`providerSession:loading=${patch.loading}:building=${patch.building}:stopping=${patch.stopping}:stop=${patch.stopRequested}:error=${patch.error ?? ''}`)
    },
    notifyRunSettled: (payload) => {
      calls.push(`settled:${payload.requestId}:${payload.status}:${payload.error}`)
    },
  }
}

function failureDeps(
  calls: string[],
  options: { requestId?: string } = {},
): SendFailureDeps {
  return {
    ...cleanupDeps(calls, options),
    toastError: (error) => {
      calls.push(`toast:${String(error)}`)
    },
    assistantErrorContent: (message) => `当前提供方暂不可用。${message}`,
  }
}
