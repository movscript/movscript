import { getMCPContextSnapshot } from '../context/store'
import type { AgentDraftKind } from '../../../src/shared/contracts/agentDraft'
import type { DraftSeedTargetIds } from './types'
import { numericValue } from './utils'

export interface DraftSeedHydrationTarget {
  projectId?: number
  targetIds: DraftSeedTargetIds
}

export function resolveDraftSeedHydrationTarget(kind: AgentDraftKind, target: Record<string, unknown>): DraftSeedHydrationTarget {
  return {
    projectId: numericValue(target.projectId)
      ?? (isProjectLayerDraftKind(kind) ? numericValue(target.entityId) : getMCPContextSnapshot().project?.id),
    targetIds: {
      entityId: numericValue(target.entityId),
      productionId: numericValue(target.productionId ?? target.production_id),
      segmentId: numericValue(target.segmentId ?? target.segment_id),
      sceneMomentId: numericValue(target.sceneMomentId ?? target.scene_moment_id),
      contentUnitId: numericValue(target.contentUnitId ?? target.content_unit_id),
    },
  }
}

function isProjectLayerDraftKind(kind: AgentDraftKind): boolean {
  return kind === 'setting_proposal' || kind === 'asset_proposal' || kind === 'project_standards_proposal'
}
