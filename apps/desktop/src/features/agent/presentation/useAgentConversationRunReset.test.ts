import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentConversationRunResetKey,
  nextAgentConversationRunReset,
  resetAgentConversationRunState,
} from '@/features/agent/presentation/useAgentConversationRunReset'

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

test('nextAgentConversationRunReset ignores transient missing active runs inside the same conversation', () => {
  const initial = nextAgentConversationRunReset({
    conversationId: 'conversation_1',
    activeRunId: 'run_1',
  })
  const missing = nextAgentConversationRunReset({
    cursor: initial.cursor,
    conversationId: 'conversation_1',
    activeRunId: undefined,
  })
  const sameRun = nextAgentConversationRunReset({
    cursor: missing.cursor,
    conversationId: 'conversation_1',
    activeRunId: 'run_1',
  })

  assert.equal(initial.shouldReset, true)
  assert.equal(missing.shouldReset, false)
  assert.equal(sameRun.shouldReset, false)
  assert.equal(sameRun.cursor.lastConcreteRunId, 'run_1')
})

test('nextAgentConversationRunReset resets when a new concrete run or conversation takes over', () => {
  const initial = nextAgentConversationRunReset({
    conversationId: 'conversation_1',
    activeRunId: 'run_1',
  })
  const nextRun = nextAgentConversationRunReset({
    cursor: initial.cursor,
    conversationId: 'conversation_1',
    activeRunId: 'run_2',
  })
  const nextConversation = nextAgentConversationRunReset({
    cursor: nextRun.cursor,
    conversationId: 'conversation_2',
    activeRunId: undefined,
  })

  assert.equal(nextRun.shouldReset, true)
  assert.equal(nextRun.cursor.lastConcreteRunId, 'run_2')
  assert.equal(nextConversation.shouldReset, true)
  assert.equal(nextConversation.cursor.conversationId, 'conversation_2')
  assert.equal(nextConversation.cursor.lastConcreteRunId, undefined)
})
