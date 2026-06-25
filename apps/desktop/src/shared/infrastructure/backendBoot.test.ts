import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canManageLocalBackend,
  probeLocalBackendStatus,
  waitForLocalBackendReady,
} from '@/shared/infrastructure/backendBoot'
import {
  getLocalAPIBaseURL,
  getRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'

test('canManageLocalBackend requires Electron backend IPC helpers', () => {
  withWindow({}, () => {
    assert.equal(canManageLocalBackend(), false)
  })

  withWindow({
    api: {
      getBackendStatus: async () => ({ state: 'ready', baseURL: 'http://localhost:8766' }),
      setAppSettings: async () => {},
    },
  }, () => {
    assert.equal(canManageLocalBackend(), true)
  })
})

test('probeLocalBackendStatus reports ready from HTTP health without Electron IPC', async () => {
  await withFetch(async () => new Response(null, { status: 204 }), async () => {
    const status = await probeLocalBackendStatus('http://localhost:8766/')
    assert.deepEqual(status, {
      state: 'ready',
      baseURL: 'http://localhost:8766',
    })
  })
})

test('probeLocalBackendStatus returns actionable error when local HTTP health is unavailable', async () => {
  await withFetch(async () => {
    throw new Error('connection refused')
  }, async () => {
    const status = await probeLocalBackendStatus('http://localhost:8766')
    assert.equal(status.state, 'error')
    assert.equal(status.baseURL, 'http://localhost:8766')
    assert.match(status.message ?? '', /Local runtime data plane is not reachable/)
  })
})

test('waitForLocalBackendReady trusts daemon-owned Electron status over the legacy local URL', async () => {
  const previousSettings = useAppSettingsStore.getState().settings
  const runtimeBaseURL = 'http://127.0.0.1:45678'
  useAppSettingsStore.setState({
    settings: {
      ...previousSettings,
      launchMode: 'local',
      onboardingCompleted: true,
      apiBaseURL: getLocalAPIBaseURL(),
      localAPIBaseURL: getLocalAPIBaseURL(),
    },
  })
  setRuntimeConfigSnapshot(null)
  let fetchCalled = false
  try {
    await withWindow({
      api: {
        getBackendStatus: async () => ({ state: 'ready', baseURL: runtimeBaseURL }),
        setAppSettings: async () => {
          throw new Error('setAppSettings should not be needed for an already-ready daemon')
        },
        getRuntimeConfig: async () => ({
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          apiBaseURL: runtimeBaseURL,
          apiV1BaseURL: `${runtimeBaseURL}/api/v1`,
          localAPIBaseURL: getLocalAPIBaseURL(),
          backendStatus: { state: 'ready', baseURL: runtimeBaseURL },
        }),
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    }, async () => {
      await withFetch(async () => {
        fetchCalled = true
        throw new Error('legacy local URL should not be probed when Electron status is ready')
      }, async () => {
        await waitForLocalBackendReady(100)
      })
    })

    assert.equal(fetchCalled, false)
    assert.equal(getRuntimeConfigSnapshot()?.apiBaseURL, runtimeBaseURL)
  } finally {
    setRuntimeConfigSnapshot(null)
    useAppSettingsStore.setState({ settings: previousSettings })
  }
})

function withWindow<T>(value: unknown, fn: () => T): T {
  const hadWindow = 'window' in globalThis
  const originalWindow = (globalThis as { window?: unknown }).window
  const restore = () => {
    if (hadWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: originalWindow,
      })
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  })
  try {
    const result = fn()
    if (result && typeof result === 'object' && typeof (result as Promise<unknown>).finally === 'function') {
      return (result as Promise<unknown>).finally(restore) as T
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

async function withFetch(fetchImpl: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: fetchImpl,
  })
  try {
    await fn()
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    })
  }
}
