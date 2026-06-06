export type JSONSchema7 = Record<string, unknown>

export type WorkspaceSchemaCategory =
  | 'project'
  | 'production'
  | 'content_unit'
  | 'asset'

export type WorkspaceScope = 'project' | 'production' | 'content_unit' | 'asset'

export type WorkspaceKind =
  | 'setting_workspace'
  | 'project_standards_workspace'
  | 'production_workspace'
  | 'content_unit_workspace'
  | 'asset_workspace'

export interface WorkspaceSchemaDefinition {
  id: string
  kind: WorkspaceKind
  category: WorkspaceSchemaCategory
  scope: WorkspaceScope
  title: string
  version: string
  status: 'active' | 'deprecated'
  supersededBy?: string
  jsonSchema: JSONSchema7
  promptSummary: string
  examples: ReadonlyArray<{ name: string; content: unknown }>
}
