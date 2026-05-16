import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRun } from '../state/types.js'
import {
  resolveRuntimeMemoryContext,
  type RuntimeMemoryContextTraceInput,
} from './runtimeMemoryContext.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }

test('resolveRuntimeMemoryContext loads prompt-safe memory refs and emits a trace', () => {
  const run = makeRun()
  const traces: RuntimeMemoryContextTraceInput[] = []
  const loadedQueries: Array<{ projectId?: number; query?: string }> = []
  const result = resolveRuntimeMemoryContext({
    run,
    memoryManager: {
      loadRelevantMemories: (query) => {
        loadedQueries.push(query)
        return [memory('mem_1', 'fact'), memory('mem_2', 'preference')]
      },
    },
    projectId: 42,
    query: 'write script',
    setupRound,
    timestampMs: makeClock(1000, 1018),
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.deepEqual(loadedQueries, [{ projectId: 42, query: 'write script' }])
  assert.deepEqual(result.memories.map((item) => item.id), ['mem_1', 'mem_2'])
  assert.deepEqual(result.memories.map((item) => item.content), ['', ''])
  assert.equal(result.memoryStartedAt, 1000)
  assert.equal(result.memoryLoadedAt, 1018)
  assert.equal(result.memoryDurationMs, 18)
  assert.equal(traces[0]?.kind, 'memory')
  assert.equal(traces[0]?.title, 'Relevant memories loaded')
  assert.deepEqual((traces[0]?.data as any)?.memoryIds, ['mem_1', 'mem_2'])
  assert.deepEqual((traces[0]?.data as any)?.kinds, ['fact', 'preference'])
})

test('resolveRuntimeMemoryContext records an empty completed trace when no project memories are available', () => {
  const run = makeRun()
  const traces: RuntimeMemoryContextTraceInput[] = []
  const result = resolveRuntimeMemoryContext({
    run,
    memoryManager: {
      loadRelevantMemories: () => [],
    },
    query: 'hello',
    setupRound,
    timestampMs: makeClock(2000, 2000),
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.deepEqual(result.memories, [])
  assert.equal(result.memoryDurationMs, 0)
  assert.equal(traces[0]?.summary, '0 memory item(s) matched this run. (0ms)')
  assert.deepEqual((traces[0]?.data as any)?.memoryIds, [])
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

function memory(id: string, kind: AgentMemory['kind']): AgentMemory {
  return {
    id,
    projectId: 42,
    title: id,
    kind,
    content: `content for ${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeClock(...values: number[]): () => number {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}
