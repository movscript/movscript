import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContextLedger } from '../../ledger/shared/contextLedgerTypes.js'
import {
  buildHistoryCompactedTracePayload,
  buildLedgerDedupedTracePayload,
  buildLedgerUpdatedTracePayload,
  buildReferenceTracePayload,
  buildToolResultDroppedTracePayload,
} from './contextTraceBuilder.js'

test('buildHistoryCompactedTracePayload records history projection without transcript bodies', () => {
  const trace = buildHistoryCompactedTracePayload({
    messages: [
      {
        id: 'msg_retained',
        role: 'user',
        content: 'retained user message',
        createdAt: '2026-01-01T00:00:00.000Z',
      } as any,
    ],
    summary: 'Older thread summary should stay outside trace data bodies.',
    compactedCount: 3,
    filteredCount: 1,
    inputCount: 5,
    retainedCount: 1,
    summaryChars: 48,
    projectionDecisions: [{
      action: 'drop',
      stage: 'runtime_failure_filter',
      reason: 'Runtime failure and non-transcript runtime assistant messages are omitted from prompt history.',
      messageCount: 1,
      retainedCount: 1,
      summaryChars: 48,
      maxMessages: 6,
    }],
  })

  assert.equal(trace?.data.eventType, 'context.history_compacted')
  assert.equal(trace?.data.compactedCount, 3)
  assert.equal(trace?.data.filteredCount, 1)
  assert.equal(trace?.data.retainedCount, 1)
  assert.equal(JSON.stringify(trace?.data).includes('retained user message'), false)
  assert.equal(JSON.stringify(trace?.data).includes('Older thread summary'), false)
})

test('buildHistoryCompactedTracePayload skips unchanged history projection', () => {
  const trace = buildHistoryCompactedTracePayload({
    messages: [],
    compactedCount: 0,
    filteredCount: 0,
    inputCount: 0,
    retainedCount: 0,
    summaryChars: 0,
    projectionDecisions: [],
  })

  assert.equal(trace, undefined)
})

test('buildReferenceTracePayload summarizes reference get without copying source bodies into refs', () => {
  const ledger = makeLedger()
  const trace = buildReferenceTracePayload({
    ledger,
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic', maxChars: 800 } },
    result: {
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      localReferenceSetId: 'film.reference.storyboard',
      domain: 'storyboard',
      contentHash: 'hash_1',
      charCount: 1200,
      content: '起承转合',
      truncated: true,
    },
  })

  assert.equal(trace?.data.eventType, 'context.reference_loaded')
  assert.equal(trace?.data.id, 'storyboard.rhythm.basic')
  assert.equal(trace?.data.truncated, true)
  assert.deepEqual((trace?.data.refs as any[]).map((ref) => ref.id), ['storyboard.rhythm.basic'])
  assert.equal(JSON.stringify(trace?.data.refs).includes('起承转合'), false)
})

test('buildReferenceTracePayload ignores non-plain reference result records', () => {
  class RuntimeReferenceResult {
    id = 'runtime.object'
    content = 'should not be trusted'
  }

  const trace = buildReferenceTracePayload({
    ledger: makeLedger({ retrieved: [] }),
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: new RuntimeReferenceResult() as unknown as any,
  })

  assert.equal(trace?.data.id, 'storyboard.rhythm.basic')
  assert.equal(trace?.data.contentChars, 0)
})

test('buildLedgerUpdatedTracePayload reports context record states and mutation summary', () => {
  const trace = buildLedgerUpdatedTracePayload(makeLedger({
    retrieved: [
      ledgerRecord({ id: 'active', hash: 'hash_active' }),
      ledgerRecord({ id: 'amended', hash: 'hash_amended', status: 'amended' }),
      ledgerRecord({ id: 'deleted', hash: 'hash_deleted', status: 'deleted' }),
    ],
  }))

  assert.equal(trace.data.eventType, 'context.ledger_updated')
  assert.equal(trace.data.activeCount, 1)
  assert.equal(trace.data.amendedCount, 1)
  assert.equal(trace.data.deletedCount, 1)
  assert.equal((trace.data.refs as any[]).some((record) => record.status === 'deleted'), true)
  assert.equal(JSON.stringify(trace.data).includes('SECRET_REFERENCE_BODY'), false)
})

test('buildLedgerDedupedTracePayload and buildToolResultDroppedTracePayload expose trace summaries', () => {
  const deduped = buildLedgerDedupedTracePayload('reference_get', {
    ledger: makeLedger(),
    incomingCount: 2,
    dedupedRecords: [{
      key: 'reference:storyboard.rhythm.basic:hash_1',
      ref: { type: 'reference', id: 'storyboard.rhythm.basic', title: '分镜节奏基础', hash: 'hash_1', source: 'reference' },
      incomingTitle: '分镜节奏基础',
      existingTitle: '分镜节奏基础',
      existingRetrievedAt: '2026-01-01T00:00:00.000Z',
    }],
  })
  const dropped = buildToolResultDroppedTracePayload('movscript_script_locate', {
    content: 'summary',
    dropped: true,
    originalChars: 1000,
    renderedChars: 100,
    reason: 'summarized',
    resultRef: {
      key: 'tool_result:1',
      hash: 'sha256:abc',
      evidenceKind: 'tool_result',
      lookup: { resultHash: 'sha256:abc', refKey: 'tool_result:1' },
    },
  })

  assert.equal(deduped?.data.eventType, 'context.item_deduped')
  assert.equal(deduped?.data.dedupedCount, 1)
  assert.equal(dropped?.data.eventType, 'context.item_dropped')
  assert.equal(dropped?.data.resultHash, 'sha256:abc')
})

function makeLedger(overrides: Partial<ContextLedger> = {}): ContextLedger {
  return {
    schema: 'movscript.context-ledger.v1',
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    activeSkillIds: [],
    visibleToolNames: [],
    retrieved: [ledgerRecord({ id: 'storyboard.rhythm.basic', hash: 'hash_1' })],
    facts: [],
    artifactRefs: [],
    unresolvedQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function ledgerRecord(input: { id: string; hash: string; status?: 'active' | 'amended' | 'deleted' }): ContextLedger['retrieved'][number] {
  return {
    ref: { type: 'reference', id: input.id, title: input.id, hash: input.hash, source: 'reference' },
    source: 'reference',
    evidence: 'advisory',
    title: input.id,
    summary: 'SECRET_REFERENCE_BODY should stay out of traces',
    contentHash: input.hash,
    charCount: 1200,
    retrievedAt: '2026-01-01T00:00:00.000Z',
    usedInPrompt: input.status !== 'deleted',
    ...(input.status && input.status !== 'active' ? { status: input.status } : {}),
  }
}
