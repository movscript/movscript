import assert from 'node:assert/strict'
import test from 'node:test'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { canExecuteConcurrently } from './agentGraphExecutionPolicy.js'

test('canExecuteConcurrently uses explicit tool execution metadata before risk fallback', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'studio.safe_write_preview',
      description: 'Preview write changes without mutating state.',
      permission: 'draft.preview',
      risk: 'write',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
      execution: {
        readOnly: true,
        destructive: false,
        concurrencySafe: true,
        interruptBehavior: 'cancel',
        resultRefStrategy: 'summary_ref',
      },
    },
    {
      name: 'studio.serial_read',
      description: 'Read through a serialized external handle.',
      permission: 'project.read',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
      execution: {
        readOnly: true,
        destructive: false,
        concurrencySafe: false,
        interruptBehavior: 'block',
        resultRefStrategy: 'auto',
      },
    },
  ])

  assert.equal(canExecuteConcurrently({ id: 'call_1', name: 'studio.safe_write_preview', args: {} }, registry), true)
  assert.equal(canExecuteConcurrently({ id: 'call_2', name: 'studio.serial_read', args: {} }, registry), false)
})
