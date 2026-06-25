import assert from 'node:assert/strict'
import test from 'node:test'
import { needsModelSetupAction } from '@/shared/domain/actionableErrors'

test('needsModelSetupAction detects missing provider model routing', () => {
  assert.equal(needsModelSetupAction('no model route found — configure a backend catalog route first'), true)
  assert.equal(needsModelSetupAction(new Error('no text-capable model configured and enabled')), true)
})

test('needsModelSetupAction detects backend model and credential setup failures', () => {
  assert.equal(needsModelSetupAction({ error: { message: 'model route id=3 is disabled' } }), true)
  assert.equal(needsModelSetupAction({ message: 'credential for model route id=2 is disabled' }), true)
  assert.equal(needsModelSetupAction('没有可用的 video 模型路由，请先在管理后台配置 Catalog/Route'), true)
})

test('needsModelSetupAction ignores unrelated errors', () => {
  assert.equal(needsModelSetupAction('MCP server is unavailable'), false)
  assert.equal(needsModelSetupAction({ error: 'project not found' }), false)
})
