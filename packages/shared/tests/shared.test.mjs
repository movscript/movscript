import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  defaultShotLibrarySource,
  getSettingsDaemonGatewayBaseURL,
  getSettingsDataConnectionBaseURL,
  isActiveSemanticEntityRecord,
  isLocalDataConnection,
  isRecord,
  normalizeAPIBaseURL,
  normalizeAppSettings,
  normalizeShotLibrarySource,
  providerSessionErrorMessage,
  providerSessionResponseError,
  ProviderSessionHTTPError,
  providerSessionStreamError,
  isProviderSessionNotFoundError,
  isRetryableRunStreamError,
  createProviderSessionAbortError,
  createProviderSessionRequestSignal,
  createProviderSessionTimeoutError,
  configureSurfaceHostStateClient,
  getSurfaceHostStateSnapshot,
  normalizePositiveTimeoutMs,
  sleepWithAbort,
} from '../dist/index.js'

test('shared package JSON value rules accept only plain records', () => {
  class RuntimeRecord {
    value = 'runtime'
  }

  assert.equal(isRecord({ value: 'plain' }), true)
  assert.equal(isRecord(Object.create(null)), true)
  assert.equal(isRecord([]), false)
  assert.equal(isRecord(new Date()), false)
  assert.equal(isRecord(new Map()), false)
  assert.equal(isRecord(new RuntimeRecord()), false)
})

test('shared package semantic entity visibility hides deleted records', () => {
  assert.equal(isActiveSemanticEntityRecord({ ID: 1 }), true)
  assert.equal(isActiveSemanticEntityRecord({ ID: 2, __delete: true }), false)
  assert.equal(isActiveSemanticEntityRecord({ ID: 3, deleted: true }), false)
})

test('shared package app settings normalize URLs, modes, and shot library sources', () => {
  const defaultSettings = {
    dataConnection: { kind: 'cloud', url: 'http://localhost:8765' },
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: false,
  }

  assert.equal(normalizeAPIBaseURL(' http://localhost:8765/api/v1/ '), 'http://localhost:8765')
  assert.equal(isLocalDataConnection({ dataConnection: { kind: 'local', url: 'http://localhost:8766' } }), true)
  assert.equal(isLocalDataConnection({ dataConnection: { kind: 'cloud', url: 'https://api.test' } }), false)
  assert.equal(getSettingsDataConnectionBaseURL({
    dataConnection: { kind: 'cloud', url: ' https://team.test/api/v1 ' },
    cloudAPIBaseURL: 'https://legacy-cloud.test',
    apiBaseURL: 'https://legacy.test',
  }), 'https://team.test')
  assert.equal(getSettingsDaemonGatewayBaseURL({
    dataConnection: { kind: 'local', url: 'http://data.test:8766' },
    daemonGatewayBaseURL: ' http://daemon.test:8766/api/v1 ',
    apiBaseURL: 'http://legacy.test:8766',
  }), 'http://daemon.test:8766')
  assert.deepEqual(defaultShotLibrarySource('http://api.test'), {
    id: 'default',
    name: 'Movscript',
    baseURL: 'http://api.test',
    enabled: true,
    readOnly: false,
  })
  assert.deepEqual(normalizeShotLibrarySource({
    id: ' custom ',
    name: ' Custom ',
    baseURL: ' http://shot.test/api/v1 ',
    enabled: undefined,
    readOnly: true,
    authToken: ' token ',
  }), {
    id: 'custom',
    name: 'Custom',
    baseURL: 'http://shot.test',
    enabled: true,
    readOnly: true,
    authToken: 'token',
  })

  assert.deepEqual(normalizeAppSettings({
    apiBaseURL: ' http://api.test/api/v1 ',
    launchMode: 'local',
    workMode: 'agent',
    onboardingCompleted: true,
    movScriptWorkspaceDir: ' /tmp/movscript ',
    localDisplayName: ' Local ',
    shotLibrarySources: [
      { id: ' custom ', name: ' Custom ', baseURL: ' http://shot.test/api/v1 ' },
      { id: 'bad', name: '', baseURL: '' },
    ],
    defaultShotLibrarySourceId: 'custom',
  }, {
    defaultSettings,
    localAPIBaseURL: 'http://localhost:8766',
  }), {
    dataConnection: { kind: 'local', url: 'http://api.test' },
    apiBaseURL: 'http://api.test',
    cloudAPIBaseURL: 'http://localhost:8765',
    daemonGatewayBaseURL: 'http://api.test',
    launchMode: 'local',
    workMode: 'agent',
    onboardingCompleted: true,
    language: undefined,
    movScriptWorkspaceDir: '/tmp/movscript',
    localDisplayName: 'Local',
    shotLibrarySources: [
      { id: 'custom', name: 'Custom', baseURL: 'http://shot.test', enabled: true, readOnly: false, authToken: undefined },
      { id: 'default', name: 'Movscript', baseURL: 'http://api.test', enabled: true, readOnly: false },
    ],
    defaultShotLibrarySourceId: 'custom',
  })

  assert.deepEqual(normalizeAppSettings({
    cloudAPIBaseURL: ' https://cloud.example/api/v1 ',
    localAPIBaseURL: ' http://localhost:8766 ',
    launchMode: 'cloud',
  }, {
    defaultSettings,
    localAPIBaseURL: 'http://localhost:8766',
  }), {
    dataConnection: { kind: 'cloud', url: 'https://cloud.example' },
    apiBaseURL: 'https://cloud.example',
    cloudAPIBaseURL: 'https://cloud.example',
    daemonGatewayBaseURL: 'http://localhost:8766',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: false,
    language: undefined,
    movScriptWorkspaceDir: undefined,
    localDisplayName: undefined,
    shotLibrarySources: [
      { id: 'default', name: 'Movscript', baseURL: 'https://cloud.example', enabled: true, readOnly: false },
    ],
    defaultShotLibrarySourceId: 'default',
  })
})

