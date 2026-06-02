import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentRun, AgentThread, CreateRunInput, CreateThreadInput, CreateToolRunInput } from '../../../../state/shared/types.js'
import type { RuntimeRunAuthRegistry } from '../../auth/runAuth.js'
import type { RuntimeCatalogSnapshotRegistry } from '../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import {
  applyRuntimeCreateRunRequest,
  applyRuntimeCreateToolRunRequest,
} from '../request/runtimeRunCreation.js'
import type { RuntimeRunExecutionSchedulerBridge } from '../../execution/scheduler/bridge/runtimeRunExecutionSchedulerBridge.js'
import { prepareRuntimeRunThread } from '../thread/runtimeRunThread.js'
import { prepareRuntimeToolRunThread } from '../tool-thread/runtimeToolRunThread.js'
import { isoNow, makeId } from '../../../../shared/runtime/runtimeIdentity.js'

export interface RuntimeRunCreationBridge {
  createRun: (input: CreateRunInput) => AgentRun
  createToolRun: (input: CreateToolRunInput) => AgentRun
}

export function createRuntimeRunCreationBridge(input: {
  store: AgentStore
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  contractResolver: AgentRuntimeContractResolver
  runAuth: RuntimeRunAuthRegistry
  runExecutionScheduler: RuntimeRunExecutionSchedulerBridge
  createThread: (input?: CreateThreadInput) => AgentThread
  createRunRequest?: typeof applyRuntimeCreateRunRequest
  createToolRunRequest?: typeof applyRuntimeCreateToolRunRequest
}): RuntimeRunCreationBridge {
  const createRunRequest = input.createRunRequest ?? applyRuntimeCreateRunRequest
  const createToolRunRequest = input.createToolRunRequest ?? applyRuntimeCreateToolRunRequest

  return {
    createRun: (runInput) => {
      const { thread, clientInput } = prepareRuntimeRunThread({
        store: input.store,
        runInput,
      })
      const catalogSnapshot = input.catalogSnapshots.current
      return createRunRequest({
        runInput,
        thread,
        ...(clientInput ? { clientInput } : {}),
        catalogSnapshot,
        contractResolver: input.contractResolver,
        runId: makeId('run'),
        now: isoNow(),
        rememberCatalogRun: (runId, snapshot) => input.catalogSnapshots.rememberRun(runId, snapshot),
        rememberRunAuth: (runId, targetRunInput) => input.runAuth.remember(runId, targetRunInput),
        createRun: (targetRun) => input.store.createRun(targetRun),
        updateThread: (targetThread) => input.store.updateThread(targetThread),
        startRunExecution: (runId) => input.runExecutionScheduler.startRunExecution(runId),
      })
    },
    createToolRun: (runInput) => {
      const {
        thread,
        userMessage,
        clientInput,
        toolCall,
      } = prepareRuntimeToolRunThread({
        store: input.store,
        toolRunInput: runInput,
        createThread: (threadInput) => input.createThread(threadInput),
      })
      const catalogSnapshot = input.catalogSnapshots.current
      return createToolRunRequest({
        runInput,
        thread,
        userMessage,
        toolCall,
        ...(clientInput ? { clientInput } : {}),
        catalogSnapshot,
        contractResolver: input.contractResolver,
        runId: makeId('run'),
        now: isoNow(),
        rememberCatalogRun: (runId, snapshot) => input.catalogSnapshots.rememberRun(runId, snapshot),
        rememberRunAuth: (runId, targetRunInput) => input.runAuth.remember(runId, targetRunInput),
        createRun: (targetRun) => input.store.createRun(targetRun),
        updateThread: (targetThread) => input.store.updateThread(targetThread),
        startRunExecution: (runId) => input.runExecutionScheduler.startRunExecution(runId),
      })
    },
  }
}
