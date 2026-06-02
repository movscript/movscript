import type { AgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import type { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentCapabilitiesResponse, AgentRunPreview, PreviewRunInput } from '../../../../state/shared/types.js'
import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { RuntimeCatalogSnapshotRegistry } from '../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { isoNow, makeId } from '../../../../shared/runtime/runtimeIdentity.js'
import { buildRuntimeRunPreview } from '../core/runtimeRunPreview.js'

export interface RuntimeRunPreviewBridge {
  previewRun: (input: PreviewRunInput) => Promise<AgentRunPreview>
}

export function createRuntimeRunPreviewBridge(input: {
  store: AgentStore
  mcpClient: Parameters<typeof buildRuntimeRunPreview>[0]['mcpClient']
  memoryManager: MemoryManager
  workspaceStore: AgentWorkspaceStore
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
      workspaceStore: input.workspaceStore,
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
