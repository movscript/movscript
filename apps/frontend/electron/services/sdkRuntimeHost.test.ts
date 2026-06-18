import assert from 'node:assert/strict'
import test from 'node:test'

import {
  notificationEventFromContext,
  publishSdkRuntimeNotification,
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
