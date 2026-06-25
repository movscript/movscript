export const AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY = 'movscript-ai-ui-sidebar-width'
export const LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY = 'movscript-ai-ui-sidebar-collapsed'
export const AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY = 'movscript:agent-mode:sidebar-state'
export const AGENT_MODE_SIDEBAR_DEFAULT_WIDTH = 288
export const AGENT_MODE_SIDEBAR_MIN_WIDTH = 180
export const AGENT_MODE_SIDEBAR_MAX_WIDTH = 420

export const LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY = 'movscript-ai-ui-content-panel-collapsed'
export const AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY = 'movscript:agent-mode:content-pane-state'
export const AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY = 'movscript-ai-ui-content-panel-width'
export const AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH = 380
export const AGENT_MODE_CONTENT_PANEL_MIN_WIDTH = 200
export const AGENT_MODE_CONTENT_PANEL_MAX_WIDTH = 1500

export function clampAgentModeSidebarWidth(width: number) {
  return Math.min(AGENT_MODE_SIDEBAR_MAX_WIDTH, Math.max(AGENT_MODE_SIDEBAR_MIN_WIDTH, width))
}

export function clampAgentModeContentPanelWidth(width: number) {
  return Math.min(AGENT_MODE_CONTENT_PANEL_MAX_WIDTH, Math.max(AGENT_MODE_CONTENT_PANEL_MIN_WIDTH, width))
}
