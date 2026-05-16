import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMemory } from '../memory/types.js'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentMessage, AgentRun } from '../state/types.js'
import { RuntimeDeferredTaskRegistry } from './runtimeDeferredTasks.js'
import { createRuntimePostRunRecordsBridge } from './runtimePostRunRecordsBridge.js'

const round = { roundId: 'round_1', roundIndex: 1, roundLabel: 'Final', roundSource: 'final' as const }

test('createRuntimePostRunRecordsBridge defers and flushes post-run records', async () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const traces: string[] = []
  const bridge = createRuntimePostRunRecordsBridge({
    store,
    memoryManager: {
      extractAndWriteMemories: () => [memory('memory_1')],
    },
    tasks: new RuntimeDeferredTaskRegistry(),
    recordTrace: (_run, trace) => traces.push(trace.title),
  })

  bridge.deferPostRunRecords(run.id, {
    round,
    userMessage: message(),
    projectId: 7,
    toolOutcomes: [],
    warnings: [],
  })
  await bridge.flush()

  assert.deepEqual(store.getRun(run.id)?.metadata?.writtenMemoryIds, ['memory_1'])
  assert.deepEqual(traces, ['Memories written'])
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
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
