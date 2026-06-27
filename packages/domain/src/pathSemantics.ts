import type { MovScriptDomainDiagnostic } from './types.js'

export type MovScriptDomainStructureSource = 'source_path'
export type MovScriptNamespaceVocabularyRole = 'labels_templates_and_aliases'

export interface MovScriptDomainPathSemantics {
  structureSource: MovScriptDomainStructureSource
  vocabularyRole: MovScriptNamespaceVocabularyRole
  rules: readonly string[]
  diagnostics: readonly MovScriptDomainDiagnostic[]
}

export const MOVSCRIPT_DOMAIN_PATH_SEMANTICS: MovScriptDomainPathSemantics = {
  structureSource: 'source_path',
  vocabularyRole: 'labels_templates_and_aliases',
  rules: [
    'The source path is the canonical instance tree: parent/child structure is derived from the actual entity file location.',
    'project.namespace_vocabulary and namespace_kind fields name, template, alias, and project vocabulary; they do not create a second instance tree.',
    'Default path templates are writer hints and legacy compatibility paths. Custom namespace layouts are valid when the entity is placed under the intended parent path and uses the canonical entity filename.',
    'Namespace nodes are organizational scope only. They cannot directly own content-unit refs or become content-unit targets; use timeline_assembly_ref for namespace-scope output.',
  ],
  diagnostics: [],
} as const
