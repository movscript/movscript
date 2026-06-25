import type { RouteLayoutPaneSpec, RouteLayoutSpec } from '@movscript/ui/layout'

export const CONTENT_CANVAS_STRUCTURE_PANE_ID = 'content-canvas.structure-pane'
export const CONTENT_CANVAS_INSPECTOR_PANE_ID = 'content-canvas.inspector-pane'
export const CONTENT_CANVAS_TIMELINE_PANE_ID = 'content-canvas.timeline-pane'

export const CONTENT_CANVAS_STRUCTURE_WIDTH_STORAGE_KEY = 'movscript.contentCanvas.structure.width'
export const CONTENT_CANVAS_INSPECTOR_WIDTH_STORAGE_KEY = 'movscript.contentCanvas.inspector.width'
export const CONTENT_CANVAS_TIMELINE_HEIGHT_STORAGE_KEY = 'movscript.contentCanvas.timeline.height'

export const CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH = 236
export const CONTENT_CANVAS_STRUCTURE_MIN_WIDTH = 188
export const CONTENT_CANVAS_STRUCTURE_MAX_WIDTH = 420

export const CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH = 336
export const CONTENT_CANVAS_INSPECTOR_MIN_WIDTH = 280
export const CONTENT_CANVAS_INSPECTOR_MAX_WIDTH = 520

export const CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT = 190
export const CONTENT_CANVAS_TIMELINE_MIN_HEIGHT = 120
export const CONTENT_CANVAS_TIMELINE_MAX_HEIGHT = 340

export const CONTENT_CANVAS_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
  {
    id: CONTENT_CANVAS_STRUCTURE_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultSize: CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH,
    minSize: CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
    maxSize: CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
    defaultState: 'default',
    allowedStates: ['default'],
    storageKey: CONTENT_CANVAS_STRUCTURE_WIDTH_STORAGE_KEY,
    persistState: true,
    overlapMode: 'none',
  },
  {
    id: CONTENT_CANVAS_INSPECTOR_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultSize: CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH,
    minSize: CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
    maxSize: CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
    defaultState: 'default',
    allowedStates: ['default'],
    storageKey: CONTENT_CANVAS_INSPECTOR_WIDTH_STORAGE_KEY,
    persistState: true,
    overlapMode: 'none',
  },
  {
    id: CONTENT_CANVAS_TIMELINE_PANE_ID,
    side: 'bottom',
    owner: 'workbench',
    defaultSize: CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT,
    minSize: CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
    maxSize: CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
    defaultState: 'default',
    allowedStates: ['default'],
    storageKey: CONTENT_CANVAS_TIMELINE_HEIGHT_STORAGE_KEY,
    persistState: true,
    overlapMode: 'none',
  },
]

export const CONTENT_CANVAS_WORKBENCH_ROUTE_LAYOUT: Pick<RouteLayoutSpec, 'panes'> = {
  panes: CONTENT_CANVAS_WORKBENCH_PANES,
}
