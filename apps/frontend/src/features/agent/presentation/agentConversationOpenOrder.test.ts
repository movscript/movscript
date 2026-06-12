import assert from 'node:assert/strict'
import test from 'node:test'

import {
  closedAgentConversationIds,
  hasOpenAgentConversationRecords,
  mergeAgentConversationOpenState,
  openAgentConversationIds,
  reorderAgentConversationOpenState,
  setAgentConversationOpen,
  visibleAgentConversationIds,
} from '@/features/agent/presentation/agentConversationOpenOrder'

test('visibleAgentConversationIds treats open conversations as the default and preserves closed history', () => {
  const merged = mergeAgentConversationOpenState([
    { id: 'thread_1', open: false },
  ], ['thread_1', 'thread_2'])

  assert.deepEqual(merged, [
    { id: 'thread_1', open: false },
    { id: 'thread_2', open: true },
  ])
  assert.deepEqual(closedAgentConversationIds(merged), ['thread_1'])
  assert.deepEqual(visibleAgentConversationIds(merged, ['thread_1', 'thread_2']), ['thread_2'])
})

test('setAgentConversationOpen explicitly opens a restored conversation from the closed list', () => {
  const restored = setAgentConversationOpen([
    { id: 'thread_1', open: false },
    { id: 'thread_2', open: true },
  ], ['thread_1'], true)

  assert.deepEqual(restored, [
    { id: 'thread_1', open: true },
    { id: 'thread_2', open: true },
  ])
  assert.deepEqual(visibleAgentConversationIds(restored, ['thread_1', 'thread_2']), ['thread_1', 'thread_2'])
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

test('reorderAgentConversationOpenState moves a tab before the target and preserves open state', () => {
  const reordered = reorderAgentConversationOpenState([
    { id: 'thread_1', open: true },
    { id: 'thread_2', open: false },
    { id: 'thread_3', open: true },
  ], 'thread_3', 'thread_1', 'before')

  assert.deepEqual(reordered, [
    { id: 'thread_3', open: true },
    { id: 'thread_1', open: true },
    { id: 'thread_2', open: false },
  ])
})

test('reorderAgentConversationOpenState moves a tab after the target', () => {
  const reordered = reorderAgentConversationOpenState([
    { id: 'thread_1', open: true },
    { id: 'thread_2', open: true },
    { id: 'thread_3', open: true },
  ], 'thread_1', 'thread_3', 'after')

  assert.deepEqual(openAgentConversationIds(reordered), ['thread_2', 'thread_3', 'thread_1'])
})

test('reorderAgentConversationOpenState ignores unknown drag or drop ids without losing known records', () => {
  const records = [
    { id: 'thread_1', open: true },
    { id: 'thread_2', open: false },
  ]

  assert.deepEqual(reorderAgentConversationOpenState(records, 'missing', 'thread_1', 'before'), records)
  assert.deepEqual(reorderAgentConversationOpenState(records, 'thread_1', 'missing', 'after'), records)
})
