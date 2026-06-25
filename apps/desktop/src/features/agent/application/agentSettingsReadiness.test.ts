import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSdkAgentReadinessItems } from '@/features/agent/application/agentSettingsReadiness'

test('SDK-only agent settings readiness hides catalog-only empty states', () => {
  const items = buildSdkAgentReadinessItems({
    agentLabel: 'Mova',
    agentEnabled: true,
    runtimeLabel: 'SDK 连接',
    runtimeAvailable: true,
    pendingChanges: 0,
  })

  assert.deepEqual(items.map((item) => item.id), ['agent', 'runtime', 'pending'])
  assert.equal(items.every((item) => item.status === 'ready'), true)
  assert.equal(items.some((item) => item.id === 'model'), false)
  assert.equal(items.some((item) => item.id === 'configFile'), false)
  assert.equal(items.some((item) => item.id === 'skills'), false)
  assert.equal(items.some((item) => item.id === 'tools'), false)
})

test('SDK-only Claude readiness points to the API key launch environment', () => {
  const items = buildSdkAgentReadinessItems({
    agentLabel: 'Claude Code',
    agentEnabled: true,
    runtimeLabel: 'SDK 连接',
    runtimeAvailable: true,
    authEnv: 'ANTHROPIC_API_KEY',
    pendingChanges: 0,
  })

  assert.deepEqual(items.map((item) => item.id), ['agent', 'runtime', 'sdk-credentials', 'pending'])
  assert.equal(items.find((item) => item.id === 'sdk-credentials')?.status, 'warning')
  assert.equal(items.find((item) => item.id === 'sdk-credentials')?.detailValues?.env, 'ANTHROPIC_API_KEY')
})
