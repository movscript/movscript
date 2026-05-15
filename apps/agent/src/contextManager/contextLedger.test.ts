import assert from 'node:assert/strict'
import test from 'node:test'

import { recordToolResultInContextLedgerWithAudit } from './contextLedger.js'

test('context ledger audit reports duplicate retrieved refs while preserving first retrieval time', () => {
  const first = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'movscript_get_knowledge', args: { id: 'storyboard.rhythm.basic' } },
    result: knowledgeResult('分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-01T00:00:00.000Z',
  })
  const second = recordToolResultInContextLedgerWithAudit({
    ledger: first.ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'movscript_get_knowledge', args: { id: 'storyboard.rhythm.basic' } },
    result: knowledgeResult('新版分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-02T00:00:00.000Z',
  })

  assert.equal(first.dedupedRecords.length, 0)
  assert.equal(second.incomingCount, 1)
  assert.equal(second.dedupedRecords.length, 1)
  assert.equal(second.dedupedRecords[0]?.key, 'knowledge:storyboard.rhythm.basic:sha256:rhythm')
  assert.equal(second.dedupedRecords[0]?.existingRetrievedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(second.ledger.retrieved.length, 1)
  assert.equal(second.ledger.retrieved[0]?.title, '新版分镜节奏基础')
  assert.equal(second.ledger.retrieved[0]?.retrievedAt, '2026-01-01T00:00:00.000Z')
})

test('context ledger records search refs without charging retrieved body budget', () => {
  const search = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'movscript_search_knowledge', args: { query: '分镜' } },
    result: {
      results: [
        { id: 'storyboard.rhythm.basic', title: '分镜节奏基础', collectionId: 'movscript.knowledge.storyboard', contentHash: 'sha256:rhythm', charCount: 3000 },
        { id: 'storyboard.hook.basic', title: '钩子基础', collectionId: 'movscript.knowledge.storyboard', contentHash: 'sha256:hook', charCount: 2000 },
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
    call: { name: 'movscript_get_knowledge', args: { id: 'storyboard.rhythm.basic' } },
    result: knowledgeResult('分镜节奏基础'),
    source: 'runtime',
    now: '2026-01-01T00:00:01.000Z',
  })

  const rhythm = get.ledger.retrieved.find((record) => record.ref.id === 'storyboard.rhythm.basic')
  const hook = get.ledger.retrieved.find((record) => record.ref.id === 'storyboard.hook.basic')
  assert.equal(rhythm?.charCount, 7)
  assert.equal(hook?.charCount, 0)
})

test('context ledger records memory search refs separately from loaded memory body', () => {
  const search = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'movscript_search_memories', args: { projectId: 42, query: '偏好' } },
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
    call: { name: 'movscript_get_memory', args: { projectId: 42, id: 'memory_1' } },
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
    call: { name: 'movscript_read_project_scripts', args: { projectId: 42 } },
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

test('context ledger extracts refs from data-wrapped tool payloads', () => {
  const audit = recordToolResultInContextLedgerWithAudit({
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'catalog_1',
    call: { name: 'movscript_create_generation_job', args: {} },
    result: {
      data: {
        jobId: 99,
        status: 'queued',
        message: '生成任务已创建',
      },
    },
    source: 'mcp',
  })

  assert.equal(audit.ledger.retrieved[0]?.ref.type, 'generation_job')
  assert.equal(audit.ledger.retrieved[0]?.ref.id, '99')
})

function knowledgeResult(title: string) {
  return {
    id: 'storyboard.rhythm.basic',
    collectionId: 'movscript.knowledge.storyboard',
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
