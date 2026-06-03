import assert from 'node:assert/strict'
import test from 'node:test'

import {
  amendContextLedgerRecord,
  deleteContextLedgerRecord,
  previewToolResultContextRefs,
  recordToolResultInContextLedgerWithAudit,
  summarizeContextMutations,
} from './contextLedger.js'
import { refKey } from '../retrieval/retrievedContextStore.js'

test('context ledger audit reports duplicate retrieved refs while preserving first retrieval time', () => {
  const first = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: referenceResult('分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  })
  const second = recordToolResultInContextLedgerWithAudit({
    ledger: first.ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: referenceResult('新版分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-02T00:00:00.000Z',
  })

  assert.equal(first.dedupedRecords.length, 0)
  assert.equal(second.incomingCount, 1)
  assert.equal(second.dedupedRecords.length, 1)
  assert.equal(second.dedupedRecords[0]?.key, 'reference:storyboard.rhythm.basic:sha256:rhythm')
  assert.equal(second.dedupedRecords[0]?.existingRetrievedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(second.ledger.retrieved.length, 1)
  assert.equal(second.ledger.retrieved[0]?.title, '新版分镜节奏基础')
  assert.equal(second.ledger.retrieved[0]?.retrievedAt, '2026-01-01T00:00:00.000Z')
})

test('context ledger preview exposes the same tool result refs that recording materializes', () => {
  const call = { id: 'call_1', name: 'core_file_read', args: { ref: 'agent://workspace/workspace_1/content' } }
  const result = { content: 'file body' }
  const previewRefs = previewToolResultContextRefs(call, result)
  const audit = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call,
    result,
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.deepEqual(previewRefs.map(refKey), audit.ledger.retrieved.map((record) => refKey(record.ref)))
  assert.equal(previewRefs[0]?.type, 'tool_result')
  assert.equal(previewRefs[0]?.hash, audit.ledger.retrieved[0]?.contentHash)
})

test('context ledger records search refs without charging retrieved body budget', () => {
  const search = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'reference_search', args: { query: '分镜' } },
    result: {
      results: [
        { id: 'storyboard.rhythm.basic', title: '分镜节奏基础', localReferenceSetId: 'film.reference.storyboard', contentHash: 'sha256:rhythm', charCount: 3000 },
        { id: 'storyboard.hook.basic', title: '钩子基础', localReferenceSetId: 'film.reference.storyboard', contentHash: 'sha256:hook', charCount: 2000 },
      ],
    },
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(search.ledger.retrieved.length, 2)
  assert.deepEqual(search.ledger.retrieved.map((record) => record.charCount), [0, 0])

  const get = recordToolResultInContextLedgerWithAudit({
    ledger: search.ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: referenceResult('分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-01T00:00:01.000Z',
  })

  const rhythm = get.ledger.retrieved.find((record) => record.ref.id === 'storyboard.rhythm.basic')
  const hook = get.ledger.retrieved.find((record) => record.ref.id === 'storyboard.hook.basic')
  assert.equal(rhythm?.charCount, 7)
  assert.equal(hook?.charCount, 0)
})

test('context ledger summarizes append, amend, and delete mutations without embedding records', () => {
  const appended = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: referenceResult('分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  }).ledger
  const original = appended.retrieved[0]!
  const originalKey = refKey(original.ref)
  const amended = amendContextLedgerRecord({
    ledger: appended,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    targetKey: originalKey,
    record: {
      ...original,
      ref: { ...original.ref, hash: 'sha256:rhythm-v2' },
      contentHash: 'sha256:rhythm-v2',
      retrievedAt: '2026-01-01T00:00:01.000Z',
    },
    reason: 'reference refreshed',
    now: '2026-01-01T00:00:01.000Z',
  })
  const replacement = amended.retrieved.find((record) => record.contentHash === 'sha256:rhythm-v2')!
  const deleted = deleteContextLedgerRecord({
    ledger: amended,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    targetKey: refKey(replacement.ref),
    reason: 'no longer relevant',
    now: '2026-01-01T00:00:02.000Z',
  })

  const summary = summarizeContextMutations(deleted)
  assert.equal(summary.total, 3)
  assert.equal(summary.appended, 1)
  assert.equal(summary.amended, 1)
  assert.equal(summary.deleted, 1)
  assert.equal(summary.appendedContextKeys.includes(originalKey), true)
  assert.equal(summary.amendedContextKeys.includes(originalKey), true)
  assert.equal(summary.amendedContextKeys.includes(refKey(replacement.ref)), true)
  assert.deepEqual(summary.deletedContextKeys, [refKey(replacement.ref)])
  assert.equal(summary.latest?.type, 'delete')
  assert.equal(JSON.stringify(summary).includes('分镜节奏基础'), false)
})

test('context ledger records memory search refs separately from loaded memory body', () => {
  const search = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'core_memory_search', args: { projectId: 42, query: '偏好' } },
    result: {
      memories: [
        { id: 'memory_1', title: '偏好', kind: 'preference', excerpt: '只返回摘要', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      count: 1,
    },
    source: 'runtime',
  })
  assert.equal(search.ledger.retrieved[0]?.charCount, 0)

  const get = recordToolResultInContextLedgerWithAudit({
    ledger: search.ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'core_memory_get', args: { projectId: 42, id: 'memory_1' } },
    result: {
      id: 'memory_1',
      projectId: 42,
      title: '偏好',
      kind: 'preference',
      content: '完整记忆正文',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    source: 'runtime',
  })

  assert.equal(get.ledger.retrieved[0]?.charCount, '完整记忆正文'.length)
})

test('context ledger extracts refs from MCP text JSON tool wrappers', () => {
  const audit = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'movscript_script_locate', args: { projectId: 42 } },
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({
          projectId: 42,
          scripts: [
            { id: 7, title: '第一场', content: '雨夜便利店' },
          ],
        }),
      }],
    },
    source: 'mcp',
  })

  assert.equal(audit.ledger.retrieved.some((record) => record.ref.type === 'project' && record.ref.id === '42'), true)
  const project = audit.ledger.retrieved.find((record) => record.ref.type === 'project')
  assert.equal(project?.source, 'mcp')
  assert.equal(project?.evidence, 'verified')
})

