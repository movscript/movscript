import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import {
  appendRunStep,
  appendTraceEvent,
  buildRunStep,
  buildRunTracePage,
  completeRunStep,
  normalizeTracePageLimit,
} from './runTrace.js'

test('buildRunStep creates in-progress step with round metadata', () => {
  const step = buildRunStep({
    id: 'step_1',
    runId: 'run_1',
    type: 'tool_call',
    toolName: 'movscript_read_project_scripts',
    createdAt: '2026-05-06T00:00:00.000Z',
    round: {
      roundId: 'round_1',
      roundIndex: 1,
      roundLabel: 'Model turn 1',
      roundSource: 'model',
    },
  })

  assert.equal(step.status, 'in_progress')
  assert.equal(step.roundId, 'round_1')
  assert.equal(step.roundSource, 'model')
  assert.equal(step.toolName, 'movscript_read_project_scripts')
})

test('appendRunStep appends the step and updates run timestamp', () => {
  const run = buildRun()
  const step = appendRunStep({
    id: 'step_1',
    run,
    runId: run.id,
    type: 'message',
    createdAt: '2026-05-06T00:00:01.000Z',
  })

  assert.equal(run.steps.length, 1)
  assert.equal(run.steps[0], step)
  assert.equal(run.updatedAt, '2026-05-06T00:00:01.000Z')
})

test('completeRunStep records terminal status, output, and timing', () => {
  const step = buildRunStep({
    id: 'step_1',
    runId: 'run_1',
    type: 'tool_call',
    createdAt: '2026-05-06T00:00:00.000Z',
  })

  completeRunStep(step, {
    completedAt: '2026-05-06T00:00:02.000Z',
    result: { ok: true },
    durationMs: 2000,
  })

  assert.equal(step.status, 'completed')
  assert.deepEqual(step.result, { ok: true })
  assert.equal(step.completedAt, '2026-05-06T00:00:02.000Z')
  assert.equal(step.durationMs, 2000)
})

test('completeRunStep drops invalid and negative durations', () => {
  const step = buildRunStep({
    id: 'step_1',
    runId: 'run_1',
    type: 'tool_call',
    createdAt: '2026-05-06T00:00:00.000Z',
  })

  completeRunStep(step, {
    completedAt: '2026-05-06T00:00:02.000Z',
    durationMs: -1,
  })

  assert.equal(step.durationMs, undefined)
})

test('completeRunStep marks errors as failed and keeps error data', () => {
  const step = buildRunStep({
    id: 'step_1',
    runId: 'run_1',
    type: 'tool_call',
    createdAt: '2026-05-06T00:00:00.000Z',
  })

  completeRunStep(step, {
    completedAt: '2026-05-06T00:00:02.000Z',
    error: 'tool failed',
    errorData: { code: 'bad_request' },
    sandboxed: true,
  })

  assert.equal(step.status, 'failed')
  assert.equal(step.error, 'tool failed')
  assert.deepEqual(step.errorData, { code: 'bad_request' })
  assert.equal(step.sandboxed, true)
})

test('appendTraceEvent builds sanitized trace data and updates run timestamp without mutating run trace list', () => {
  const run = buildRun()

  const event = appendTraceEvent({
    id: 'trace_1',
    run,
    now: '2026-05-06T00:00:01.000Z',
    kind: 'policy',
    title: 'Policy',
    status: 'completed',
    data: {
      keep: 'value',
      skip: undefined,
      nested: { value: 1, unsupported: Symbol('x') },
    },
  })

  assert.equal(run.traceEvents.length, 0)
  assert.equal(run.updatedAt, '2026-05-06T00:00:01.000Z')
  assert.equal(event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data.keep : undefined, 'value')
  assert.equal(event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? 'skip' in event.data : true, false)
  assert.deepEqual(event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data.nested : undefined, {
    value: 1,
    unsupported: 'Symbol(x)',
  })
})

