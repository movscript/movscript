import assert from 'node:assert/strict'
import test from 'node:test'
import { toolDefinitionFromRegisteredTool } from './registry.js'
import type { RegisteredTool } from '../tools/toolRegistry.js'

const EMPTY_OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {},
}

test('toolDefinitionFromRegisteredTool preserves plain JSON schema records', () => {
  const inputSchema = { type: 'object', properties: { value: { type: 'string' } } }
  const outputSchema = { type: 'object', properties: { ok: { type: 'boolean' } } }

  const definition = toolDefinitionFromRegisteredTool(tool({ inputSchema, outputSchema }))

  assert.equal(definition.inputSchema, inputSchema)
  assert.equal(definition.outputSchema, outputSchema)
})

test('toolDefinitionFromRegisteredTool rejects non-plain schema records', () => {
  class RuntimeSchema {
    type = 'object'
  }

  const definition = toolDefinitionFromRegisteredTool(tool({
    inputSchema: new RuntimeSchema() as never,
    outputSchema: new Map([['type', 'object']]) as never,
  }))

  assert.deepEqual(definition.inputSchema, EMPTY_OBJECT_SCHEMA)
  assert.equal(definition.outputSchema, undefined)
})

function tool(overrides: Partial<RegisteredTool> = {}): RegisteredTool {
  return {
    name: 'tool_a',
    description: 'Tool A',
    permission: 'agent.tool.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    defaults: { grant: 'allow', approval: 'never' },
    ...overrides,
  }
}
