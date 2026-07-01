import assert from 'node:assert/strict'
import test from 'node:test'
import { getAPIBaseURL, getDefaultAPIBaseURL, APP_SETTINGS_STORAGE_KEY } from './config'

const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window

function withWindow(url: string, storage: Record<string, string> = {}): () => void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: new URL(url),
      localStorage: {
        getItem: (key: string) => storage[key] ?? null,
      },
    },
  })

  return () => {
    if (typeof originalWindow === 'undefined') {
      Reflect.deleteProperty(globalThis, 'window')
      return
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
}

test('getAPIBaseURL prefers explicit apiBaseURL query parameter', () => {
  const restore = withWindow('movscript-admin://app/models?apiBaseURL=https%3A%2F%2Fapi.example.com%2Fapi%2Fv1', {
    [APP_SETTINGS_STORAGE_KEY]: JSON.stringify({ apiBaseURL: 'http://stored.example.com' }),
  })
  try {
    assert.equal(getAPIBaseURL(), 'https://api.example.com')
  } finally {
    restore()
  }
})

test('getAPIBaseURL falls back to electron launch context before stored settings', () => {
  const encoded = Buffer.from(JSON.stringify({ api_base_url: 'http://localhost:8765/api/v1' }), 'utf8').toString('base64url')
  const restore = withWindow(`movscript-admin://app/models#authSession=${encoded}`, {
    [APP_SETTINGS_STORAGE_KEY]: JSON.stringify({ apiBaseURL: 'http://localhost:8766' }),
  })
  try {
    assert.equal(getAPIBaseURL(), 'http://localhost:8765')
  } finally {
    restore()
  }
})

test('getAPIBaseURL ignores stored settings in Electron admin and then falls back to local backend', () => {
  let restore = withWindow('movscript-admin://app/models', {
    [APP_SETTINGS_STORAGE_KEY]: JSON.stringify({ state: { settings: { apiBaseURL: 'https://stored.example.com/api/v1' } } }),
  })
  try {
    assert.equal(getAPIBaseURL(), 'http://localhost:8766')
  } finally {
    restore()
  }

  restore = withWindow('movscript-admin://app/models')
  try {
    assert.equal(getAPIBaseURL(), 'http://localhost:8766')
  } finally {
    restore()
  }
})

test('getAPIBaseURL can still use stored settings for standalone admin deployments', () => {
  const restore = withWindow('https://console.example.com/models', {
    [APP_SETTINGS_STORAGE_KEY]: JSON.stringify({ state: { settings: { apiBaseURL: 'https://stored.example.com/api/v1' } } }),
  })
  try {
    assert.equal(getAPIBaseURL(), 'https://stored.example.com')
  } finally {
    restore()
  }
})

test('getDefaultAPIBaseURL keeps same-origin behavior for admin path deployments', () => {
  const restore = withWindow('https://console.example.com/admin/models')
  try {
    assert.equal(getDefaultAPIBaseURL(), 'https://console.example.com')
  } finally {
    restore()
  }
})
