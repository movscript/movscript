import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { writeMovScriptDataServiceConfig } from '@movscript/data-client'
import { readDesktopAppSettings, readDesktopAppSettingsForRenderer, writeDesktopAppSettings } from './appSettings'

test('desktop app settings persist intent without derived API URLs or secrets', () => {
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
  assert.deepEqual(restored?.dataConnection, { kind: 'local' })
  assert.equal(restored?.language, 'zh-CN')
  assert.equal('apiBaseURL' in (restored ?? {}), false)
  assert.equal('cloudAPIBaseURL' in (restored ?? {}), false)
  assert.equal('daemonGatewayBaseURL' in (restored ?? {}), false)
  assert.equal('localAPIBaseURL' in (restored ?? {}), false)
  assert.equal(restored?.shotLibrarySources?.[0]?.authToken, undefined)

  const raw = readFileSync(join(movScriptHomeDir, 'backend', 'app-settings.json'), 'utf8')
  assert.doesNotMatch(raw, /http:\/\/localhost:9876/)
  assert.doesNotMatch(raw, /https:\/\/cloud\.example/)
  assert.doesNotMatch(raw, /secret-token/)
  assert.doesNotMatch(raw, /apiBaseURL/)
  assert.doesNotMatch(raw, /cloudAPIBaseURL/)
  assert.doesNotMatch(raw, /daemonGatewayBaseURL/)
  assert.doesNotMatch(raw, /"url"/)
  assert.doesNotMatch(raw, /localAPIBaseURL/)
})

test('desktop app settings for renderer hydrate cloud URL from data service config', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-app-settings-renderer-'))

  writeMovScriptDataServiceConfig(movScriptHomeDir, { baseURL: 'https://team.example/api/v1' })
  writeDesktopAppSettings(movScriptHomeDir, {
    dataConnection: { kind: 'cloud', url: 'https://legacy.example' },
    apiBaseURL: 'https://legacy.example',
    cloudAPIBaseURL: 'https://legacy.example',
    daemonGatewayBaseURL: 'http://localhost:9876',
    launchMode: 'cloud',
    workMode: 'project',
    onboardingCompleted: true,
  })

  const restored = readDesktopAppSettings(movScriptHomeDir)
  assert.deepEqual(restored?.dataConnection, { kind: 'cloud' })
  assert.equal('apiBaseURL' in (restored ?? {}), false)

  const rendererSettings = readDesktopAppSettingsForRenderer(movScriptHomeDir)
  assert.equal(rendererSettings?.apiBaseURL, 'https://team.example')
  assert.equal(rendererSettings?.cloudAPIBaseURL, 'https://team.example')
  assert.deepEqual(rendererSettings?.dataConnection, { kind: 'cloud', url: 'https://team.example' })
})
