import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentStore } from '../state/store.js'
import type { AgentCapabilitiesResponse, AgentRunPreview, PreviewRunInput } from '../state/types.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import { isoNow, makeId } from './runtimeIdentity.js'
import { buildRuntimeRunPreview } from './runtimeRunPreview.js'

export interface RuntimeRunPreviewBridge {
  previewRun: (input: PreviewRunInput) => Promise<AgentRunPreview>
}

export function createRuntimeRunPreviewBridge(input: {
  store: AgentStore
  mcpClient: Parameters<typeof buildRuntimeRunPreview>[0]['mcpClient']
  memoryManager: MemoryManager
  draftStore: AgentDraftStore
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  contractResolver: AgentRuntimeContractResolver
  updateState?: AgentCapabilitiesResponse['updates']
  previewRequest?: typeof buildRuntimeRunPreview
}): RuntimeRunPreviewBridge {
  const previewRequest = input.previewRequest ?? buildRuntimeRunPreview
  return {
    previewRun: (previewInput) => previewRequest({
      store: input.store,
      mcpClient: input.mcpClient,
      memoryManager: input.memoryManager,
      draftStore: input.draftStore,
      catalogSnapshot: input.catalogSnapshots.current,
      contractResolver: input.contractResolver,
      updateState: input.updateState,
      previewInput,
      makePreviewId: () => makeId('preview'),
      makeApprovalId: () => makeId('approval'),
      now: isoNow,
    }),
  }
}
