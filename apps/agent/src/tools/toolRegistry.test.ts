import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRegisteredTool } from './toolRegistry.js'

test('normalizeRegisteredTool drops non-finite JSON schemas', () => {
  const tool = normalizeRegisteredTool({
    name: 'movscript_test_tool',
    description: 'Test tool',
    permission: 'test.read',
    risk: 'read',
    inputSchema: {
      type: 'object',
      max: Number.POSITIVE_INFINITY,
    },
    outputSchema: {
      type: 'object',
      min: Number.NEGATIVE_INFINITY,
    },
  })

  assert.ok(tool)
  assert.equal(tool.inputSchema, undefined)
  assert.equal(tool.outputSchema, undefined)
})
