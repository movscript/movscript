import assert from 'node:assert/strict'
import test from 'node:test'

import { createCodexAgentChatDataSource } from '@/shared/infrastructure/codex-app-server/codexAgentChatDataSource'
import type { CodexAppServerRpcClient } from '@/shared/infrastructure/codex-app-server/codexAppServerRpcClient'

test('Codex Agent data source maps provider-neutral thread lifecycle operations to app-server requests', async () => {
  const requests: Array<{ method: string; params: unknown }> = []
  const client = {
    requestProtocol: async (method: string, params: unknown) => {
      requests.push({ method, params })
      return { thread: codexThread({ name: method }) }
    },
  } as unknown as CodexAppServerRpcClient

  const dataSource = createCodexAgentChatDataSource(client)
  const renamed = await dataSource.renameThread?.({ threadId: 'thread_1', name: 'Renamed' })
  await dataSource.archiveThread?.({ threadId: 'thread_1' })
  await dataSource.unarchiveThread?.({ threadId: 'thread_1' })

  assert.equal(renamed && typeof renamed === 'object' && 'provider' in renamed ? renamed.provider : null, 'codex')
  assert.deepEqual(requests, [
    { method: 'thread/name/set', params: { threadId: 'thread_1', name: 'Renamed' } },
    { method: 'thread/archive', params: { threadId: 'thread_1' } },
    { method: 'thread/unarchive', params: { threadId: 'thread_1' } },
  ])
})

test('Codex Agent data source forwards model selection to thread and turn requests', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  const client = {
    startThread: async (params: Record<string, unknown>) => {
      calls.push({ method: 'thread/start', params })
      return { thread: codexThread() }
    },
    startTurn: async (params: Record<string, unknown>) => {
      calls.push({ method: 'turn/start', params })
      return {
        turn: {
          id: 'turn_1',
          status: 'inProgress',
          error: null,
          startedAt: 3,
          completedAt: null,
          items: [],
        },
      }
    },
  } as unknown as CodexAppServerRpcClient

  const dataSource = createCodexAgentChatDataSource(client)
  await dataSource.startThread({ model: 'gpt-5.4', modelProvider: 'movscript' })
  await dataSource.startTurn?.({
    threadId: 'thread_1',
    inputs: [{ type: 'text', text: 'hello', textElements: [] }],
    model: 'gpt-5.4-mini',
  })

  assert.deepEqual(calls, [
    { method: 'thread/start', params: { model: 'gpt-5.4', modelProvider: 'movscript', threadSource: 'user' } },
    {
      method: 'turn/start',
      params: {
        threadId: 'thread_1',
        clientUserMessageId: undefined,
        input: [{ type: 'text', text: 'hello', text_elements: [] }],
        model: 'gpt-5.4-mini',
      },
    },
  ])
})

test('Codex Agent data source exposes global server request subscriptions', async () => {
  const handlers: Array<(request: { id: string; method: string; params?: unknown }) => unknown> = []
  const notificationHandlers: Array<(notification: { method: string; params?: unknown }) => void> = []
  const client = {
    onNotification: (handler: (notification: { method: string; params?: unknown }) => void) => {
      notificationHandlers.push(handler)
      return () => {
        const index = notificationHandlers.indexOf(handler)
        if (index >= 0) notificationHandlers.splice(index, 1)
      }
    },
    onServerRequest: (handler: (request: { id: string; method: string; params?: unknown }) => unknown) => {
      handlers.push(handler)
      return () => {
        const index = handlers.indexOf(handler)
        if (index >= 0) handlers.splice(index, 1)
      }
    },
  } as unknown as CodexAppServerRpcClient

  const dataSource = createCodexAgentChatDataSource(client)
  const seenRequests: unknown[] = []
  const seenNotifications: unknown[] = []
  const dispose = dataSource.subscribeServerRequests?.({
    onNotification: (notification) => seenNotifications.push(notification),
    onServerRequest: (request) => {
      seenRequests.push(request)
      return {
        action: 'approve',
        permissions: { network: null, fileSystem: null },
        scope: 'turn',
        strictAutoReview: false,
      }
    },
  })

  assert.equal(handlers.length, 1)
  assert.equal(notificationHandlers.length, 1)
  const response = await handlers[0]({
    id: 'request_1',
    method: 'item/permissions/requestApproval',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      itemId: 'call_1',
      cwd: '/repo',
      permissions: { network: null, fileSystem: null },
    },
  })

  assert.deepEqual(seenRequests, [{
    id: 'request_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'call_1',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      itemId: 'call_1',
      cwd: '/repo',
      permissions: { network: null, fileSystem: null },
    },
    raw: {
      id: 'request_1',
      method: 'item/permissions/requestApproval',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'call_1',
        cwd: '/repo',
        permissions: { network: null, fileSystem: null },
      },
    },
  }])
  assert.deepEqual(response, {
    permissions: { network: null, fileSystem: null },
    scope: 'turn',
    strictAutoReview: false,
  })
  notificationHandlers[0]?.({
    method: 'serverRequest/resolved',
    params: { threadId: 'thread_1', requestId: 'request_1' },
  })
  notificationHandlers[0]?.({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', name: 'Ignored globally' },
  })
  assert.deepEqual(seenNotifications, [{
    method: 'serverRequest/resolved',
    params: { threadId: 'thread_1', requestId: 'request_1' },
    event: {
      type: 'serverRequestResolved',
      threadId: 'thread_1',
      requestId: 'request_1',
      raw: {
        method: 'serverRequest/resolved',
        params: { threadId: 'thread_1', requestId: 'request_1' },
      },
    },
    raw: {
      method: 'serverRequest/resolved',
      params: { threadId: 'thread_1', requestId: 'request_1' },
    },
  }])

  if (typeof dispose === 'function') dispose()
  assert.equal(handlers.length, 0)
  assert.equal(notificationHandlers.length, 0)
})

function codexThread(patch: Record<string, unknown> = {}) {
  return {
    id: 'thread_1',
    sessionId: 'session_1',
    preview: 'hello',
    name: null,
    createdAt: 1,
    updatedAt: 2,
    status: { type: 'idle' },
    turns: [],
    ...patch,
  }
}
