import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import { completeRuntimeRunStep } from './runtimeRunStepCompletion.js'

test('completeRuntimeRunStep completes a step, updates the run, and emits a snapshot', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const snapshots: string[] = []

  const completed = completeRuntimeRunStep({
    store,
    run,
    stepId: 'step_1',
    result: { ok: true },
    completedAt: '2026-01-01T00:00:01.250Z',
    emitRunSnapshot: (targetRun) => snapshots.push(`${targetRun.id}:${targetRun.updatedAt}`),
  })

  assert.equal(completed, true)
  assert.equal(run.steps[0]?.status, 'completed')
  assert.deepEqual(run.steps[0]?.result, { ok: true })
  assert.equal(run.steps[0]?.durationMs, 1250)
  assert.equal(run.updatedAt, '2026-01-01T00:00:01.250Z')
  assert.deepEqual(snapshots, ['run_1:2026-01-01T00:00:01.250Z'])
})

test('completeRuntimeRunStep marks failed and sandboxed step details', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)

  const completed = completeRuntimeRunStep({
    store,
    run,
    stepId: 'step_1',
    error: 'boom',
    sandboxed: true,
    completedAt: '2026-01-01T00:00:01.000Z',
    emitRunSnapshot: () => {},
  })

  assert.equal(completed, true)
  assert.equal(run.steps[0]?.status, 'failed')
  assert.equal(run.steps[0]?.error, 'boom')
  assert.equal(run.steps[0]?.sandboxed, true)
})

test('completeRuntimeRunStep returns false without side effects when the step is missing', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const snapshots: string[] = []

  const completed = completeRuntimeRunStep({
    store,
    run,
    stepId: 'missing_step',
    completedAt: '2026-01-01T00:00:01.000Z',
    emitRunSnapshot: () => snapshots.push('snapshot'),
  })

  assert.equal(completed, false)
  assert.equal(run.steps[0]?.status, 'in_progress')
  assert.deepEqual(snapshots, [])
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
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'in_progress',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  }
}
