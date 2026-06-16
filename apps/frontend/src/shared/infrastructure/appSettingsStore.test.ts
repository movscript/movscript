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
  })

  assert.equal(merged.shotLibrarySources?.[0]?.authToken, 'secret-token')
  assert.equal(sanitizeAppSettingsForPersistence(merged).shotLibrarySources?.[0]?.authToken, undefined)
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
