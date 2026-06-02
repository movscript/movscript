import type { ApplyWorkspaceInput } from '../../../workspaces/apply/workspaceApply.js'
import type { AgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import type { JSONValue } from '../../../state/shared/types.js'

export interface WorkspaceApplyPort {
  apply(input: {
    workspaceStore: AgentWorkspaceStore
    applyInput: ApplyWorkspaceInput & {
      backendAuthToken?: unknown
      backendAPIBaseURL?: unknown
    }
    now: () => string
    appliedBy?: string
  }): Promise<JSONValue>
}
