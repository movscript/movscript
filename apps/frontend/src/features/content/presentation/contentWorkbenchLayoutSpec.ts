export const CONTENT_WORKBENCH_FILTER_PANE_MIN_WIDTH = 300
export const CONTENT_WORKBENCH_DETAIL_PANE_ID = 'content-workbench.detail-pane'
export const CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY = 'movscript.contentWorkbench.detailPaneWidth'
export const CONTENT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH = 880
export const CONTENT_WORKBENCH_DETAIL_PANE_MIN_WIDTH = 560
export const CONTENT_WORKBENCH_DETAIL_PANE_MAX_WIDTH = 1160

export function contentWorkbenchDetailPaneMaxWidth(containerRect: DOMRectReadOnly): number {
  return Math.max(
    CONTENT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
    Math.min(containerRect.width - CONTENT_WORKBENCH_FILTER_PANE_MIN_WIDTH, CONTENT_WORKBENCH_DETAIL_PANE_MAX_WIDTH),
  )
}
