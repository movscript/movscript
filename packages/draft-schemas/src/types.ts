export type JSONSchema7 = Record<string, unknown>

export type DraftSchemaCategory =
  | 'project'
  | 'production'
  | 'content_unit'
  | 'asset'

export type DraftScope = 'project' | 'production' | 'content_unit' | 'asset'

export type DraftKind =
  | 'setting_proposal'
  | 'project_standards_proposal'
  | 'production_proposal'
  | 'content_unit_proposal'
  | 'asset_proposal'

export interface DraftSchemaDefinition {
  id: string
  kind: DraftKind
  category: DraftSchemaCategory
  scope: DraftScope
  title: string
  version: string
  status: 'active' | 'deprecated'
  supersededBy?: string
  jsonSchema: JSONSchema7
  promptSummary: string
  examples: ReadonlyArray<{ name: string; content: unknown }>
}
