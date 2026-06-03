import type { MCPClient } from '../../../adapters/mcp/client/mcpClient.js'
import { GenerationJobWorkProvider } from '../../../runtime-work/providers/generationJobWorkProvider.js'
import { SubagentRunWorkProvider } from '../../../runtime-work/providers/subagentRunWorkProvider.js'
import { isTerminalRuntimeWorkStatus, type RuntimeWork } from '../../../runtime-work/core/runtimeWork.js'
import { RuntimeWorkManager } from '../../../runtime-work/manager/runtimeWorkManager.js'
import { AgentStoreRuntimeWorkStore } from '../../../runtime-work/store/runtimeWorkStore.js'
import type { AgentStore } from '../../../state/store/core/store.js'
import type { AgentRun, AgentThread, AgentTraceEvent, CancelRunInput, CreateRunInput, CreateThreadInput } from '../../../state/shared/types.js'
import { createRuntimeWorksBridge, type RuntimeWorksBridge } from '../bridge/runtimeWorksBridge.js'
import type { RuntimeScheduler } from '../scheduler/runtimeScheduler.js'
import { RuntimeWakeCoordinator, type RuntimeWakeResult } from '../wake/runtimeWakeCoordinator.js'
import { summarizeRuntimeWorkTrace } from '../../../trace/summaries/tool/call/toolTrace.js'

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
    const observed = await input.workManager.observe(work.id)
    const run = input.store.getRun(observed.runId)
    if (run) {
      input.recordTrace(run, {
        kind: 'tool_call',
        title: `Runtime work observed: ${observed.kind}`,
        summary: observed.externalHandle
          ? `${observed.externalHandle.type} ${String(observed.externalHandle.id)} is ${observed.status}.`
          : `Work ${observed.id} is ${observed.status}.`,
        status: observed.status === 'failed' ? 'failed' : observed.status === 'completed' ? 'completed' : 'info',
        toolName: 'core_work_wait',
        data: summarizeRuntimeWorkTrace({ toolName: 'core_work_wait', work: observed }),
      })
    }
    return observed
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
