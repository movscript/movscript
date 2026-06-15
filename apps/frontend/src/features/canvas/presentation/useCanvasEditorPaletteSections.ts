import { useMemo } from 'react'

import {
  SIDEBAR_HIDDEN_NODE_TYPES,
  SIDEBAR_NODE_CATEGORIES,
} from '@/features/canvas/components/canvasEditorModel'
import { CANVAS_NODE_CATALOG } from '@/features/canvas/presentation/nodeCatalog'
import { isPaletteNodeTypeAvailable } from '@/features/canvas/editor/nodeFactory'
import type { CanvasType } from '@/types'

export function useCanvasEditorPaletteSections(canvasType: CanvasType) {
  return useMemo(() => SIDEBAR_NODE_CATEGORIES
    .map((category) => ({
      category,
      items: CANVAS_NODE_CATALOG.filter((item) => (
        item.category === category.id
        && !SIDEBAR_HIDDEN_NODE_TYPES.has(item.type)
        && isPaletteNodeTypeAvailable(item.type, canvasType)
      )),
    }))
    .filter((section) => section.items.length > 0), [canvasType])
}
