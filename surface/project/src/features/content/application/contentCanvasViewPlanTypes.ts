import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import type { ContentCanvasNodeLayout } from './contentCanvasLayout'
import type {
  ContentCanvasCollapsedRelationSummary,
  ContentCanvasHiddenEdgeSummary,
} from './contentCanvasViewSummaries'

export type ContentCanvasViewMode = 'structure' | 'dependency' | 'issues'
export type ContentCanvasImpactKind = 'created' | 'selected' | 'affected'
export type ContentCanvasDensity = 'overview' | 'workband' | 'trace'
export type ContentCanvasLodTier = 'normal' | 'folded' | 'clustered' | 'focused'
export type ContentCanvasStatusFilter = 'all' | 'selected' | 'ready' | 'stale' | 'needs_candidate' | 'missing'
export type ContentCanvasIssueActorFilter = 'all' | 'human' | 'agent' | 'workflow'
export type ContentCanvasIssueSeverityFilter = 'all' | 'blocking' | 'warning' | 'suggestion'
export type ContentCanvasIssueTargetKindFilter = ContentCanvasNodeKind | 'all'
export type ContentCanvasEdgeFilter = ContentCanvasEdge['kind'] | NonNullable<ContentCanvasEdge['relation']>

export interface ContentCanvasViewPlanInput {
  graph: ContentCanvasWorkspaceSnapshot
  query: string
  kindFilter: ContentCanvasNodeKind | 'all'
  statusFilter?: ContentCanvasStatusFilter
  mode: ContentCanvasViewMode
  selectedNodeId: string | null
  impactByNodeId: Record<string, ContentCanvasImpactKind>
  issueActorFilter?: ContentCanvasIssueActorFilter
  issueSeverityFilter?: ContentCanvasIssueSeverityFilter
  issueTargetKindFilter?: ContentCanvasIssueTargetKindFilter
  layoutByNodeId?: Record<string, Pick<ContentCanvasNodeLayout, 'collapsed'>>
  hiddenKinds?: ContentCanvasNodeKind[]
  edgeFilters?: ContentCanvasEdgeFilter[]
  largeGraphNodeThreshold?: number
  clusterGraphNodeThreshold?: number
  focusedGraphNodeThreshold?: number
  edgeRenderLimit?: number
}

export interface ContentCanvasViewPlan {
  graph: ContentCanvasWorkspaceSnapshot
  density: ContentCanvasDensity
  lodTier: ContentCanvasLodTier
  hiddenNodeIds: Set<string>
  hiddenEdgeIds: Set<string>
  backgroundEdges: ContentCanvasEdge[]
  edgeLabelIds: Set<string>
  collapsedSummariesByNodeId: Record<string, ContentCanvasCollapsedRelationSummary[]>
  edgeSummariesByNodeId: Record<string, ContentCanvasHiddenEdgeSummary[]>
}
