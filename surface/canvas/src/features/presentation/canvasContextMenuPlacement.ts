export type CanvasContextMenuPositioning = 'fixed' | 'viewport'

export interface CanvasContextMenuSize {
  width: number
  height: number
}

export interface CanvasContextMenuPoint {
  left: number
  top: number
}

export interface CanvasContextMenuStyle {
  left: number
  top: number
}

export interface CanvasContextMenuRect extends CanvasContextMenuSize {}

export interface CanvasContextMenuElement {
  getBoundingClientRect(): CanvasContextMenuRect
}

const CANVAS_CONTEXT_MENU_VIEWPORT_PADDING = 8

export function canvasContextMenuViewportFromWindow(): CanvasContextMenuSize {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return { width: window.innerWidth, height: window.innerHeight }
}

export function canvasContextMenuPositionFromRect({
  x,
  y,
  menuRect,
  positioning,
  boundary,
  viewport = canvasContextMenuViewportFromWindow(),
}: {
  x: number
  y: number
  menuRect: CanvasContextMenuRect
  positioning: CanvasContextMenuPositioning
  boundary?: CanvasContextMenuSize
  viewport?: CanvasContextMenuSize
}): CanvasContextMenuPoint {
  const padding = CANVAS_CONTEXT_MENU_VIEWPORT_PADDING
  const maxWidth = positioning === 'viewport' ? boundary?.width ?? viewport.width : viewport.width
  const maxHeight = positioning === 'viewport' ? boundary?.height ?? viewport.height : viewport.height
  const maxLeft = Math.max(padding, maxWidth - menuRect.width - padding)
  const maxTop = Math.max(padding, maxHeight - menuRect.height - padding)

  return {
    left: Math.min(Math.max(padding, x), maxLeft),
    top: Math.min(Math.max(padding, y), maxTop),
  }
}

export function canvasContextMenuPositionFromElement({
  element,
  x,
  y,
  positioning,
  boundary,
  viewport,
}: {
  element: CanvasContextMenuElement
  x: number
  y: number
  positioning: CanvasContextMenuPositioning
  boundary?: CanvasContextMenuSize
  viewport?: CanvasContextMenuSize
}): CanvasContextMenuPoint {
  return canvasContextMenuPositionFromRect({
    x,
    y,
    positioning,
    boundary,
    viewport,
    menuRect: element.getBoundingClientRect(),
  })
}

export function canvasContextMenuStyleFromPosition(position: CanvasContextMenuPoint): CanvasContextMenuStyle {
  return {
    left: finiteNumber(position.left),
    top: finiteNumber(position.top),
  }
}

function finiteNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}
