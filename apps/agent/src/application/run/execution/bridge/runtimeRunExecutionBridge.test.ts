import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createRuntimeRunExecutionBridge,
} from './runtimeRunExecutionBridge.js'
import type {
  executeRuntimeRun,
  RuntimeRunExecutionDependencies,
} from '../core/runtimeRunExecution.js'

test('createRuntimeRunExecutionBridge binds runtime execution dependencies', async () => {
  const signal = new AbortController().signal
  const dependencies = {
    store: { label: 'store' },
    catalogSnapshots: { label: 'catalogSnapshots' },
    runAuth: { label: 'runAuth' },
    runCancellationGuard: { label: 'runCancellationGuard' },
    runCancellation: { label: 'runCancellation' },
    streams: { label: 'streams' },
    runSteps: { label: 'runSteps' },
    postRunRecords: { label: 'postRunRecords' },
    mcpClient: { label: 'mcpClient' },
    workspaceStore: { label: 'workspaceStore' },
    externalToolGatewayPort: { label: 'externalToolGatewayPort' },
    memoryStore: { label: 'memoryStore' },
    memoryManager: { label: 'memoryManager' },
    referenceManager: { label: 'referenceManager' },
    contractResolver: { label: 'contractResolver' },
    catalogManager: { label: 'catalogManager' },
    updateState: { label: 'updateState' },
  } as unknown as RuntimeRunExecutionDependencies
  let captured: Parameters<typeof executeRuntimeRun>[0] | undefined
  const bridge = createRuntimeRunExecutionBridge({
    ...dependencies,
    executeRun: async (input) => {
      captured = input
    },
  })

  await bridge.executeRun('run_1', signal)

  assert.equal(captured?.runId, 'run_1')
  assert.equal(captured?.signal, signal)
  assert.equal(captured?.store, dependencies.store)
  assert.equal(captured?.catalogSnapshots, dependencies.catalogSnapshots)
  assert.equal(captured?.runAuth, dependencies.runAuth)
  assert.equal(captured?.runCancellationGuard, dependencies.runCancellationGuard)
  assert.equal(captured?.runCancellation, dependencies.runCancellation)
  assert.equal(captured?.streams, dependencies.streams)
  assert.equal(captured?.runSteps, dependencies.runSteps)
  assert.equal(captured?.postRunRecords, dependencies.postRunRecords)
  assert.equal(captured?.mcpClient, dependencies.mcpClient)
  assert.equal(captured?.workspaceStore, dependencies.workspaceStore)
  assert.equal(captured?.externalToolGatewayPort, dependencies.externalToolGatewayPort)
  assert.equal(captured?.memoryStore, dependencies.memoryStore)
  assert.equal(captured?.memoryManager, dependencies.memoryManager)
  assert.equal(captured?.referenceManager, dependencies.referenceManager)
  assert.equal(captured?.contractResolver, dependencies.contractResolver)
  assert.equal(captured?.catalogManager, dependencies.catalogManager)
  assert.equal(captured?.updateState, dependencies.updateState)
})
