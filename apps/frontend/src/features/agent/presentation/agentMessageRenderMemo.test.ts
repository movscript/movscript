import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agentConversationMessageItemHasInteractionRuns,
  agentConversationMessageItemsEqual,
  agentConversationMessageItemUsesLiveRunInteractionState,
  shallowReferenceArrayEqual,
} from './agentMessageRenderMemo.ts'
import type { AgentConversationMessageItem } from '@/features/agent/domain/agentConversationThreadItems'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

function messageItem(overrides: Partial<AgentConversationMessageItem> = {}): AgentConversationMessageItem {
  return {
    beforeMessageInteractionRuns: [],
    afterMessageInteractionRuns: [],
    liveInteractionRuns: null,
    message: {
      id: 'message-1',
      role: 'assistant',
      content: 'hello',
      timestamp: 1,
    },
    showMessage: true,
    ...overrides,
  }
}

test('agent message render memo treats rebuilt empty run interaction arrays as equal', () => {
  const message = messageItem().message
  assert.equal(agentConversationMessageItemsEqual(
    messageItem({ message }),
    messageItem({ message }),
  ), true)
})

test('agent message render memo detects changed message identity', () => {
  assert.equal(agentConversationMessageItemsEqual(
    messageItem(),
    messageItem({ message: { id: 'message-1', role: 'assistant', content: 'hello', timestamp: 1 } }),
  ), false)
})

test('agent message render memo detects live run interaction state only when mounted item needs it', () => {
  const run = { id: 'run-1' } as AgentRun
  assert.equal(agentConversationMessageItemUsesLiveRunInteractionState(messageItem()), false)
  assert.equal(agentConversationMessageItemUsesLiveRunInteractionState(messageItem({ liveInteractionRuns: [run] })), true)
  assert.equal(agentConversationMessageItemHasInteractionRuns(messageItem({ beforeMessageInteractionRuns: [run] })), true)
})

test('shallowReferenceArrayEqual compares array items by reference', () => {
  const item = { id: 'a' }
  assert.equal(shallowReferenceArrayEqual([item], [item]), true)
  assert.equal(shallowReferenceArrayEqual([{ id: 'a' }], [{ id: 'a' }]), false)
  assert.equal(shallowReferenceArrayEqual(undefined, []), false)
})
