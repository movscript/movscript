import type { AgentWorkspaceKind, AgentWorkspaceTarget } from '../../../workspaces/store/workspaceStore.js'
import type { JSONValue } from '../../../state/shared/types.js'

export interface WorkspaceWorkspaceSnapshotHydrationPort {
  hydrateProjectLayerSnapshotBase(input: {
    kind: Extract<AgentWorkspaceKind, 'setting_workspace' | 'asset_workspace'>
    target?: AgentWorkspaceTarget
    signal?: AbortSignal
  }): Promise<{
    snapshotBase: Record<string, JSONValue>
    seed?: JSONValue
  }>
}
