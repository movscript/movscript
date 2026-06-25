import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AgentChatDataSource,
  AgentChatNotification,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/agent-chat'
import { subscribeSharedAgentChatServerRequests } from '@/features/agent/application/agentChatServerRequestSubscriptionCoordinator'

type SubscribeServerRequests = NonNullable<AgentChatDataSource['subscribeServerRequests']>
type SubscribeInput = Parameters<SubscribeServerRequests>[0]
type SubscribeResult = ReturnType<SubscribeServerRequests>

test('agent chat server request subscriptions share one runtime stream per data source identity', () => {
  let subscribeCount = 0
  let cleanupCount = 0
  let subscriptionInput: SubscribeInput | undefined

  const dataSource = dataSourceWithServerRequestSubscription('shared-runtime', (input) => {
    subscribeCount += 1
    subscriptionInput = input
    return () => {
      cleanupCount += 1
    }
  })
  const notifications: string[] = []
  const firstResponse: AgentChatServerRequestResponse = { action: 'approve', scope: 'turn' }
  const secondResponse: AgentChatServerRequestResponse = { action: 'reject', reason: 'second owns the prompt' }

  const unsubscribeFirst = subscribeSharedAgentChatServerRequests(dataSource, {
    onNotification: (notification) => notifications.push(`first:${notification.method}`),
    onServerRequest: () => firstResponse,
  })
  const unsubscribeSecond = subscribeSharedAgentChatServerRequests(dataSource, {
    onNotification: (notification) => notifications.push(`second:${notification.method}`),
    onServerRequest: () => secondResponse,
  })

  assert.equal(subscribeCount, 1)
  subscriptionInput?.onNotification?.(notification('thread/updated'))
  assert.deepEqual(notifications, ['first:thread/updated', 'second:thread/updated'])
  assert.deepEqual(subscriptionInput?.onServerRequest?.(request('request-1')), secondResponse)

  unsubscribeSecond()
  assert.deepEqual(subscriptionInput?.onServerRequest?.(request('request-2')), firstResponse)
  assert.equal(subscriptionInput?.signal?.aborted, false)
  assert.equal(cleanupCount, 0)

  unsubscribeFirst()
  assert.equal(subscriptionInput?.signal?.aborted, true)
  assert.equal(cleanupCount, 1)
  assert.equal(subscriptionInput?.onServerRequest?.(request('request-3')), undefined)
})

test('agent chat server request subscriptions dispose late async cleanup after the last listener leaves', async () => {
  let cleanupCount = 0
  let subscriptionInput: SubscribeInput | undefined
  let resolveCleanup: ((cleanup: () => void) => void) | undefined
  const cleanupReady = new Promise<() => void>((resolve) => {
    resolveCleanup = resolve
  })
  const dataSource = dataSourceWithServerRequestSubscription('async-cleanup-runtime', (input) => {
    subscriptionInput = input
    return cleanupReady
  })

  const unsubscribe = subscribeSharedAgentChatServerRequests(dataSource, {
    onNotification: () => undefined,
  })

  unsubscribe()
  assert.equal(subscriptionInput?.signal?.aborted, true)
  assert.equal(cleanupCount, 0)

  resolveCleanup?.(() => {
    cleanupCount += 1
  })
  await cleanupReady
  await Promise.resolve()

  assert.equal(cleanupCount, 1)
})

function dataSourceWithServerRequestSubscription(
  label: string,
  subscribeServerRequests: (input: SubscribeInput) => SubscribeResult,
): AgentChatDataSource {
  return {
    provider: 'codex',
    providerId: 'codex',
    providerInstanceId: label,
    label,
    listThreads: async () => ({ threads: [] }),
    readThread: async () => {
      throw new Error('readThread is not used in this test')
    },
    startThread: async () => {
      throw new Error('startThread is not used in this test')
    },
    startTextTurn: async () => {
      throw new Error('startTextTurn is not used in this test')
    },
    subscribeServerRequests,
  }
}

function notification(method: string): AgentChatNotification {
  return { method }
}

function request(id: string): AgentChatServerRequest {
  return {
    id,
    method: 'item/permissions/requestApproval',
    params: {},
  }
}
