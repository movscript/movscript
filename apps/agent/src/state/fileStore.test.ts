import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileAgentStore } from './fileStore.js'

test('file agent store ignores corrupt or non-object state files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    writeFileSync(statePath, '{not-json', 'utf8')
    const corruptStore = new FileAgentStore(statePath)
    assert.deepEqual(corruptStore.listThreads(), [])
    assert.deepEqual(corruptStore.listRuns(), [])

    writeFileSync(statePath, '["thread_1"]', 'utf8')
    const nonObjectStore = new FileAgentStore(statePath)
    assert.deepEqual(nonObjectStore.listThreads(), [])
    assert.deepEqual(nonObjectStore.listRuns(), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store persists compact debug ledgers next to trace events', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createRun({
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      role: 'planner',
      policy: {
        approvalMode: 'interactive',
        maxToolCalls: 20,
        maxIterations: 20,
        allowNetwork: false,
        allowFileBytes: false,
      },
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      steps: [],
    })
    store.appendTraceEvent({
      id: 'trace_1',
      runId: 'run_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      status: 'started',
      createdAt: '2026-05-21T00:00:01.000Z',
      data: {
        phase: 'request',
        request: { body: { model: 'gpt-test', messages: [{ role: 'user', content: 'hello' }] } },
      },
    })
    store.flush()

    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { debugLedgers?: Array<{ runId: string; evidenceIndex: unknown[]; budget: { estimatedChars: number; maxChars: number } }> }
    assert.equal(persisted.debugLedgers?.[0]?.runId, 'run_1')
    assert.equal(persisted.debugLedgers?.[0]?.evidenceIndex.length, 1)
    assert.ok((persisted.debugLedgers?.[0]?.budget.estimatedChars ?? Number.POSITIVE_INFINITY) <= (persisted.debugLedgers?.[0]?.budget.maxChars ?? 0))

    const restored = new FileAgentStore(statePath)
    assert.equal(restored.getRunDebugLedger('run_1')?.evidenceIndex[0]?.evidenceId, 'trace_1:model_request')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store skips malformed persisted collections and entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    writeFileSync(statePath, JSON.stringify({
      version: 3,
      threads: 'bad',
      runs: ['bad-run'],
      plans: { id: 'plan_1' },
      tasks: null,
      traceEvents: ['bad-trace'],
    }), 'utf8')

    const store = new FileAgentStore(statePath)

    assert.deepEqual(store.listThreads(), [])
    assert.deepEqual(store.listRuns(), [])
    assert.deepEqual(store.listPlans(), [])
    assert.deepEqual(store.listTasks(), [])
    assert.deepEqual(store.listRunTraceEvents('run_1'), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store drops invalid persisted thread project ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    writeFileSync(statePath, JSON.stringify({
      version: 3,
      threads: [
        {
          id: 'thread_valid',
          projectId: 42,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          messages: [],
        },
        {
          id: 'thread_invalid',
          projectId: 42.5,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          messages: [],
        },
      ],
      runs: [],
    }), 'utf8')

    const store = new FileAgentStore(statePath)

    assert.equal(store.getThread('thread_valid')?.projectId, 42)
    assert.equal(store.getThread('thread_invalid')?.projectId, undefined)
    assert.equal(store.listThreadSummaries().find((thread) => thread.id === 'thread_invalid')?.projectId, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
