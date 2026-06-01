import type { AgentStore } from '../state/store.js'
import type { AgentTaskGraphSnapshot } from '../state/types.js'
import {
  buildRuntimeSessionSnapshotV1,
  buildRuntimeThreadSnapshotV2,
  type RuntimeSessionSnapshotV1,
  type RuntimeThreadSnapshotV2,
} from './runtimeThreadSnapshot.js'
import { selectRuntimeSnapshotRunsForThread } from './runtimeThreadSnapshotSelection.js'

export interface RuntimeSnapshotBridge {
  getThreadRuntimeSnapshot: (threadId: string) => Promise<RuntimeThreadSnapshotV2 | undefined>
  getSessionRuntimeSnapshot: (sessionId: string) => Promise<RuntimeSessionSnapshotV1 | undefined>
}

export function createRuntimeSnapshotBridge(input: {
  store: AgentStore
  reconcileThread: (threadId: string) => Promise<void>
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
}): RuntimeSnapshotBridge {
  return {
    getThreadRuntimeSnapshot: async (threadId) => {
      if (!input.store.getThread(threadId)) return undefined
      await input.reconcileThread(threadId)
      const thread = input.store.getThread(threadId)
      if (!thread) return undefined
      const runs = selectRuntimeSnapshotRunsForThread({
        thread,
        store: input.store,
      })
      const runIds = new Set(runs.map((run) => run.id))
      return buildRuntimeThreadSnapshotV2({
        thread,
        runs,
        works: input.store.listRuntimeWorks()
          .filter((work) => work.threadId === threadId || runIds.has(work.runId)),
        interactions: input.store.listRuntimeInteractions()
          .filter((interaction) => interaction.threadId === threadId
            || interaction.displayThreadId === threadId
            || interaction.displayAnchor?.threadId === threadId),
        continuations: input.store.listRuntimeContinuations()
          .filter((continuation) => continuation.threadId === threadId || runIds.has(continuation.runId)),
        wakeEvents: input.store.listRuntimeWakeEvents()
          .filter((event) => event.threadId === threadId || (event.runId ? runIds.has(event.runId) : false)),
      })
    },
    getSessionRuntimeSnapshot: async (sessionId) => {
      const session = input.store.getSession(sessionId)
      if (!session) return undefined
      const threads = input.store.listThreads().filter((thread) => thread.sessionId === sessionId)
      for (const thread of threads) await input.reconcileThread(thread.id)
      const refreshedThreads = input.store.listThreads().filter((thread) => thread.sessionId === sessionId)
      const threadIds = new Set(refreshedThreads.map((thread) => thread.id))
      const taskGraphSnapshots = input.store.listTaskGraphs()
        .filter((taskGraph) => taskGraph.sessionId === sessionId || threadIds.has(taskGraph.threadId))
        .map((taskGraph) => input.getTaskGraphSnapshot(taskGraph.id))
      const runs = input.store.listRuns({ sessionId })
      const runIds = new Set(runs.map((run) => run.id))
      const works = input.store.listRuntimeWorks({ sessionId })
      const interactions = input.store.listRuntimeInteractions()
        .filter((interaction) => threadIds.has(interaction.threadId) || runIds.has(interaction.runId))
      const continuations = input.store.listRuntimeContinuations()
        .filter((continuation) => threadIds.has(continuation.threadId) || runIds.has(continuation.runId))
      const wakeEvents = input.store.listRuntimeWakeEvents()
        .filter((event) => threadIds.has(event.threadId) || (event.runId ? runIds.has(event.runId) : false))
      return buildRuntimeSessionSnapshotV1({
        session,
        threads: refreshedThreads,
        taskGraphSnapshots,
        runs,
        works,
        interactions,
        continuations,
        wakeEvents,
      })
    },
  }
}
