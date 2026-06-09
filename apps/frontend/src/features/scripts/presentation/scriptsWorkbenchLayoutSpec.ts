export const SCRIPT_WORKBENCH_LIST_MIN_WIDTH = 240
export const SCRIPT_WORKBENCH_DETAIL_PANE_ID = 'scripts.detail-pane'
export const SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY = 'movscript.scriptWorkbench.detailPaneWidth'
export const SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH = 810
export const SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH = 360
export const SCRIPT_WORKBENCH_DETAIL_PANE_MAX_WIDTH = 2400

export function scriptWorkbenchDetailPaneMaxWidth(containerRect: DOMRectReadOnly): number {
  return Math.max(
    SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
    Math.min(SCRIPT_WORKBENCH_DETAIL_PANE_MAX_WIDTH, containerRect.width - SCRIPT_WORKBENCH_LIST_MIN_WIDTH),
  )
}
