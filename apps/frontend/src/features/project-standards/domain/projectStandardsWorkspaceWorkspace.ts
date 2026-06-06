import { WORKSPACE_CONTENT_SCHEMA_IDS, WORKSPACE_SCOPES } from '@movscript/core/workspace'

export const PROJECT_STANDARDS_WORKSPACE_WORKSPACE_SCHEMA = WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace
export const PROJECT_STANDARDS_WORKSPACE_SCOPE = WORKSPACE_SCOPES.projectStandardsWorkspace

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

export interface ProjectStandardsWorkspaceArtifactShellContent {
  schema: typeof PROJECT_STANDARDS_WORKSPACE_WORKSPACE_SCHEMA
  scope: typeof PROJECT_STANDARDS_WORKSPACE_SCOPE
  mode: 'snapshot'
  projectId?: number
  productionId?: number
  summary: string
  workspace: {
    project_style: ProjectStylePatch
  }
  impact_notes: string[]
  createdAt: string
}

/** @deprecated Use ProjectStandardsWorkspaceArtifactShellContent. */
export type ProjectStandardsWorkspaceWorkspaceContent = ProjectStandardsWorkspaceArtifactShellContent

export function buildEmptyProjectStandardsWorkspaceArtifactShellContent(input: {
  projectId?: number
  productionId?: number
  mode?: 'snapshot'
  projectStyle?: ProjectStylePatch
  createdAt?: string
  summary?: string
} = {}): ProjectStandardsWorkspaceArtifactShellContent {
  return {
    schema: PROJECT_STANDARDS_WORKSPACE_WORKSPACE_SCHEMA,
    scope: PROJECT_STANDARDS_WORKSPACE_SCOPE,
    mode: input.mode ?? 'snapshot',
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.productionId !== undefined ? { productionId: input.productionId } : {}),
    summary: input.summary ?? '',
    workspace: {
      project_style: input.projectStyle ?? {},
    },
    impact_notes: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

/** @deprecated Use buildEmptyProjectStandardsWorkspaceArtifactShellContent. */
export const buildEmptyProjectStandardsWorkspaceWorkspaceContent = buildEmptyProjectStandardsWorkspaceArtifactShellContent

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
