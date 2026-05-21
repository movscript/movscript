import { DRAFT_CONTENT_SCHEMA_IDS, DRAFT_SCOPES } from '@movscript/draft-schemas'

export const PRODUCTION_PROPOSAL_DRAFT_SCHEMA = DRAFT_CONTENT_SCHEMA_IDS.productionProposal
export const PRODUCTION_PROPOSAL_SCOPE = DRAFT_SCOPES.productionProposal

export interface ProductionProposalContentUnitSnapshot {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  description?: string
  shot_size?: string
  camera_angle?: string
  duration_sec?: number
  order?: number
  status?: string
  script_block_id?: number
  before?: Record<string, unknown>
  keyframes?: ProductionProposalKeyframeSnapshot[]
}

export interface ProductionProposalKeyframeSnapshot {
  id?: number
  client_id?: string
  title?: string
  description?: string
  prompt?: string
  order?: number
  status?: string
  before?: Record<string, unknown>
}

export interface ProductionProposalCreativeReferenceUsageSnapshot {
  id: number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
}

export interface ProductionProposalAssetSlotSnapshot {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  description?: string
  priority?: string
  source_label?: string
}

export interface ProductionProposalSceneMomentSnapshot {
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
  status?: string
  script_block_id?: number
  content_units?: ProductionProposalContentUnitSnapshot[]
  creative_references?: ProductionProposalCreativeReferenceUsageSnapshot[]
  asset_slots?: ProductionProposalAssetSlotSnapshot[]
  keyframes?: ProductionProposalKeyframeSnapshot[]
  rationale?: string
  before?: Record<string, unknown>
}

export interface ProductionProposalSegmentSnapshot {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  status?: string
  script_block_id?: number
  scene_moments: ProductionProposalSceneMomentSnapshot[]
  rationale?: string
  before?: Record<string, unknown>
}

export interface ProductionProposalDraftContent {
  schema: typeof PRODUCTION_PROPOSAL_DRAFT_SCHEMA
  scope: typeof PRODUCTION_PROPOSAL_SCOPE
  mode: 'snapshot'
  projectId?: number
  productionId: number
  proposalScope: 'production'
  summary: string
  proposal: {
    segments: ProductionProposalSegmentSnapshot[]
  }
  snapshot_base?: Record<string, unknown>
  impact_notes: string[]
  proposedAt: string
  projectDraftId?: string
}

export function buildEmptyProductionProposalDraftContent(input: {
  projectId?: number
  productionId: number
  projectDraftId?: string
  snapshotBase?: Record<string, unknown>
  proposedAt?: string
  summary?: string
}): ProductionProposalDraftContent {
  return {
    schema: PRODUCTION_PROPOSAL_DRAFT_SCHEMA,
    scope: PRODUCTION_PROPOSAL_SCOPE,
    mode: 'snapshot',
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    productionId: input.productionId,
    proposalScope: 'production',
    summary: input.summary ?? '',
    proposal: { segments: [] },
    ...(input.snapshotBase ? { snapshot_base: input.snapshotBase } : {}),
    impact_notes: [],
    proposedAt: input.proposedAt ?? new Date().toISOString(),
    ...(input.projectDraftId ? { projectDraftId: input.projectDraftId } : {}),
  }
}
