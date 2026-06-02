import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRetrievedContextStore,
  countRetrievedContextChars,
  selectRetrievedContext,
  uniqueRetrievedContextRefs,
} from './retrievedContextStore.js'

test('retrieved context store normalizes and dedupes ledger records by ref identity', () => {
  const store = buildRetrievedContextStore({
    retrieved: [
      {
        ref: { type: 'reference', id: 'storyboard.rhythm.basic', hash: 'sha256:a' },
        source: 'reference',
        evidence: 'advisory',
        title: 'Old title',
        summary: 'reference_get old',
        charCount: 100,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        usedInPrompt: true,
      },
      {
        ref: { type: 'reference', id: 'storyboard.rhythm.basic', hash: 'sha256:a' },
        source: 'reference',
        evidence: 'advisory',
        title: 'New title',
        summary: 'reference_get new',
        charCount: 120,
        retrievedAt: '2026-01-02T00:00:00.000Z',
        usedInPrompt: true,
      },
    ],
  })

  assert.equal(store.records.length, 1)
  assert.equal(store.records[0]?.title, 'New title')
  assert.equal(store.records[0]?.retrievedAt, '2026-01-01T00:00:00.000Z')
})

test('retrieved context store selects records by source, ref type, prefix, and budget', () => {
  const store = buildRetrievedContextStore({
    retrieved: [
      referenceRecord('storyboard.rhythm.basic', 30, '2026-01-02T00:00:00.000Z'),
      referenceRecord('storyboard.hook.short_drama', 40, '2026-01-01T00:00:00.000Z'),
      {
        ref: { type: 'workspace', id: 'workspace_1' },
        source: 'workspace',
        evidence: 'workspace',
        title: 'Workspace',
        summary: 'core_file_read result reference (runtime)',
        charCount: 50,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        usedInPrompt: true,
      },
    ],
  })

  const selected = selectRetrievedContext({
    store,
    source: 'reference',
    refType: 'reference',
    summaryPrefix: 'reference_get ',
    maxChars: 50,
  })

  assert.deepEqual(selected.map((record) => record.ref.id), ['storyboard.rhythm.basic'])
  assert.equal(countRetrievedContextChars(selected), 30)
  assert.deepEqual(uniqueRetrievedContextRefs(store.records).map((ref) => `${ref.type}:${ref.id}`), [
    'reference:storyboard.rhythm.basic',
    'reference:storyboard.hook.short_drama',
    'workspace:workspace_1',
  ])
})

test('retrieved context store selects newest records first before applying budget', () => {
  const store = buildRetrievedContextStore({
    retrieved: [
      referenceRecord('older.large', 80, '2026-01-01T00:00:00.000Z'),
      referenceRecord('newer.small', 20, '2026-01-02T00:00:00.000Z'),
    ],
  })

  const selected = selectRetrievedContext({
    store,
    source: 'reference',
    refType: 'reference',
    maxChars: 50,
  })

  assert.deepEqual(selected.map((record) => record.ref.id), ['newer.small'])
})

test('retrieved context store rejects non-plain ledger records', () => {
  class RuntimeRecord {
    ref = { type: 'reference', id: 'storyboard.rhythm.basic' }
    source = 'reference'
    evidence = 'advisory'
    title = '分镜节奏基础'
    retrievedAt = '2026-01-01T00:00:00.000Z'
    usedInPrompt = true
  }

  const store = buildRetrievedContextStore({
    retrieved: [new RuntimeRecord()],
  })

  assert.deepEqual(store.records, [])
})

function referenceRecord(id: string, charCount: number, retrievedAt = '2026-01-01T00:00:00.000Z'): Record<string, unknown> {
  return {
    ref: { type: 'reference', id },
    source: 'reference',
    evidence: 'advisory',
    title: id,
    summary: 'reference_get result reference (runtime)',
    charCount,
    retrievedAt,
    usedInPrompt: true,
  }
}
