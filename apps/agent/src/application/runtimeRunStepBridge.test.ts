import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import { createRuntimeRunStepBridge } from './runtimeRunStepBridge.js'

test('createRuntimeRunStepBridge creates persisted steps with runtime id and time sinks', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const snapshots: string[] = []
  const bridge = createRuntimeRunStepBridge({
    store,
    createStepId: () => 'step_bridge',
    now: () => '2026-01-01T00:00:01.000Z',
    emitRunSnapshot: (targetRun) => snapshots.push(`${targetRun.id}:${targetRun.steps.length}`),
  })

  const step = bridge.createStep(run, 'tool_call', {
    roundId: 'round_1',
    roundIndex: 1,
    roundLabel: 'Model',
    roundSource: 'model',
  }, 'tool_a')

  assert.equal(step.id, 'step_bridge')
  assert.equal(step.toolName, 'tool_a')
  assert.equal(store.getRun(run.id)?.steps[0]?.id, 'step_bridge')
  assert.deepEqual(snapshots, ['run_1:1'])
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
