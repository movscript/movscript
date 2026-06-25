import assert from 'node:assert/strict'
import test from 'node:test'

import {
  notificationEventFromContext,
  publishSdkRuntimeNotification,
  requestSdkRuntimeServerRequest,
  respondToSdkRuntimeServerRequest,
  registerSdkRuntimeSubscription,
  registerSdkRuntimeHandler,
  requestSdkRuntime,
} from './sdkRuntimeHost'
import {
  CODEX_PROVIDER_ID,
  DEFAULT_PROVIDER_SETTINGS,
  providerRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'
import { SDK_RUNTIME_REQUIRED_RPC_METHODS } from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'

test('SDK runtime host rejects unsupported provider/runtime pairs before handler dispatch', async () => {
  const input = requestInput()

  await assert.rejects(
    () => requestSdkRuntime({
      ...input,
      params: {
        ...input.params,
        provider: {
          ...input.params.provider,
          kind: 'claude',
        },
      },
    }),
    /does not support provider kind claude/,
  )
})

test('SDK runtime host reports missing runtime handlers clearly', async () => {
  await assert.rejects(
    () => requestSdkRuntime(requestInput()),
    /Codex SDK runtime host is not installed yet/,
  )
})

test('SDK runtime host dispatches registered SDK handlers', async () => {
  const unregister = registerSdkRuntimeHandler('codex-sdk', async (input) => {
    assert.equal(input.method, 'thread/list')
    return { threads: [] }
  }, {
    supportedMethods: SDK_RUNTIME_REQUIRED_RPC_METHODS,
  })

  try {
    assert.deepEqual(await requestSdkRuntime(requestInput()), { threads: [] })
  } finally {
    unregister()
  }
})

test('SDK runtime host dispatches registered app-server handlers', async () => {
  const input = {
    ...requestInput(),
    params: {
      ...requestInput().params,
      runtime: {
        ...requestInput().params.runtime,
        id: 'codex-codex-app-server',
        api: 'codex-app-server',
        label: 'Codex app-server',
      },
    },
  }
  const unregister = registerSdkRuntimeHandler('codex-app-server', async (request) => {
    assert.equal(request.method, 'thread/list')
    return { threads: [] }
  }, {
    supportedMethods: SDK_RUNTIME_REQUIRED_RPC_METHODS,
  })

  try {
    assert.deepEqual(await requestSdkRuntime(input), { threads: [] })
  } finally {
    unregister()
  }
})

test('SDK runtime host validates handler coverage against required RPC methods', () => {
  assert.throws(
    () => registerSdkRuntimeHandler('codex-sdk', async () => ({ threads: [] }), {
      supportedMethods: ['thread/list'],
    }),
    /missing required RPC methods: runtime\/probe/,
  )
})

test('SDK runtime host dispatches every required neutral RPC method declared by a handler', async () => {
  const unregister = registerSdkRuntimeHandler('codex-sdk', async (input) => {
    assert.equal(input.method, 'thread/rename')
    return { ok: true }
  }, {
    supportedMethods: SDK_RUNTIME_REQUIRED_RPC_METHODS,
  })

  try {
    assert.deepEqual(await requestSdkRuntime({
      ...requestInput(),
      method: 'thread/rename',
      params: {
        ...requestInput().params,
        threadId: 'thread_1',
        name: 'Renamed',
      },
    }), { ok: true })
  } finally {
    unregister()
  }
})

test('SDK runtime host publishes notifications to matching runtime subscriptions', () => {
  const input = requestInput()
  const received: unknown[] = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'test-subscription',
    runtimeId: input.params.runtime.id,
    providerId: input.params.provider.id,
    threadId: 'thread_1',
    sendNotification: (event) => received.push(event.notification),
  })

  try {
    publishSdkRuntimeNotification(notificationEventFromContext({
      ...input.params,
      threadId: 'other_thread',
    }, {
      method: 'thread/status/changed',
      params: { threadId: 'other_thread', status: 'running' },
    }))
    publishSdkRuntimeNotification(notificationEventFromContext({
      ...input.params,
      threadId: 'thread_1',
    }, {
      method: 'thread/status/changed',
      params: { threadId: 'thread_1', status: 'running' },
    }))

    assert.deepEqual(received, [{
      method: 'thread/status/changed',
      params: { threadId: 'thread_1', status: 'running' },
    }])
  } finally {
    unregister()
  }
})

test('SDK runtime host prefers thread subscriptions over matching global notification subscriptions for the same target', () => {
  const input = requestInput()
  const received: string[] = []
  const unregisterGlobal = registerSdkRuntimeSubscription({
    subscriptionId: 'target-1:global',
    targetId: 'target-1',
    runtimeId: input.params.runtime.id,
    providerId: input.params.provider.id,
    sendNotification: () => received.push('global'),
  })
  const unregisterThread = registerSdkRuntimeSubscription({
    subscriptionId: 'target-1:thread_1',
    targetId: 'target-1',
    runtimeId: input.params.runtime.id,
    providerId: input.params.provider.id,
    threadId: 'thread_1',
    sendNotification: () => received.push('thread'),
  })
  const unregisterOtherTargetGlobal = registerSdkRuntimeSubscription({
    subscriptionId: 'target-2:global',
    targetId: 'target-2',
    runtimeId: input.params.runtime.id,
    providerId: input.params.provider.id,
    sendNotification: () => received.push('other-global'),
  })

  try {
    publishSdkRuntimeNotification(notificationEventFromContext({
      ...input.params,
      threadId: 'thread_1',
    }, {
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'assistant_1',
        delta: 'hello',
      },
    }))

    assert.deepEqual(received, ['thread', 'other-global'])
  } finally {
    unregisterGlobal()
    unregisterThread()
    unregisterOtherTargetGlobal()
  }
})

test('SDK runtime host brokers server requests and resolves renderer responses', async () => {
  const input = requestInput()
  const received: unknown[] = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'server-request-subscription',
    runtimeId: input.params.runtime.id,
    providerId: input.params.provider.id,
    sendNotification: (event) => received.push(event.notification),
    sendServerRequest: (event) => {
      received.push(event.request)
      void respondToSdkRuntimeServerRequest({
        runtimeId: event.runtimeId,
        requestId: event.request.id,
        response: { action: 'approve' },
      })
    },
  })

  try {
    const response = await requestSdkRuntimeServerRequest(input.params, {
      id: 'request_1',
      method: 'item/permissions/requestApproval',
      params: { permissions: { filesystem: 'workspace' } },
    })

    assert.deepEqual(response, { action: 'approve' })
    assert.deepEqual(received, [
      {
        id: 'request_1',
        method: 'item/permissions/requestApproval',
        params: { permissions: { filesystem: 'workspace' } },
      },
      {
        method: 'serverRequest/resolved',
        params: { requestId: 'request_1' },
      },
    ])
  } finally {
    unregister()
  }
})

test('SDK runtime host resolves server requests when no renderer is subscribed', async () => {
  const input = requestInput()
  const response = await requestSdkRuntimeServerRequest(input.params, {
    id: 'unsubscribed_request',
    method: 'item/permissions/requestApproval',
    params: { permissions: { filesystem: 'workspace' } },
  })

  assert.equal(response, undefined)
})

function requestInput() {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === CODEX_PROVIDER_ID)!
  const runtime = {
    ...providerRuntimeProfile(provider),
    id: 'codex-codex-sdk',
    api: 'codex-sdk',
  }
  return {
    method: 'thread/list' as const,
    params: {
      provider,
      runtime,
      limit: 1,
    },
  }
}