test('appendTraceEvent records only non-negative trace durations', () => {
  const run = buildRun()

  const zeroDuration = appendTraceEvent({
    id: 'trace_1',
    run,
    now: '2026-05-06T00:00:01.000Z',
    kind: 'tool_call',
    title: 'Tool',
    status: 'completed',
    durationMs: 0,
  })
  const negativeDuration = appendTraceEvent({
    id: 'trace_2',
    run,
    now: '2026-05-06T00:00:02.000Z',
    kind: 'tool_call',
    title: 'Tool',
    status: 'completed',
    durationMs: -1,
  })

  assert.equal(zeroDuration.durationMs, 0)
  assert.equal(negativeDuration.durationMs, undefined)
})

test('appendTraceEvent bounds recursive trace data without throwing', () => {
  const run = buildRun()
  const circular: Record<string, unknown> = { name: 'root' }
  circular.self = circular
  let deep: Record<string, unknown> = { leaf: true }
  for (let index = 0; index < 24; index += 1) deep = { child: deep }
  const manyItems = Array.from({ length: 205 }, (_, index) => index)
  const longText = 'x'.repeat(200_010)

  const event = appendTraceEvent({
    id: 'trace_1',
    run,
    now: '2026-05-06T00:00:01.000Z',
    kind: 'error',
    title: 'Large trace data',
    status: 'failed',
    data: {
      circular,
      deep,
      manyItems,
      longText,
      nonFinite: Number.NaN,
      big: 123n,
    },
  })
  const data = event.data as Record<string, any>

  assert.equal(data.circular.self, '[Circular]')
  assert.match(JSON.stringify(data.deep), /max depth exceeded/)
  assert.equal(data.manyItems.length, 201)
  assert.match(data.manyItems.at(-1), /5 more items/)
  assert.match(data.longText, /truncated 10 chars/)
  assert.equal(data.nonFinite, 'NaN')
  assert.equal(data.big, '123')
})

test('appendTraceEvent stringifies non-plain trace data objects instead of dropping their shape', () => {
  const run = buildRun()

  const event = appendTraceEvent({
    id: 'trace_1',
    run,
    now: '2026-05-06T00:00:01.000Z',
    kind: 'error',
    title: 'Runtime object trace data',
    status: 'failed',
    data: {
      at: new Date('2026-01-01T00:00:00.000Z'),
      map: new Map([['status', 'queued']]),
    },
  })
  const data = event.data as Record<string, unknown>

  assert.match(String(data.at), /2026/)
  assert.equal(data.map, '[object Map]')
})

test('normalizeTracePageLimit clamps invalid and oversized page sizes', () => {
  assert.equal(normalizeTracePageLimit(undefined), 200)
  assert.equal(normalizeTracePageLimit(Number.NaN), 200)
  assert.equal(normalizeTracePageLimit(0), 1)
  assert.equal(normalizeTracePageLimit(2.8), 2)
  assert.equal(normalizeTracePageLimit(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER - 1)
})

test('buildRunTracePage slices one extra event into hasMore and nextCursor', () => {
  const first = traceEvent('trace_1')
  const second = traceEvent('trace_2')
  const third = traceEvent('trace_3')

  assert.deepEqual(buildRunTracePage({
    runId: 'run_1',
    eventsPlusOne: [first, second, third],
    limit: 2,
    total: 3,
  }), {
    runId: 'run_1',
    events: [first, second],
    total: 3,
    hasMore: true,
    nextCursor: 'trace_2',
  })

  assert.deepEqual(buildRunTracePage({
    runId: 'run_1',
    eventsPlusOne: [first],
    limit: 2,
    total: 1,
  }), {
    runId: 'run_1',
    events: [first],
    total: 1,
    hasMore: false,
  })
})

function buildRun() {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive' as const,
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    steps: [],
    traceEvents: [],
  }
}

function traceEvent(id: string) {
  return {
    id,
    runId: 'run_1',
    kind: 'run' as const,
    title: id,
    status: 'info' as const,
    createdAt: '2026-05-06T00:00:01.000Z',
  }
}
