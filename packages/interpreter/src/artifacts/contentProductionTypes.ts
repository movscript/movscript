import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import type {
  MovScriptContentUnitOutputKind,
  MovScriptContentUnitPromptRefKind,
} from '@movscript/domain'

export type ContentUnitOutputKind = MovScriptContentUnitOutputKind
export type ContentUnitRuntimePanelStatus = 'ready' | 'blocked'

export type ContentUnitPromptRefKind = MovScriptContentUnitPromptRefKind

export interface ContentUnitPromptRef {
  kind: ContentUnitPromptRefKind
  id: string
  raw: string
  source: {
    field: string
    start?: number
    end?: number
  }
}

export interface UnsupportedContentUnitPromptRef {
  kind: string
  id: string
  raw: string
  source: ContentUnitPromptRef['source']
}

export interface ContentUnitResolvedRef extends ContentUnitPromptRef {
  role: 'input'
  resolved?: {
    entityKind: string
    id?: string | number
    path?: string
  }
  selection?: ContentUnitUpstreamSelection
  blocker?: ContentUnitPromptBlocker
}

export interface ContentUnitUpstreamSelection {
  content_unit_ref: string
  candidate_id?: string | number
  resource_id?: number
  artifact_ref?: string
  provider_asset?: ContentUnitProviderAssetCertification
  stale?: boolean
  stale_policy?: string
  role?: string
  continuity_role?: string
}

export interface ContentUnitProviderAssetCertification {
  provider: string
  status: 'active'
  asset_uri: string
  hub_asset_id?: string
  source_resource_id?: number
  source_candidate_id?: string | number
  source_hash?: string
  certified_at?: string
  updated_at?: string
}

export interface ContentUnitPromptBlocker {
  code:
    | 'ref_not_found'
    | 'primary_ref_missing'
    | 'primary_ref_ambiguous'
    | 'upstream_content_unit_not_found'
    | 'upstream_candidate_missing'
    | 'upstream_selection_missing'
    | 'upstream_selection_stale'
    | 'upstream_resource_missing'
    | 'prompt_dependency_cycle'
    | 'unsupported_prompt_ref_kind'
  ref?: string
  message: string
}

export interface NormalizedContentUnitPrompt {
  schema: 'movscript.content_unit_prompt.v1'
  content_unit_ref: string
  content_unit_id?: string | number
  content_unit_type: string
  output_kind: ContentUnitOutputKind
  adapter_version: string
  edit_prompt?: {
    text?: string
    negative_text?: string
    notes?: string
    structured?: Record<string, unknown>
  }
  model_intent?: Record<string, unknown>
  refs: ContentUnitResolvedRef[]
  generation_refs?: ContentUnitResolvedRef[]
  runtime_request: {
    capability: string
    provider_intent?: string
    model_intent?: Record<string, unknown>
    inputs: Array<{
      role: string
      kind: 'text' | 'image' | 'video' | 'audio' | 'metadata'
      ref?: string
      source_content_unit_ref?: string
      candidate_id?: string | number
      resource_id?: number
      mime_type?: string
      provider_asset?: ContentUnitProviderAssetCertification
      required: boolean
    }>
    params?: Record<string, unknown>
    metadata?: Record<string, unknown> & {
      style_reference_resource_ids?: number[]
    }
  }
  blockers?: ContentUnitPromptBlocker[]
  created_at: string
}

export interface ContentUnitRuntimePanel {
  schema: 'movscript.content_unit_runtime_panel.v1'
  content_unit_ref: string
  content_unit_id?: string | number
  content_unit_type: string
  adapter_version: string
  output_kind: ContentUnitOutputKind
  status: ContentUnitRuntimePanelStatus
  prompt?: {
    text?: string
    negative_text?: string
    notes?: string
    structured?: Record<string, unknown>
  }
  runtime_request?: {
    capability: string
    provider_intent?: string
    model_intent?: Record<string, unknown>
    inputs: Array<{
      role: string
      kind: 'text' | 'image' | 'video' | 'audio' | 'metadata'
      ref?: string
      source_content_unit_ref?: string
      candidate_id?: string | number
      resource_id?: number
      mime_type?: string
      provider_asset?: ContentUnitProviderAssetCertification
      required: boolean
    }>
    params?: Record<string, unknown>
    metadata?: Record<string, unknown> & {
      style_reference_resource_ids?: number[]
    }
  }
  review?: {
    warnings?: string[]
    blockers?: string[]
  }
}

export interface ContentUnitDependencyReport {
  schema: 'movscript.content_unit_dependency_report.v1'
  content_unit_ref: string
  content_unit_type: string
  dependencies: Array<{
    role: string
    entityKind?: string
    id?: string | number
    path?: string
    required?: boolean
  }>
  refs: ContentUnitResolvedRef[]
  upstream_selections: ContentUnitUpstreamSelection[]
  blockers?: ContentUnitPromptBlocker[]
  issues: Array<{
    severity: 'error' | 'warning'
    message: string
  }>
}

export interface ContentUnitSelectionValidity {
  schema: 'movscript.content_unit_selection_validity.v2'
  content_unit_ref: string
  selected: boolean
  candidate_id?: string | number
  resource_id?: number
  stale: boolean
  stale_policy: 'strict' | 'accept_stale'
  reason?: string
  stale_reasons?: Array<
    | 'edit_prompt_changed'
    | 'model_intent_changed'
    | 'refs_changed'
    | 'runtime_inputs_changed'
    | 'candidate_missing'
    | 'candidate_prompt_missing'
    | 'prompt_dependency_missing'
  >
}

export interface ContentUnitDerivedArtifactBundle {
  contentUnitId: string | number
  contentUnitPath: string
  runtimePanel: ContentUnitRuntimePanel
  generationPrompt: NormalizedContentUnitPrompt
  dependencyReport: ContentUnitDependencyReport
  selectionValidity: ContentUnitSelectionValidity
}

export interface AdapterContext {
  index: MovScriptWorkspaceDomainIndex
  contentUnit: MovScriptWorkspaceIndexedEntity
  interpreterVersion: string
  createdAt: string
  promptStack?: string[]
}

export interface AdapterDerivation {
  dependencies: AdapterDependencies
  prompt: NormalizedContentUnitPrompt
}

export interface ContentUnitAdapter {
  type: string
  version: string
  outputKind: ContentUnitOutputKind
  validate(context: AdapterContext): ContentUnitDependencyReport['issues']
  derivePrompt(context: AdapterContext): NormalizedContentUnitPrompt
  collectDependencies(context: AdapterContext, prompt: NormalizedContentUnitPrompt): AdapterDependencies
  deriveRuntimePanel(context: AdapterContext, derivation: AdapterDerivation): ContentUnitRuntimePanel
}

export interface AdapterDependencies {
  entities: Record<string, MovScriptWorkspaceIndexedEntity[]>
  upstreamSelections: ContentUnitUpstreamSelection[]
  refs: ContentUnitResolvedRef[]
  blockers: ContentUnitPromptBlocker[]
}
