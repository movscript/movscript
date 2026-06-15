import assert from 'node:assert/strict'
import test from 'node:test'

import { useAppSettingsStore } from './appSettingsStore'

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

function pickOnboardingSettings(settings: ReturnType<typeof useAppSettingsStore.getState>['settings']) {
  return {
    apiBaseURL: settings.apiBaseURL,
    launchMode: settings.launchMode,
    workMode: settings.workMode,
    localDisplayName: settings.localDisplayName,
    onboardingCompleted: settings.onboardingCompleted,
  }
}
