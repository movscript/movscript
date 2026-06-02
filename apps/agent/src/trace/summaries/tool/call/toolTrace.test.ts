import assert from 'node:assert/strict'
import test from 'node:test'
import { previewToolResultContextRefs } from '../../../../context/ledger/core/contextLedger.js'
import { refKey } from '../../../../context/ledger/retrieval/retrievedContextStore.js'
import {
  summarizeRuntimeWorkTrace,
  summarizeRuntimeWorkWaitTrace,
  summarizeToolCallTrace,
} from './toolTrace.js'

test('summarizeToolCallTrace hashes tool results without storing the full result payload', () => {
  const summary = summarizeToolCallTrace({
    call: { name: 'core_file_read', args: { ref: 'agent://workspace/workspace_1/content' } },
    source: 'runtime',
    result: { content: 'large content' },
    durationMs: 12,
  })

  assert.equal(summary.args, undefined)
  assert.match(String(summary.argsHash), /^sha256:/)
  assert.equal(summary.argsMode, 'summary')
  assert.equal(summary.toolName, 'core_file_read')
  assert.equal(summary.result, undefined)
  assert.match(String(summary.resultHash), /^sha256:/)
  assert.equal(summary.resultMode, 'summary')
  assert.equal(summary.resultChars, JSON.stringify({ content: 'large content' }).length)
  assert.equal(summary.source, 'runtime')
  assert.equal(summary.durationMs, 12)
  const contextRefs = summary.contextRefs as Array<Record<string, any>>
  assert.equal(contextRefs.length, 1)
  assert.equal(contextRefs[0]?.ref.type, 'tool_result')
  assert.equal(contextRefs[0]?.ref.hash, summary.resultHash)
})

test('summarizeToolCallTrace preserves generation event summaries for generation views', () => {
  const summary = summarizeToolCallTrace({
    call: { name: 'generation_job_create', args: { prompt: 'rain street' } },
    source: 'mcp',
    result: { status: 'queued', jobId: 123, terminal: false },
  })

  assert.equal(summary.result, undefined)
  assert.equal((summary.generation as Record<string, unknown> | undefined)?.jobId, 123)
  assert.equal((summary.generation as Record<string, unknown> | undefined)?.stage, 'created')
  assert.equal((summary.generation as Record<string, unknown> | undefined)?.terminal, false)
  const contextRefs = summary.contextRefs as Array<Record<string, any>>
  assert.equal(contextRefs[0]?.ref.type, 'generation_job')
  assert.equal(contextRefs[0]?.ref.id, '123')
})

test('summarizeToolCallTrace hashes error data without storing the full error payload', () => {
  const summary = summarizeToolCallTrace({
    call: { name: 'tool_a', args: { id: 1 } },
    error: 'failed',
    errorData: { debug: 'stack detail' },
  })

  assert.equal(summary.error, 'failed')
  assert.equal(summary.args, undefined)
  assert.match(String(summary.argsHash), /^sha256:/)
  assert.equal(summary.errorData, undefined)
  assert.match(String(summary.errorDataHash), /^sha256:/)
  assert.equal(summary.errorDataMode, 'summary')
  assert.equal(summary.contextRefs, undefined)
})

test('summarizeToolCallTrace uses the same context refs as the context ledger preview', () => {
  const call = { id: 'call_1', name: 'reference_search', args: { query: 'rhythm' } }
  const result = {
    results: [{
      id: 'storyboard.rhythm.basic',
      title: '分镜节奏基础',
      contentHash: 'sha256:rhythm',
    }],
  }
  const summary = summarizeToolCallTrace({ call, result })
  const contextRefs = summary.contextRefs as Array<Record<string, any>>

  assert.deepEqual(
    contextRefs.map((item) => item.key),
    previewToolResultContextRefs(call, result).map(refKey),
  )
})

test('summarizeRuntimeWorkTrace hashes work request and result payloads', () => {
  const summary = summarizeRuntimeWorkTrace({
    toolName: 'core_work_start',
    work: {
      id: 'work_1',
      runId: 'run_1',
      threadId: 'thread_1',
      kind: 'generation_job',
      mode: 'async',
      status: 'completed',
      request: { prompt: 'image prompt' },
      result: { status: 'succeeded', jobId: 123, terminal: true },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    },
  })
  const work = summary.runtimeWork as Record<string, unknown>

  assert.equal(work.id, 'work_1')
  assert.equal(work.result, undefined)
  assert.equal(work.resultMode, 'summary')
  assert.match(String(work.resultHash), /^sha256:/)
  assert.equal(work.request, undefined)
  assert.equal(work.requestMode, 'summary')
  assert.equal((summary.generation as Record<string, unknown> | undefined)?.jobId, 123)
})

test('summarizeRuntimeWorkWaitTrace summarizes waited work collections', () => {
  const summary = summarizeRuntimeWorkWaitTrace({
    status: 'completed',
    done: true,
    mode: 'all',
    workIds: ['work_1'],
    works: [{
      id: 'work_1',
      runId: 'run_1',
      threadId: 'thread_1',
      kind: 'generation_job',
      mode: 'async',
      status: 'completed',
      request: { prompt: 'image prompt' },
      result: { content: 'large' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    }],
    timeoutMs: 1000,
    message: 'done',
    completed: [{
      id: 'work_1',
      runId: 'run_1',
      threadId: 'thread_1',
      kind: 'generation_job',
      mode: 'async',
      status: 'completed',
      request: { prompt: 'image prompt' },
      result: { content: 'large' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    }],
    failed: [],
    cancelled: [],
    pending: [],
  })
  const wait = summary.runtimeWorkWait as Record<string, unknown>
  const completed = wait.completed as Array<Record<string, unknown>>

  assert.equal(wait.status, 'completed')
  assert.equal(completed[0]?.result, undefined)
  assert.equal(completed[0]?.resultMode, 'summary')
  assert.match(String(completed[0]?.resultHash), /^sha256:/)
})
