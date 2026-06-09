import { WORKSPACE_CONTENT_SCHEMA_IDS, WORKSPACE_SCOPES } from '@movscript/workspace'

export const PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA = WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace
export const PRODUCTION_WORKSPACE_SCOPE = WORKSPACE_SCOPES.productionWorkspace

export interface ProductionWorkspaceContentUnitSnapshot {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  description?: string
  shot_size?: string
  camera_angle?: string
  duration_sec?: number
  order?: number
  script_block_id?: number | null
  before?: Record<string, unknown>
  keyframes?: ProductionWorkspaceKeyframeSnapshot[]
}

export interface ProductionWorkspaceKeyframeSnapshot {
  id?: number
  client_id?: string
  title?: string
  description?: string
  prompt?: string
  order?: number
  before?: Record<string, unknown>
}

export interface ProductionWorkspaceSettingUsageSnapshot {
  id: number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
}

export interface ProductionWorkspaceAssetSlotSnapshot {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  description?: string
  priority?: string
  source_label?: string
}

export interface ProductionWorkspaceSceneMomentSnapshot {
  id?: number
  client_id?: string
  title?: string
  time_text?: string
  location_text?: string
  condition_text?: string
  action_text?: string
  mood?: string
  description?: string
  order?: number
  script_block_id?: number | null
  content_units?: ProductionWorkspaceContentUnitSnapshot[]
  settings?: ProductionWorkspaceSettingUsageSnapshot[]
  asset_slots?: ProductionWorkspaceAssetSlotSnapshot[]
  keyframes?: ProductionWorkspaceKeyframeSnapshot[]
  rationale?: string
  before?: Record<string, unknown>
}

export interface ProductionWorkspaceSegmentSnapshot {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  script_block_id?: number | null
  scene_moments: ProductionWorkspaceSceneMomentSnapshot[]
  rationale?: string
  before?: Record<string, unknown>
}

export interface ProductionWorkspaceArtifactShellContent {
  schema: typeof PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA
  scope: typeof PRODUCTION_WORKSPACE_SCOPE
  mode: 'snapshot'
  projectId?: number
  productionId: number
  workspaceScope: 'production'
  summary: string
  workspace: {
    segments: ProductionWorkspaceSegmentSnapshot[]
  }
  snapshot_base?: Record<string, unknown>
  impact_notes: string[]
  proposedAt: string
  projectWorkspaceId?: string
}

/** @deprecated Use ProductionWorkspaceArtifactShellContent. */
export type ProductionWorkspaceWorkspaceContent = ProductionWorkspaceArtifactShellContent

export function buildEmptyProductionWorkspaceArtifactShellContent(input: {
  projectId?: number
  productionId: number
  projectWorkspaceId?: string
  snapshotBase?: Record<string, unknown>
  proposedAt?: string
  summary?: string
}): ProductionWorkspaceArtifactShellContent {
  return {
    schema: PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA,
    scope: PRODUCTION_WORKSPACE_SCOPE,
    mode: 'snapshot',
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    productionId: input.productionId,
    workspaceScope: 'production',
    summary: input.summary ?? '',
    workspace: { segments: [] },
    ...(input.snapshotBase ? { snapshot_base: input.snapshotBase } : {}),
    impact_notes: [],
    proposedAt: input.proposedAt ?? new Date().toISOString(),
    ...(input.projectWorkspaceId ? { projectWorkspaceId: input.projectWorkspaceId } : {}),
  }
}

/** @deprecated Use buildEmptyProductionWorkspaceArtifactShellContent. */
export const buildEmptyProductionWorkspaceWorkspaceContent = buildEmptyProductionWorkspaceArtifactShellContent
