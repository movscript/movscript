import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContextBundle } from '../../../../context/ledger/shared/contextLedgerTypes.js'
import { contextBundleTraceData, contextBundleTraceRef } from './contextBundleTrace.js'

test('contextBundleTraceRef summarizes bundle identity without embedding prompt parts', () => {
  const ref = contextBundleTraceRef(makeBundle())

  assert.equal(ref.id, 'ctxb_1')
  assert.equal(ref.promptHash, 'sha256:prompt')
  assert.equal(ref.promptPartCount, 1)
  assert.equal(ref.contextRefCount, 1)
  assert.equal(ref.promptParts, undefined)
  assert.equal(ref.contextRefs, undefined)
})

test('contextBundleTraceData keeps only bundle identity and compact ref', () => {
  const bundle = makeBundle()
  const summary = contextBundleTraceData(bundle)

  assert.equal(summary.contextBundleId, 'ctxb_1')
  assert.equal((summary.contextBundleRef as Record<string, unknown>).id, 'ctxb_1')
  assert.equal(summary.contextBundle, undefined)
  assert.equal(JSON.stringify(summary).includes('promptParts'), false)
  assert.equal(JSON.stringify(summary).includes('contextRefs'), false)
})

function makeBundle(): ContextBundle {
  return {
    schema: 'movscript.context-bundle.v1',
    id: 'ctxb_1',
    runId: 'run_1',
    threadId: 'thread_1',
    roundIndex: 1,
    roundLabel: 'Model turn 1',
    createdAt: '2026-01-01T00:00:00.000Z',
    promptHash: 'sha256:prompt',
    messageCount: 3,
    toolCount: 2,
    systemMessageCount: 1,
    promptChars: 120,
    promptParts: [{
      id: 'part_1',
      kind: 'system',
      title: 'System',
      charCount: 80,
      hash: 'sha256:part',
    }],
    contextRefs: [{
      key: 'reference:k1:sha256:k1',
      ref: { type: 'reference', id: 'k1', hash: 'sha256:k1' },
      status: 'active',
      title: 'Reference',
      source: 'reference',
      evidence: 'verified',
      contentHash: 'sha256:k1',
    }],
    activeContextKeys: ['reference:k1:sha256:k1'],
    amendedContextKeys: [],
    deletedContextKeys: [],
  }
}
