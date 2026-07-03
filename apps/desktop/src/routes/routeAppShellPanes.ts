import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
  AGENT_MODE_SIDEBAR_MAX_WIDTH,
  AGENT_MODE_SIDEBAR_MIN_WIDTH,
  AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/features/agent/presentation/agentModePanelSizing'
import { APP_SIDEBAR_DEFAULT_WIDTH, APP_SIDEBAR_MAX_WIDTH, APP_SIDEBAR_MIN_WIDTH, APP_SIDEBAR_WIDTH_STORAGE_KEY } from '@movscript/ui/layout'
import type { RouteLayoutPaneSpec } from './routeLayoutTypes'

export const APP_SHELL_TOOL_SIDEBAR_PANE_ID = 'app-shell.tool-sidebar'
export const APP_SHELL_SETTINGS_SIDEBAR_PANE_ID = 'app-shell.settings-sidebar'
export const APP_SHELL_AGENT_SIDEBAR_PANE_ID = 'app-shell.agent-sidebar'
export const APP_SHELL_AGENT_CONTENT_PANE_ID = 'app-shell.agent-content-pane'
export const APP_SHELL_PROJECT_AGENT_PANE_ID = 'app-shell.project-agent-pane'
export const APP_SHELL_PROJECT_AGENT_PANE_STATE_STORAGE_KEY = 'movscript.appShell.projectAgentPane.state'
export const APP_SHELL_PROJECT_AGENT_PANE_WIDTH_STORAGE_KEY = 'movscript.appShell.projectAgentPane.width'
export const APP_SHELL_SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY = 'movscript.appShell.settingsSidebar.width'
export const APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID = 'app-shell.shell-workbench-dock'
export const APP_SHELL_SHELL_WORKBENCH_DOCK_STATE_STORAGE_KEY = 'movscript.appShell.shellWorkbench.open'
export const APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY = 'movscript.appShell.shellWorkbench.height'
export const APP_SHELL_SHELL_WORKBENCH_DOCK_DEFAULT_HEIGHT = 300
export const APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT = 236
export const APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT = 520

export const APP_SHELL_SHELL_WORKBENCH_DOCK_PANE: RouteLayoutPaneSpec = {
  id: APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID,
  side: 'bottom',
  owner: 'app-shell',
  defaultSize: APP_SHELL_SHELL_WORKBENCH_DOCK_DEFAULT_HEIGHT,
  minSize: APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT,
  maxSize: APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT,
  defaultState: 'hidden',
  allowedStates: ['default', 'hidden'],
  storageKey: APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY,
  stateStorageKey: APP_SHELL_SHELL_WORKBENCH_DOCK_STATE_STORAGE_KEY,
  persistState: true,
  collapsible: true,
  overlapMode: 'none',
}

export const APP_SHELL_REMOTION_STUDIO_SHELL_WORKBENCH_DOCK_PANE: RouteLayoutPaneSpec = {
  ...APP_SHELL_SHELL_WORKBENCH_DOCK_PANE,
  persistState: false,
  stateStorageKey: undefined,
}

export function withShellWorkbenchDock(panes: RouteLayoutPaneSpec[]): RouteLayoutPaneSpec[] {
  if (panes.some((pane) => pane.id === APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID)) return panes
  return [...panes, APP_SHELL_SHELL_WORKBENCH_DOCK_PANE]
}

export const APP_SHELL_TOOL_PANES: RouteLayoutPaneSpec[] = [
  {
    id: APP_SHELL_TOOL_SIDEBAR_PANE_ID,
    side: 'left',
    owner: 'app-shell',
    defaultSize: APP_SIDEBAR_DEFAULT_WIDTH,
    minSize: APP_SIDEBAR_MIN_WIDTH,
    maxSize: APP_SIDEBAR_MAX_WIDTH,
    collapsedSize: 0,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'hidden'],
    storageKey: APP_SIDEBAR_WIDTH_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
]

export const APP_SHELL_SETTINGS_PANES: RouteLayoutPaneSpec[] = [
  {
    id: APP_SHELL_SETTINGS_SIDEBAR_PANE_ID,
    side: 'left',
    owner: 'app-shell',
    defaultSize: APP_SIDEBAR_DEFAULT_WIDTH,
    minSize: APP_SIDEBAR_MIN_WIDTH,
    maxSize: APP_SIDEBAR_MAX_WIDTH,
    collapsedSize: 0,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'hidden'],
    storageKey: APP_SHELL_SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
]

export const APP_SHELL_PROJECT_PANES: RouteLayoutPaneSpec[] = [
  {
    id: APP_SHELL_PROJECT_AGENT_PANE_ID,
    side: 'right',
    owner: 'app-shell',
    defaultSize: AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
    minSize: AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
    maxSize: AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
    defaultState: 'collapsed',
    allowedStates: ['default', 'collapsed'],
    collapsedSize: 0,
    storageKey: APP_SHELL_PROJECT_AGENT_PANE_WIDTH_STORAGE_KEY,
    stateStorageKey: APP_SHELL_PROJECT_AGENT_PANE_STATE_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
]

export const APP_SHELL_AGENT_PANES: RouteLayoutPaneSpec[] = [
  {
    id: APP_SHELL_AGENT_SIDEBAR_PANE_ID,
    side: 'left',
    owner: 'app-shell',
    defaultSize: AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
    minSize: AGENT_MODE_SIDEBAR_MIN_WIDTH,
    maxSize: AGENT_MODE_SIDEBAR_MAX_WIDTH,
    collapsedSize: 0,
    defaultState: 'default',
    allowedStates: ['default', 'hidden'],
    storageKey: AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
    stateStorageKey: AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
  {
    id: APP_SHELL_AGENT_CONTENT_PANE_ID,
    side: 'right',
    owner: 'app-shell',
    defaultSize: AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
    minSize: AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
    maxSize: AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed'],
    collapsedSize: 0,
    storageKey: AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
    stateStorageKey: AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
]
