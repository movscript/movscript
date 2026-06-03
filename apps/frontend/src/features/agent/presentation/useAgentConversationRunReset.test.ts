import assert from 'node:assert/strict'
import test from 'node:test'

import { agentConversationRunResetKey, resetAgentConversationRunState } from '@/features/agent/presentation/useAgentConversationRunReset'

test('agentConversationRunResetKey changes when the active run changes inside one conversation', () => {
  assert.notEqual(
    agentConversationRunResetKey('conversation_1', 'run_1'),
    agentConversationRunResetKey('conversation_1', 'run_2'),
  )
})

test('agentConversationRunResetKey normalizes missing active runs', () => {
  assert.equal(agentConversationRunResetKey('conversation_1'), 'conversation_1\u0000none')
  assert.equal(agentConversationRunResetKey('conversation_1', '   '), 'conversation_1\u0000none')
})

test('resetAgentConversationRunState clears live activity, streaming assistant, and submitted interactions together', () => {
  const calls: string[] = []
  resetAgentConversationRunState({
    resetLiveRunActivity: () => calls.push('live'),
    resetStreamingAssistant: () => calls.push('streaming'),
    setSubmittedInteractionRuns: (action) => {
      calls.push(Array.isArray(action) && action.length === 0 ? 'interactions' : 'unexpected')
    },
  })

  assert.deepEqual(calls, ['live', 'streaming', 'interactions'])
})
