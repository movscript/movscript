export const PROJECT_PROPOSAL_DRAFT_SCHEMA = 'movscript.project_proposal.v1'
export const PROJECT_PROPOSAL_SCOPE = 'project_proposal'

export interface ProjectProposalMergeCandidate {
  source_id: number
  reason?: string
}

export interface ProjectProposalOwnerPatch {
  type?: string
  id?: number
  client_id?: string
}

export interface ProjectProposalCreativeReferencePatch {
  client_id?: string
  id?: number
  fields?: Record<string, unknown>
  merge_candidates?: ProjectProposalMergeCandidate[]
}

export interface ProjectProposalAssetSlotPatch {
  client_id?: string
  id?: number
  owner?: ProjectProposalOwnerPatch
  fields?: Record<string, unknown>
}

export interface ProjectProposalDraftContent {
  schema: typeof PROJECT_PROPOSAL_DRAFT_SCHEMA
  scope: typeof PROJECT_PROPOSAL_SCOPE
  projectId?: number
  productionId?: number
  summary: string
  proposal: {
    creative_references: ProjectProposalCreativeReferencePatch[]
    asset_slots: ProjectProposalAssetSlotPatch[]
  }
  impact_notes: string[]
  createdAt: string
}

export function buildEmptyProjectProposalDraftContent(input: {
  projectId?: number
  productionId?: number
  createdAt?: string
  summary?: string
} = {}): ProjectProposalDraftContent {
  return {
    schema: PROJECT_PROPOSAL_DRAFT_SCHEMA,
    scope: PROJECT_PROPOSAL_SCOPE,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.productionId !== undefined ? { productionId: input.productionId } : {}),
    summary: input.summary ?? '',
    proposal: {
      creative_references: [],
      asset_slots: [],
    },
    impact_notes: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}
