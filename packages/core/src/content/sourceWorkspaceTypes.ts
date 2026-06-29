export type PreviewMode = 'structure' | 'source' | 'generate' | 'select'
export type SelectionState = 'selected' | 'stale' | 'needs_candidate' | 'ready'
export type RefStatus = 'current' | 'changed' | 'missing' | 'locked'
export type ChildStatus = 'selected' | 'candidate' | 'stale' | 'draft'
export type ProductionWorkItemKind =
  | 'fix_source'
  | 'edit_structure'
  | 'create_content_unit'
  | 'generate_candidates'
  | 'select_candidate'
  | 'review_stale_selection'
  | 'review_affected_output'
export type ProductionWorkItemStatus = 'open' | 'blocked' | 'ready' | 'informational'
export type ProductionWorkItemSeverity = 'blocking' | 'warning' | 'suggestion'
export type HierarchyNodeType =
  | 'production'
  | 'setting'
  | 'state'
  | 'asset'
  | 'segment'
  | 'scene_moment'
  | 'shot'
  | 'group'
  | 'expression_unit'
  | 'audio_cue'
  | 'storyboard'
  | 'keyframe'

export interface PreviewCandidate {
  id: string
  title: string
  model: string
  inputHash: string
  selected?: boolean
  note: string
  resourceId?: number
  resourceKind?: string
  artifactRef?: string
  status?: string
  decisionStatus?: string
  decisionReason?: string
  source?: string
  producer?: Record<string, unknown>
  outputs?: unknown[]
  promptSnapshot?: Record<string, unknown>
  createdAt?: string
}

export interface PreviewAssetCandidate extends PreviewCandidate {
  confirmation: 'confirmed' | 'review' | 'stale'
}

export interface PreviewAssetDownstream {
  id: string
  title: string
  kind: 'keyframe' | 'storyboard' | 'expression_unit' | 'content_unit'
  ownerNodeId: string
  momentId: string
  expressionUnitId: string
  dependencyHash: string
  state: SelectionState
  action: string
  preview: string
}

export interface PreviewAssetUpstream {
  id: string
  title: string
  kind: 'setting' | 'state' | 'asset' | 'expression_unit' | 'content_unit'
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
  type: 'storyboard_ref' | 'keyframe_ref' | 'audio_cue_ref' | 'scence_moment_ref' | 'scene_moment_ref' | 'expression_unit_ref'
  outputKind: 'image' | 'video' | 'audio' | 'text' | 'metadata' | 'storyboard'
  path: string
  editPrompt: string
  sceneMomentRef: string
  expressionUnitRef: string
  storyboardRef: string
  keyframeRefs: string[]
  acceptedInputHash?: string
  selectionState: SelectionState
  candidates: PreviewCandidate[]
}

export interface PreviewExpressionUnit {
  id: string
  title: string
  kind: string
  slotKind?: string
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
  expressionUnits: PreviewExpressionUnit[]
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

export interface ExpressionUnitChildOption {
  id: string
  title: string
  status: ChildStatus
  inputHash: string
  summary: string
  contentUnit?: PreviewContentUnit
}

export interface ExpressionUnitImpact {
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
  kind: PreviewAssetDownstream['kind'] | ExpressionUnitImpact['kind'] | 'ref'
  ownerNodeId?: string
  momentId?: string
  expressionUnitId?: string
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

export interface ExpressionUnitWorkspaceDetails {
  settings: EditableRef[]
  assets: EditableRef[]
  keyframes: ExpressionUnitChildOption[]
  storyboards: ExpressionUnitChildOption[]
  impacts: ExpressionUnitImpact[]
}

export interface HierarchyNode {
  id: string
  type: HierarchyNodeType
  title: string
  path: string
  state?: SelectionState | RefStatus | ChildStatus
  expressionUnitId?: string
  momentId?: string
  transition?: HierarchyTransition
  storyboardTimeline?: StoryboardTimeline
  children?: HierarchyNode[]
}

export interface HierarchyTransition {
  in?: string
  out?: string
  notes?: string
}

export interface StoryboardTimeline {
  caption?: string
  gapAfterSec?: number
  durationSec?: number
}

export interface ExpressionUnit {
  id: string
  title: string
  path: string
  kind: string
  slotKind?: string
  text: string
  summary: string
  speaker?: string
  note?: string
  sceneMomentId: string
}

export interface AudioCue {
  id: string
  title: string
  path: string
  cueKind: string
  promptHint: string
  expressionUnitRef?: string
  storyboardRef?: string
  timing: Record<string, unknown>
  assetRefs: string[]
  sceneMomentId: string
  contentUnit?: PreviewContentUnit
}

export interface ProductionWorkItemView {
  id: string
  kind: ProductionWorkItemKind
  status: ProductionWorkItemStatus
  severity: ProductionWorkItemSeverity
  priority: number
  reason: string
  targetKind: string
  targetId?: string
  targetPath?: string
  recommendedActor: 'human' | 'agent' | 'workflow'
  actionLabels: string[]
}

export interface ProductionWorkPlanView {
  summary: {
    open: number
    blocking: number
    humanRecommended: number
    agentRecommended: number
    readyToGenerate: number
    staleSelections: number
  }
  items: ProductionWorkItemView[]
}
