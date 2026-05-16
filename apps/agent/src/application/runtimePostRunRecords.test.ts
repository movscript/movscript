import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMemory } from '../memory/types.js'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  ToolCallOutcome,
} from '../state/types.js'
import {
  deferRuntimePostRunRecords,
  type RuntimePostRunRecordsTraceInput,
} from './runtimePostRunRecords.js'

const round = { roundId: 'round_1', roundIndex: 1, roundLabel: 'Final', roundSource: 'final' as const }

test('deferRuntimePostRunRecords writes memories and rollback traces for completed runs', async () => {
  const store = new InMemoryAgentStore()
  const run = makeRun('completed')
  store.createRun(run)
  const traces: RuntimePostRunRecordsTraceInput[] = []
  const tracked: Promise<void>[] = []

  deferRuntimePostRunRecords({
    store,
    memoryManager: {
      extractAndWriteMemories: () => [memory('memory_1')],
    },
    tasks: {
      track: (task) => tracked.push(task),
    },
    runId: run.id,
    records: {
      round,
      userMessage: message(),
      projectId: 7,
      toolOutcomes: [rollbackOutcome('manual_compensation')],
      warnings: ['warning'],
    },
    defer: (callback) => callback(),
    recordTrace: (_run, trace) => traces.push(trace),
  })
  await Promise.all(tracked)

  assert.deepEqual(store.getRun(run.id)?.metadata?.writtenMemoryIds, ['memory_1'])
  assert.equal(traces[0]?.title, 'Memories written')
  assert.equal((traces[0]?.data as any)?.async, true)
  assert.equal(traces[1]?.title, 'Rollback policy recorded')
  assert.equal(traces[1]?.status, 'blocked')
  assert.equal(((traces[1]?.data as any)?.rollbackRecords as unknown[]).length, 1)
})

test('deferRuntimePostRunRecords skips non-terminal successful runs', async () => {
  const store = new InMemoryAgentStore()
  const run = makeRun('in_progress')
  store.createRun(run)
  const tracked: Promise<void>[] = []
  let memoryWrites = 0

  deferRuntimePostRunRecords({
    store,
    memoryManager: {
      extractAndWriteMemories: () => {
        memoryWrites += 1
        return [memory('memory_1')]
      },
    },
    tasks: {
      track: (task) => tracked.push(task),
    },
    runId: run.id,
    records: {
      round,
      userMessage: message(),
      projectId: 7,
      toolOutcomes: [rollbackOutcome('reversible')],
      warnings: [],
    },
    defer: (callback) => callback(),
    recordTrace: () => {},
  })
  await Promise.all(tracked)

  assert.equal(memoryWrites, 0)
  assert.equal(store.getRun(run.id)?.metadata?.writtenMemoryIds, undefined)
})

function makeRun(status: AgentRun['status']): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status,
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

function message(): AgentMessage {
  return {
    id: 'msg_user',
    threadId: 'thread_1',
    role: 'user',
    content: 'remember this',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function memory(id: string): AgentMemory {
  return {
    id,
    projectId: 7,
    title: 'Memory',
    kind: 'preference',
    content: 'Remember this',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function rollbackOutcome(policy: NonNullable<ToolCallOutcome['rollback']>['policy']): ToolCallOutcome {
  return {
    call: { name: 'tool_a' },
    result: { ok: true },
    rollback: {
      policy,
      reason: 'Side effect',
    },
  }
}
