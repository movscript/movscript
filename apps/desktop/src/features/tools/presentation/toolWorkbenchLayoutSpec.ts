export const TOOL_WORKBENCH_RESOURCE_PANE_ID = 'tools.resource-pane'
export const TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY = 'movscript:tools:resource-pane-width'
export const TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH = 520
export const TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH = 360
export const TOOL_WORKBENCH_RESOURCE_PANE_MAX_WIDTH = 760
export const TOOL_WORKBENCH_MAIN_MIN_WIDTH = 460

export function toolWorkbenchResourcePaneMaxWidth(rect: DOMRectReadOnly): number {
  return Math.max(
    TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
    Math.min(TOOL_WORKBENCH_RESOURCE_PANE_MAX_WIDTH, rect.width - TOOL_WORKBENCH_MAIN_MIN_WIDTH),
  )
}
