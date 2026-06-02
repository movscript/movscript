import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
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

test('file agent store persists debug ledgers in state and trace events in the file trace store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createRun({
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      role: 'planner',
      runtimeLimits: { approvalMode: 'interactive',
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

    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { traceEvents?: unknown[]; debugLedgers?: Array<{ runId: string; evidenceIndex: unknown[]; budget: { estimatedChars: number; maxChars: number } }> }
    assert.equal(persisted.traceEvents, undefined)
    assert.equal(persisted.debugLedgers?.[0]?.runId, 'run_1')
    assert.equal(persisted.debugLedgers?.[0]?.evidenceIndex.length, 1)
    assert.ok((persisted.debugLedgers?.[0]?.budget.estimatedChars ?? Number.POSITIVE_INFINITY) <= (persisted.debugLedgers?.[0]?.budget.maxChars ?? 0))
    assert.equal(existsSync(join(dir, 'traces', 'index.json')), true)
    assert.equal(existsSync(join(dir, 'traces', 'threads', 'thread_1', 'runs', 'run_1', 'events-000001.ndjson')), true)

    const restored = new FileAgentStore(statePath)
    assert.equal(restored.listRunTraceEvents('run_1')[0]?.id, 'trace_1')
    assert.equal(restored.getRunDebugLedger('run_1')?.evidenceIndex[0]?.evidenceId, 'trace_1:model_request')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store persists runtime wake events', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createRuntimeWakeEvent({
      id: 'wake_1',
      threadId: 'thread_1',
      runId: 'run_1',
      workId: 'work_1',
      kind: 'work.observed',
      status: 'queued',
      payload: { workId: 'work_1' },
      dedupeKey: 'work.observed:work_1:completed:2026-05-21T00:00:00.000Z',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
    })
    store.flush()

    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { runtimeWakeEvents: Array<{ id?: string; status?: string }> }
    assert.deepEqual(persisted.runtimeWakeEvents.map((event) => `${event.id}:${event.status}`), ['wake_1:queued'])

    const restored = new FileAgentStore(statePath)
    assert.equal(restored.getRuntimeWakeEvent('wake_1')?.dedupeKey, 'work.observed:work_1:completed:2026-05-21T00:00:00.000Z')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store compacts consumed runtime wake event payloads on load', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    writeFileSync(statePath, JSON.stringify({
      version: 6,
      sessions: [],
      threads: [],
      runs: [],
      plans: [],
      tasks: [],
      runtimeWorks: [],
      runtimeInteractions: [],
      runtimeContinuations: [],
      runtimeWakeEvents: [{
        id: 'wake_1',
        threadId: 'thread_1',
        runId: 'run_1',
        workId: 'work_1',
        kind: 'work.observed',
        status: 'consumed',
        payload: { work: { id: 'work_1', result: 'x'.repeat(100_000) } },
        dedupeKey: 'work.observed:work_1:completed:2026-05-21T00:00:00.000Z',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:01.000Z',
        consumedAt: '2026-05-21T00:00:01.000Z',
      }],
    }), 'utf8')

    const store = new FileAgentStore(statePath)

    assert.deepEqual(store.getRuntimeWakeEvent('wake_1')?.payload, {
      consumed: true,
      kind: 'work.observed',
      runId: 'run_1',
      workId: 'work_1',
    })
    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { runtimeWakeEvents?: Array<{ payload?: unknown }> }
    assert.deepEqual(persisted.runtimeWakeEvents?.[0]?.payload, {
      consumed: true,
      kind: 'work.observed',
      runId: 'run_1',
      workId: 'work_1',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store limits persisted runtime wake history while preserving queued events', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  const previousLimit = process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUNTIME_WAKE_EVENTS
  process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUNTIME_WAKE_EVENTS = '3'
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    for (let index = 1; index <= 5; index += 1) {
      store.createRuntimeWakeEvent({
        id: `wake_consumed_${index}`,
        threadId: 'thread_1',
        kind: 'thread.opened',
        status: 'consumed',
        payload: { threadId: 'thread_1' },
        dedupeKey: `thread.opened:thread_1:${index}`,
        createdAt: `2026-05-21T00:00:0${index}.000Z`,
        updatedAt: `2026-05-21T00:00:0${index}.000Z`,
        consumedAt: `2026-05-21T00:00:0${index}.000Z`,
      })
    }
    store.createRuntimeWakeEvent({
      id: 'wake_queued',
      threadId: 'thread_1',
      kind: 'thread.opened',
      status: 'queued',
      payload: { threadId: 'thread_1' },
      dedupeKey: 'thread.opened:thread_1',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
    })
    store.flush()

    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { runtimeWakeEvents?: Array<{ id?: string }> }
    assert.deepEqual(persisted.runtimeWakeEvents?.map((event) => event.id), [
      'wake_queued',
      'wake_consumed_4',
      'wake_consumed_5',
    ])

    const restored = new FileAgentStore(statePath)
    assert.deepEqual(restored.listRuntimeWakeEvents().map((event) => event.id), [
      'wake_queued',
      'wake_consumed_4',
      'wake_consumed_5',
    ])
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUNTIME_WAKE_EVENTS
    } else {
      process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUNTIME_WAKE_EVENTS = previousLimit
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store strips inactive runtime wake history before parsing oversized state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  const previousLimit = process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES
  process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES = '1'
  try {
    const statePath = join(dir, 'state.json')
    writeFileSync(statePath, JSON.stringify({
      version: 6,
      sessions: [],
      threads: [],
      runs: [],
      plans: [],
      tasks: [],
      runtimeWorks: [],
      runtimeInteractions: [],
      runtimeContinuations: [],
      runtimeWakeEvents: [{
        id: 'wake_1',
        threadId: 'thread_1',
        kind: 'thread.opened',
        status: 'consumed',
        payload: { threadId: 'thread_1', large: 'x'.repeat(10_000) },
        dedupeKey: 'thread.opened:thread_1',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:01.000Z',
        consumedAt: '2026-05-21T00:00:01.000Z',
      }],
    }), 'utf8')

    const store = new FileAgentStore(statePath)

    assert.deepEqual(store.listRuntimeWakeEvents(), [])
    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { runtimeWakeEvents?: unknown[] }
    assert.deepEqual(persisted.runtimeWakeEvents, [])
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES
    } else {
      process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES = previousLimit
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store compacts oversized state files on load', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  const previousLimit = process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES
  process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES = '1'
  try {
    const statePath = join(dir, 'state.json')
    writeFileSync(statePath, JSON.stringify({
      version: 6,
      threads: [],
      runs: [{
        id: 'run_1',
        threadId: 'thread_1',
        status: 'completed',
        runtimeLimits: { approvalMode: 'interactive',
          maxToolCalls: 20,
          maxIterations: 20,
          allowNetwork: false,
          allowFileBytes: false,
        },
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:01.000Z',
        steps: [],
      }],
      traceEvents: [{
        id: 'trace_1',
        runId: 'run_1',
        kind: 'model_call',
        title: 'Model HTTP response received',
        status: 'completed',
        createdAt: '2026-05-21T00:00:01.000Z',
        data: { response: { bodyText: 'x'.repeat(1000) } },
      }],
      debugLedgers: [{
        schema: 'movscript.agent.run-debug-ledger.v1',
        runId: 'run_1',
        generatedAt: '2026-05-21T00:00:01.000Z',
        budget: { maxChars: 32000, estimatedChars: 0, truncated: false },
        run: { status: 'completed', warnings: [] },
        context: { activeSkillIds: [], availableToolNames: [], droppedSummary: { count: 0, totalOriginalChars: 0, totalRenderedChars: 0, samples: [] }, layers: [] },
        modelCalls: [],
        toolCalls: [],
        decisions: [],
        attention: [],
        evidenceIndex: [],
      }],
    }), 'utf8')

    const store = new FileAgentStore(statePath)

    assert.equal(store.listRunTraceEvents('run_1').length, 0)
    assert.equal(store.getRunDebugLedger('run_1')?.run.status, 'completed')
    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { traceEvents?: unknown[] }
    assert.equal(persisted.traceEvents, undefined)
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES
    } else {
      process.env.MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES = previousLimit
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store stores oversized trace data as external trace blobs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  const previousLimit = process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_TRACE_EVENT_BYTES
  process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_TRACE_EVENT_BYTES = '1000'
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createRun({
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      role: 'planner',
      runtimeLimits: { approvalMode: 'interactive',
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
      title: 'Model HTTP response received',
      status: 'completed',
      createdAt: '2026-05-21T00:00:01.000Z',
      data: {
        phase: 'response',
        response: {
          status: 200,
          bodyText: 'x'.repeat(50_000),
          parsedBody: { usage: { input_tokens: 12, output_tokens: 34 } },
        },
        latencyMs: 123,
      },
    })
    store.flush()

    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { traceEvents?: unknown[] }
    assert.equal(persisted.traceEvents, undefined)

    const event = store.listRunTraceEvents('run_1')[0]
    const data = event?.data as Record<string, unknown> | undefined
    assert.equal(data?.persistedTraceTruncated, true)
    assert.equal((data?.response as { bodyText?: unknown } | undefined)?.bodyText, undefined)
    assert.equal((data?.response as { bodyTextChars?: unknown } | undefined)?.bodyTextChars, 50_000)
    assert.equal(typeof data?.dataRef, 'string')

    const blobPath = join(dir, 'traces', data?.dataRef as string)
    const blobData = JSON.parse(gunzipSync(readFileSync(blobPath)).toString('utf8')) as { response?: { bodyText?: string } }
    assert.equal(blobData.response?.bodyText?.length, 50_000)
    const restoredData = store.getRunTraceEventData('run_1', 'trace_1') as { response?: { bodyText?: string } } | undefined
    assert.equal(restoredData?.response?.bodyText?.length, 50_000)
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_TRACE_EVENT_BYTES
    } else {
      process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_TRACE_EVENT_BYTES = previousLimit
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file trace store rolls trace events into multiple chunk files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  const previousLimit = process.env.MOVSCRIPT_AGENT_TRACE_CHUNK_BYTES
  process.env.MOVSCRIPT_AGENT_TRACE_CHUNK_BYTES = '500'
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createRun({
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      role: 'planner',
      runtimeLimits: { approvalMode: 'interactive',
        maxToolCalls: 20,
        maxIterations: 20,
        allowNetwork: false,
        allowFileBytes: false,
      },
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      steps: [],
    })
    for (let index = 1; index <= 3; index += 1) {
      store.appendTraceEvent({
        id: `trace_${index}`,
        runId: 'run_1',
        kind: 'context',
        title: `Trace ${index}`,
        status: 'completed',
        summary: 'x'.repeat(300),
        createdAt: `2026-05-21T00:00:0${index}.000Z`,
      })
    }

    const index = JSON.parse(readFileSync(join(dir, 'traces', 'index.json'), 'utf8')) as {
      threads?: Record<string, { runIds?: string[] }>
      runs?: Record<string, { chunks?: string[]; threadId?: string }>
    }

    assert.ok((index.runs?.run_1?.chunks?.length ?? 0) > 1)
    assert.equal(index.runs?.run_1?.threadId, 'thread_1')
    assert.deepEqual(index.threads?.thread_1?.runIds, ['run_1'])
    assert.equal(index.runs?.run_1?.chunks?.every((chunk) => chunk.startsWith('threads/thread_1/runs/run_1/')), true)
    assert.deepEqual(store.listRunTraceEvents('run_1').map((event) => event.id), ['trace_1', 'trace_2', 'trace_3'])
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_TRACE_CHUNK_BYTES
    } else {
      process.env.MOVSCRIPT_AGENT_TRACE_CHUNK_BYTES = previousLimit
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file trace store preserves replacement semantics for repeated trace ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createRun({
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      role: 'planner',
      runtimeLimits: { approvalMode: 'interactive',
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
      kind: 'context',
      title: 'Initial trace',
      status: 'started',
      createdAt: '2026-05-21T00:00:01.000Z',
    })
    store.appendTraceEvent({
      id: 'trace_1',
      runId: 'run_1',
      kind: 'tool_call',
      title: 'Replacement trace',
      status: 'completed',
      createdAt: '2026-05-21T00:00:02.000Z',
    })

    const events = store.listRunTraceEvents('run_1')
    const summary = store.summarizeRunTraceEvents('run_1')

    assert.equal(events.length, 1)
    assert.equal(events[0]?.kind, 'tool_call')
    assert.equal(store.countRunTraceEvents('run_1'), 1)
    assert.equal(store.countRunTraceEvents('run_1', { kind: 'context' }), 0)
    assert.equal(summary.total, 1)
    assert.equal(summary.byKind.tool_call, 1)
    assert.equal(summary.latestEvent?.title, 'Replacement trace')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store deleteAllThreads removes persisted state and trace files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createThread({
      id: 'thread_1',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      messages: [],
    })
    store.createRun({
      id: 'run_1',
      threadId: 'thread_1',
      status: 'completed',
      role: 'planner',
      runtimeLimits: { approvalMode: 'interactive',
        maxToolCalls: 20,
        maxIterations: 20,
        allowNetwork: false,
        allowFileBytes: false,
      },
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:01.000Z',
      steps: [],
    })
    store.appendTraceEvent({
      id: 'trace_1',
      runId: 'run_1',
      kind: 'context',
      title: 'Trace',
      status: 'completed',
      createdAt: '2026-05-21T00:00:01.000Z',
    })
    store.flush()

    const traceRunDir = join(dir, 'traces', 'threads', 'thread_1', 'runs', 'run_1')
    assert.equal(existsSync(traceRunDir), true)

    const deletion = store.deleteAllThreads()
    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as { threads?: unknown[]; runs?: unknown[] }
    const index = JSON.parse(readFileSync(join(dir, 'traces', 'index.json'), 'utf8')) as { threads?: Record<string, unknown>; runs?: Record<string, unknown> }

    assert.equal(deletion.deleted, true)
    assert.deepEqual(deletion.deletedThreadIds, ['thread_1'])
    assert.deepEqual(deletion.deletedRunIds, ['run_1'])
    assert.deepEqual(persisted.threads, [])
    assert.deepEqual(persisted.runs, [])
    assert.deepEqual(index.threads, {})
    assert.deepEqual(index.runs, {})
    assert.equal(existsSync(traceRunDir), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store compacts oversized run step results and rollback records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  const previousStepLimit = process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES
  const previousRollbackLimit = process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES
  const previousRollbackRecordsLimit = process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS
  const previousRollbackRecordsBytesLimit = process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES
  process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES = '1000'
  process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES = '1000'
  process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS = '3'
  process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES = '3000'
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    store.createRun({
      id: 'run_1',
      threadId: 'thread_1',
      status: 'completed',
      role: 'planner',
      runtimeLimits: { approvalMode: 'interactive',
        maxToolCalls: 20,
        maxIterations: 20,
        allowNetwork: false,
        allowFileBytes: false,
      },
      metadata: {
        rollbackRecords: [{
          call: { name: 'draft_apply', args: {} },
          rollback: {
            policy: 'manual_compensation',
            reason: 'backend write',
            metadata: { result: { payload: 'r'.repeat(20_000) } },
          },
        }, ...Array.from({ length: 8 }, (_, index) => ({
          call: { id: `call_${index}`, name: 'draft_apply', args: { index } },
          rollback: {
            policy: 'manual_compensation',
            reason: `backend write ${index}`,
            metadata: { result: { payload: `small_${index}` } },
          },
        }))],
      },
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:01.000Z',
      steps: [{
        id: 'step_1',
        runId: 'run_1',
        type: 'tool_call',
        status: 'completed',
        toolName: 'movscript_script_locate',
        result: { payload: 'x'.repeat(20_000) },
        createdAt: '2026-05-21T00:00:00.000Z',
        completedAt: '2026-05-21T00:00:01.000Z',
      }],
    })
    store.flush()

    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as {
      runs?: Array<{
        metadata?: {
          rollbackRecords?: Array<{
            persistedRollbackRecordsTruncated?: unknown
            originalRollbackRecordCount?: unknown
            call?: { id?: unknown }
            rollback?: { reason?: unknown }
          }>
        }
        steps?: Array<{ result?: Record<string, unknown> }>
      }>
    }
    const run = persisted.runs?.[0]

    assert.equal(run?.steps?.[0]?.result?.persistedStepResultTruncated, true)
    assert.equal(run?.steps?.[0]?.result?.originalResultBytes, 20014)
    assert.equal(run?.metadata?.rollbackRecords?.[0]?.persistedRollbackRecordsTruncated, true)
    assert.equal(run?.metadata?.rollbackRecords?.[0]?.originalRollbackRecordCount, 9)
    assert.equal(run?.metadata?.rollbackRecords?.length, 4)
    assert.equal(run?.metadata?.rollbackRecords?.[1]?.call?.id, 'call_5')
    assert.equal(run?.metadata?.rollbackRecords?.[1]?.rollback?.reason, 'backend write 5')
  } finally {
    if (previousStepLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES
    } else {
      process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES = previousStepLimit
    }
    if (previousRollbackLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES
    } else {
      process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES = previousRollbackLimit
    }
    if (previousRollbackRecordsLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS
    } else {
      process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS = previousRollbackRecordsLimit
    }
    if (previousRollbackRecordsBytesLimit === undefined) {
      delete process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES
    } else {
      process.env.MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES = previousRollbackRecordsBytesLimit
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file agent store skips malformed persisted collections and entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    writeFileSync(statePath, JSON.stringify({
      version: 6,
      threads: 'bad',
      runs: ['bad-run'],
      plans: { id: 'task_graph_1' },
      tasks: null,
      traceEvents: ['bad-trace'],
    }), 'utf8')

    const store = new FileAgentStore(statePath)

    assert.deepEqual(store.listThreads(), [])
    assert.deepEqual(store.listRuns(), [])
    assert.deepEqual(store.listTaskGraphs(), [])
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
      version: 6,
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
