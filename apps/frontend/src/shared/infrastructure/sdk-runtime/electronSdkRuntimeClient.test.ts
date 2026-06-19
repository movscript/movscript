import assert from 'node:assert/strict'
import test from 'node:test'

import { CODEX_PROVIDER_ID, DEFAULT_PROVIDER_SETTINGS, providerRuntimeProfile } from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import {
  electronSdkRuntimeClient,
  electronSdkRuntimeClientAvailable,
} from '@/shared/infrastructure/sdk-runtime/electronSdkRuntimeClient'

test('electron SDK runtime client is unavailable outside the Electron preload API', () => {
  const previousWindow = globalThis.window
  delete (globalThis as { window?: unknown }).window

  try {
    assert.equal(electronSdkRuntimeClientAvailable(), false)
    assert.equal(electronSdkRuntimeClient(clientInput()), undefined)
  } finally {
    setGlobalWindow(previousWindow)
  }
})

test('electron SDK runtime client forwards typed runtime requests through window.api', async () => {
  const previousWindow = globalThis.window
  const calls: unknown[] = []
  setGlobalWindow({
    api: {
      sdkRuntimeRequest: async (input: unknown) => {
        calls.push(input)
        return { threads: [] }
      },
    },
  })

  try {
    const client = electronSdkRuntimeClient(clientInput())
    assert.ok(client)
    assert.equal(electronSdkRuntimeClientAvailable(), true)

    const result = await client.request('thread/list', {
      provider: clientInput().provider,
      runtime: clientInput().runtime,
      limit: 2,
    })

    assert.deepEqual(result, { threads: [] })
    assert.deepEqual(calls, [{
      method: 'thread/list',
      params: {
        provider: clientInput().provider,
        runtime: clientInput().runtime,
        limit: 2,
      },
    }])
  } finally {
    setGlobalWindow(previousWindow)
  }
})

test('electron SDK runtime client subscribes to matching runtime notifications', async () => {
  const previousWindow = globalThis.window
  const input = clientInput()
  const notifications: Array<(event: { runtimeId: string; providerId?: string; threadId?: string; notification: unknown }) => void> = []
  const notifyCalls: unknown[] = []
  setGlobalWindow({
    api: {
      sdkRuntimeRequest: async () => ({}),
      sdkRuntimeNotify: async (call: unknown) => {
        notifyCalls.push(call)
      },
      onSdkRuntimeNotification: (handler: (event: { runtimeId: string; providerId?: string; threadId?: string; notification: unknown }) => void) => {
        notifications.push(handler)
        return () => {
          const index = notifications.indexOf(handler)
          if (index >= 0) notifications.splice(index, 1)
        }
      },
    },
  })

  try {
    const client = electronSdkRuntimeClient(input)
    assert.ok(client?.subscribe)
    const received: unknown[] = []
    const cleanup = client.subscribe({
      provider: input.provider,
      runtime: input.runtime,
      threadId: 'thread_1',
      onNotification: (notification) => received.push(notification),
    })

    notifications[0]?.({
      runtimeId: input.runtime.id,
      providerId: input.provider.id,
      threadId: 'other_thread',
      notification: { method: 'thread/status/changed' },
    })
    notifications[0]?.({
      runtimeId: input.runtime.id,
      providerId: input.provider.id,
      threadId: 'thread_1',
      notification: { method: 'thread/status/changed' },
    })

    assert.deepEqual(notifyCalls, [{
      method: 'runtime/notify/threadSubscribe',
      params: {
        provider: input.provider,
        runtime: input.runtime,
        threadId: 'thread_1',
      },
    }])
    assert.deepEqual(received, [{ method: 'thread/status/changed' }])
    if (typeof cleanup === 'function') cleanup()
    assert.equal(notifications.length, 0)
  } finally {
    setGlobalWindow(previousWindow)
  }
})

