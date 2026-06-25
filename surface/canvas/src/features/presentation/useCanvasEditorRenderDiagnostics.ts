import { useEffect, useRef, type RefObject } from 'react'
import type { Edge, Node } from '@xyflow/react'

import {
  canvasRenderDiagnosticsEnabled,
  compactCanvasDebugOptions,
  type CanvasDebugOptions,
} from './canvasDebugOptions'
import { logCanvasRenderDiagnostics } from './canvasRenderDiagnostics'
import { canvasRenderDiagnosticViewport } from './canvasViewportGeometry'
import type { CanvasType, RawResource } from '@movscript/shared'

export function useCanvasEditorRenderDiagnostics({
  canvasDebug,
  canvasId,
  canvasMediaLightweightMode,
  canvasNodeResources,
  canvasPaneRef,
  canvasType,
  edges,
  id,
  libraryCollapsed,
  nodes,
  renderedNodesCount,
  runningCount,
  selectedCount,
  showCanvasGrid,
  showCanvasMinimap,
  visibleEdgesCount,
  viewportZoomRef,
  workflowPanelCollapsed,
}: {
  canvasDebug: CanvasDebugOptions
  canvasId: number | string
  canvasMediaLightweightMode: boolean
  canvasNodeResources: RawResource[]
  canvasPaneRef: RefObject<HTMLDivElement | null>
  canvasType: CanvasType
  edges: Edge[]
  id: string
  libraryCollapsed: boolean
  nodes: Node[]
  renderedNodesCount: number
  runningCount: number
  selectedCount: number
  showCanvasGrid: boolean
  showCanvasMinimap: boolean
  visibleEdgesCount: number
  viewportZoomRef: { current: number }
  workflowPanelCollapsed: boolean
}) {
  const renderDiagnosticsTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!canvasRenderDiagnosticsEnabled({
      dev: import.meta.env.DEV,
      renderDiagnostics: import.meta.env.VITE_MOVSCRIPT_RENDER_DIAGNOSTICS,
    }, canvasDebug)) return
    if (renderDiagnosticsTimerRef.current !== null) {
      window.clearTimeout(renderDiagnosticsTimerRef.current)
    }
    renderDiagnosticsTimerRef.current = window.setTimeout(() => {
      renderDiagnosticsTimerRef.current = null
      logCanvasRenderDiagnostics({
        id,
        canvasType,
        root: canvasPaneRef.current,
        viewport: canvasRenderDiagnosticViewport(),
        nodes,
        edgesCount: edges.length,
        renderedNodesCount,
        renderedEdgesCount: visibleEdgesCount,
        resourcesCount: canvasNodeResources.length,
        selectedCount,
        runningCount,
        libraryCollapsed,
        workflowPanelCollapsed,
        zoom: viewportZoomRef.current,
        grid: showCanvasGrid,
        minimap: showCanvasMinimap,
        mediaLightweight: canvasMediaLightweightMode,
        debugOptions: compactCanvasDebugOptions(canvasDebug),
        origin: window.location.origin,
      })
    }, 250)

    return () => {
      if (renderDiagnosticsTimerRef.current !== null) {
        window.clearTimeout(renderDiagnosticsTimerRef.current)
        renderDiagnosticsTimerRef.current = null
      }
    }
  }, [canvasDebug, canvasId, canvasMediaLightweightMode, canvasNodeResources.length, canvasPaneRef, canvasType, edges, id, libraryCollapsed, nodes, renderedNodesCount, runningCount, selectedCount, showCanvasGrid, showCanvasMinimap, visibleEdgesCount, viewportZoomRef, workflowPanelCollapsed])
}
