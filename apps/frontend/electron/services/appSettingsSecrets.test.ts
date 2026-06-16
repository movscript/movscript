import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  mergeAppSettingsSecrets,
  readAppSettingsSecrets,
  writeAppSettingsSecretsFromSettings,
} from './appSettingsSecrets'

test('app settings secrets persist shot library tokens outside browser settings', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-secrets-'))
  const settings = {
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud' as const,
    workMode: 'project' as const,
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
      authToken: 'secret-token',
    }],
  }

  writeAppSettingsSecretsFromSettings(movScriptHomeDir, settings)
  assert.deepEqual(readAppSettingsSecrets(movScriptHomeDir).shotLibrarySourceAuthTokens, {
    external: 'secret-token',
  })
})

test('app settings secrets preserve existing tokens when sanitized settings are synced', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-secrets-preserve-'))
  writeAppSettingsSecretsFromSettings(movScriptHomeDir, {
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
      authToken: 'secret-token',
    }],
  })

  writeAppSettingsSecretsFromSettings(movScriptHomeDir, {
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
    }],
  })

  assert.equal(readAppSettingsSecrets(movScriptHomeDir).shotLibrarySourceAuthTokens.external, 'secret-token')
})

test('app settings secrets drop tokens for removed shot library sources', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-secrets-drop-'))
  writeAppSettingsSecretsFromSettings(movScriptHomeDir, {
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
      authToken: 'secret-token',
    }],
  })

  writeAppSettingsSecretsFromSettings(movScriptHomeDir, {
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: true,
    shotLibrarySources: [],
  })

  assert.deepEqual(readAppSettingsSecrets(movScriptHomeDir).shotLibrarySourceAuthTokens, {})
})

test('app settings secrets merge tokens back into runtime settings', () => {
  const settings = {
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud' as const,
    workMode: 'project' as const,
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
    }],
  }

  assert.equal(
    mergeAppSettingsSecrets(settings, { shotLibrarySourceAuthTokens: { external: 'secret-token' } })
      .shotLibrarySources?.[0]?.authToken,
    'secret-token',
  )
})
