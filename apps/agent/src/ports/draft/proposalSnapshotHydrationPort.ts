import type { AgentDraftKind, AgentDraftTarget } from '../../drafts/draftStore.js'
import type { JSONValue } from '../../state/types.js'

export interface DraftProposalSnapshotHydrationPort {
  hydrateProjectLayerSnapshotBase(input: {
    kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>
    target?: AgentDraftTarget
    signal?: AbortSignal
  }): Promise<{
    snapshotBase: Record<string, JSONValue>
    seed?: JSONValue
  }>
}
