import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { useResizablePanel } from '@movscript/ui/layout'
import {
  routeLayoutSpecForPathname,
  CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
  CONTENT_CANVAS_INSPECTOR_PANE_ID,
  CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
  CONTENT_CANVAS_STRUCTURE_PANE_ID,
  CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
  CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
  CONTENT_CANVAS_TIMELINE_PANE_ID,
} from '@/routes/routeLayoutRegistry'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import {
  clearContentCanvasNodePositions,
  mergeContentCanvasNodePositions,
  readContentCanvasViewState,
  subscribeContentCanvasViewState,
  type ContentCanvasNodePosition,
  type ContentCanvasViewStateScope,
} from '../application/contentCanvasViewState'
import type { CanvasMode, RadialNode } from './contentCanvasWorkspaceTypes'
import { clampRadialCoordinate, clampRadialYCoordinate } from './contentCanvasWorkspaceModel'

export function useContentCanvasPaneLayout({
  timelineVisible = true,
}: {
  timelineVisible?: boolean
} = {}) {
  const location = useLocation()
  const routeLayout = useMemo(() => routeLayoutSpecForPathname(location.pathname), [location.pathname])
  const structurePane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CONTENT_CANVAS_STRUCTURE_PANE_ID,
  })
  const inspectorPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CONTENT_CANVAS_INSPECTOR_PANE_ID,
  })
  const timelinePane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CONTENT_CANVAS_TIMELINE_PANE_ID,
  })

  const structureResize = useResizablePanel({
    size: structurePane.size,
    onSizeChange: structurePane.setSize,
    minSize: CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
    maxSize: CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
    resizeEdge: 'right',
    ariaLabel: '调整结构层级宽度',
  })
  const inspectorResize = useResizablePanel({
    size: inspectorPane.size,
    onSizeChange: inspectorPane.setSize,
    minSize: CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
    maxSize: CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
    resizeEdge: 'left',
    ariaLabel: '调整节点信息宽度',
  })
  const timelineResize = useResizablePanel({
    size: timelinePane.size,
    onSizeChange: timelinePane.setSize,
    minSize: CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
    maxSize: CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
    resizeEdge: 'top',
    ariaLabel: '调整时间线高度',
  })

  return {
    style: {
      '--content-canvas-structure-width': `${structurePane.size}px`,
      '--content-canvas-inspector-width': `${inspectorPane.size}px`,
      '--content-canvas-timeline-height': timelineVisible ? `${timelinePane.size}px` : '0px',
    } as CSSProperties,
    structure: structureResize,
    inspector: inspectorResize,
    timeline: timelineResize,
  }
}

export function useContentCanvasRadialLayout({
  projectId,
  mode,
  mainNodeId,
}: {
  projectId: number | undefined
  mode: CanvasMode
  mainNodeId: string | undefined
}) {
  const scope = useMemo<ContentCanvasViewStateScope>(() => ({
    productionId: mainNodeId,
    mode: `workspace-${mode}`,
  }), [mainNodeId, mode])
  const [positions, setPositions] = useState<Record<string, ContentCanvasNodePosition>>(() => (
    readContentCanvasViewState(projectId, scope)?.nodePositions ?? {}
  ))

  useEffect(() => {
    const syncPositions = () => setPositions(readContentCanvasViewState(projectId, scope)?.nodePositions ?? {})
    syncPositions()
    return subscribeContentCanvasViewState(projectId, scope, syncPositions)
  }, [projectId, scope])

  const applyNodePositions = useCallback((nodes: RadialNode[]) => (
    nodes.map((node) => {
      const position = positions[node.id]
      return position ? { ...node, x: position.x, y: position.y } : node
    })
  ), [positions])

  const commitNodePosition = useCallback((nodeId: string, position: ContentCanvasNodePosition) => {
    const nextPosition = {
      x: clampRadialCoordinate(position.x),
      y: clampRadialYCoordinate(position.y),
    }
    setPositions((current) => ({ ...current, [nodeId]: nextPosition }))
    mergeContentCanvasNodePositions(projectId, { [nodeId]: nextPosition }, scope)
  }, [projectId, scope])

  const reset = useCallback(() => {
    setPositions({})
    clearContentCanvasNodePositions(projectId, scope)
  }, [projectId, scope])

  return useMemo(() => ({
    applyNodePositions,
    commitNodePosition,
    reset,
  }), [applyNodePositions, commitNodePosition, reset])
}


export function ContentCanvasResizeHandle({
  className,
  resizeHandleProps,
}: {
  className: string
  resizeHandleProps: ReturnType<typeof useResizablePanel>['resizeHandleProps']
}) {
  const { active, ...props } = resizeHandleProps
  return (
    <div
      className={className}
      data-active={active ? 'true' : undefined}
      {...props}
    />
  )
}
