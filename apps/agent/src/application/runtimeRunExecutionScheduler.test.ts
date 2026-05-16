import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import {
  applyRuntimeRunExecutionScheduleRequest,
  startRuntimeRunExecution,
} from './runtimeRunExecutionScheduler.js'

test('startRuntimeRunExecution creates a controller and runs settlement cleanup after execution', async () => {
  const controllers = new RuntimeRunControllerRegistry()
  const events: string[] = []
  let observedSignal: AbortSignal | undefined

  startRuntimeRunExecution({
    runId: 'run_1',
    controllers,
    executeRun: async (runId, signal) => {
      events.push(`execute:${runId}`)
      observedSignal = signal
    },
    onRunSettled: (runId) => events.push(`settled:${runId}`),
  })

  assert.equal(controllers.get('run_1')?.signal, observedSignal)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(controllers.get('run_1'), undefined)
  assert.deepEqual(events, ['execute:run_1', 'settled:run_1'])
})

test('startRuntimeRunExecution does not release a newer controller for the same run', async () => {
  const controllers = new RuntimeRunControllerRegistry()
  let finishExecution: (() => void) | undefined

  startRuntimeRunExecution({
    runId: 'run_1',
    controllers,
    executeRun: async () => {
      await new Promise<void>((resolve) => {
        finishExecution = resolve
      })
    },
    onRunSettled: () => {},
  })
  const first = controllers.get('run_1')
  const second = controllers.create('run_1')

  finishExecution?.()
  await Promise.resolve()
  await Promise.resolve()
  assert.notEqual(first, second)
  assert.equal(controllers.get('run_1'), second)
})

test('applyRuntimeRunExecutionScheduleRequest cleans catalog state before syncing task state', async () => {
  const controllers = new RuntimeRunControllerRegistry()
  const events: string[] = []

  applyRuntimeRunExecutionScheduleRequest({
    runId: 'run_1',
    controllers,
    executeRun: async (runId) => {
      events.push(`execute:${runId}`)
    },
    deleteCatalogSnapshot: (runId) => events.push(`catalog:${runId}`),
    syncTaskFromRun: (runId) => events.push(`sync:${runId}`),
  })

  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(events, ['execute:run_1', 'catalog:run_1', 'sync:run_1'])
})
