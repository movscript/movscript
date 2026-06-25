import { useMemo } from 'react'

import {
  SIDEBAR_HIDDEN_NODE_TYPES,
  SIDEBAR_NODE_CATEGORIES,
} from '../components/canvasEditorModel'
import { CANVAS_NODE_CATALOG } from './nodeCatalog'
import { isPaletteNodeTypeAvailable } from '../editor/nodeFactory'
import type { CanvasType } from '@movscript/shared'

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
