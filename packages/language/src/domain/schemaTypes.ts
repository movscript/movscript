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
  | 'shot'
  | 'storyboard'
  | 'audio_cue'
  | 'expression_unit'
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
  | 'shot_workspace'
  | 'storyboard_workspace'
  | 'audio_cue_workspace'
  | 'expression_unit_workspace'
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
  examples: ReadonlyArray<{ title: string; content: unknown }>
}
