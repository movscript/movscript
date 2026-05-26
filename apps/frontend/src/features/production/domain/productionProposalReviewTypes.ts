export type ProductionProposalSnapshotAction = 'create' | 'update' | 'delete'

export interface ProductionProposalApplyPreviewItem {
  key: string
  title: string
  detail: string
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'creative_reference' | 'asset_slot' | 'writing_expression'
  action?: ProductionProposalSnapshotAction
  parent?: string
}

export interface ProductionProposalApplyPreview {
  writeTaskGraph: ProductionProposalApplyPreviewItem[]
  rejected: ProductionProposalApplyPreviewItem[]
  pending: ProductionProposalApplyPreviewItem[]
  blocked: ProductionProposalApplyPreviewItem[]
}

export interface ProductionProposalApplyGate {
  status: 'ready' | 'blocked' | 'needs_preview' | 'empty'
  title: string
  detail: string
}

export type ProductionProposalNodeDecision = 'accepted' | 'rejected'
export type ProductionProposalNodeDecisions = Record<string, ProductionProposalNodeDecision>
export type ProductionProposalSemanticDiffKind = 'structure' | 'content' | 'reference' | 'asset'

export interface ProductionProposalContextItem {
  nodeKey: string
  action?: ProductionProposalSnapshotAction
  title: string
  detail: string
  parent: string
}

export interface ProductionProposalContextResources {
  creativeReferences: ProductionProposalContextItem[]
  assetSlots: ProductionProposalContextItem[]
}

export interface ProductionProposalSemanticDiffItem {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProductionProposalSnapshotAction
  kind: ProductionProposalSemanticDiffKind
  before?: string
  after?: string
}

export interface ProductionProposalSemanticDiffGroup {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProductionProposalSnapshotAction
  kind: ProductionProposalSemanticDiffKind
  nodeKeys: string[]
  visibleNodeKeys?: string[]
  stats: string[]
  children: ProductionProposalSemanticDiffItem[]
}
