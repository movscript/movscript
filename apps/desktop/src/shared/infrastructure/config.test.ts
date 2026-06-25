import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APP_SETTINGS_STORAGE_KEY,
  getDefaultAPIBaseURL,
  getAPIBaseURL,
  getAPIV1BaseURL,
  getCanvasServiceBaseURL,
  getCanvasServiceV1BaseURL,
  getRuntimeConfigSnapshot,
  isLocalLaunchMode,
  normalizeAPIBaseURL,
  setRuntimeConfigSnapshot,
  trimTrailingSlash,
} from './config'

test('app settings config keeps URL and launch mode normalization behind core helpers', () => {
  assert.equal(trimTrailingSlash('http://localhost:8765///'), 'http://localhost:8765')
  assert.equal(normalizeAPIBaseURL(' http://localhost:8765/api/v1/ '), 'http://localhost:8765')
  assert.equal(isLocalLaunchMode({ launchMode: 'local' }), true)
  assert.equal(isLocalLaunchMode({ launchMode: 'cloud' }), false)
})

test('runtime config snapshot is the preferred API base URL source', () => {
  setRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    apiBaseURL: 'http://localhost:8766/',
    apiV1BaseURL: 'http://localhost:8766/api/v1',
    projectServiceBaseURL: 'http://localhost:9005/',
    canvasServiceBaseURL: 'http://localhost:9777/',
    localAPIBaseURL: 'http://localhost:8766',
    workspaceDir: '/tmp/movscript-home',
    providerRuntimeEnv: {
      MOVSCRIPT_CODEX_RUNTIME_API: ' codex-sdk ',
      invalid: '',
    },
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766/' },
  })

  assert.equal(getRuntimeConfigSnapshot()?.apiBaseURL, 'http://localhost:8766')
  assert.equal(getRuntimeConfigSnapshot()?.movScriptHomeDir, '/tmp/movscript-home')
  assert.deepEqual(getRuntimeConfigSnapshot()?.providerRuntimeEnv, {
    MOVSCRIPT_CODEX_RUNTIME_API: 'codex-sdk',
  })
  assert.equal(getAPIBaseURL(), 'http://localhost:8766')
  assert.equal(getAPIV1BaseURL(), 'http://localhost:8766/api/v1')
  assert.equal(getRuntimeConfigSnapshot()?.projectServiceBaseURL, 'http://localhost:9005')
  assert.equal(getCanvasServiceBaseURL(), 'http://localhost:9777')
  assert.equal(getCanvasServiceV1BaseURL(), 'http://localhost:9777/v1')

  setRuntimeConfigSnapshot(null)
})

test('browser app settings are only an API base URL fallback outside Electron runtime config', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>([
    [APP_SETTINGS_STORAGE_KEY, JSON.stringify({ state: { settings: { apiBaseURL: 'http://legacy-browser:8765/api/v1' } } })],
  ])
  globalThis.window = {
    location: { pathname: '/', origin: 'http://localhost:5173' },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
  } as typeof window

  try {
    setRuntimeConfigSnapshot(null)

    assert.equal(getAPIBaseURL(), 'http://legacy-browser:8765')

    globalThis.window = {
      ...globalThis.window,
      api: {
        getRuntimeConfig: async () => ({
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          apiBaseURL: 'http://home-runtime:8766',
          apiV1BaseURL: 'http://home-runtime:8766/api/v1',
          localAPIBaseURL: 'http://home-runtime:8766',
          backendStatus: { state: 'ready', baseURL: 'http://home-runtime:8766' },
        }),
      },
    } as typeof window

    assert.equal(getAPIBaseURL(), getDefaultAPIBaseURL())
  } finally {
    setRuntimeConfigSnapshot(null)
    globalThis.window = previousWindow
  }
})
