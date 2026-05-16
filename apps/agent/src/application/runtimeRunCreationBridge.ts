import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentThread, CreateRunInput, CreateThreadInput, CreateToolRunInput } from '../state/types.js'
import type { RuntimeRunAuthRegistry } from './runAuth.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import {
  applyRuntimeCreateRunRequest,
  applyRuntimeCreateToolRunRequest,
} from './runtimeRunCreation.js'
import type { RuntimeRunExecutionSchedulerBridge } from './runtimeRunExecutionSchedulerBridge.js'
import { prepareRuntimeRunThread } from './runtimeRunThread.js'
import { prepareRuntimeToolRunThread } from './runtimeToolRunThread.js'
import { isoNow, makeId } from './runtimeIdentity.js'

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