test('shared package provider session errors unwrap protocol response bodies', async () => {
  assert.equal(providerSessionErrorMessage('{"error":"model missing"}'), 'model missing')
  assert.equal(providerSessionErrorMessage('{"error":{"message":"nested missing"}}'), 'nested missing')
  assert.equal(providerSessionErrorMessage('{"message":"message missing"}'), 'message missing')
  assert.equal(providerSessionErrorMessage('raw failure'), 'raw failure')

  const responseError = await providerSessionResponseError({
    status: 400,
    text: async () => '{"error":"model must be a non-empty string"}',
  })
  assert.ok(responseError instanceof ProviderSessionHTTPError)
  assert.equal(responseError.status, 400)
  assert.equal(responseError.responseText, '{"error":"model must be a non-empty string"}')
  assert.equal(responseError.message, 'provider session returned 400: model must be a non-empty string')

  const streamError = await providerSessionStreamError({
    status: 503,
    responseText: async () => '{"message":"stream unavailable"}',
  })
  assert.equal(streamError.message, 'provider session returned 503: stream unavailable')
})

test('shared package provider session errors classify not found and retryable stream failures', () => {
  assert.equal(isProviderSessionNotFoundError(new ProviderSessionHTTPError(404, '{"error":"missing"}', 'missing')), true)
  assert.equal(isProviderSessionNotFoundError(new ProviderSessionHTTPError(500, 'backend failed', 'backend failed')), false)
  assert.equal(isProviderSessionNotFoundError(new Error('provider session returned 404: missing session')), true)
  assert.equal(isRetryableRunStreamError(new ProviderSessionHTTPError(500, 'backend failed', 'backend failed')), false)
  assert.equal(isRetryableRunStreamError(Object.assign(new Error('aborted'), { name: 'AbortError' })), true)
  assert.equal(isRetryableRunStreamError(Object.assign(new Error('fetch failed'), { name: 'TypeError' })), true)
})

test('shared package provider session request signals normalize timeouts and aborts', async () => {
  assert.equal(normalizePositiveTimeoutMs(5), 5)
  assert.equal(normalizePositiveTimeoutMs(0), undefined)
  assert.equal(normalizePositiveTimeoutMs(Number.NaN), undefined)
  assert.equal(normalizePositiveTimeoutMs('5'), undefined)

  const abortError = createProviderSessionAbortError()
  assert.equal(abortError.name, 'AbortError')
  const timeoutError = createProviderSessionTimeoutError(12)
  assert.equal(timeoutError.name, 'TimeoutError')
  assert.match(timeoutError.message, /12ms/)

  const external = new AbortController()
  const request = createProviderSessionRequestSignal(external.signal, 1000)
  external.abort(abortError)
  assert.equal(request.signal.aborted, true)
  assert.equal(request.signal.reason, abortError)
  request.cleanup()

  const sleepAbort = new AbortController()
  const pending = sleepWithAbort(1000, sleepAbort.signal)
  sleepAbort.abort(abortError)
  await assert.rejects(pending, /Aborted/)
})

test('shared package host state snapshots keep stable identity for unchanged fields', () => {
  const currentProject = { ID: 1, Name: 'Demo' }
  const orgMemberships = []
  const appSettings = { workMode: 'project' }
  const localRecentProjects = []
  let workspaceRoot = '/tmp/demo'

  configureSurfaceHostStateClient({
    getSnapshot: () => ({
      currentProject,
      currentUser: null,
      currentOrgID: null,
      orgMemberships,
      appSettings,
      localRecentProjects,
      workspaceRoot,
    }),
    subscribe: () => () => undefined,
  })

  const first = getSurfaceHostStateSnapshot()
  assert.equal(getSurfaceHostStateSnapshot(), first)

  workspaceRoot = '/tmp/other-demo'
  const changed = getSurfaceHostStateSnapshot()
  assert.notEqual(changed, first)
  assert.equal(getSurfaceHostStateSnapshot(), changed)
})

test('shared package rules stay independent from frontend runtime', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/appSettings.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/jsonValue.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/providerSessionErrors.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/providerSessionRequestSignal.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/semanticEntityVisibility.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
})
