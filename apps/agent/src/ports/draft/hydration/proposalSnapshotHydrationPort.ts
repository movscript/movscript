import type { AgentDraftKind, AgentDraftTarget } from '../../../drafts/store/draftStore.js'
import type { JSONValue } from '../../../state/shared/types.js'

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
