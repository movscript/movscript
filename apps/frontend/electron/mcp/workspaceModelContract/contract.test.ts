import assert from 'node:assert/strict'
import test from 'node:test'
import { getWorkspaceModelContract } from './contract'

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}

test('workspace model contract owns initial workspace protocol and content', async () => {
  const contract = record(await getWorkspaceModelContract({
    kind: 'setting_workspace',
    target: { projectId: 1 },
  }))
  const protocol = record(contract.workspaceProtocol)
  const open = record(protocol.open)
  const validation = record(protocol.validation)
  const save = record(protocol.save)
  const initialContent = record(contract.initialContent)

  assert.equal(protocol.owner, 'frontend')
  assert.equal(open.contentRequired, false)
  assert.equal(open.initialContentSource, 'mcp.initialContent')
  assert.equal(validation.effectsRequiredBeforeSave, true)
  assert.equal(save.boundary, 'setting_workspace')
  assert.equal(initialContent.schema, 'movscript.setting_workspace.v1')
  assert.equal(initialContent.scope, 'setting_workspace')
})
