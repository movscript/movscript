import assert from 'node:assert/strict'
import test from 'node:test'
import type { ElectronRuntimeConfig } from '@/shared/contracts/electronApi'

import {
  APP_SETTINGS_STORAGE_KEY,
  getDefaultAPIBaseURL,
  getAPIBaseURL,
  getAPIV1BaseURL,
  getCanvasGatewayBaseURL,
  getDaemonGatewayBaseURL,
  getRuntimeDataConnection,
  getRuntimeConfigSnapshot,
  getRuntimeDescriptor,
  getSettingsDaemonGatewayBaseURL,
  getSettingsDataConnectionBaseURL,
  isLocalDataConnection,
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

test('app settings data connection helpers use runtime gateway for local and typed URLs for cloud', () => {
  assert.equal(isLocalDataConnection({ dataConnection: { kind: 'local', url: 'http://localhost:8766' } }), true)
  assert.equal(isLocalDataConnection({ dataConnection: { kind: 'cloud', url: 'https://api.example' } }), false)
  assert.equal(
    getSettingsDaemonGatewayBaseURL({
      dataConnection: { kind: 'local', url: 'http://data.example:8766/' },
      daemonGatewayBaseURL: 'http://daemon.example:8766/',
      apiBaseURL: 'http://legacy.example:8766/',
    }),
    'http://localhost:8766',
  )
  assert.equal(
    getSettingsDataConnectionBaseURL({
      dataConnection: { kind: 'cloud', url: 'https://team.example/api/v1' },
      cloudAPIBaseURL: 'https://legacy-cloud.example',
      apiBaseURL: 'https://legacy.example',
    }),
    'https://team.example',
  )
})

test('runtime config snapshot is the preferred API base URL source', () => {
  setRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    gatewayBaseURL: 'http://localhost:8766/',
    runtimeConnection: runtimeConnection('http://localhost:8766/', 'local'),
    runtime: runtimeDescriptor('http://localhost:8766/', 'local'),
    dataConnection: { kind: 'local', authMode: 'local-owner', status: 'connected' },
    runtimeBundleStatus: {
      action: 'upgrade',
      reason: ' Desktop bundled runtime is newer. ',
      homeCurrent: { version: '0.1.30', pluginRoot: ' /tmp/movscript-home/plugins/movscript/current ' },
      desktopBundled: { version: '0.1.31', pluginRoot: ' /Applications/MovScript.app/Contents/Resources/provider-plugins/movscript ' },
      comparison: {
        kind: 'newer',
        compatible: true,
        reason: 'running bundle 0.1.31 is newer than Home current 0.1.30',
      },
    },
    apiBaseURL: 'http://localhost:8766/',
    apiV1BaseURL: 'http://localhost:8766/api/v1',
    workspaceDir: '/tmp/movscript-home',
    providerRuntimeEnv: {
      MOVSCRIPT_CODEX_RUNTIME_API: ' codex-sdk ',
      invalid: '',
    },
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766/' },
  })

  assert.equal(getRuntimeConfigSnapshot()?.apiBaseURL, 'http://localhost:8766')
  assert.equal(getRuntimeConfigSnapshot()?.runtimeConnection.gatewayBaseURL, 'http://localhost:8766')
  assert.equal(getRuntimeConfigSnapshot()?.runtimeConnection.mode, 'local')
  assert.equal(getRuntimeConfigSnapshot()?.movScriptHomeDir, '/tmp/movscript-home')
  assert.equal(getRuntimeDescriptor()?.runtime.owner, 'movscript.local-node')
  assert.equal(getRuntimeDescriptor()?.gateway.canonicalPrefix, '/v1')
  assert.equal(getRuntimeDescriptor()?.gateway.baseURL, 'http://localhost:8766')
  assert.equal(getRuntimeDataConnection()?.kind, 'local')
  assert.equal(getRuntimeConfigSnapshot()?.runtimeBundleStatus?.action, 'upgrade')
  assert.equal(getRuntimeConfigSnapshot()?.runtimeBundleStatus?.reason, 'Desktop bundled runtime is newer.')
  assert.equal(getRuntimeConfigSnapshot()?.runtimeBundleStatus?.homeCurrent?.pluginRoot, '/tmp/movscript-home/plugins/movscript/current')
  assert.equal(getRuntimeConfigSnapshot()?.runtimeBundleStatus?.desktopBundled?.version, '0.1.31')
  assert.equal(getRuntimeConfigSnapshot()?.runtimeBundleStatus?.comparison?.kind, 'newer')
  assert.deepEqual(getRuntimeConfigSnapshot()?.providerRuntimeEnv, {
    MOVSCRIPT_CODEX_RUNTIME_API: 'codex-sdk',
  })
  assert.equal(getAPIBaseURL(), 'http://localhost:8766')
  assert.equal(getAPIV1BaseURL(), 'http://localhost:8766/api/v1')
  assert.equal(getCanvasGatewayBaseURL(), 'http://localhost:8766')
  assert.equal('projectServiceBaseURL' in (getRuntimeConfigSnapshot() ?? {}), false)
  assert.equal('canvasServiceBaseURL' in (getRuntimeConfigSnapshot() ?? {}), false)
  assert.equal('localAPIBaseURL' in (getRuntimeConfigSnapshot() ?? {}), false)

  setRuntimeConfigSnapshot(null)
})