test('context ledger extracts generation refs from runtime work payloads', () => {
  const audit = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'core_work_start', args: { kind: 'generation_job', request: {} } },
    result: {
      status: 'started',
      work: {
        id: 'op_99',
        kind: 'generation_job',
        status: 'waiting',
        externalHandle: { provider: 'movscript', type: 'generation_job', id: 99 },
        result: {
          jobId: 99,
          status: 'queued',
          message: '生成任务已创建',
        },
      },
    },
    source: 'runtime',
  })

  assert.equal(audit.ledger.retrieved[0]?.ref.type, 'generation_job')
  assert.equal(audit.ledger.retrieved[0]?.ref.id, '99')
})

test('context ledger ignores invalid numeric project and generation refs', () => {
  for (const invalidId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const audit = recordToolResultInContextLedgerWithAudit({
      runId: 'run_1',
      threadId: 'thread_1',
      catalogSnapshotId: 'catalog_1',
      call: {
        name: 'project_status_read',
        args: {
          projectId: invalidId,
        },
      },
      result: {
        projectId: invalidId,
        jobId: invalidId,
      },
      source: 'runtime',
    })

    assert.equal(audit.ledger.retrieved.some((record) => record.ref.type === 'project'), false)
    assert.equal(audit.ledger.retrieved.some((record) => record.ref.type === 'generation_job'), false)
  }
})

test('context ledger ignores non-plain persisted ledger records', () => {
  class PersistedLedger {
    schema = 'movscript.context-ledger.v1'
    runId = 'run_old'
    threadId = 'thread_old'
    catalogSnapshotId = 'catalog_old'
    activeSkillIds = ['old_skill']
    visibleToolNames = ['old_tool']
    artifactRefs = [{ type: 'reference', id: 'old_reference' }]
    retrieved = [{
      ref: { type: 'reference', id: 'old_reference' },
      source: 'reference',
      evidence: 'advisory',
      title: 'Old reference',
      retrievedAt: '2026-01-01T00:00:00.000Z',
    }]
    createdAt = '2026-01-01T00:00:00.000Z'
    updatedAt = '2026-01-01T00:00:00.000Z'
  }

  const audit = recordToolResultInContextLedgerWithAudit({
    ledger: new PersistedLedger(),
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    activeSkillIds: ['new_skill'],
    visibleToolNames: ['new_tool'],
    call: { name: 'reference_get', args: { id: 'storyboard.rhythm.basic' } },
    result: referenceResult('分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-02T00:00:00.000Z',
  })

  assert.equal(audit.ledger.runId, 'run_1')
  assert.equal(audit.ledger.threadId, 'thread_1')
  assert.equal(audit.ledger.catalogSnapshotId, 'catalog_1')
  assert.deepEqual(audit.ledger.activeSkillIds, ['new_skill'])
  assert.deepEqual(audit.ledger.visibleToolNames, ['new_tool'])
  assert.equal(audit.ledger.retrieved.some((record) => record.ref.id === 'old_reference'), false)
})

function referenceResult(title: string) {
  return {
    id: 'storyboard.rhythm.basic',
    localReferenceSetId: 'film.reference.storyboard',
    domain: 'storyboard',
    title,
    summary: '节奏',
    tags: ['storyboard'],
    content: 'content',
    contentHash: 'sha256:rhythm',
    truncated: false,
    sourcePath: null,
    charCount: 7,
  }
}
