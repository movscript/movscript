import {
  canvasDefaultClientPoint,
  type CanvasClientPoint,
} from '../domain/layout'
import {
  createCanvasViewportDropHitMap,
  type CanvasDropInteractionBox,
  type CanvasDropLayoutHitMap,
  type CanvasDropPayload,
} from '../domain/canvasDropTarget'

export interface CanvasViewportRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface CanvasViewportSize {
  width: number
  height: number
}

export interface CanvasRenderDiagnosticViewport extends CanvasViewportSize {
  dpr: number
}

export interface CanvasViewportElement {
  clientWidth: number
  clientHeight: number
  getBoundingClientRect(): CanvasViewportRect
}

export interface CanvasClientPointEvent {
  clientX: number
  clientY: number
}

export function canvasViewportWindowMetrics(): CanvasRenderDiagnosticViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0, dpr: 1 }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
  }
}

export function canvasViewportRectFromElement(
  viewport: Pick<CanvasViewportElement, 'getBoundingClientRect'> | null | undefined,
): CanvasViewportRect | null {
  return viewport?.getBoundingClientRect() ?? null
}

export function canvasViewportSizeFromElement(
  viewport: Pick<CanvasViewportElement, 'clientWidth' | 'clientHeight'> | null | undefined,
  fallback: CanvasViewportSize = canvasViewportWindowMetrics(),
): CanvasViewportSize {
  return {
    width: viewport?.clientWidth ?? fallback.width,
    height: viewport?.clientHeight ?? fallback.height,
  }
}

export function canvasDefaultClientPointFromViewportElement(
  viewport: Pick<CanvasViewportElement, 'getBoundingClientRect'> | null | undefined,
  fallback: CanvasViewportSize = canvasViewportWindowMetrics(),
): CanvasClientPoint {
  return canvasDefaultClientPoint({
    containerRect: canvasViewportRectFromElement(viewport),
    viewportWidth: fallback.width,
    viewportHeight: fallback.height,
  })
}

export function canvasOverlayPointFromClient(
  point: CanvasClientPoint,
  viewport: Pick<CanvasViewportElement, 'getBoundingClientRect'> | null | undefined,
): CanvasClientPoint {
  const rect = canvasViewportRectFromElement(viewport)
  return rect
    ? { x: point.x - rect.left, y: point.y - rect.top }
    : point
}

export function canvasClientPointFromEvent(event: CanvasClientPointEvent): CanvasClientPoint {
  return {
    x: finiteCoordinate(event.clientX),
    y: finiteCoordinate(event.clientY),
  }
}

export function canvasViewportContextMenuBoundary(
  viewport: Pick<CanvasViewportElement, 'clientWidth' | 'clientHeight'> | null | undefined,
  fallback: CanvasViewportSize = canvasViewportWindowMetrics(),
): CanvasViewportSize {
  return canvasViewportSizeFromElement(viewport, fallback)
}

export function createCanvasViewportDropHitMapFromElement(
  viewport: Pick<CanvasViewportElement, 'getBoundingClientRect'> | null | undefined,
): CanvasDropLayoutHitMap {
  return createCanvasViewportDropHitMap({
    viewportRect: canvasViewportRectFromElement(viewport),
  })
}

export function canvasViewportDropHitBoxFromEvent({
  event,
  viewport,
  payload,
}: {
  event: CanvasClientPointEvent
  viewport: Pick<CanvasViewportElement, 'getBoundingClientRect'> | null | undefined
  payload?: CanvasDropPayload | null
}): CanvasDropInteractionBox | null {
  return createCanvasViewportDropHitMapFromElement(viewport).boxFromClient(
    canvasClientPointFromEvent(event),
    payload,
  )
}

export function canvasRenderDiagnosticViewport(): CanvasRenderDiagnosticViewport {
  return canvasViewportWindowMetrics()
}

function finiteCoordinate(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}
