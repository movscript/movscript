import assert from 'node:assert/strict'
import test from 'node:test'

import { activateConversationForPanelDraft, consumeQueuedPanelDrafts, type AgentPanelDraftConversationDeps } from './agentPanelDraftIntake'
import type { AgentPanelDraftPayload } from './agentPanelBridge'

test('activateConversationForPanelDraft selects the active conversation by default and binds page task', () => {
  const calls: string[] = []
  const result = activateConversationForPanelDraft({
    message: 'Hello',
    title: 'Task title',
    requestId: 'req_1',
  }, depsFixture(calls, { activeConversationId: 'active_conv' }))

  assert.equal(result, 'active_conv')
  assert.deepEqual(calls, [
    'title:active_conv:Task title',
    'active:active_conv',
    'attach:req_1:active_conv',
  ])
})

test('activateConversationForPanelDraft creates a new conversation when requested or when none is active', () => {
  const calls: string[] = []
  const result = activateConversationForPanelDraft({
    message: 'Hello',
    newConversation: true,
  }, depsFixture(calls, { activeConversationId: 'active_conv' }))

  assert.equal(result, 'created_conv_1')
  assert.deepEqual(calls, ['create:created_conv_1', 'active:created_conv_1'])
})

test('consumeQueuedPanelDrafts drains consecutive queued payloads with messages', () => {
  const calls: string[] = []
  const queue: Array<AgentPanelDraftPayload | null> = [
    { message: 'One', newConversation: true },
    { message: 'Two', title: 'Second' },
    { message: '   ' },
  ]
  const result = consumeQueuedPanelDrafts(() => queue.shift(), depsFixture(calls, { activeConversationId: null }))

  assert.deepEqual(result, ['created_conv_1', 'created_conv_2'])
  assert.deepEqual(calls, [
    'create:created_conv_1',
    'active:created_conv_1',
    'create:created_conv_2',
    'title:created_conv_2:Second',
    'active:created_conv_2',
  ])
})

function depsFixture(
  calls: string[],
  options: { activeConversationId?: string | null } = {},
): AgentPanelDraftConversationDeps {
  let createCount = 0
  return {
    userId: 'user_1',
    createConversation: () => {
      createCount += 1
      const id = `created_conv_${createCount}`
      calls.push(`create:${id}`)
      return id
    },
    getActiveConversationId: () => options.activeConversationId,
    setActiveConversation: (_userId, conversationId) => {
      calls.push(`active:${conversationId}`)
    },
    updateConversationTitle: (_userId, conversationId, title) => {
      calls.push(`title:${conversationId}:${title}`)
    },
    attachPageTaskConversation: (requestId, conversationId) => {
      calls.push(`attach:${requestId}:${conversationId}`)
    },
  }
}
