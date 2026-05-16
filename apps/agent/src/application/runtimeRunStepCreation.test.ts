import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import {
  applyRuntimeRunStepCreationRequest,
  createRuntimeRunStep,
} from './runtimeRunStepCreation.js'

test('createRuntimeRunStep appends a step, persists the run, and emits a snapshot', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const snapshots: string[] = []

  const step = createRuntimeRunStep({
    store,
    run,
    stepId: 'step_1',
    type: 'tool_call',
    toolName: 'tool_a',
    round: { roundId: 'round_1', roundIndex: 1, roundLabel: 'Model', roundSource: 'model' },
    createdAt: '2026-01-01T00:00:01.000Z',
    emitRunSnapshot: (targetRun) => snapshots.push(`${targetRun.id}:${targetRun.steps.length}`),
  })

  assert.equal(step.id, 'step_1')
  assert.equal(step.toolName, 'tool_a')
  assert.equal(step.roundId, 'round_1')
  assert.equal(run.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.equal(store.getRun(run.id)?.steps.length, 1)
  assert.deepEqual(snapshots, ['run_1:1'])
})

test('applyRuntimeRunStepCreationRequest allocates step id and timestamp before persisting', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const snapshots: string[] = []

  const step = applyRuntimeRunStepCreationRequest({
    store,
    run,
    type: 'message',
    createStepId: () => 'step_request',
    now: () => '2026-01-01T00:00:02.000Z',
    emitRunSnapshot: (targetRun) => snapshots.push(`${targetRun.id}:${targetRun.updatedAt}`),
  })

  assert.equal(step.id, 'step_request')
  assert.equal(step.createdAt, '2026-01-01T00:00:02.000Z')
  assert.equal(store.getRun(run.id)?.steps[0]?.id, 'step_request')
  assert.deepEqual(snapshots, ['run_1:2026-01-01T00:00:02.000Z'])
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
