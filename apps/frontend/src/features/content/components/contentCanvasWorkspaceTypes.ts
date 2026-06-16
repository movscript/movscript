import type { LucideIcon } from 'lucide-react'
import type { ContentCanvasNode, ContentCanvasNodeKind, OpenCutTimelineDocumentLike } from '../domain/contentCanvasTypes'
import type { ContentCanvasSettingKind } from '../application/contentCanvasCommands'

export type SettingKind =
  | 'character'
  | 'location'
  | 'prop'
  | 'costume'
  | 'visual_style'
  | 'world_rule'
  | 'relationship'
  | 'sound_motif'

export type CanvasMode = 'scene_moment' | 'setting'

export type RadialNode = {
  id: string
  code: string
  title: string
  description: string
  x: number
  y: number
  Icon: LucideIcon
  variant?: 'primary' | 'state' | 'asset' | 'expression' | 'shot' | 'keyframe' | 'storyboard'
  parentId?: string
  source?: ContentCanvasNode
}

export type SceneSettingGroup = {
  id: string
  setting: ContentCanvasNode
  states: Array<{ state: ContentCanvasNode, assets: ContentCanvasNode[] }>
  x: number
  y: number
}

export type StarCanvasAction = {
  label: string
  onClick?: () => void
  disabled?: boolean
}

export type StarCanvasContextAction = StarCanvasAction

export type InspectorSelection =
  | { kind: 'scene_moment', node: RadialNode }
  | { kind: 'setting', setting: ContentCanvasNode }
  | { kind: 'state', node: RadialNode }
  | { kind: 'asset', node: RadialNode }
  | { kind: 'create_expression_unit', parent: ContentCanvasNode }
  | { kind: 'create_state', parent: ContentCanvasNode }
  | { kind: 'create_asset', parent: ContentCanvasNode }
  | { kind: 'create_keyframe', parent: ContentCanvasNode }
  | { kind: 'other', node: RadialNode }

export type InspectorSelectionRef = {
  kind: InspectorSelection['kind']
  nodeId: string
}

export type CandidateSelections = Record<string, string>

export type CandidateDecisionTone = 'empty' | 'pending' | 'selected' | 'locked' | 'stale'

export type CandidateDecision = {
  tone: CandidateDecisionTone
  label: string
  summary: string
  actionLabel: string
  candidateCount: number
  hasExplicitSelection: boolean
}

export type TreeNodeData = {
  id?: string
  kind: ContentCanvasNodeKind
  title: string
  meta: string
  code: string
  tone: string
  active?: boolean
  children?: TreeNodeData[]
}

export type StructureCreateDialogState =
  | { kind: 'production' }
  | { kind: 'segment'; parent: TreeNodeData }
  | { kind: 'scene_moment'; parent: TreeNodeData }

export type SettingCreateDialogState = {
  kind: 'setting'
}

export type { ContentCanvasSettingKind }

export type TimelineItem = {
  id: string
  title: string
  type: string
  width: number
  start: number
  startSec?: number
  durationSec?: number
  trimStartSec?: number
  trimEndSec?: number
  resourceId?: number
  status?: 'selected' | 'needs_candidate' | 'stale' | 'missing' | 'ready'
  contentUnitId?: string
}

export type TimelineTrackKind = 'audio' | 'video' | 'subtitle'

export type TimelineTrack = {
  kind: TimelineTrackKind
  label: string
  items: TimelineItem[]
}

export type { OpenCutTimelineDocumentLike }

export const ASSET_PROMPTS: Record<string, string> = {}
export const CANVAS_WORLD_WIDTH = 760
export const CANVAS_WORLD_HEIGHT = 460
export const SCENE_RELATION_RADIUS_X = 168
export const SCENE_RELATION_RADIUS_Y = 108
export const CONTENT_CANVAS_SETTING_DRAG_TYPE = 'application/x-movscript-content-setting'
