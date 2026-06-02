import type { ApplyWorkspaceInput } from '../../../workspaces/apply/workspaceApply.js'
import type { AgentWorkspace, AgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import type { JSONValue } from '../../../shared/protocol/types.js'
import { isoNow } from '../../../shared/runtime/runtimeIdentity.js'
import {
  applyRuntimeWorkspaceFromUI,
  createRuntimeLocalWorkspace,
  getRuntimeWorkspace,
  listRuntimeWorkspaces,
  previewRuntimeWorkspaceApply,
  rejectRuntimeWorkspace,
  simulateRuntimeWorkspaceApply,
  updateRuntimeWorkspace,
} from '../operations/runtimeWorkspaceOperations.js'
import type { RuntimeWorkspaceBackendApplyPort } from '../../../ports/workspace/backend/runtimeWorkspaceBackendApplyPort.js'

export interface RuntimeWorkspaceOperationsBridge {
  listWorkspaces: (query?: Parameters<typeof listRuntimeWorkspaces>[0]['query']) => AgentWorkspace[]
  createLocalWorkspace: (input: Parameters<typeof createRuntimeLocalWorkspace>[0]['workspaceInput']) => AgentWorkspace
  getWorkspace: (id: string) => AgentWorkspace | undefined
  updateWorkspace: (input: Parameters<typeof updateRuntimeWorkspace>[0]['workspaceInput']) => AgentWorkspace
  previewApplyWorkspace: (input: ApplyWorkspaceInput) => JSONValue
  simulateApplyWorkspace: (input: ApplyWorkspaceInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }) => Promise<JSONValue>
  applyWorkspaceFromUI: (input: ApplyWorkspaceInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }) => Promise<JSONValue>
  rejectWorkspace: (input: { workspaceId?: unknown; reason?: unknown }) => AgentWorkspace
}

export function createRuntimeWorkspaceOperationsBridge(input: {
  workspaceStore: AgentWorkspaceStore
  backendApplyPort: RuntimeWorkspaceBackendApplyPort
  now?: () => string
}): RuntimeWorkspaceOperationsBridge {
  const now = input.now ?? isoNow
  return {
    listWorkspaces: (query = {}) => listRuntimeWorkspaces({ workspaceStore: input.workspaceStore, query }),
    createLocalWorkspace: (workspaceInput) => createRuntimeLocalWorkspace({ workspaceStore: input.workspaceStore, workspaceInput }),
    getWorkspace: (workspaceId) => getRuntimeWorkspace({ workspaceStore: input.workspaceStore, workspaceId }),
    updateWorkspace: (workspaceInput) => updateRuntimeWorkspace({ workspaceStore: input.workspaceStore, workspaceInput }),
    previewApplyWorkspace: (applyInput) => previewRuntimeWorkspaceApply({ workspaceStore: input.workspaceStore, applyInput }),
    simulateApplyWorkspace: (applyInput) => simulateRuntimeWorkspaceApply({
      workspaceStore: input.workspaceStore,
      backendApplyPort: input.backendApplyPort,
      applyInput,
    }),
    applyWorkspaceFromUI: (applyInput) => applyRuntimeWorkspaceFromUI({
      workspaceStore: input.workspaceStore,
      backendApplyPort: input.backendApplyPort,
      applyInput,
      now,
    }),
    rejectWorkspace: (request) => rejectRuntimeWorkspace({
      workspaceStore: input.workspaceStore,
      workspaceId: request.workspaceId,
      reason: request.reason,
    }),
  }
}
