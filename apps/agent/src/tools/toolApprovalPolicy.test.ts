import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultToolApproval,
  isSandboxAutoAllowedTool,
  requiresToolApproval,
} from './toolApprovalPolicy.js'
import type { RegisteredTool } from './toolRegistry.js'

test('defaultToolApproval follows registered tool defaults and unknown tools require approval', () => {
  assert.equal(defaultToolApproval(undefined), 'always')
  assert.equal(defaultToolApproval(buildTool({ requiresApprovalByDefault: true })), 'always')
  assert.equal(defaultToolApproval(buildTool({ requiresApprovalByDefault: false })), 'never')
})

test('requiresToolApproval applies explicit grant approval before tool defaults', () => {
  const writeTool = buildTool({ risk: 'write', requiresApprovalByDefault: false })
  const readTool = buildTool({ risk: 'read', requiresApprovalByDefault: true })

  assert.equal(requiresToolApproval(undefined, 'never'), true)
  assert.equal(requiresToolApproval(writeTool, 'never'), false)
  assert.equal(requiresToolApproval(readTool, 'always'), true)
  assert.equal(requiresToolApproval(writeTool, 'on_write'), true)
  assert.equal(requiresToolApproval(buildTool({ risk: 'generate' }), 'on_write'), true)
  assert.equal(requiresToolApproval(buildTool({ risk: 'destructive' }), 'on_write'), true)
  assert.equal(requiresToolApproval(readTool, 'on_write'), false)
  assert.equal(requiresToolApproval(readTool, undefined), true)
})

test('isSandboxAutoAllowedTool allows sandbox interception only for write-like risks', () => {
  assert.equal(isSandboxAutoAllowedTool(buildTool({ risk: 'read' }), true), false)
  assert.equal(isSandboxAutoAllowedTool(buildTool({ risk: 'draft' }), true), false)
  assert.equal(isSandboxAutoAllowedTool(buildTool({ risk: 'write' }), true), true)
  assert.equal(isSandboxAutoAllowedTool(buildTool({ risk: 'generate' }), true), true)
  assert.equal(isSandboxAutoAllowedTool(buildTool({ risk: 'destructive' }), true), true)
  assert.equal(isSandboxAutoAllowedTool(buildTool({ risk: 'write' }), false), false)
})

function buildTool(input: Partial<RegisteredTool> = {}): RegisteredTool {
  return {
    name: 'tool_a',
    description: 'Tool A',
    permission: 'tool.a',
    risk: 'read',
    projectScoped: false,
    requiresApprovalByDefault: false,
    ...input,
  }
}
