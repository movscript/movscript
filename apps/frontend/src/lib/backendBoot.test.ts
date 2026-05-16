import assert from 'node:assert/strict'
import test from 'node:test'

import { canManageLocalBackend, probeLocalBackendStatus } from './backendBoot'

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
    assert.match(status.message ?? '', /Local backend is not reachable/)
  })
})

function withWindow(value: unknown, fn: () => void): void {
  const hadWindow = 'window' in globalThis
  const originalWindow = (globalThis as { window?: unknown }).window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  })
  try {
    fn()
  } finally {
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
