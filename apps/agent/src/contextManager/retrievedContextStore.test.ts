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
        ref: { type: 'knowledge', id: 'storyboard.rhythm.basic', hash: 'sha256:a' },
        source: 'knowledge',
        evidence: 'advisory',
        title: 'Old title',
        summary: 'movscript_get_knowledge old',
        charCount: 100,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        usedInPrompt: true,
      },
      {
        ref: { type: 'knowledge', id: 'storyboard.rhythm.basic', hash: 'sha256:a' },
        source: 'knowledge',
        evidence: 'advisory',
        title: 'New title',
        summary: 'movscript_get_knowledge new',
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
      knowledgeRecord('storyboard.rhythm.basic', 30, '2026-01-02T00:00:00.000Z'),
      knowledgeRecord('storyboard.hook.short_drama', 40, '2026-01-01T00:00:00.000Z'),
      {
        ref: { type: 'draft', id: 'draft_1' },
        source: 'draft',
        evidence: 'draft',
        title: 'Draft',
        summary: 'movscript_get_draft result reference (runtime)',
        charCount: 50,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        usedInPrompt: true,
      },
    ],
  })

  const selected = selectRetrievedContext({
    store,
    source: 'knowledge',
    refType: 'knowledge',
    summaryPrefix: 'movscript_get_knowledge ',
    maxChars: 50,
  })

  assert.deepEqual(selected.map((record) => record.ref.id), ['storyboard.rhythm.basic'])
  assert.equal(countRetrievedContextChars(selected), 30)
  assert.deepEqual(uniqueRetrievedContextRefs(store.records).map((ref) => `${ref.type}:${ref.id}`), [
    'knowledge:storyboard.rhythm.basic',
    'knowledge:storyboard.hook.short_drama',
    'draft:draft_1',
  ])
})

test('retrieved context store selects newest records first before applying budget', () => {
  const store = buildRetrievedContextStore({
    retrieved: [
      knowledgeRecord('older.large', 80, '2026-01-01T00:00:00.000Z'),
      knowledgeRecord('newer.small', 20, '2026-01-02T00:00:00.000Z'),
    ],
  })

  const selected = selectRetrievedContext({
    store,
    source: 'knowledge',
    refType: 'knowledge',
    maxChars: 50,
  })

  assert.deepEqual(selected.map((record) => record.ref.id), ['newer.small'])
})

test('retrieved context store rejects non-plain ledger records', () => {
  class RuntimeRecord {
    ref = { type: 'knowledge', id: 'storyboard.rhythm.basic' }
    source = 'knowledge'
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

function knowledgeRecord(id: string, charCount: number, retrievedAt = '2026-01-01T00:00:00.000Z'): Record<string, unknown> {
  return {
    ref: { type: 'knowledge', id },
    source: 'knowledge',
    evidence: 'advisory',
    title: id,
    summary: 'movscript_get_knowledge result reference (runtime)',
    charCount,
    retrievedAt,
    usedInPrompt: true,
  }
}
