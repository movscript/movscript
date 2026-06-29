import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type { MovScriptDomainNode, MovScriptDomainNodeCategory } from '@movscript/domain'
import type { ContentSourceWorkspaceData, ProductionWorkItemView, ProductionWorkPlanView } from '@movscript/core/content'

export type ContentCanvasNodeKind =
  | 'project'
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'storyboard'
  | 'expression_unit'
  | 'content_unit'
  | 'candidate'
  | 'selection'
  | 'resource'
  | 'keyframe'
  | 'asset'
  | 'setting'
  | 'state'
  | 'audio_cue'
  | 'work_item'
  | 'actor'
  | 'group'

export interface ContentCanvasEntity {
  key: string
  kind: ContentCanvasNodeKind
  entity: MovScriptWorkspaceIndexedEntity
}

export interface ContentCanvasNode {
  id: string
  entityKey: string
  kind: ContentCanvasNodeKind
  title: string
  subtitle: string
  summary: string
  status: 'ready' | 'active' | 'missing' | 'neutral'
  metrics: string[]
  sourcePath: string
  record: Record<string, unknown>
  domainCategory?: MovScriptDomainNodeCategory
  domainKind?: string
  domainNode?: MovScriptDomainNode
  domainParentNodeId?: string
  domainAncestorNodeIds?: string[]
  candidates: ContentCanvasCandidate[]
  generationTask?: ContentCanvasGenerationTask
  position: { x: number; y: number }
}

export interface ContentCanvasGenerationTask {
  id: string
  nodeId: string
  contentUnitType: string
  outputKind: string
  title: string
  prompt: string
  status: 'none' | 'ready' | 'needs_candidate' | 'selected' | 'stale'
  sourcePath: string
  record: Record<string, unknown>
  candidates: ContentCanvasCandidate[]
  selectedCandidate?: ContentCanvasCandidate
}

export interface ContentCanvasCandidate {
  id: string
  title: string
  resourceId?: number
  resourceKind?: string
  artifactRef?: string
  inputHash?: string
  source: string
  status?: string
  decisionStatus?: string
  decisionReason?: string
  producer?: Record<string, unknown>
  outputs?: unknown[]
  promptSnapshot?: Record<string, unknown>
  createdAt?: string
  selected: boolean
  notes: string
}

export type MediaEditingProjectLike = {
  version?: number
  id?: string
  title?: string
  timeline?: {
    durationMs?: number
    tracks?: Array<{
      id?: string
      name?: string
      type?: string
      locked?: boolean
      muted?: boolean
      clips?: MediaTimelineClipLike[]
    }>
  }
}

export type MediaTimelineClipLike = {
  id?: string
  assetType?: string
  timelineStartMs?: number
  durationMs?: number
  sourceStartMs?: number
  sourceEndMs?: number
  muted?: boolean
  text?: {
    content?: string
  }
  asset?: {
    resourceId?: number
    label?: string
  }
  metadata?: {
    movscript?: {
      resourceId?: number
      contentUnitId?: string | number
      selected?: boolean
      stale?: boolean
      outputKind?: string
      trackType?: string
    }
  }
}

export type ContentCanvasEdgeType =
  | 'contains'
  | 'sequence'
  | 'constrains'
  | 'depends_on'
  | 'generates'
  | 'selected_from'
  | 'invalidates'
  | 'affects'
  | 'work_item_targets'

export interface ContentCanvasEdge {
  id: string
  source: string
  target: string
  label?: string
  type?: ContentCanvasEdgeType
  state?: 'selected' | 'ready' | 'stale' | 'needs_candidate' | 'missing' | 'changed' | 'locked'
  evidence?: string
  action?: string
  kind: 'hierarchy' | 'reference' | 'sequence'
  relation?:
    | 'content_unit_scene'
    | 'content_unit_candidate'
    | 'content_unit_asset'
    | 'content_unit_resource'
    | 'content_unit_keyframe'
    | 'content_unit_storyboard'
    | 'content_unit_audio_cue'
    | 'audio_cue_storyboard'
    | 'audio_cue_asset'
    | 'expression_unit_storyboard'
    | 'expression_unit_content_unit'
    | 'setting_state_reference'
    | 'asset_downstream'
    | 'candidate_resource'
    | 'selection_candidate'
    | 'work_item_target'
    | 'actor_work_item'
}

export interface ContentCanvasWorkspaceSnapshot {
  nodes: ContentCanvasNode[]
  edges: ContentCanvasEdge[]
  indexes?: ContentCanvasWorkspaceSnapshotIndexes
  summary?: ContentCanvasWorkspaceSnapshotSummary
}

export interface ContentCanvasWorkspaceSnapshotIndexes {
  nodeById: Record<string, ContentCanvasNode>
  edgeById: Record<string, ContentCanvasEdge>
  upstreamEdgeIdsByNodeId: Record<string, string[]>
  downstreamEdgeIdsByNodeId: Record<string, string[]>
  workItemIdsByTargetId: Record<string, string[]>
}

export interface ContentCanvasWorkspaceSnapshotSummary {
  nodeCount: number
  edgeCount: number
  nodeCountByKind: Partial<Record<ContentCanvasNodeKind, number>>
  productionCount: number
  staleCount: number
  needsCandidateCount: number
  missingCount: number
  openWorkItemCount: number
  actorWorkItemCount: Record<ProductionWorkItemView['recommendedActor'], number>
}

export interface ContentCanvasProjectData {
  projectId: number
  project: MovScriptWorkspaceIndexedEntity | null
  productions: MovScriptWorkspaceIndexedEntity[]
  segments: MovScriptWorkspaceIndexedEntity[]
  sceneMoments: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  contentUnits: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  settings: MovScriptWorkspaceIndexedEntity[]
  settingStates?: MovScriptWorkspaceIndexedEntity[]
  audioCues?: MovScriptWorkspaceIndexedEntity[]
  contentUnitCandidates: Record<string, ContentCanvasCandidate[]>
  domainGraph?: ContentSourceWorkspaceData['domainGraph']
  editingProjectsByNodeId?: Record<string, MediaEditingProjectLike>
  assetReferenceUnits?: ContentSourceWorkspaceData['assetReferenceUnits']
  productionWorkPlan?: ProductionWorkPlanView
}
