export const AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY = 'movscript-ai-ui-content-panel-width'
export const AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH = 380
export const AGENT_MODE_CONTENT_PANEL_MIN_WIDTH = 200
export const AGENT_MODE_CONTENT_PANEL_MAX_WIDTH = 1500

export function clampAgentModeContentPanelWidth(width: number) {
  return Math.min(AGENT_MODE_CONTENT_PANEL_MAX_WIDTH, Math.max(AGENT_MODE_CONTENT_PANEL_MIN_WIDTH, width))
}
