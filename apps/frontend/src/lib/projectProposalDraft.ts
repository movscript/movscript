import { DRAFT_CONTENT_SCHEMA_IDS, DRAFT_SCOPES } from '@movscript/draft-schemas'

export const PROJECT_PROPOSAL_DRAFT_SCHEMA = DRAFT_CONTENT_SCHEMA_IDS.projectProposal
export const PROJECT_PROPOSAL_SCOPE = DRAFT_SCOPES.projectProposal

export interface ProjectStylePatch {
  aspect_ratio?: string
  shot_size_system?: string[]
  camera_language?: string
  visual_style?: string
  lighting_style?: string
  color_palette?: string
  pacing_rules?: string
  negative_rules?: string[]
  custom_rules?: ProjectPromptRulePatch[]
}

export interface ProjectPromptRulePatch {
  id?: string
  key: string
  label: string
  category?: string
  value: string
  prompt_role?: 'context' | 'style' | 'constraint' | 'negative' | 'quality_gate'
  enabled?: boolean
  required?: boolean
  order?: number
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
  }
  impact_notes: string[]
  createdAt: string
}

export function buildEmptyProjectProposalDraftContent(input: {
  projectId?: number
  productionId?: number
  mode?: 'snapshot'
  projectStyle?: ProjectStylePatch
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
    custom_rules: [],
  }
}
