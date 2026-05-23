import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Brush,
  Camera,
  FileText,
  HardDrive,
  Image,
  Layers3,
  LogIn,
  LogOut,
  Palette,
  PersonStanding,
  RotateCw,
  Sparkles,
  UserCheck,
  Video,
} from 'lucide-react'
import type { NodeType } from '@/types'
import {
  CANVAS_NODE_CATEGORIES,
  CANVAS_NODE_DEFINITION_MAP,
  CANVAS_NODE_DEFINITIONS,
  CANVAS_NODE_LABELS,
  type CanvasNodeCategory,
  type CanvasNodeDefinition,
} from '@/features/canvas/domain/nodeDefinitions'

export type { CanvasNodeCategory }

export interface CanvasNodeCatalogItem extends CanvasNodeDefinition {
  icon: LucideIcon
}

const CANVAS_NODE_ICONS: Partial<Record<NodeType, LucideIcon>> = {
  input: LogIn,
  output: LogOut,
  resource_sink: HardDrive,
  approval: UserCheck,
  text: FileText,
  image: Image,
  video: Video,
  text_gen: Sparkles,
  ref_image_gen: Palette,
  ref_video_gen: Camera,
  multi_angle: RotateCw,
  style_transfer: Brush,
  motion_imitation: PersonStanding,
  canvas: Layers3,
  group: Boxes,
}

export { CANVAS_NODE_CATEGORIES }

export const CANVAS_NODE_CATALOG: CanvasNodeCatalogItem[] = CANVAS_NODE_DEFINITIONS.map((item) => ({
  ...item,
  icon: CANVAS_NODE_ICONS[item.type] ?? Boxes,
}))

export const CANVAS_NODE_META = CANVAS_NODE_DEFINITION_MAP
export const NODE_LABELS = CANVAS_NODE_LABELS
