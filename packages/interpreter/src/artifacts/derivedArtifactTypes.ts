import type { SemanticEntityKind } from '@movscript/language/domain'
import type { MovScriptDomainNodeCategory } from '@movscript/domain'
import type { MovScriptWorkspaceDomainIndex } from '@movscript/workspace/indexer'
import type { MovScriptSemanticChange } from '../semanticChanges/index.js'
import type { ContentUnitDerivedArtifactBundle } from './contentProduction.js'

export type MovScriptDomainRelationType = 'owns' | 'contains' | 'references' | 'uses' | 'targets' | 'derives'
export type MovScriptProductionActor = 'human' | 'agent' | 'workflow'

export interface MovScriptDomainEntityRef {
  entityKind: SemanticEntityKind | string
  id?: string | number
  path?: string
}

export interface MovScriptDomainRelation {
  type: MovScriptDomainRelationType
  from: MovScriptDomainEntityRef
  to: MovScriptDomainEntityRef
  field?: string
}

export interface MovScriptDomainTreeNode {
  entityKind: SemanticEntityKind | string
  nodeCategory?: MovScriptDomainNodeCategory
  nodeKind?: string
  id?: string | number
  path: string
  title?: string
  order?: number
  children: MovScriptDomainTreeNode[]
}

export interface MovScriptDomainTreeArtifact {
  schema: 'movscript.domain-tree.v1'
  roots: MovScriptDomainTreeNode[]
}

export interface MovScriptRelationGraphArtifact {
  schema: 'movscript.relation-graph.v1'
  relations: MovScriptDomainRelation[]
}

export interface MovScriptAssetIndexEntry {
  id?: string | number
  path: string
  owner: MovScriptDomainEntityRef
  slot?: string
}

export interface MovScriptAssetIndexArtifact {
  schema: 'movscript.asset-index.v1'
  assets: MovScriptAssetIndexEntry[]
}

export interface MovScriptImpactReportChangedEntity {
  entityKind: string
  id?: string | number
  path: string
  state: string
  businessImpacts: string[]
  editorImpacts: string[]
  affectedContentUnits: MovScriptDomainEntityRef[]
  staleMarkers: string[]
}

export interface MovScriptImpactReportArtifact {
  schema: 'movscript.impact-report.v1'
  interpretationId: string
  createdAt: string
  changedEntities: MovScriptImpactReportChangedEntity[]
}

export interface MovScriptPreviewTimelineItem {
  id: string
  itemType: 'timeline_namespace' | 'segment' | 'scene_moment' | 'shot' | 'storyboard' | 'keyframe' | 'audio_cue' | 'expression_unit' | 'content_unit'
  entity: MovScriptDomainEntityRef
  order: number
  parentId?: string
  title?: string
  caption?: string
  gapAfterSec?: number
  cueKind?: string
  timing?: Record<string, unknown>
  transition?: Record<string, unknown>
  contentUnitIds?: Array<string | number>
}

export interface MovScriptPreviewTimelineArtifact {
  schema: 'movscript.preview_timeline.v1'
  productionId: string | number
  productionPath: string
  items: MovScriptPreviewTimelineItem[]
}

export interface MovScriptEditPlanTrackItem {
  id: string
  content_unit_id: string | number
  content_unit_ref: string
  output_kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
  target_kind: 'scene_moment' | 'expression_unit' | 'content_unit' | string
  target_ref: string
  expression_unit_ref?: string
  expression_modality?: string
  expression_role?: string
  candidate_id?: string | number
  resource_id?: number
  selected: boolean
  stale: boolean
  timing_intent?: Record<string, unknown>
  generation_role?: string
  order: number
}

export interface MovScriptEditPlanTrack {
  type: 'video' | 'voice' | 'subtitle' | 'audio' | 'image' | 'metadata'
  items: MovScriptEditPlanTrackItem[]
}

