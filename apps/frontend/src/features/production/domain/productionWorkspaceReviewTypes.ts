export type ProductionWorkspaceSnapshotAction = 'create' | 'update' | 'delete'

export interface ProductionWorkspaceApplyPreviewItem {
  key: string
  title: string
  detail: string
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'setting' | 'asset_slot' | 'expression_unit'
  action?: ProductionWorkspaceSnapshotAction
  parent?: string
}

export interface ProductionWorkspaceApplyPreview {
  writeTaskGraph: ProductionWorkspaceApplyPreviewItem[]
  rejected: ProductionWorkspaceApplyPreviewItem[]
  pending: ProductionWorkspaceApplyPreviewItem[]
  blocked: ProductionWorkspaceApplyPreviewItem[]
}

export interface ProductionWorkspaceApplyGate {
  status: 'ready' | 'blocked' | 'needs_preview' | 'empty'
  title: string
  detail: string
}

export type ProductionWorkspaceNodeDecision = 'accepted' | 'rejected'
export type ProductionWorkspaceNodeDecisions = Record<string, ProductionWorkspaceNodeDecision>
export type ProductionWorkspaceSemanticDiffKind = 'structure' | 'content' | 'reference' | 'asset'

export interface ProductionWorkspaceContextItem {
  nodeKey: string
  action?: ProductionWorkspaceSnapshotAction
  title: string
  detail: string
  parent: string
}

export interface ProductionWorkspaceContextResources {
  settings: ProductionWorkspaceContextItem[]
  assetSlots: ProductionWorkspaceContextItem[]
}

export interface ProductionWorkspaceSemanticDiffItem {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProductionWorkspaceSnapshotAction
  kind: ProductionWorkspaceSemanticDiffKind
  before?: string
  after?: string
}

export interface ProductionWorkspaceSemanticDiffGroup {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProductionWorkspaceSnapshotAction
  kind: ProductionWorkspaceSemanticDiffKind
  nodeKeys: string[]
  visibleNodeKeys?: string[]
  stats: string[]
  children: ProductionWorkspaceSemanticDiffItem[]
}
