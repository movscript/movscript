import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRollbackMetadata, buildToolRollbackRecords } from './toolRollbackRecords.js'
import type { ToolCallOutcome } from '../state/types.js'

test('buildToolRollbackRecords extracts only outcomes with rollback policies', () => {
  assert.deepEqual(buildToolRollbackRecords([
    outcome('tool.read'),
    outcome('tool.write', { policy: 'manual_compensation', reason: 'External write' }),
  ]), [{
    call: { id: 'call_tool.write', name: 'tool.write', args: {} },
    rollback: { policy: 'manual_compensation', reason: 'External write' },
  }])
})

test('buildRollbackMetadata omits empty metadata and serializes rollback records', () => {
  assert.deepEqual(buildRollbackMetadata([outcome('tool.read')]), {})
  assert.deepEqual(buildRollbackMetadata([outcome('tool.write', { policy: 'reversible', reason: 'Local draft write' })]), {
    rollbackRecords: [{
      call: { id: 'call_tool.write', name: 'tool.write', args: {} },
      rollback: { policy: 'reversible', reason: 'Local draft write' },
    }],
  })
})

test('buildToolRollbackRecords dedupes repeated rollback entries for the same tool call', () => {
  const duplicate = outcome('tool.write', { policy: 'manual_compensation', reason: 'External write' })

  assert.deepEqual(buildToolRollbackRecords([duplicate, duplicate]), [{
    call: { id: 'call_tool.write', name: 'tool.write', args: {} },
    rollback: { policy: 'manual_compensation', reason: 'External write' },
  }])
})

function outcome(toolName: string, rollback?: ToolCallOutcome['rollback']): ToolCallOutcome {
  return {
    call: { id: `call_${toolName}`, name: toolName, args: {} },
    result: { ok: true },
    ...(rollback ? { rollback } : {}),
  }
}
