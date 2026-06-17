import assert from 'node:assert/strict'
import test from 'node:test'

import { appServerAccountSourceBaseLabel, appServerAccountSourceLabel } from '@/features/agent/application/appServerConfigDisplay'
import type { ElectronAppServerConfigStatus } from '@/shared/contracts/electronApi'

test('app-server config display maps runtime account sources to product concepts', () => {
  assert.equal(appServerAccountSourceBaseLabel('local-home'), '本机')
  assert.equal(appServerAccountSourceBaseLabel('movscript-backend-session'), '后端')
  assert.equal(appServerAccountSourceBaseLabel('movscript-account'), '托管配置')
  assert.equal(appServerAccountSourceBaseLabel('managed-home'), '托管配置')
  assert.equal(appServerAccountSourceBaseLabel('custom-config'), '托管配置')
  assert.equal(appServerAccountSourceBaseLabel('none'), '未配置')
})

test('app-server config display appends API key status without leaking raw source ids', () => {
  const config: ElectronAppServerConfigStatus = {
    ok: true,
    sourceConfigPath: '/tmp/.movscript/providers/codex/config.json',
    configTomlPath: '/tmp/.codex/config.toml',
    authJsonPath: '/tmp/.codex/auth.json',
    baseURL: 'http://127.0.0.1:8766/v1',
    apiKind: 'openai_responses',
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'managed-home',
    distributedAt: '2026-06-17T00:00:00.000Z',
  }

  assert.equal(appServerAccountSourceLabel(config), '托管配置 / API Key')
  assert.equal(appServerAccountSourceLabel(), '-')
})
