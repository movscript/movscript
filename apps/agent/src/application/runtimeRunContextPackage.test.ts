import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONValue } from '../types.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRun, AgentThread } from '../state/types.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import {
  resolveRuntimeRunContextPackage,
  type RuntimeRunContextPackageTraceInput,
} from './runtimeRunContextPackage.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }

test('resolveRuntimeRunContextPackage extracts project context and skips memories for ordinary requests', async () => {
  const run = makeRun()
  const thread = makeThread()
  const traces: RuntimeRunContextPackageTraceInput[] = []
  const updatedThreads: AgentThread[] = []
  const updatedRuns: AgentRun[] = []
  const loadedQueries: Array<{ projectId?: number; query?: string }> = []

  const result = await resolveRuntimeRunContextPackage({
    store: {
      updateRun: (targetRun) => updatedRuns.push({ ...targetRun }),
      updateThread: (targetThread) => updatedThreads.push({ ...targetThread }),
    },
    run,
    thread,
    command: parseAgentCommand('write a scene'),
    userMessage: 'write a scene',
    setupRound,
    timestampMs: makeClock(1000, 1015, 1020, 1028, 1031),
    now: () => '2026-01-01T00:00:01.015Z',
    mcpClient: new FakeFocusClient({
      data: {
        snapshot: {
          project: { id: 42 },
          productionId: 7,
        },
        timings: { totalMs: 8 },
      },
    }),
    memoryManager: {
      loadRelevantMemories: (query) => {
        loadedQueries.push(query)
        return [memory('mem_1', 'fact')]
      },
    },
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.context.currentProjectId, 42)
  assert.equal(result.context.currentProductionId, 7)
  assert.deepEqual(result.focusTimings, { totalMs: 8, focusMs: 8 })
  assert.equal(thread.projectId, 42)
  assert.deepEqual(updatedThreads.map((item) => item.projectId), [42])
  assert.deepEqual(loadedQueries, [])
  assert.deepEqual(result.memories, [])
  assert.equal(result.memoryDurationMs, 0)
  assert.equal(result.contextCompletedAt, 1028)
  assert.deepEqual(traces, [])
  assert.deepEqual(updatedRuns, [])
})

test('resolveRuntimeRunContextPackage loads scoped memories for memory-related requests', async () => {
  const run = makeRun()
  const thread = makeThread()
  const traces: RuntimeRunContextPackageTraceInput[] = []
  const loadedQueries: Array<{ projectId?: number; query?: string }> = []

  const result = await resolveRuntimeRunContextPackage({
    store: {
      updateRun: () => {},
      updateThread: () => {},
    },
    run,
    thread,
    command: parseAgentCommand('参考上次的偏好写一段'),
    userMessage: '参考上次的偏好写一段',
    setupRound,
    timestampMs: makeClock(1100, 1115, 1120, 1128, 1131),
    now: () => '2026-01-01T00:00:01.115Z',
    mcpClient: new FakeFocusClient({
      data: {
        snapshot: {
          project: { id: 42 },
        },
      },
    }),
    memoryManager: {
      loadRelevantMemories: (query) => {
        loadedQueries.push(query)
        return [memory('mem_1', 'preference')]
      },
    },
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.deepEqual(loadedQueries, [{ projectId: 42, query: '参考上次的偏好写一段' }])
  assert.deepEqual(result.memories.map((item) => item.id), ['mem_1'])
  assert.equal(result.memoryDurationMs, 8)
  assert.equal(result.contextCompletedAt, 1131)
  assert.equal(traces[0]?.title, 'Relevant memories loaded')
})

test('resolveRuntimeRunContextPackage keeps thread project unchanged when focus has no project id', async () => {
  const run = makeRun()
  const thread = makeThread()
  const updatedThreads: AgentThread[] = []
  const loadedQueries: Array<{ projectId?: number; query?: string }> = []

  const result = await resolveRuntimeRunContextPackage({
    store: {
      updateRun: () => {},
      updateThread: (targetThread) => updatedThreads.push({ ...targetThread }),
    },
    run,
    thread,
    command: parseAgentCommand('hello'),
    userMessage: 'hello',
    setupRound,
    timestampMs: makeClock(2000, 2003, 2005, 2005, 2005),
    now: () => '2026-01-01T00:00:02.003Z',
    mcpClient: new FakeFocusClient({ data: { snapshot: { route: { pathname: '/agent' } } } }),
    memoryManager: {
      loadRelevantMemories: (query) => {
        loadedQueries.push(query)
        return []
      },
    },
    recordTrace: () => {},
  })

  assert.equal(result.context.currentProjectId, undefined)
  assert.equal(thread.projectId, undefined)
  assert.deepEqual(updatedThreads, [])
  assert.deepEqual(loadedQueries, [])
})

test('resolveRuntimeRunContextPackage ignores invalid focus project ids at the package boundary', async () => {
  const run = makeRun()
  const thread = makeThread()
  const updatedThreads: AgentThread[] = []
  const loadedQueries: Array<{ projectId?: number; query?: string }> = []

  const result = await resolveRuntimeRunContextPackage({
    store: {
      updateRun: () => {},
      updateThread: (targetThread) => updatedThreads.push({ ...targetThread }),
    },
    run,
    thread,
    command: parseAgentCommand('memory scope check'),
    userMessage: 'memory scope check',
    setupRound,
    timestampMs: makeClock(3000, 3001, 3002, 3003),
    now: () => '2026-01-01T00:00:03.001Z',
    mcpClient: new FakeFocusClient({ data: { snapshot: { project: { id: 42.5 } } } }),
    memoryManager: {
      loadRelevantMemories: (query) => {
        loadedQueries.push(query)
        return []
      },
    },
    recordTrace: () => {},
  })

  assert.equal(result.context.currentProjectId, undefined)
  assert.equal(thread.projectId, undefined)
  assert.deepEqual(updatedThreads, [])
  assert.deepEqual(loadedQueries, [{ query: 'memory scope check' }])
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

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

class FakeFocusClient {
  constructor(private readonly result: JSONValue) {}

  async initialize(): Promise<void> {}

  async callTool(): Promise<JSONValue> {
    return this.result
  }
}
