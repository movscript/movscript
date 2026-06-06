import { getMCPContextSnapshot } from '../context/store'
import type { MovScriptWorkspaceKind } from '../../../src/shared/contracts/movscriptWorkspace'
import type { WorkspaceSeedTargetIds } from './types'
import { numericValue } from './utils'

export interface WorkspaceSeedHydrationTarget {
  projectId?: number
  targetIds: WorkspaceSeedTargetIds
}

export function resolveWorkspaceSeedHydrationTarget(kind: MovScriptWorkspaceKind, target: Record<string, unknown>): WorkspaceSeedHydrationTarget {
  return {
    projectId: numericValue(target.projectId)
      ?? (isProjectLayerWorkspaceKind(kind) ? numericValue(target.entityId) : getMCPContextSnapshot().project?.id),
    targetIds: {
      entityId: numericValue(target.entityId),
      productionId: numericValue(target.productionId ?? target.production_id),
      segmentId: numericValue(target.segmentId ?? target.segment_id),
      sceneMomentId: numericValue(target.sceneMomentId ?? target.scene_moment_id),
      contentUnitId: numericValue(target.contentUnitId ?? target.content_unit_id),
    },
  }
}

function isProjectLayerWorkspaceKind(kind: MovScriptWorkspaceKind): boolean {
  return kind === 'setting_workspace' || kind === 'asset_workspace' || kind === 'project_standards_workspace'
}
