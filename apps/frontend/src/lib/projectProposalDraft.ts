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

export interface ProjectProposalCreativeReferenceSnapshot {
  client_id?: string
  id?: number
  merge_candidates?: ProjectProposalMergeCandidate[]
  source_script_id?: number
  source_analysis_id?: number
  kind?: string
  name: string
  alias?: string
  description?: string
  content?: string
  importance?: string
  status?: string
  profile_json?: string
  tags_json?: string
}

export interface ProjectProposalAssetSlotSnapshot {
  client_id?: string
  id?: number
  owner?: ProjectProposalOwnerPatch
  production_id?: number
  creative_reference_id?: number
  creative_reference_state_id?: number
  owner_type?: string
  owner_id?: number
  kind: string
  name: string
  description?: string
  slot_key?: string
  prompt_hint?: string
  status?: string
  priority?: string
  resource_id?: number
  locked_asset_slot_id?: number
  metadata_json?: string
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
  mode: 'snapshot'
  projectId?: number
  productionId?: number
  summary: string
  proposal: {
    project_style: ProjectStylePatch
    creative_references: ProjectProposalCreativeReferenceSnapshot[]
    asset_slots: ProjectProposalAssetSlotSnapshot[]
  }
  impact_notes: string[]
  createdAt: string
}

export function buildEmptyProjectProposalDraftContent(input: {
  projectId?: number
  productionId?: number
  mode?: 'snapshot'
  projectStyle?: ProjectStylePatch
  creativeReferences?: ProjectProposalCreativeReferenceSnapshot[]
  assetSlots?: ProjectProposalAssetSlotSnapshot[]
  createdAt?: string
  summary?: string
} = {}): ProjectProposalDraftContent {
  return {
    schema: PROJECT_PROPOSAL_DRAFT_SCHEMA,
    scope: PROJECT_PROPOSAL_SCOPE,
    mode: input.mode ?? 'snapshot',
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
