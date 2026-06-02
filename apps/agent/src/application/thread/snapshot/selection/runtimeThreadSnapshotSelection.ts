import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentRun, AgentThread } from '../../../../state/shared/types.js'
import { runtimeRunDisplaysOnThread, uniqueRuntimeRunsById } from '../../../run/view/visibility/runtimeRunVisibility.js'

export function selectRuntimeSnapshotRunsForThread(input: {
  thread: AgentThread
  store: Pick<AgentStore, 'listRuns'>
}): AgentRun[] {
  const { thread } = input
  const candidates = thread.sessionId
    ? input.store.listRuns({ sessionId: thread.sessionId })
    : input.store.listRuns({ threadId: thread.id })
  const visible = candidates.filter((run) => run.threadId === thread.id || runtimeRunDisplaysOnThread(run, thread.id))
  return uniqueRuntimeRunsById(visible)
}
