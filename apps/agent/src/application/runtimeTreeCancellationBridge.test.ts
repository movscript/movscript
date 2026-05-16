import test from 'node:test'
import assert from 'node:assert/strict'
import { createRuntimeTreeCancellationBridge } from './runtimeTreeCancellationBridge.js'

test('createRuntimeTreeCancellationBridge wires subtree and plan tree cancellation', () => {
  const calls: string[] = []
  const bridge = createRuntimeTreeCancellationBridge({
    store: { label: 'store' } as never,
    cancelRun: (runId, input) => {
      calls.push(`cancelRun:${runId}:${input?.reason ?? 'none'}`)
    },
    cancelSubtreeRequest: (input) => {
      calls.push(`subtree:${input.runId}:${input.reason}`)
      input.cancelRun('run_leaf', String(input.reason))
      return { cancelledRunIds: [input.runId, 'run_leaf'] }
    },
    cancelPlanTreeRequest: (input) => {
      calls.push(`planTree:${input.runId}`)
      return input.cancelSubtree('run_root')
    },
  })

  assert.deepEqual(bridge.cancelSubtree('run_parent', { reason: 'user' }), {
    cancelledRunIds: ['run_parent', 'run_leaf'],
  })
  assert.deepEqual(bridge.cancelPlanTree('run_planner', { reason: 'plan' }), {
    cancelledRunIds: ['run_root', 'run_leaf'],
  })
  assert.deepEqual(calls, [
    'subtree:run_parent:user',
    'cancelRun:run_leaf:user',
    'planTree:run_planner',
    'subtree:run_root:plan',
    'cancelRun:run_leaf:plan',
  ])
})
