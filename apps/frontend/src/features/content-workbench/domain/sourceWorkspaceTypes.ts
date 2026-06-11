export type PreviewMode = 'structure' | 'source' | 'generate' | 'select'
export type SelectionState = 'selected' | 'stale' | 'needs_candidate' | 'ready'
export type RefStatus = 'current' | 'changed' | 'missing' | 'locked'
export type ChildStatus = 'selected' | 'candidate' | 'stale' | 'draft'
export type HierarchyNodeType =
  | 'production'
  | 'setting'
  | 'state'
  | 'asset'
  | 'segment'
  | 'scene_moment'
  | 'group'
  | 'shot'
  | 'expression_unit'
  | 'storyboard'
  | 'keyframe'

export interface PreviewCandidate {
  id: string
  title: string
  model: string
  inputHash: string
  selected?: boolean
  note: string
}

export interface PreviewAssetCandidate extends PreviewCandidate {
  resourceId: string
  confirmation: 'confirmed' | 'review' | 'stale'
}

export interface PreviewAssetDownstream {
  id: string
  title: string
  kind: 'keyframe' | 'storyboard' | 'shot' | 'content_unit'
  ownerNodeId: string
  momentId: string
  shotId: string
  dependencyHash: string
  state: SelectionState
  action: string
  preview: string
}

export interface PreviewAssetUpstream {
  id: string
  title: string
  kind: 'setting' | 'state' | 'asset' | 'shot' | 'content_unit'
  ownerNodeId: string
  state: RefStatus | SelectionState
  summary: string
}

export interface PreviewAssetReferenceUnit {
  assetId: string
  title: string
  path: string
  contentUnitId: string
  contentUnitType: 'asset_ref'
  outputKind: 'image'
  editPrompt: string
  usage: string
  lockPolicy: string
  acceptedInputHash?: string
  selectionState: SelectionState
  upstream: PreviewAssetUpstream[]
  candidates: PreviewAssetCandidate[]
  downstream: PreviewAssetDownstream[]
}

export interface PreviewContentUnit {
  id: string
  type: 'storyboard_ref' | 'keyframe_ref' | 'shot_video'
  outputKind: 'image' | 'video' | 'storyboard'
  sceneMomentRef: string
  shotId: string
  storyboardRef: string
  keyframeRefs: string[]
  acceptedInputHash?: string
  selectionState: SelectionState
  candidates: PreviewCandidate[]
}

export interface PreviewShot {
  id: string
  title: string
  camera: string
  duration: string
  expression: string
  stillPosition: string
  path: string
  keyframes: string[]
  assets: Array<{ title: string; status: 'ready' | 'missing' | 'locked' }>
  storyboard: string
  contentUnit: PreviewContentUnit
}

export interface PreviewMoment {
  id: string
  title: string
  path: string
  selectionState: SelectionState
  priority: '高优先级' | '中优先级' | '低优先级'
  production: string
  segment: string
  settings: string[]
  shots: PreviewShot[]
}

export interface EditableRef {
  id: string
  title: string
  owner: string
  status: RefStatus
  changedField?: string
  summary: string
  downstream: string[]
}

export interface ShotChildOption {
  id: string
  title: string
  status: ChildStatus
  inputHash: string
  summary: string
}

export interface ShotImpact {
  source: string
  kind: 'setting' | 'asset' | 'keyframe' | 'storyboard'
  change: string
  affects: string[]
  state: SelectionState
}

export interface SettingScopeState {
  node: HierarchyNode
  assets: HierarchyNode[]
  refs: EditableRef[]
}

export interface SettingScopeAsset {
  node: HierarchyNode
  unit: PreviewAssetReferenceUnit
  refs: EditableRef[]
}

export interface SettingScopeDependency {
  id: string
  title: string
  sourceTitle: string
  kind: PreviewAssetDownstream['kind'] | ShotImpact['kind'] | 'ref'
  ownerNodeId?: string
  momentId?: string
  shotId?: string
  state: SelectionState | RefStatus | ChildStatus
  dependencyHash?: string
  preview: string
  action: string
}

export interface SettingScopeDetails {
  states: SettingScopeState[]
  assets: SettingScopeAsset[]
  dependencies: SettingScopeDependency[]
}

export interface ShotWorkspaceDetails {
  settings: EditableRef[]
  assets: EditableRef[]
  keyframes: ShotChildOption[]
  storyboards: ShotChildOption[]
  impacts: ShotImpact[]
}

export interface HierarchyNode {
  id: string
  type: HierarchyNodeType
  title: string
  path: string
  state?: SelectionState | RefStatus | ChildStatus
  shotId?: string
  momentId?: string
  children?: HierarchyNode[]
}

export interface ExpressionUnit {
  id: string
  title: string
  kind: string
  summary: string
  sceneMomentId: string
}
