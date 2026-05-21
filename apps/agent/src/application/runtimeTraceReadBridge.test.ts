import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import { defaultRunPolicy } from '../state/runPolicy.js'
import type { AgentRun, AgentTraceEvent } from '../state/types.js'
import { createRuntimeTraceReadBridge } from './runtimeTraceReadBridge.js'

function testRun(id = 'run_1'): AgentRun {
  return {
    id,
    threadId: 'thread_1',
    status: 'completed',
    role: 'planner',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    policy: defaultRunPolicy(),
  }
}

function trace(id: string, kind: AgentTraceEvent['kind'], data?: AgentTraceEvent['data']): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind,
    title: id,
    status: 'completed',
    ...(data !== undefined ? { data } : {}),
    createdAt: `2026-01-01T00:00:0${id.at(-1)}.000Z`,
  }
}

test('createRuntimeTraceReadBridge reads trace events, pages, and summaries', () => {
  const store = new InMemoryAgentStore()
  const run = testRun()
  store.createRun(run)
  store.appendTraceEvent(trace('trace_1', 'context'))
  store.appendTraceEvent(trace('trace_2', 'tool_call'))
  store.appendTraceEvent(trace('trace_3', 'tool_call'))

  const bridge = createRuntimeTraceReadBridge({ store })

  assert.deepEqual(bridge.getRunTraceEvents(run.id, { kind: 'tool_call' }).map((event) => event.id), ['trace_2', 'trace_3'])

  const page = bridge.getRunTracePage(run.id, { limit: 2 })
  assert.deepEqual(page.events.map((event) => event.id), ['trace_1', 'trace_2'])
  assert.equal(page.total, 3)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextCursor, 'trace_2')

  const summary = bridge.getRunTraceSummary(run.id)
  assert.equal(summary.total, 3)
  assert.equal(summary.byKind.context, 1)
  assert.equal(summary.byKind.tool_call, 2)
  assert.equal(summary.latestEvent?.id, 'trace_3')

  const debugView = bridge.getRunTraceDebugView(run.id)
  assert.equal(debugView.schema, 'movscript.agent-trace-debug-view.v1')
  assert.equal(debugView.trace.loaded, 3)
  assert.equal(debugView.trace.hasMore, false)
  assert.equal(debugView.coverage.loadedLabel, '3 / 3')
  assert.equal(debugView.bundle.schema, 'movscript.agent-run-debug-bundle.v1')

  const ledger = bridge.getRunDebugLedger(run.id)
  assert.equal(ledger.schema, 'movscript.agent.run-debug-ledger.v1')
  assert.equal(ledger.runId, run.id)
  assert.ok(ledger.budget.estimatedChars <= ledger.budget.maxChars)

  store.appendTraceEvent(trace('trace_4', 'tool_call', {
    generation: {
      jobId: 50,
      jobType: 'image',
      providerName: 'Provider C',
      modelDisplay: 'Replay Model',
      status: 'succeeded',
      stage: 'completed',
      terminal: true,
      outputResourceId: 88,
      media: {
        ID: 88,
        owner_id: 1,
        type: 'image',
        name: 'result.png',
        url: '/api/v1/resources/88/file',
        size: 1234,
        mime_type: 'image/png',
      },
    },
  }))
  const generationView = bridge.getRunGenerationView(run.id)
  assert.equal(generationView.schema, 'movscript.agent-run-generation-view.v1')
  assert.equal(generationView.jobs[0]?.jobId, 50)
  assert.deepEqual(generationView.outputResourceIds, [88])
  assert.equal(generationView.outputResources[0]?.ID, 88)
  assert.equal(generationView.metadataByResourceId['88']?.modelDisplay, 'Replay Model')
})

test('createRuntimeTraceReadBridge exposes compact debug ledgers and evidence payloads', () => {
  const store = new InMemoryAgentStore()
  const run = testRun()
  store.createRun(run)
  store.appendTraceEvent(trace('trace_1', 'model_call', {
    phase: 'request',
    request: {
      body: {
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
  }))

  const bridge = createRuntimeTraceReadBridge({ store })
  const ledger = bridge.getRunDebugLedger(run.id)
  const evidenceRef = ledger.evidenceIndex.find((item) => item.kind === 'model_request')
  assert.equal(evidenceRef?.evidenceId, 'trace_1:model_request')
  assert.ok(JSON.stringify(ledger).length <= 32_000)

  const evidence = bridge.getRunDebugEvidence(run.id, evidenceRef!.evidenceId)
  assert.equal(evidence.schema, 'movscript.agent.run-debug-evidence.v1')
  assert.deepEqual(evidence.value, {
    model: 'gpt-test',
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.throws(() => bridge.getRunDebugEvidence(run.id, 'missing:model_request'), /debug evidence not found/)
})

test('createRuntimeTraceReadBridge validates run existence before reading traces', () => {
  const bridge = createRuntimeTraceReadBridge({ store: new InMemoryAgentStore() })

  assert.throws(() => bridge.getRunTraceEvents('missing'), /run not found: missing/)
  assert.throws(() => bridge.getRunTracePage('missing'), /run not found: missing/)
  assert.throws(() => bridge.getRunTraceSummary('missing'), /run not found: missing/)
  assert.throws(() => bridge.getRunTraceDebugView('missing'), /run not found: missing/)
  assert.throws(() => bridge.getRunDebugLedger('missing'), /run not found: missing/)
  assert.throws(() => bridge.getRunDebugEvidence('missing', 'trace:model_request'), /run not found: missing/)
  assert.throws(() => bridge.getRunGenerationView('missing'), /run not found: missing/)
})

test('createRuntimeTraceReadBridge delegates summaries to the store aggregate', () => {
  const run = testRun()
  const calls: string[] = []
  const bridge = createRuntimeTraceReadBridge({
    store: {
      getRun: (runId) => runId === run.id ? run : undefined,
      listRunTraceEvents: () => {
        throw new Error('summary should not list full trace events')
      },
      countRunTraceEvents: () => {
        throw new Error('summary should not count through page reads')
      },
      summarizeRunTraceEvents: (runId) => {
        calls.push(runId)
        return { runId, total: 2, byKind: { context: 1, tool_call: 1 }, latestEvent: trace('trace_2', 'tool_call') }
      },
      getRunDebugLedger: () => undefined,
    },
  })

  const summary = bridge.getRunTraceSummary(run.id)

  assert.deepEqual(calls, [run.id])
  assert.equal(summary.total, 2)
  assert.equal(summary.byKind.tool_call, 1)
  assert.equal(summary.latestEvent?.id, 'trace_2')
})
