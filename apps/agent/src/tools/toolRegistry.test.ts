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

test('normalizeRegisteredTool derives execution metadata from risk by default', () => {
  const readTool = normalizeRegisteredTool({
    name: 'movscript_read_tool',
    description: 'Read tool',
    permission: 'test.read',
    risk: 'read',
  })
  const writeTool = normalizeRegisteredTool({
    name: 'movscript_write_tool',
    description: 'Write tool',
    permission: 'test.write',
    risk: 'write',
  })

  assert.deepEqual(readTool?.execution, {
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    interruptBehavior: 'cancel',
    resultRefStrategy: 'auto',
  })
  assert.deepEqual(writeTool?.execution, {
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    interruptBehavior: 'block',
    resultRefStrategy: 'auto',
  })
})

test('normalizeRegisteredTool preserves explicit execution metadata', () => {
  const tool = normalizeRegisteredTool({
    name: 'movscript_explicit_tool',
    description: 'Explicit tool',
    permission: 'test.write',
    risk: 'write',
    execution: {
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      interruptBehavior: 'cancel',
      maxResultSizeChars: 4096,
      resultRefStrategy: 'summary_ref',
    },
  })

  assert.deepEqual(tool?.execution, {
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    interruptBehavior: 'cancel',
    maxResultSizeChars: 4096,
    resultRefStrategy: 'summary_ref',
  })
})
