import assert from 'node:assert/strict'
import test from 'node:test'

import {
  crossPageEventFromAgentChatNotification,
  resetCrossPageNotificationDedupeForTests,
} from '@/shared/application/crossPageNotifications'
import {
  markAgentChatNotificationProjected,
  projectAgentChatCrossPageNotification,
  shouldProjectAgentChatCrossPageNotification,
} from './agentCrossPageNotificationProjection'
import type { AgentChatRuntimeAction } from '@movscript/core/agent/chat'

test('agent cross-page projection accepts global and active-thread events only', () => {
  const globalEvent = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'mcpServer/startupStatus/updated',
      params: { name: 'filesystem', status: 'ready' },
    },
    transport: 'app-server-rpc',
    source: 'Mova',
  })
  const activeThreadEvent = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'thread/name/updated',
      params: { threadId: 'thread_1', name: 'Thread one' },
    },
    transport: 'app-server-rpc',
    source: 'Mova',
  })
  const otherThreadEvent = crossPageEventFromAgentChatNotification({
    notification: {
      method: 'thread/name/updated',
      params: { threadId: 'thread_2', name: 'Thread two' },
    },
    transport: 'app-server-rpc',
    source: 'Mova',
  })

  assert.equal(shouldProjectAgentChatCrossPageNotification(globalEvent, 'thread_1'), true)
  assert.equal(shouldProjectAgentChatCrossPageNotification(activeThreadEvent, 'thread_1'), true)
  assert.equal(shouldProjectAgentChatCrossPageNotification(otherThreadEvent, 'thread_1'), false)
})

test('agent cross-page projection dispatches and deduplicates notifications', () => {
  resetCrossPageNotificationDedupeForTests()
  const actions: AgentChatRuntimeAction[] = []
  const seenKeysRef = { current: new Set<string>() }
  const notification = {
    method: 'serverRequest/resolved',
    params: { threadId: 'thread_1', requestId: 'request_1' },
  }
  const event = crossPageEventFromAgentChatNotification({
    notification,
    transport: 'app-server-rpc',
    source: 'Mova',
  })

  assert.equal(projectAgentChatCrossPageNotification({
    event,
    activeThreadId: 'thread_1',
    dispatchRuntime: (action) => actions.push(action),
    nextRecentEventSequence: () => 1,
    seenKeysRef,
  }), true)
  assert.equal(projectAgentChatCrossPageNotification({
    event,
    activeThreadId: 'thread_1',
    dispatchRuntime: (action) => actions.push(action),
    nextRecentEventSequence: () => 2,
    seenKeysRef,
  }), false)

  assert.equal(actions.length, 1)
  assert.equal(actions[0]?.type, 'applyNotification')
})

test('agent cross-page projection skips events already handled by direct subscription', () => {
  const actions: AgentChatRuntimeAction[] = []
  const seenKeysRef = { current: new Set<string>() }
  const notification = {
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', name: 'Thread one' },
  }
  markAgentChatNotificationProjected(seenKeysRef, notification)
  const event = crossPageEventFromAgentChatNotification({
    notification,
    transport: 'app-server-rpc',
    source: 'Mova',
  })

  assert.equal(projectAgentChatCrossPageNotification({
    event,
    activeThreadId: 'thread_1',
    dispatchRuntime: (action) => actions.push(action),
    nextRecentEventSequence: () => 1,
    seenKeysRef,
  }), false)
  assert.equal(actions.length, 0)
})
