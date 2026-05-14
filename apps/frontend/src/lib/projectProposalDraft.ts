import { DRAFT_CONTENT_SCHEMA_IDS, DRAFT_SCOPES } from '@movscript/draft-schemas'

export const PROJECT_PROPOSAL_DRAFT_SCHEMA = DRAFT_CONTENT_SCHEMA_IDS.projectProposal
export const PROJECT_PROPOSAL_SCOPE = DRAFT_SCOPES.projectProposal

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

export interface ProjectStylePatch {
  aspect_ratio?: string
  shot_size_system?: string[]
  camera_language?: string
  visual_style?: string
  lighting_style?: string
  color_palette?: string
  pacing_rules?: string
  negative_rules?: string[]
}

export interface ProjectProposalDraftContent {
  schema: typeof PROJECT_PROPOSAL_DRAFT_SCHEMA
  scope: typeof PROJECT_PROPOSAL_SCOPE
  mode?: 'patch' | 'snapshot'
  projectId?: number
  productionId?: number
  summary: string
  proposal: {
    project_style: ProjectStylePatch
    creative_references: ProjectProposalCreativeReferencePatch[]
    asset_slots: ProjectProposalAssetSlotPatch[]
  }
  impact_notes: string[]
  createdAt: string
}

export function buildEmptyProjectProposalDraftContent(input: {
  projectId?: number
  productionId?: number
  mode?: 'patch' | 'snapshot'
  projectStyle?: ProjectStylePatch
  creativeReferences?: ProjectProposalCreativeReferencePatch[]
  assetSlots?: ProjectProposalAssetSlotPatch[]
  createdAt?: string
  summary?: string
} = {}): ProjectProposalDraftContent {
  return {
    schema: PROJECT_PROPOSAL_DRAFT_SCHEMA,
    scope: PROJECT_PROPOSAL_SCOPE,
    mode: input.mode ?? 'patch',
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.productionId !== undefined ? { productionId: input.productionId } : {}),
    summary: input.summary ?? '',
    proposal: {
      project_style: input.projectStyle ?? {},
      creative_references: input.creativeReferences ?? [],
      asset_slots: input.assetSlots ?? [],
    },
    impact_notes: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export function buildDefaultProjectStylePatch(): ProjectStylePatch {
  return {
    aspect_ratio: '',
    shot_size_system: [],
    camera_language: '',
    visual_style: '',
    lighting_style: '',
    color_palette: '',
    pacing_rules: '',
    negative_rules: [],
  }
}
