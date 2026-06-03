import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasOpenAgentConversationRecords,
  mergeAgentConversationOpenState,
  openAgentConversationIds,
  setAgentConversationOpen,
} from '@/features/agent/presentation/agentConversationOpenOrder'

test('mergeAgentConversationOpenState can preserve closed history without reopening unknown conversations', () => {
  const merged = mergeAgentConversationOpenState([
    { id: 'thread_1', open: false },
  ], ['thread_1', 'thread_2'], { defaultOpen: false })

  assert.deepEqual(merged, [
    { id: 'thread_1', open: false },
  ])
  assert.deepEqual(openAgentConversationIds(merged), [])
})

test('setAgentConversationOpen explicitly opens a restored conversation after a conservative merge', () => {
  const merged = mergeAgentConversationOpenState([], ['thread_1', 'thread_2'], { defaultOpen: false })
  const opened = setAgentConversationOpen(merged, ['thread_2'], true)

  assert.deepEqual(opened, [
    { id: 'thread_2', open: true },
  ])
  assert.deepEqual(openAgentConversationIds(opened), ['thread_2'])
})

test('setAgentConversationOpen keeps existing open tabs when opening another tab', () => {
  const opened = setAgentConversationOpen([
    { id: 'thread_1', open: true },
    { id: 'thread_2', open: true },
  ], ['thread_3'], true)

  assert.deepEqual(openAgentConversationIds(opened), ['thread_1', 'thread_2', 'thread_3'])
})

test('hasOpenAgentConversationRecords tracks persisted open tabs independently from active conversation state', () => {
  assert.equal(hasOpenAgentConversationRecords([
    { id: 'thread_1', open: false },
    { id: 'thread_2', open: true },
  ]), true)
  assert.equal(hasOpenAgentConversationRecords([
    { id: 'thread_1', open: false },
  ]), false)
})