export interface MovScriptEditPlanArtifact {
  schema: 'movscript.edit_plan.v1'
  productionId: string | number
  productionPath: string
  sceneMomentId: string | number
  sceneMomentPath: string
  target_ref: string
  status: 'ready_to_compose' | 'missing_selection'
  tracks: MovScriptEditPlanTrack[]
  compose_inputs: Array<{
    content_unit_id: string | number
    resource_id: number
    output_kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
    track_type: MovScriptEditPlanTrack['type']
  }>
  blockers?: Array<{
    code: 'selection_missing' | 'selection_stale' | 'resource_missing'
    content_unit_id: string | number
    message: string
  }>
}

export interface MovScriptProductionWorkPlanSourceIssue {
  path: string
  severity: 'error' | 'warning'
  message: string
}

export interface MovScriptProductionWorkPlan {
  schema: 'movscript.production_work_plan.v1'
  created_at: string
  project?: MovScriptDomainEntityRef
  scope?: {
    production_id?: string | number
    segment_id?: string | number
    scene_moment_id?: string | number
    shot_id?: string | number
    content_unit_id?: string | number
  }
  source_status: {
    ready_to_interpret: boolean
    has_pending_edits: boolean
    issue_count: number
  }
  interpret_status: {
    status: 'missing' | 'current' | 'stale'
    interpretation_id?: string
    interpreted_at?: string
  }
  items: MovScriptProductionWorkItem[]
  summary: {
    open: number
    blocking: number
    human_recommended: number
    agent_recommended: number
    ready_to_generate: number
    stale_selections: number
  }
}

export interface MovScriptProductionWorkItem {
  id: string
  kind:
    | 'fix_source'
    | 'edit_structure'
    | 'create_content_unit'
    | 'generate_candidates'
    | 'select_candidate'
    | 'review_stale_selection'
    | 'review_affected_output'
  status: 'open' | 'blocked' | 'ready' | 'informational'
  severity: 'blocking' | 'warning' | 'suggestion'
  priority: number
  reason: string
  target: MovScriptDomainEntityRef
  upstream?: MovScriptDomainEntityRef[]
  downstream?: MovScriptDomainEntityRef[]
  blockers?: MovScriptProductionWorkItemBlocker[]
  allowed_actors: MovScriptProductionActor[]
  recommended_actor: MovScriptProductionActor
  actions: MovScriptProductionWorkAction[]
  evidence?: Record<string, unknown>
}

export interface MovScriptProductionWorkItemBlocker {
  code: string
  message: string
  ref?: string
}

export type MovScriptProductionWorkAction =
  | {
      type: 'open_editor'
      entityKind: string
      entityId?: string | number
      path?: string
      missingFields?: string[]
    }
  | {
      type: 'upsert_entity'
      entityKind: string
      suggestedPatch?: Record<string, unknown>
    }
  | {
      type: 'derive_content_unit_artifact'
      contentUnitId: string | number
    }
  | {
      type: 'generate_candidates'
      contentUnitId: string | number
      capability: 'image' | 'video' | 'audio' | 'text'
      suggestedCandidateCount?: number
    }
  | {
      type: 'open_candidate_picker'
      contentUnitId: string | number
    }
  | {
      type: 'agent_review_candidates'
      contentUnitId: string | number
    }
  | {
      type: 'accept_stale'
      contentUnitId: string | number
    }

export interface MovScriptWorkspaceArtifactsInput {
  index: MovScriptWorkspaceDomainIndex
  changedEntities: Array<{
    entityKind: string
    path: string
    id?: string | number
    state: string
  }>
  semanticChanges?: readonly MovScriptSemanticChange[]
  sourceIssues?: readonly MovScriptProductionWorkPlanSourceIssue[]
  interpretationId: string
  createdAt: string
}

export interface MovScriptWorkspaceDerivedArtifacts {
  domainTree: MovScriptDomainTreeArtifact
  relationGraph: MovScriptRelationGraphArtifact
  assetIndex: MovScriptAssetIndexArtifact
  impactReport: MovScriptImpactReportArtifact
  previewTimelines: MovScriptPreviewTimelineArtifact[]
  editPlans: MovScriptEditPlanArtifact[]
  contentUnitArtifacts: ContentUnitDerivedArtifactBundle[]
  productionWorkPlan: MovScriptProductionWorkPlan
}
