import { DRAFT_CONTENT_SCHEMA_IDS, DRAFT_SCOPES } from '@movscript/draft-schemas'

export const PRODUCTION_PROPOSAL_DRAFT_SCHEMA = DRAFT_CONTENT_SCHEMA_IDS.productionProposal
export const PRODUCTION_PROPOSAL_SCOPE = DRAFT_SCOPES.productionProposal

export type ProductionProposalAction = 'create' | 'reuse' | 'update'

export interface ProductionProposalContentUnitPatch {
  action: ProductionProposalAction
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
  before?: Record<string, unknown>
}

export interface ProductionProposalCreativeReferenceUsagePatch {
  action: ProductionProposalAction
  id?: number
  client_id?: string
  creative_reference_id?: number
  source_label?: string
  state?: Record<string, unknown>
}

export interface ProductionProposalAssetSlotUsagePatch {
  action: ProductionProposalAction
  id?: number
  client_id?: string
  asset_slot_id?: number
  source_label?: string
}

export interface ProductionProposalSceneMomentPatch {
  action: ProductionProposalAction
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
  content_units?: ProductionProposalContentUnitPatch[]
  creative_references?: ProductionProposalCreativeReferenceUsagePatch[]
  asset_slots?: ProductionProposalAssetSlotUsagePatch[]
  rationale?: string
  before?: Record<string, unknown>
}

export interface ProductionProposalSegmentPatch {
  action: ProductionProposalAction
  id?: number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  status?: string
  scene_moments: ProductionProposalSceneMomentPatch[]
  rationale?: string
  before?: Record<string, unknown>
}

export interface ProductionProposalDraftContent {
  schema: typeof PRODUCTION_PROPOSAL_DRAFT_SCHEMA
  scope: typeof PRODUCTION_PROPOSAL_SCOPE
  projectId?: number
  productionId: number
  proposalScope: 'production'
  summary: string
  proposal: {
    segments: ProductionProposalSegmentPatch[]
  }
  impact_notes: string[]
  proposedAt: string
  projectDraftId?: string
}

export function buildEmptyProductionProposalDraftContent(input: {
  projectId?: number
  productionId: number
  projectDraftId?: string
  proposedAt?: string
  summary?: string
}): ProductionProposalDraftContent {
  return {
    schema: PRODUCTION_PROPOSAL_DRAFT_SCHEMA,
    scope: PRODUCTION_PROPOSAL_SCOPE,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    productionId: input.productionId,
    proposalScope: 'production',
    summary: input.summary ?? '',
    proposal: { segments: [] },
    impact_notes: [],
    proposedAt: input.proposedAt ?? new Date().toISOString(),
    ...(input.projectDraftId ? { projectDraftId: input.projectDraftId } : {}),
  }
}
