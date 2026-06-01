import type { MCPClient } from '../mcpClient.js'
import { GenerationJobWorkProvider } from '../runtimeWork/providers/generationJobWorkProvider.js'
import { SubagentRunWorkProvider } from '../runtimeWork/providers/subagentRunWorkProvider.js'
import { isTerminalRuntimeWorkStatus, type RuntimeWork } from '../runtimeWork/runtimeWork.js'
import { RuntimeWorkManager } from '../runtimeWork/runtimeWorkManager.js'
import { AgentStoreRuntimeWorkStore } from '../runtimeWork/runtimeWorkStore.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentThread, AgentTraceEvent, CancelRunInput, CreateRunInput, CreateThreadInput } from '../state/types.js'
import { createRuntimeWorksBridge, type RuntimeWorksBridge } from './runtimeWorksBridge.js'
import type { RuntimeScheduler } from './runtimeScheduler.js'
import { RuntimeWakeCoordinator, type RuntimeWakeResult } from './runtimeWakeCoordinator.js'

export interface RuntimeWorkCoordinatorBridge {
  works: RuntimeWorksBridge
  threadOpened: (threadId: string) => Promise<RuntimeWork[]>
  runSettled: (runId: string) => Promise<RuntimeWakeResult>
}

export function createRuntimeWorkCoordinatorBridge(input: {
  store: AgentStore
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  scheduler: Pick<RuntimeScheduler, 'dispatch' | 'advanceThread'>
  createThread: (threadInput: CreateThreadInput) => AgentThread
  createRun: (runInput: CreateRunInput) => AgentRun
  cancelSubtree: (runId: string, input?: CancelRunInput) => { cancelledRunIds: string[] }
  recordTrace: (run: AgentRun, trace: {
    kind: AgentTraceEvent['kind']
    title: string
    summary?: string
    status: AgentTraceEvent['status']
    toolName?: string
    data?: unknown
  }) => void
  now: () => string
}): RuntimeWorkCoordinatorBridge {
  const workManager = new RuntimeWorkManager({
    store: new AgentStoreRuntimeWorkStore(input.store),
    providers: [
      new GenerationJobWorkProvider(input.mcpClient),
      new SubagentRunWorkProvider({
        createThread: input.createThread,
        createRun: input.createRun,
        getRun: (runId) => input.store.getRun(runId),
        listRuns: (query) => input.store.listRuns(query),
        cancelSubtree: input.cancelSubtree,
      }),
    ],
  })
  const wake = new RuntimeWakeCoordinator({
    store: input.store,
    scheduler: input.scheduler,
    observeWork: (work) => observeRuntimeWork({
      work,
      workManager,
      store: input.store,
      recordTrace: input.recordTrace,
    }),
    now: input.now,
  })
  void wake.drainQueued()
  return {
    works: createRuntimeWorksBridge({
      workManager,
      wake,
      recordTrace: input.recordTrace,
    }),
    threadOpened: (threadId) => wake.threadOpened(threadId),
    runSettled: (runId) => wake.runSettled(runId),
  }
}

async function observeRuntimeWork(input: {
  work: RuntimeWork
  workManager: RuntimeWorkManager
  store: Pick<AgentStore, 'getRun'>
  recordTrace: Parameters<typeof createRuntimeWorkCoordinatorBridge>[0]['recordTrace']
}): Promise<RuntimeWork | undefined> {
  const { work } = input
  if (isTerminalRuntimeWorkStatus(work.status)) return work
  try {
    return await input.workManager.observe(work.id)
  } catch (error) {
    const run = input.store.getRun(work.runId)
    if (run) {
      input.recordTrace(run, {
        kind: 'tool_call',
        title: `Runtime work observe failed: ${work.kind}`,
        summary: error instanceof Error ? error.message : String(error),
        status: 'failed',
        toolName: 'core_work_wait',
        data: { runtimeWorkId: work.id },
      })
    }
    return undefined
  }
}
