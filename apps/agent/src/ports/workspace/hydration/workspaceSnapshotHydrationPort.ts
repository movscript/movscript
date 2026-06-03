import type { AgentWorkspaceKind, AgentWorkspaceTarget } from '../../../workspaces/store/workspaceStore.js'
import type { JSONValue } from '../../../state/shared/types.js'

export interface WorkspaceWorkspaceSnapshotHydrationPort {
  openWorkspaceContent(input: {
    kind: AgentWorkspaceKind
    target?: AgentWorkspaceTarget
    seedMode?: 'empty' | 'snapshot' | 'editable_snapshot'
    include?: string[]
    signal?: AbortSignal
  }): Promise<{
    content: string
    seed?: JSONValue
    contract?: JSONValue
  }>
  hydrateProjectLayerSnapshotBase(input: {
    kind: AgentWorkspaceKind
    target?: AgentWorkspaceTarget
    signal?: AbortSignal
  }): Promise<{
    snapshotBase: Record<string, JSONValue>
    seed?: JSONValue
  }>
}
