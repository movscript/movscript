import type { RunBackendAuth } from '../../../auth/runAuth.js'
import { resolveRunTitleUser } from '../../../input/execution/runExecutionInput.js'
import type { AgentRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from '../../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import type { AgentMessage, AgentRun, AgentThread } from '../../../../../state/shared/types.js'
import { requireRuntimeThread } from '../../../../shared/store/runtimeStoreLookup.js'

export interface RuntimeRunExecutionPreflight {
  run?: AgentRun
  thread?: AgentThread
  titleUser?: AgentMessage
  catalogSnapshot?: AgentRuntimeCatalogSnapshot
  skipped: boolean
}

export async function prepareRuntimeRunExecutionPreflight(input: {
  runId: string
  store: Pick<AgentStore, 'getRun' | 'getThread'>
  catalogSnapshots: Pick<RuntimeCatalogSnapshotRegistry, 'getForRun'>
  signal?: AbortSignal
  getAuth: (runId: string) => RunBackendAuth
  throwIfRunCancelled: (runId: string, signal?: AbortSignal) => void
  ensureThreadTitle: (
    thread: AgentThread,
    sourceUser: AgentMessage | undefined,
    auth: RunBackendAuth,
    signal: AbortSignal | undefined,
    runId: string,
  ) => Promise<void>
}): Promise<RuntimeRunExecutionPreflight> {
  const run = input.store.getRun(input.runId)
  if (!run) return { skipped: true }
  if (run.status === 'cancelled') return { run, skipped: true }

  input.throwIfRunCancelled(input.runId, input.signal)
  const thread = requireRuntimeThread(input.store, run.threadId)
  const titleUser = resolveRunTitleUser(run, thread)
  setTimeout(() => {
    void input.ensureThreadTitle(thread, titleUser, input.getAuth(run.id), input.signal, run.id)
      .catch(() => {
        // Title generation is auxiliary; never block or fail the run preflight.
      })
  }, 0)
  return {
    run,
    thread,
    ...(titleUser ? { titleUser } : {}),
    catalogSnapshot: input.catalogSnapshots.getForRun(input.runId),
    skipped: false,
  }
}
