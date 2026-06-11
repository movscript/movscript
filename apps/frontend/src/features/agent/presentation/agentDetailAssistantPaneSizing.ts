export const DETAIL_AGENT_PANEL_WIDTH_STORAGE_KEY = 'movscript.appShell.assistantDockWidth'
export const DETAIL_AGENT_PANEL_MIN_WIDTH = 260
export const DETAIL_AGENT_PANEL_DEFAULT_WIDTH = 360
export const DETAIL_AGENT_PANEL_MAX_WIDTH = 720

export function clampDetailAgentPanelWidth(width: number) {
  return Math.min(DETAIL_AGENT_PANEL_MAX_WIDTH, Math.max(DETAIL_AGENT_PANEL_MIN_WIDTH, width))
}
