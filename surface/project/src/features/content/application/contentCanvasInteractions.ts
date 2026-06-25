export interface ContentCanvasPoint {
  x: number
  y: number
}

export interface ContentCanvasViewport {
  x: number
  y: number
  zoom: number
}

export type ContentCanvasRightPanePointerState =
  | { type: 'idle' }
  | {
    type: 'candidate'
    screenStart: ContentCanvasPoint
    graphStart: ContentCanvasPoint
    viewportStart: ContentCanvasViewport
  }
  | {
    type: 'panning'
    screenStart: ContentCanvasPoint
    graphStart: ContentCanvasPoint
    viewportStart: ContentCanvasViewport
  }

export type ContentCanvasRightPanePointerEnd =
  | { type: 'none' }
  | { type: 'create'; graphPosition: ContentCanvasPoint }
  | { type: 'pan'; viewport: ContentCanvasViewport }

export const CONTENT_CANVAS_RIGHT_DRAG_THRESHOLD_PX = 5

export function startContentCanvasRightPanePointer(input: {
  button: number
  screenPoint: ContentCanvasPoint
  graphPoint: ContentCanvasPoint
  viewport: ContentCanvasViewport
}): ContentCanvasRightPanePointerState {
  if (input.button !== 2) return { type: 'idle' }
  return {
    type: 'candidate',
    screenStart: input.screenPoint,
    graphStart: input.graphPoint,
    viewportStart: input.viewport,
  }
}

export function updateContentCanvasRightPanePointer(input: {
  state: ContentCanvasRightPanePointerState
  screenPoint: ContentCanvasPoint
  thresholdPx?: number
}): ContentCanvasRightPanePointerState {
  if (input.state.type === 'idle') return input.state
  const threshold = input.thresholdPx ?? CONTENT_CANVAS_RIGHT_DRAG_THRESHOLD_PX
  if (input.state.type === 'candidate' && distance(input.state.screenStart, input.screenPoint) < threshold) {
    return input.state
  }
  return {
    ...input.state,
    type: 'panning',
  }
}

export function endContentCanvasRightPanePointer(input: {
  state: ContentCanvasRightPanePointerState
  screenPoint: ContentCanvasPoint
  thresholdPx?: number
}): ContentCanvasRightPanePointerEnd {
  if (input.state.type === 'idle') return { type: 'none' }
  const threshold = input.thresholdPx ?? CONTENT_CANVAS_RIGHT_DRAG_THRESHOLD_PX
  if (input.state.type === 'candidate' && distance(input.state.screenStart, input.screenPoint) < threshold) {
    return {
      type: 'create',
      graphPosition: input.state.graphStart,
    }
  }
  return {
    type: 'pan',
    viewport: pannedViewport(input.state.viewportStart, input.state.screenStart, input.screenPoint),
  }
}

export function pannedViewport(
  viewportStart: ContentCanvasViewport,
  screenStart: ContentCanvasPoint,
  screenPoint: ContentCanvasPoint,
): ContentCanvasViewport {
  return {
    ...viewportStart,
    x: viewportStart.x + screenPoint.x - screenStart.x,
    y: viewportStart.y + screenPoint.y - screenStart.y,
  }
}

function distance(left: ContentCanvasPoint, right: ContentCanvasPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y)
}
