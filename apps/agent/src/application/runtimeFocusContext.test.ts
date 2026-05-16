import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONValue } from '../types.js'
import type { AgentRun } from '../state/types.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import {
  resolveRuntimeFocusContext,
  type RuntimeFocusContextTraceInput,
} from './runtimeFocusContext.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }

test('resolveRuntimeFocusContext returns MCP focus result and timing on success', async () => {
  const run = makeRun()
  const traces: RuntimeFocusContextTraceInput[] = []
  const updated: string[] = []

  const result = await resolveRuntimeFocusContext({
    run,
    command: parseAgentCommand('hello'),
    setupRound,
    timestampMs: makeClock(1000, 1015),
    now: () => '2026-01-01T00:00:01.015Z',
    mcpClient: new FakeFocusClient({ snapshot: { route: { pathname: '/projects' } } }),
    recordTrace: (_run, trace) => traces.push(trace),
    updateRun: (targetRun) => updated.push(targetRun.id),
  })

  assert.deepEqual(result.contextResult, { snapshot: { route: { pathname: '/projects' } } })
  assert.equal(result.contextError, undefined)
  assert.equal(result.contextStartedAt, 1000)
  assert.equal(result.contextDurationMs, 15)
  assert.deepEqual(traces, [])
  assert.deepEqual(updated, [])
})

test('resolveRuntimeFocusContext records failed focus and rethrows for normal commands', async () => {
  const run = makeRun()
  const traces: RuntimeFocusContextTraceInput[] = []
  const updated: string[] = []

  await assert.rejects(
    resolveRuntimeFocusContext({
      run,
      command: parseAgentCommand('hello'),
      setupRound,
      timestampMs: makeClock(1000, 1025),
      now: () => '2026-01-01T00:00:01.025Z',
      mcpClient: new FakeFocusClient(undefined, new Error('mcp offline')),
      recordTrace: (_run, trace) => traces.push(trace),
      updateRun: (targetRun) => updated.push(targetRun.id),
    }),
    /mcp offline/,
  )

  assert.equal(traces[0]?.title, 'Focus failed')
  assert.equal(traces[0]?.status, 'failed')
  assert.equal((traces[0]?.data as any)?.fallback, 'none')
  assert.deepEqual(updated, ['run_1'])
})

test('resolveRuntimeFocusContext falls back to client input snapshot for local diagnostics', async () => {
  const run = makeRun()
  const traces: RuntimeFocusContextTraceInput[] = []

  const result = await resolveRuntimeFocusContext({
    run,
    command: parseAgentCommand('/context'),
    clientInput: {
      visibleMessage: '/context',
      attachments: [],
      uiSnapshot: {
        route: { pathname: '/agent/debug' },
        project: { id: 42, name: 'Fallback Project' },
      },
    },
    setupRound,
    timestampMs: makeClock(1000, 1030),
    now: () => '2026-01-01T00:00:01.030Z',
    mcpClient: new FakeFocusClient(undefined, new Error('mcp offline')),
    recordTrace: (_run, trace) => traces.push(trace),
    updateRun: () => {},
  })

  assert.equal(result.contextError, 'mcp offline')
  assert.equal(result.contextDurationMs, 30)
  assert.equal(traces[0]?.status, 'blocked')
  assert.equal((traces[0]?.data as any)?.fallback, 'client_input_snapshot')
  assert.match(JSON.stringify(result.contextResult), /Fallback Project/)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

function makeClock(...values: number[]): () => number {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

class FakeFocusClient {
  constructor(
    private readonly result?: JSONValue,
    private readonly error?: Error,
  ) {}

  async initialize(): Promise<void> {
    if (this.error) throw this.error
  }

  async callTool(): Promise<JSONValue> {
    if (this.error) throw this.error
    return this.result ?? {}
  }
}
