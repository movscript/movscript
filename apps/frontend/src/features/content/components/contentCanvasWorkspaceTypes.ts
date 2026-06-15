import type { LucideIcon } from 'lucide-react'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'

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

export type InspectorSelection =
  | { kind: 'scene_moment', node: RadialNode }
  | { kind: 'setting', setting: ContentCanvasNode }
  | { kind: 'state', node: RadialNode }
  | { kind: 'asset', node: RadialNode }
  | { kind: 'other', node: RadialNode }

export type CandidateSelections = Record<string, string>

export type TreeNodeData = {
  id?: string
  title: string
  meta: string
  code: string
  tone: string
  active?: boolean
  children?: TreeNodeData[]
}

export type TimelineItem = {
  id: string
  title: string
  type: string
  width: number
  start: number
}

export type TimelineTrackKind = 'audio' | 'video' | 'subtitle'

export type TimelineTrack = {
  kind: TimelineTrackKind
  label: string
  items: TimelineItem[]
}

export const ASSET_PROMPTS: Record<string, string> = {}
export const CANVAS_WORLD_WIDTH = 760
export const CANVAS_WORLD_HEIGHT = 460
export const SCENE_RELATION_RADIUS_X = 168
export const SCENE_RELATION_RADIUS_Y = 108
export const CONTENT_CANVAS_SETTING_DRAG_TYPE = 'application/x-movscript-content-setting'
