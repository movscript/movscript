import type { SemanticEntityKind } from '@movscript/language/domain'
import type { MovScriptWorkspaceDomainIndex } from '@movscript/workspace/indexer'
import type { MovScriptSemanticChange } from '../semanticChanges/index.js'
import type { ContentUnitDerivedArtifactBundle } from './contentProduction.js'

export type MovScriptDomainRelationType = 'owns' | 'contains' | 'references' | 'uses' | 'derives'

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
  itemType: 'segment' | 'scene_moment' | 'shot' | 'storyboard' | 'audio_cue' | 'content_unit'
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

export interface MovScriptWorkspaceArtifactsInput {
  index: MovScriptWorkspaceDomainIndex
  changedEntities: Array<{
    entityKind: string
    path: string
    id?: string | number
    state: string
  }>
  semanticChanges?: readonly MovScriptSemanticChange[]
  interpretationId: string
  createdAt: string
}

export interface MovScriptWorkspaceDerivedArtifacts {
  domainTree: MovScriptDomainTreeArtifact
  relationGraph: MovScriptRelationGraphArtifact
  assetIndex: MovScriptAssetIndexArtifact
  impactReport: MovScriptImpactReportArtifact
  previewTimelines: MovScriptPreviewTimelineArtifact[]
  contentUnitArtifacts: ContentUnitDerivedArtifactBundle[]
}
