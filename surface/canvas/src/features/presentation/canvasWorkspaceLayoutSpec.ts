import type { RouteLayoutPaneSpec, RouteLayoutSpec } from '@movscript/ui/layout'

export const CANVAS_PALETTE_PANE_ID = 'canvas.palette-pane'
export const CANVAS_WORKFLOW_PANE_ID = 'canvas.workflow-pane'
export const CANVAS_WORKFLOW_PANE_WIDTH_STORAGE_KEY = 'movscript.canvas.workflowPaneWidth'
export const CANVAS_WORKFLOW_PANE_DEFAULT_WIDTH = 300
export const CANVAS_WORKFLOW_PANE_MIN_WIDTH = 260
export const CANVAS_WORKFLOW_PANE_MAX_WIDTH = 420

export const CANVAS_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
  {
    id: CANVAS_PALETTE_PANE_ID,
    side: 'left',
    owner: 'canvas',
    defaultState: 'default',
    allowedStates: ['default', 'collapsed'],
    collapsible: true,
    overlapMode: 'none',
  },
  {
    id: CANVAS_WORKFLOW_PANE_ID,
    side: 'right',
    owner: 'canvas',
    defaultSize: CANVAS_WORKFLOW_PANE_DEFAULT_WIDTH,
    minSize: CANVAS_WORKFLOW_PANE_MIN_WIDTH,
    maxSize: CANVAS_WORKFLOW_PANE_MAX_WIDTH,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'expanded'],
    collapsedSize: 44,
    storageKey: CANVAS_WORKFLOW_PANE_WIDTH_STORAGE_KEY,
    collapsible: true,
    expandable: true,
    overlapMode: 'pane-surface',
  },
]

export const CANVAS_WORKBENCH_ROUTE_LAYOUT: Pick<RouteLayoutSpec, 'panes'> = {
  panes: CANVAS_WORKBENCH_PANES,
}
