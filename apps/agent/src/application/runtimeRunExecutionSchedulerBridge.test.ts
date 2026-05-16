import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import { createRuntimeRunExecutionSchedulerBridge } from './runtimeRunExecutionSchedulerBridge.js'

test('createRuntimeRunExecutionSchedulerBridge wires execution scheduling and settlement cleanup', async () => {
  const controllers = new RuntimeRunControllerRegistry()
  const events: string[] = []
  const bridge = createRuntimeRunExecutionSchedulerBridge({
    controllers,
    executeRun: async (runId) => {
      events.push(`execute:${runId}`)
    },
    deleteCatalogSnapshot: (runId) => events.push(`catalog:${runId}`),
    syncTaskFromRun: (runId) => events.push(`sync:${runId}`),
  })

  bridge.startRunExecution('run_1')

  await Promise.resolve()
  await Promise.resolve()
  assert.equal(controllers.get('run_1'), undefined)
  assert.deepEqual(events, ['execute:run_1', 'catalog:run_1', 'sync:run_1'])
})
