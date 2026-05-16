import assert from 'node:assert/strict'
import test from 'node:test'
import { needsModelSetupAction } from './actionableErrors'

test('needsModelSetupAction detects missing runtime model configuration', () => {
  assert.equal(needsModelSetupAction('no model config found — configure a backend model config first'), true)
  assert.equal(needsModelSetupAction(new Error('no text-capable model configured and enabled')), true)
})

test('needsModelSetupAction detects backend model and credential setup failures', () => {
  assert.equal(needsModelSetupAction({ error: { message: 'model config id=3 is disabled' } }), true)
  assert.equal(needsModelSetupAction({ message: 'credential for model config id=2 is disabled' }), true)
  assert.equal(needsModelSetupAction('没有可用的 video 模型配置，请先在管理后台配置可用模型'), true)
})

test('needsModelSetupAction ignores unrelated errors', () => {
  assert.equal(needsModelSetupAction('MCP server is unavailable'), false)
  assert.equal(needsModelSetupAction({ error: 'project not found' }), false)
})
