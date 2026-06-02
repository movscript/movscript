import assert from 'node:assert/strict'
import test from 'node:test'

import { activateConversationForPanelWorkspace, consumeQueuedPanelWorkspaces, type AgentPanelWorkspaceConversationDeps } from './agentPanelWorkspaceIntake'
import type { AgentPanelWorkspacePayload } from '@/features/agent/application/agentPanelBridge'

test('activateConversationForPanelWorkspace selects the active conversation by default and binds page task', async () => {
  const calls: string[] = []
  const result = await activateConversationForPanelWorkspace({
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

test('activateConversationForPanelWorkspace creates a runtime conversation when requested or when none is active', async () => {
  const calls: string[] = []
  const result = await activateConversationForPanelWorkspace({
    message: 'Hello',
    newConversation: true,
  }, depsFixture(calls, { activeConversationId: 'active_conv' }))

  assert.equal(result, 'runtime_conv_1')
  assert.deepEqual(calls, ['runtime:Hello:runtime_conv_1', 'active:runtime_conv_1'])
})

test('consumeQueuedPanelWorkspaces drains consecutive queued payloads with messages', async () => {
  const calls: string[] = []
  const queue: Array<AgentPanelWorkspacePayload | null> = [
    { message: 'One', newConversation: true },
    { message: 'Two', title: 'Second' },
    { message: '   ' },
  ]
  const result = await consumeQueuedPanelWorkspaces(() => queue.shift(), depsFixture(calls, { activeConversationId: null }))

  assert.deepEqual(result, ['runtime_conv_1', 'runtime_conv_2'])
  assert.deepEqual(calls, [
    'runtime:One:runtime_conv_1',
    'active:runtime_conv_1',
    'runtime:Two:runtime_conv_2',
    'title:runtime_conv_2:Second',
    'active:runtime_conv_2',
  ])
})

function depsFixture(
  calls: string[],
  options: { activeConversationId?: string | null } = {},
): AgentPanelWorkspaceConversationDeps {
  let createCount = 0
  return {
    userId: 'user_1',
    createConversationForWorkspace: async (payload) => {
      createCount += 1
      const id = `runtime_conv_${createCount}`
      calls.push(`runtime:${payload.message}:${id}`)
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
