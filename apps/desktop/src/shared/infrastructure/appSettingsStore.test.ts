import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeAppSettingsSecrets,
  sanitizeAppSettingsForPersistence,
  useAppSettingsStore,
} from './appSettingsStore'

test('app settings store owns onboarding preflight settings before completion', () => {
  useAppSettingsStore.setState({
    settings: {
      dataConnection: { kind: 'cloud', url: 'http://localhost:8765' },
      apiBaseURL: 'http://localhost:8765',
      launchMode: 'cloud',
      workMode: 'project',
      onboardingCompleted: false,
    },
    savedAt: null,
    hydrated: true,
  })

  useAppSettingsStore.getState().setOnboardingSettings({
    launchMode: 'local',
    apiBaseURL: 'http://localhost:8766',
    workMode: 'agent',
    localDisplayName: 'Local Admin',
    onboardingCompleted: false,
  })

  assert.deepEqual(
    pickOnboardingSettings(useAppSettingsStore.getState().settings),
    {
      apiBaseURL: 'http://localhost:8766',
      launchMode: 'local',
      workMode: 'agent',
      localDisplayName: 'Local Admin',
      onboardingCompleted: false,
    },
  )

  useAppSettingsStore.getState().completeOnboarding({
    launchMode: 'local',
    apiBaseURL: 'http://localhost:8766',
    workMode: 'agent',
    localDisplayName: 'Local Admin',
  })

  assert.equal(useAppSettingsStore.getState().settings.onboardingCompleted, true)
})

test('app settings persistence strips shot library source auth tokens', () => {
  const settings = {
    dataConnection: { kind: 'cloud' as const, url: 'http://localhost:8765' },
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud' as const,
    workMode: 'project' as const,
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
      enabled: true,
      readOnly: false,
      authToken: 'secret-token',
    }],
    defaultShotLibrarySourceId: 'external',
  }

  assert.deepEqual(sanitizeAppSettingsForPersistence(settings).shotLibrarySources, [{
    id: 'external',
    name: 'External',
    baseURL: 'https://shots.example',
    enabled: true,
    readOnly: false,
  }])
})

test('app settings secrets merge shot library tokens into memory only', () => {
  const settings = {
    dataConnection: { kind: 'cloud' as const, url: 'http://localhost:8765' },
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud' as const,
    workMode: 'project' as const,
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
      enabled: true,
      readOnly: false,
    }],
    defaultShotLibrarySourceId: 'external',
  }

  const merged = mergeAppSettingsSecrets(settings, {
    shotLibrarySourceAuthTokens: { external: 'secret-token' },
    agentRuntimeApiKeys: {},
  })

  assert.equal(merged.shotLibrarySources?.[0]?.authToken, 'secret-token')
  assert.equal(sanitizeAppSettingsForPersistence(merged).shotLibrarySources?.[0]?.authToken, undefined)
})

test('app settings store remembers cloud API and daemon gateway separately', () => {
  useAppSettingsStore.setState({
    settings: {
      dataConnection: { kind: 'cloud', url: 'https://cloud.example' },
      apiBaseURL: 'https://cloud.example',
      cloudAPIBaseURL: 'https://cloud.example',
      daemonGatewayBaseURL: 'http://localhost:8766',
      launchMode: 'cloud',
      workMode: 'project',
      onboardingCompleted: true,
    },
    savedAt: '2026-06-18T00:00:00.000Z',
    hydrated: true,
  })

  useAppSettingsStore.getState().setLaunchMode('local')
  assert.equal(useAppSettingsStore.getState().settings.apiBaseURL, 'http://localhost:8766')
  assert.deepEqual(useAppSettingsStore.getState().settings.dataConnection, { kind: 'local', url: 'http://localhost:8766' })
  assert.equal(useAppSettingsStore.getState().settings.cloudAPIBaseURL, 'https://cloud.example')

  useAppSettingsStore.getState().setAPIBaseURL('http://localhost:9876/api/v1')
  assert.equal(useAppSettingsStore.getState().settings.apiBaseURL, 'http://localhost:9876')
  assert.deepEqual(useAppSettingsStore.getState().settings.dataConnection, { kind: 'local', url: 'http://localhost:9876' })
  assert.equal(useAppSettingsStore.getState().settings.daemonGatewayBaseURL, 'http://localhost:9876')
  assert.equal('localAPIBaseURL' in useAppSettingsStore.getState().settings, false)
  assert.equal(useAppSettingsStore.getState().settings.cloudAPIBaseURL, 'https://cloud.example')

  useAppSettingsStore.getState().setLaunchMode('cloud')
  assert.equal(useAppSettingsStore.getState().settings.apiBaseURL, 'https://cloud.example')
  assert.deepEqual(useAppSettingsStore.getState().settings.dataConnection, { kind: 'cloud', url: 'https://cloud.example' })
  assert.equal(useAppSettingsStore.getState().settings.daemonGatewayBaseURL, 'http://localhost:9876')
  assert.equal('localAPIBaseURL' in useAppSettingsStore.getState().settings, false)

  useAppSettingsStore.getState().setDataConnectionURL('https://team.example/api/v1')
  assert.equal(useAppSettingsStore.getState().settings.apiBaseURL, 'https://team.example')
  assert.deepEqual(useAppSettingsStore.getState().settings.dataConnection, { kind: 'cloud', url: 'https://team.example' })
  assert.equal(useAppSettingsStore.getState().settings.cloudAPIBaseURL, 'https://team.example')
})

function pickOnboardingSettings(settings: ReturnType<typeof useAppSettingsStore.getState>['settings']) {
  return {
    apiBaseURL: settings.apiBaseURL,
    launchMode: settings.launchMode,
    workMode: settings.workMode,
    localDisplayName: settings.localDisplayName,
    onboardingCompleted: settings.onboardingCompleted,
  }
}
