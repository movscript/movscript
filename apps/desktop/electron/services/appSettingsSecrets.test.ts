import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  mergeAppSettingsSecrets,
  readAgentRuntimeApiKey,
  readAppSettingsSecrets,
  writeAgentRuntimeApiKey,
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

test('app settings secrets persist agent runtime API keys', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-secrets-agent-key-'))

  writeAgentRuntimeApiKey(movScriptHomeDir, {
    providerKey: 'Claude',
    apiKey: 'sk-ant-secret',
  })

  assert.equal(readAgentRuntimeApiKey(movScriptHomeDir, 'claude'), 'sk-ant-secret')
  assert.deepEqual(readAppSettingsSecrets(movScriptHomeDir).agentRuntimeApiKeys, {
    claude: 'sk-ant-secret',
  })
})

test('app settings secrets persist agent runtime API keys for provider aliases', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-secrets-agent-key-aliases-'))

  writeAgentRuntimeApiKey(movScriptHomeDir, {
    providerKey: 'claude',
    providerKeys: ['claude-code', 'claude-sdk'],
    apiKey: 'sk-ant-secret',
  })

  assert.equal(readAgentRuntimeApiKey(movScriptHomeDir, 'claude'), 'sk-ant-secret')
  assert.equal(readAgentRuntimeApiKey(movScriptHomeDir, 'claude-code'), 'sk-ant-secret')
  assert.equal(readAgentRuntimeApiKey(movScriptHomeDir, 'claude-sdk'), 'sk-ant-secret')
  assert.deepEqual(readAppSettingsSecrets(movScriptHomeDir).agentRuntimeApiKeys, {
    claude: 'sk-ant-secret',
    'claude-code': 'sk-ant-secret',
    'claude-sdk': 'sk-ant-secret',
  })
})

test('app settings secrets preserve agent runtime API keys when app settings are synced', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-secrets-agent-key-preserve-'))
  writeAgentRuntimeApiKey(movScriptHomeDir, {
    providerKey: 'claude',
    apiKey: 'sk-ant-secret',
  })

  writeAppSettingsSecretsFromSettings(movScriptHomeDir, {
    apiBaseURL: 'http://localhost:8765',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: true,
    shotLibrarySources: [],
  })

  assert.equal(readAgentRuntimeApiKey(movScriptHomeDir, 'claude'), 'sk-ant-secret')
})

test('app settings secrets clear agent runtime API keys', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-secrets-agent-key-clear-'))
  writeAgentRuntimeApiKey(movScriptHomeDir, {
    providerKey: 'claude',
    apiKey: 'sk-ant-secret',
  })

  writeAgentRuntimeApiKey(movScriptHomeDir, {
    providerKey: 'claude',
    apiKey: null,
  })

  assert.equal(readAgentRuntimeApiKey(movScriptHomeDir, 'claude'), undefined)
  assert.deepEqual(readAppSettingsSecrets(movScriptHomeDir).agentRuntimeApiKeys, {})
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
    mergeAppSettingsSecrets(settings, { shotLibrarySourceAuthTokens: { external: 'secret-token' }, agentRuntimeApiKeys: {} })
      .shotLibrarySources?.[0]?.authToken,
    'secret-token',
  )
})
