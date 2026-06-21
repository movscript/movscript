import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { readDesktopAppSettings, writeDesktopAppSettings } from './appSettings'

test('desktop app settings persist launch mode and service URLs without secrets', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-'))

  writeDesktopAppSettings(movScriptHomeDir, {
    apiBaseURL: 'http://localhost:9876',
    cloudAPIBaseURL: 'https://cloud.example',
    localAPIBaseURL: 'http://localhost:9876',
    launchMode: 'local',
    workMode: 'agent',
    language: 'zh-CN',
    onboardingCompleted: true,
    shotLibrarySources: [{
      id: 'external',
      name: 'External',
      baseURL: 'https://shots.example',
      enabled: true,
      readOnly: false,
      authToken: 'secret-token',
    }],
  })

  const restored = readDesktopAppSettings(movScriptHomeDir)
  assert.equal(restored?.launchMode, 'local')
  assert.equal(restored?.language, 'zh-CN')
  assert.equal(restored?.cloudAPIBaseURL, 'https://cloud.example')
  assert.equal(restored?.localAPIBaseURL, 'http://localhost:9876')
  assert.equal(restored?.shotLibrarySources?.[0]?.authToken, undefined)

  const raw = readFileSync(join(movScriptHomeDir, 'backend', 'app-settings.json'), 'utf8')
  assert.doesNotMatch(raw, /secret-token/)
})