test('electron SDK runtime client does not auto-respond from subscriptions without server request handlers', async () => {
  const previousWindow = globalThis.window
  const input = clientInput()
  const serverRequests: Array<(event: {
    runtimeId: string
    providerId?: string
    providerKind?: string
    threadId?: string
    request: { id: string; method: string; params: unknown }
  }) => void> = []
  const responses: unknown[] = []
  setGlobalWindow({
    api: {
      sdkRuntimeRequest: async () => ({}),
      sdkRuntimeNotify: async () => undefined,
      onSdkRuntimeNotification: () => () => undefined,
      onSdkRuntimeServerRequest: (handler: typeof serverRequests[number]) => {
        serverRequests.push(handler)
        return () => {
          const index = serverRequests.indexOf(handler)
          if (index >= 0) serverRequests.splice(index, 1)
        }
      },
      sdkRuntimeRespondToServerRequest: async (response: unknown) => {
        responses.push(response)
      },
    },
  })

  try {
    const client = electronSdkRuntimeClient(input)
    assert.ok(client?.subscribe)
    const cleanup = client.subscribe({
      provider: input.provider,
      runtime: input.runtime,
      threadId: 'thread_1',
    })

    serverRequests[0]?.(serverRequestEvent(input, 'request_1'))
    await Promise.resolve()

    assert.deepEqual(responses, [])
    if (typeof cleanup === 'function') cleanup()
    assert.equal(serverRequests.length, 0)
  } finally {
    setGlobalWindow(previousWindow)
  }
})

test('electron SDK runtime client responds to server requests only through explicit handlers', async () => {
  const previousWindow = globalThis.window
  const input = clientInput()
  const serverRequests: Array<(event: {
    runtimeId: string
    providerId?: string
    providerKind?: string
    threadId?: string
    request: { id: string; method: string; params: unknown }
  }) => void> = []
  const responses: unknown[] = []
  setGlobalWindow({
    api: {
      sdkRuntimeRequest: async () => ({}),
      sdkRuntimeNotify: async () => undefined,
      onSdkRuntimeNotification: () => () => undefined,
      onSdkRuntimeServerRequest: (handler: typeof serverRequests[number]) => {
        serverRequests.push(handler)
        return () => {
          const index = serverRequests.indexOf(handler)
          if (index >= 0) serverRequests.splice(index, 1)
        }
      },
      sdkRuntimeRespondToServerRequest: async (response: unknown) => {
        responses.push(response)
      },
    },
  })

  try {
    const client = electronSdkRuntimeClient(input)
    assert.ok(client?.subscribe)
    const cleanup = client.subscribe({
      provider: input.provider,
      runtime: input.runtime,
      threadId: 'thread_1',
      onServerRequest: (request) => {
        assert.equal(request.id, 'request_1')
        return { action: 'approve' }
      },
    })

    serverRequests[0]?.(serverRequestEvent(input, 'request_1'))
    await Promise.resolve()

    assert.deepEqual(responses, [{
      runtimeId: input.runtime.id,
      requestId: 'request_1',
      response: { action: 'approve' },
    }])
    if (typeof cleanup === 'function') cleanup()
  } finally {
    setGlobalWindow(previousWindow)
  }
})

function clientInput() {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === CODEX_PROVIDER_ID)!
  const runtime = {
    ...providerRuntimeProfile(provider),
    id: 'codex-codex-sdk',
    api: 'codex-sdk',
  }
  const contract = providerRuntimeApiContract('codex-sdk')!
  return { provider, runtime, contract }
}

function serverRequestEvent(input: ReturnType<typeof clientInput>, requestId: string) {
  return {
    runtimeId: input.runtime.id,
    providerId: input.provider.id,
    providerKind: input.provider.kind,
    threadId: 'thread_1',
    request: {
      id: requestId,
      method: 'item/permissions/requestApproval',
      params: { permissions: { filesystem: 'workspace' } },
    },
  }
}

function setGlobalWindow(value: unknown): void {
  if (value === undefined) {
    delete (globalThis as { window?: unknown }).window
    return
  }
  ;(globalThis as { window?: unknown }).window = value
}
