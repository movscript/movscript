import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { readDesktopAppSettings, writeDesktopAppSettings } from './appSettings'

test('desktop app settings persist launch mode and daemon gateway without legacy local API or secrets', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-'))

  writeDesktopAppSettings(movScriptHomeDir, {
    dataConnection: { kind: 'local', url: 'http://localhost:9876' },
    apiBaseURL: 'http://localhost:9876',
    cloudAPIBaseURL: 'https://cloud.example',
    daemonGatewayBaseURL: 'http://localhost:9876',
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
  assert.deepEqual(restored?.dataConnection, { kind: 'local', url: 'http://localhost:9876' })
  assert.equal(restored?.language, 'zh-CN')
  assert.equal(restored?.cloudAPIBaseURL, 'https://cloud.example')
  assert.equal(restored?.daemonGatewayBaseURL, 'http://localhost:9876')
  assert.equal('localAPIBaseURL' in (restored ?? {}), false)
  assert.equal(restored?.shotLibrarySources?.[0]?.authToken, undefined)

  const raw = readFileSync(join(movScriptHomeDir, 'backend', 'app-settings.json'), 'utf8')
  assert.doesNotMatch(raw, /secret-token/)
  assert.doesNotMatch(raw, /localAPIBaseURL/)
})
