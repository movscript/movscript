import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeRollbackRecordsTrace } from './rollbackTrace.js'

test('summarizeRollbackRecordsTrace keeps rollback identity without args or metadata bodies', () => {
  const summary = summarizeRollbackRecordsTrace([{
    call: {
      id: 'call_1',
      name: 'workspace_apply',
      args: { content: 'x'.repeat(2000) },
    },
    rollback: {
      policy: 'manual_compensation',
      reason: 'Backend write completed',
      artifactType: 'workspace',
      artifactUri: 'agent-workspace:workspace_1',
      metadata: {
        result: { payload: 'r'.repeat(2000) },
      },
    },
  }]) as Record<string, any>

  assert.equal(summary.schema, 'movscript.rollback-trace-summary.v1')
  assert.equal(summary.total, 1)
  assert.equal(summary.manualCompensationCount, 1)
  assert.equal(summary.records[0]?.callId, 'call_1')
  assert.equal(summary.records[0]?.toolName, 'workspace_apply')
  assert.equal(summary.records[0]?.policy, 'manual_compensation')
  assert.equal(summary.records[0]?.artifactUri, 'agent-workspace:workspace_1')
  assert.match(summary.records[0]?.argsHash, /^sha256:/)
  assert.equal(summary.records[0]?.argsMode, 'summary')
  assert.equal(summary.records[0]?.args, undefined)
  assert.match(summary.records[0]?.metadataHash, /^sha256:/)
  assert.equal(summary.records[0]?.metadataMode, 'summary')
  assert.equal(summary.records[0]?.metadata, undefined)
})
