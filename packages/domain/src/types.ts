export type MovScriptDomainNodeCategory =
  | 'timeline_namespace'
  | 'setting_namespace'
  | 'system_primitive'
  | 'content_unit'
  | 'resource_state'

export type MovScriptNamespaceCategory = 'timeline_namespace' | 'setting_namespace'

export type MovScriptSystemPrimitiveKind =
  | 'scene_moment'
  | 'expression_unit'
  | 'storyboard'
  | 'keyframe'
  | 'audio_cue'
  | 'asset'

export type MovScriptWorkTargetCategory = 'system_primitive' | 'content_unit'

export type MovScriptDomainRelationKind =
  | 'parent'
  | 'scope'
  | 'target'
  | 'uses'
  | 'depends_on'
  | 'produces'
  | 'selects'

export type MovScriptDomainEdgeOrigin = 'path' | 'explicit_ref' | 'derived' | 'legacy_alias'

export type MovScriptDomainDiagnosticSeverity = 'error' | 'warning'

export interface MovScriptDomainDiagnostic {
  severity: MovScriptDomainDiagnosticSeverity
  code: string
  message: string
  field?: string
  path?: string
}

export interface MovScriptDomainRef {
  category?: MovScriptDomainNodeCategory | MovScriptWorkTargetCategory
  kind: string
  id?: string | number
  path?: string
}

export interface MovScriptDomainNode extends MovScriptDomainRef {
  category: MovScriptDomainNodeCategory
  title?: string
  order?: number
  metadata?: Record<string, unknown>
}

export interface MovScriptDomainEdge {
  source: MovScriptDomainRef
  target: MovScriptDomainRef
  relation: MovScriptDomainRelationKind
  origin: MovScriptDomainEdgeOrigin
  field?: string
}

export type MovScriptContentUnitOutputKind = 'image' | 'video' | 'audio' | 'text' | 'metadata'

export type MovScriptContentUnitPromptRefKind =
  | 'production'
  | 'segment'
  | 'asset'
  | 'keyframe'
  | 'storyboard'
  | 'audio_cue'
  | 'scene_moment'
  | 'expression_unit'
  | 'content_unit'

export interface MovScriptWorkTarget {
  targetCategory: MovScriptWorkTargetCategory
  targetKind: string
  targetRef?: string
}

export interface MovScriptTimelineNamespaceScope {
  category: 'timeline_namespace'
  kind: string
  ref: string
  field?: string
}

export interface MovScriptContentUnitTargetAdapter {
  contentUnitType: string
  targetCategory?: MovScriptWorkTargetCategory
  targetKind: string
  outputKind?: MovScriptContentUnitOutputKind
  primaryRefKind?: MovScriptContentUnitPromptRefKind
  primaryRefField?: string
  namespaceScopeKind?: 'production' | 'segment'
}

export interface MovScriptNormalizedContentUnitTarget {
  contentUnitType: string
  outputKind: MovScriptContentUnitOutputKind
  target?: MovScriptWorkTarget
  primaryRefKind?: MovScriptContentUnitPromptRefKind
  primaryRefField?: string
  primaryRefs: string[]
  scope?: MovScriptTimelineNamespaceScope
  namespaceAlias?: {
    contentUnitType: 'production_ref' | 'segment_ref'
    namespaceKind: 'production' | 'segment'
  }
  diagnostics: MovScriptDomainDiagnostic[]
}

export interface MovScriptNormalizedPathParentEdge {
  edge?: MovScriptDomainEdge
  diagnostics: MovScriptDomainDiagnostic[]
}

export interface MovScriptNamespaceVocabulary {
  timelineNamespaces: string[]
  settingNamespaces: string[]
  timelineTemplate?: string
}

export type MovScriptNormalizedNamespaceVocabulary = MovScriptNamespaceVocabulary & {
  diagnostics: MovScriptDomainDiagnostic[]
}

export interface MovScriptNormalizedFocus {
  projectId?: string
  target?: MovScriptWorkTarget
  scope?: MovScriptTimelineNamespaceScope
  entity?: MovScriptDomainRef
  diagnostics: MovScriptDomainDiagnostic[]
}

export interface MovScriptSourceEntityLike {
  entityKind?: string
  category?: MovScriptDomainNodeCategory
  record?: Record<string, unknown>
  path?: string
}
