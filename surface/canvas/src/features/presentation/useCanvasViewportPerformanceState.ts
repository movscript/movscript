import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { Node } from '@xyflow/react'

import {
  CANVAS_GRID_MIN_ZOOM,
  shouldUseCanvasOverviewMode,
} from '../components/canvasEditorModel'
import { shouldUseCanvasMediaLightweightMode } from '../domain/layout'
import { canvasViewportSizeFromElement } from './canvasViewportGeometry'

export function useCanvasViewportPerformanceState({
  canvasPaneRef,
  nodes,
  viewportPositionRef,
  viewportZoomRef,
}: {
  canvasPaneRef: RefObject<HTMLDivElement | null>
  nodes: Node[]
  viewportPositionRef: { current: { x: number; y: number } }
  viewportZoomRef: { current: number }
}) {
  const [gridZoomEligible, setGridZoomEligible] = useState(true)
  const [canvasOverviewMode, setCanvasOverviewMode] = useState(false)
  const [canvasMediaLightweightMode, setCanvasMediaLightweightMode] = useState(false)

  const handleViewportMove = useCallback((_: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
    viewportZoomRef.current = viewport.zoom
    viewportPositionRef.current = { x: viewport.x, y: viewport.y }
    const nextGridZoomEligible = viewport.zoom >= CANVAS_GRID_MIN_ZOOM
    const nextOverviewMode = shouldUseCanvasOverviewMode(viewport.zoom, nodes.length)
    const viewportSize = canvasViewportSizeFromElement(canvasPaneRef.current)
    const nextMediaLightweightMode = shouldUseCanvasMediaLightweightMode({
      nodes,
      viewportX: viewport.x,
      viewportY: viewport.y,
      zoom: viewport.zoom,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
    })
    setGridZoomEligible((current) => current === nextGridZoomEligible ? current : nextGridZoomEligible)
    setCanvasOverviewMode((current) => current === nextOverviewMode ? current : nextOverviewMode)
    setCanvasMediaLightweightMode((current) => current === nextMediaLightweightMode ? current : nextMediaLightweightMode)
  }, [canvasPaneRef, nodes, viewportPositionRef, viewportZoomRef])

  useEffect(() => {
    const nextOverviewMode = shouldUseCanvasOverviewMode(viewportZoomRef.current, nodes.length)
    const viewportSize = canvasViewportSizeFromElement(canvasPaneRef.current)
    const nextMediaLightweightMode = shouldUseCanvasMediaLightweightMode({
      nodes,
      viewportX: viewportPositionRef.current.x,
      viewportY: viewportPositionRef.current.y,
      zoom: viewportZoomRef.current,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
    })
    setCanvasOverviewMode((current) => current === nextOverviewMode ? current : nextOverviewMode)
    setCanvasMediaLightweightMode((current) => current === nextMediaLightweightMode ? current : nextMediaLightweightMode)
  }, [canvasPaneRef, nodes, viewportPositionRef, viewportZoomRef])

  return {
    canvasMediaLightweightMode,
    canvasOverviewMode,
    gridZoomEligible,
    handleViewportMove,
  }
}
