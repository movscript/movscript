import type { ContentCanvasEdge } from '../domain/contentCanvasTypes'
import type { ContentCanvasNodeLayout } from './contentCanvasLayout'

export interface ContentCanvasPoint {
  x: number
  y: number
}

export interface ContentCanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ContentCanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface ContentCanvasViewportSize {
  width: number
  height: number
}

export interface ContentCanvasViewportCullingInput {
  nodeIds: string[]
  edges: ContentCanvasEdge[]
  layoutsByNodeId: Record<string, ContentCanvasNodeLayout>
  viewport: ContentCanvasViewport
  viewportSize: ContentCanvasViewportSize
  bufferRatio?: number
}

export interface ContentCanvasVisibleGraphIds {
  visibleNodeIds: string[]
  visibleEdgeIds: string[]
}

export function contentCanvasWorkspaceRectFromViewport(
  viewport: ContentCanvasViewport,
  size: ContentCanvasViewportSize,
): ContentCanvasRect {
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1
  return {
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    width: size.width / zoom,
    height: size.height / zoom,
  }
}

export function expandContentCanvasRect(
  rect: ContentCanvasRect,
  buffer: { x: number; y: number },
): ContentCanvasRect {
  return {
    x: rect.x - buffer.x,
    y: rect.y - buffer.y,
    width: rect.width + buffer.x * 2,
    height: rect.height + buffer.y * 2,
  }
}

export function contentCanvasNodeRect(layout: ContentCanvasNodeLayout): ContentCanvasRect {
  return {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
  }
}

export function contentCanvasRectsIntersect(left: ContentCanvasRect, right: ContentCanvasRect): boolean {
  return left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y
}

export function contentCanvasVisibleGraphIds(input: ContentCanvasViewportCullingInput): ContentCanvasVisibleGraphIds {
  const viewportRect = contentCanvasWorkspaceRectFromViewport(input.viewport, input.viewportSize)
  const bufferRatio = input.bufferRatio ?? 0.5
  const cullingRect = expandContentCanvasRect(viewportRect, {
    x: viewportRect.width * bufferRatio,
    y: viewportRect.height * bufferRatio,
  })
  const visibleNodeSet = new Set<string>()
  for (const nodeId of input.nodeIds) {
    const layout = input.layoutsByNodeId[nodeId]
    if (!layout) continue
    if (contentCanvasRectsIntersect(contentCanvasNodeRect(layout), cullingRect)) {
      visibleNodeSet.add(nodeId)
    }
  }
  const visibleEdgeIds = input.edges
    .filter((edge) => contentCanvasEdgeVisible(edge, visibleNodeSet, input.layoutsByNodeId, cullingRect))
    .map((edge) => edge.id)
  return {
    visibleNodeIds: input.nodeIds.filter((nodeId) => visibleNodeSet.has(nodeId)),
    visibleEdgeIds,
  }
}

export function contentCanvasEdgeVisible(
  edge: ContentCanvasEdge,
  visibleNodeSet: ReadonlySet<string>,
  layoutsByNodeId: Record<string, ContentCanvasNodeLayout>,
  cullingRect: ContentCanvasRect,
): boolean {
  if (visibleNodeSet.has(edge.source) || visibleNodeSet.has(edge.target)) return true
  const source = layoutsByNodeId[edge.source]
  const target = layoutsByNodeId[edge.target]
  if (!source || !target) return false
  return contentCanvasRectsIntersect(edgeBoundingRect(source, target), cullingRect)
}

function edgeBoundingRect(source: ContentCanvasNodeLayout, target: ContentCanvasNodeLayout): ContentCanvasRect {
  const sourceCenter = layoutCenter(source)
  const targetCenter = layoutCenter(target)
  const minX = Math.min(sourceCenter.x, targetCenter.x)
  const minY = Math.min(sourceCenter.y, targetCenter.y)
  return {
    x: minX,
    y: minY,
    width: Math.abs(sourceCenter.x - targetCenter.x),
    height: Math.abs(sourceCenter.y - targetCenter.y),
  }
}

function layoutCenter(layout: ContentCanvasNodeLayout): ContentCanvasPoint {
  return {
    x: layout.x + layout.width / 2,
    y: layout.y + layout.height / 2,
  }
}
