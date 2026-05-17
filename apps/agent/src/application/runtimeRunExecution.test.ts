import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRun } from '../state/types.js'
import { executeRuntimeRun, type RuntimeRunExecutionDependencies } from './runtimeRunExecution.js'

test('executeRuntimeRun returns without side effects when the run is missing', async () => {
  const calls: string[] = []

  await executeRuntimeRun({
    ...makeExecutionDependencies(calls),
    runId: 'missing_run',
  })

  assert.deepEqual(calls, ['getRun:missing_run'])
})

test('executeRuntimeRun returns without side effects when the run is already cancelled', async () => {
  const calls: string[] = []
  const run: AgentRun = {
    id: 'run_cancelled',
    threadId: 'thread_1',
    status: 'cancelled',
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

  await executeRuntimeRun({
    ...makeExecutionDependencies(calls, run),
    runId: run.id,
  })

  assert.deepEqual(calls, [`getRun:${run.id}`])
})

function makeExecutionDependencies(calls: string[], run?: AgentRun): RuntimeRunExecutionDependencies {
  return {
    store: {
      getRun(id: string) {
        calls.push(`getRun:${id}`)
        return id === run?.id ? run : undefined
      },
    },
    catalogSnapshots: failOnUse('catalogSnapshots'),
    runAuth: failOnUse('runAuth'),
    runCancellationGuard: failOnUse('runCancellationGuard'),
    runCancellation: failOnUse('runCancellation'),
    streams: failOnUse('streams'),
    runSteps: failOnUse('runSteps'),
    postRunRecords: failOnUse('postRunRecords'),
    mcpClient: failOnUse('mcpClient'),
    draftStore: failOnUse('draftStore'),
    backendApplyClient: failOnUse('backendApplyClient'),
    memoryStore: failOnUse('memoryStore'),
    memoryManager: failOnUse('memoryManager'),
    knowledgeManager: failOnUse('knowledgeManager'),
    contractResolver: failOnUse('contractResolver'),
    catalogManager: failOnUse('catalogManager'),
  } as unknown as RuntimeRunExecutionDependencies
}

function failOnUse(label: string): unknown {
  return new Proxy({}, {
    get(_target, property) {
      throw new Error(`${label}.${String(property)} should not be used`)
    },
  })
}
