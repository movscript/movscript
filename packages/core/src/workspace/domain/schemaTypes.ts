export type JSONSchema7 = Record<string, unknown>

export type SemanticEntityKind =
  | 'project'
  | 'project_standards'
  | 'setting'
  | 'setting_state'
  | 'asset'
  | 'script'
  | 'script_version'
  | 'script_block'
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'storyboard'
  | 'writing_expression'
  | 'content_unit'
  | 'keyframe'

export type WorkspaceKind =
  | 'project_workspace'
  | 'setting_workspace'
  | 'setting_state_workspace'
  | 'project_standards_workspace'
  | 'script_workspace'
  | 'script_version_workspace'
  | 'script_block_workspace'
  | 'production_workspace'
  | 'segment_workspace'
  | 'scene_moment_workspace'
  | 'storyboard_workspace'
  | 'writing_expression_workspace'
  | 'content_unit_workspace'
  | 'keyframe_workspace'
  | 'asset_workspace'

export interface SemanticEntitySchemaDefinition {
  id: string
  entityKind: SemanticEntityKind
  title: string
  version: string
  status: 'active' | 'deprecated'
  supersededBy?: string
  jsonSchema: JSONSchema7
  promptSummary: string
  examples: ReadonlyArray<{ name: string; content: unknown }>
}
