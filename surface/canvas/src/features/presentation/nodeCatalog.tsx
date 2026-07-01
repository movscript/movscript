import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  FileText,
  HardDrive,
  Image,
  ImagePlus,
  Layers3,
  LogIn,
  LogOut,
  Sparkles,
  UserCheck,
  Video,
} from 'lucide-react'
import type { NodeType } from '@movscript/shared'
import {
  CANVAS_NODE_CATEGORIES,
  CANVAS_NODE_DEFINITION_MAP,
  CANVAS_NODE_DEFINITIONS,
  CANVAS_NODE_LABELS,
  type CanvasNodeCategory,
  type CanvasNodeDefinition,
} from '../domain/nodeDefinitions'

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
  reference_to_image: ImagePlus,
  reference_to_video: Video,
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
