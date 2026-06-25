import { useCallback, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'

import type { CanvasClientPoint } from '../domain/layout'
import {
  canvasClientPointFromEvent,
  canvasOverlayPointFromClient as canvasOverlayPointFromViewportElement,
  canvasViewportContextMenuBoundary,
} from './canvasViewportGeometry'

export type CanvasContextMenuPosition = {
  client: CanvasClientPoint
  overlay: CanvasClientPoint
  boundary: { width: number; height: number }
}

export function useCanvasContextMenuController({
  canvasPaneRef,
}: {
  canvasPaneRef: RefObject<HTMLDivElement | null>
}) {
  const [menu, setMenu] = useState<CanvasContextMenuPosition | null>(null)

  const canvasOverlayPointFromClient = useCallback((point: CanvasClientPoint) => {
    return canvasOverlayPointFromViewportElement(point, canvasPaneRef.current)
  }, [canvasPaneRef])

  const openCanvasContextMenu = useCallback((point: CanvasClientPoint) => {
    setMenu({
      client: point,
      overlay: canvasOverlayPointFromClient(point),
      boundary: canvasViewportContextMenuBoundary(canvasPaneRef.current),
    })
  }, [canvasOverlayPointFromClient, canvasPaneRef])

  const closeCanvasContextMenu = useCallback(() => setMenu(null), [])

  const onPaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault()
    openCanvasContextMenu(canvasClientPointFromEvent(event))
  }, [openCanvasContextMenu])

  const onSelectionContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    openCanvasContextMenu(canvasClientPointFromEvent(event))
  }, [openCanvasContextMenu])

  const onNodeContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    openCanvasContextMenu(canvasClientPointFromEvent(event))
  }, [openCanvasContextMenu])

  return {
    menu,
    closeCanvasContextMenu,
    onPaneContextMenu,
    onSelectionContextMenu,
    onNodeContextMenu,
  }
}