test('runtime connection descriptor keeps api v1 URL canonical', () => {
  setRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    workspaceDir: '/tmp/movscript-home',
    runtimeConnection: {
      ...runtimeConnection('http://localhost:8766/', 'local'),
      apiV1BaseURL: 'http://localhost:8766/api/v1/',
    },
    runtime: runtimeDescriptor('http://localhost:8766/', 'local'),
    dataConnection: { kind: 'local', authMode: 'local-owner', status: 'connected' },
    apiBaseURL: 'https://stale-cloud.example',
    apiV1BaseURL: 'https://stale-cloud.example/api/v1',
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766/' },
  })

  assert.equal(getAPIBaseURL(), 'http://localhost:8766')
  assert.equal(getAPIV1BaseURL(), 'http://localhost:8766/api/v1')

  setRuntimeConfigSnapshot(null)
})

test('runtime config snapshot derives local canvas API from daemon gateway', () => {
  setRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    workspaceDir: '/tmp/movscript-home',
    gatewayBaseURL: 'http://localhost:8766/',
    runtimeConnection: runtimeConnection('http://localhost:8766/', 'local'),
    runtime: runtimeDescriptor('http://localhost:8766/', 'local'),
    dataConnection: { kind: 'local', authMode: 'local-owner', status: 'connected' },
    apiBaseURL: 'http://localhost:8766/',
    apiV1BaseURL: 'http://localhost:8766/api/v1',
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766/' },
  })

  assert.equal(getRuntimeConfigSnapshot()?.gatewayBaseURL, 'http://localhost:8766')
  assert.equal(getRuntimeConfigSnapshot()?.runtime.gateway.baseURL, 'http://localhost:8766')
  assert.equal('dataServiceBaseURL' in (getRuntimeConfigSnapshot() ?? {}), false)
  assert.equal(getDaemonGatewayBaseURL(), 'http://localhost:8766')
  assert.equal(getCanvasGatewayBaseURL(), 'http://localhost:8766')

  setRuntimeConfigSnapshot(null)
})

test('runtime config snapshot normalizes legacy canvas gateway aliases to daemon root', () => {
  setRuntimeConfigSnapshot(legacyRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    workspaceDir: '/tmp/movscript-home',
    gatewayBaseURL: 'http://localhost:8766/',
    canvasServiceV1BaseURL: 'http://localhost:8766/local-api',
    apiBaseURL: 'http://localhost:8766/',
    apiV1BaseURL: 'http://localhost:8766/api/v1',
    localAPIBaseURL: 'http://localhost:8766',
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766/' },
  }))

  assert.equal(getCanvasGatewayBaseURL(), 'http://localhost:8766')
  assert.equal('canvasServiceV1BaseURL' in (getRuntimeConfigSnapshot() ?? {}), false)
  assert.equal('localAPIBaseURL' in (getRuntimeConfigSnapshot() ?? {}), false)

  setRuntimeConfigSnapshot(legacyRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    workspaceDir: '/tmp/movscript-home',
    canvasServiceBaseURL: 'http://localhost:9777/',
    canvasServiceV1BaseURL: 'http://localhost:9777/v1',
    apiBaseURL: 'http://localhost:8766/',
    apiV1BaseURL: 'http://localhost:8766/api/v1',
    localAPIBaseURL: 'http://localhost:8766',
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766/' },
  }))

  assert.equal(getCanvasGatewayBaseURL(), 'http://localhost:8766')

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
          runtimeConnection: runtimeConnection('http://home-runtime:8766', 'local'),
          runtime: runtimeDescriptor('http://home-runtime:8766', 'local'),
          dataConnection: { kind: 'local', authMode: 'local-owner', status: 'connected' },
          apiBaseURL: 'http://home-runtime:8766',
          apiV1BaseURL: 'http://home-runtime:8766/api/v1',
          gatewayBaseURL: 'http://home-runtime:8766',
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

function runtimeDescriptor(
  gatewayBaseURL: string,
  dataConnectionKind: 'local' | 'cloud',
): ElectronRuntimeConfig['runtime'] {
  return {
    schema: 'movscript.runtime-descriptor.v1',
    runtime: {
      owner: 'movscript.local-node',
      appId: 'movscript.local-node',
      name: 'MovScript Local Node Daemon',
    },
    gateway: {
      baseURL: gatewayBaseURL,
      canonicalPrefix: '/v1',
    },
    dataConnection: {
      kind: dataConnectionKind,
      authMode: dataConnectionKind === 'local' ? 'local-owner' : 'session',
      status: 'connected',
    },
    capabilities: {
      project: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
  }
}

function runtimeConnection(
  gatewayBaseURL: string,
  mode: 'local' | 'cloud',
): ElectronRuntimeConfig['runtimeConnection'] {
  const normalized = normalizeAPIBaseURL(gatewayBaseURL)
  return {
    schema: 'movscript.runtime-connection.v1',
    mode,
    gatewayBaseURL: normalized,
    apiV1BaseURL: `${normalized}/api/v1`,
    authMode: mode === 'local' ? 'local-owner' : 'session',
    displayName: mode === 'local' ? 'Local daemon gateway' : 'Cloud data connection',
    status: 'connected',
    source: mode === 'local' ? 'daemon' : 'cloud',
  }
}

function legacyRuntimeConfigSnapshot(input: Partial<ElectronRuntimeConfig> & Record<string, unknown>): ElectronRuntimeConfig {
  return input as ElectronRuntimeConfig
}
