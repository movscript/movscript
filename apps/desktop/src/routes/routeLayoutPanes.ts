import {
  TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_ID,
  TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY,
  toolWorkbenchResourcePaneMaxWidth,
} from '@/features/tools/presentation/toolWorkbenchLayoutSpec'
import {
  PLUGIN_TOOL_NATIVE_LAYOUT_NOTE,
  PLUGIN_TOOL_NATIVE_MAIN_PANE_ID,
} from '@/features/plugins/presentation/pluginToolLayoutSpec'
import {
  CANVAS_WORKBENCH_PANES,
} from '@movscript/canvas-surface/layout'
import {
  CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
  CONTENT_CANVAS_INSPECTOR_PANE_ID,
  CONTENT_CANVAS_INSPECTOR_WIDTH_STORAGE_KEY,
  CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
  CONTENT_CANVAS_STRUCTURE_PANE_ID,
  CONTENT_CANVAS_STRUCTURE_WIDTH_STORAGE_KEY,
  CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT,
  CONTENT_CANVAS_TIMELINE_HEIGHT_STORAGE_KEY,
  CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
  CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
  CONTENT_CANVAS_TIMELINE_PANE_ID,
  CONTENT_CANVAS_WORKBENCH_PANES,
} from '@movscript/project-surface/layout'
import type { RouteLayoutPaneSpec } from './routeLayoutTypes'
import {
  APP_SHELL_AGENT_PANES,
  APP_SHELL_PROJECT_PANES,
  APP_SHELL_SETTINGS_PANES,
  APP_SHELL_TOOL_PANES,
} from './routeAppShellPanes'

export {
  CANVAS_PALETTE_PANE_ID,
  CANVAS_WORKBENCH_PANES,
  CANVAS_WORKFLOW_PANE_DEFAULT_WIDTH,
  CANVAS_WORKFLOW_PANE_ID,
  CANVAS_WORKFLOW_PANE_MAX_WIDTH,
  CANVAS_WORKFLOW_PANE_MIN_WIDTH,
  CANVAS_WORKFLOW_PANE_WIDTH_STORAGE_KEY,
} from '@movscript/canvas-surface/layout'

export {
  CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
  CONTENT_CANVAS_INSPECTOR_PANE_ID,
  CONTENT_CANVAS_INSPECTOR_WIDTH_STORAGE_KEY,
  CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
  CONTENT_CANVAS_STRUCTURE_PANE_ID,
  CONTENT_CANVAS_STRUCTURE_WIDTH_STORAGE_KEY,
  CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT,
  CONTENT_CANVAS_TIMELINE_HEIGHT_STORAGE_KEY,
  CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
  CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
  CONTENT_CANVAS_TIMELINE_PANE_ID,
  CONTENT_CANVAS_WORKBENCH_PANES,
} from '@movscript/project-surface/layout'

export {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_PANES,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_PROJECT_AGENT_PANE_ID,
  APP_SHELL_PROJECT_AGENT_PANE_STATE_STORAGE_KEY,
  APP_SHELL_PROJECT_AGENT_PANE_WIDTH_STORAGE_KEY,
  APP_SHELL_PROJECT_PANES,
  APP_SHELL_SETTINGS_PANES,
  APP_SHELL_SETTINGS_SIDEBAR_PANE_ID,
  APP_SHELL_SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY,
  APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY,
  APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
  APP_SHELL_TOOL_PANES,
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
} from './routeAppShellPanes'

export const AGENT_CONNECTION_THREADS_PANE_ID = 'agent.connections.threads-pane'
export const AGENT_CONNECTION_EVENTS_PANE_ID = 'agent.connections.events-pane'
export const AGENT_CONNECTION_RAW_PANE_ID = 'agent.connections.raw-pane'
export const WORKSPACE_CONFIG_FILE_TREE_PANE_ID = 'workspace.config.file-tree-pane'
export const WORKSPACE_CONFIG_EDITOR_PANE_ID = 'workspace.config.editor-pane'
export const WORKSPACE_REVIEW_SUMMARY_PANE_ID = 'workspace.review.summary-pane'
export const WORKSPACE_REVIEW_RAW_PANE_ID = 'workspace.review.raw-pane'
export const CANVAS_PANES: RouteLayoutPaneSpec[] = CANVAS_WORKBENCH_PANES

export const TOOL_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
  {
    id: TOOL_WORKBENCH_RESOURCE_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultSize: TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH,
    minSize: TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
    maxSize: toolWorkbenchResourcePaneMaxWidth,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'expanded'],
    storageKey: TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    expandable: true,
    collapseMode: 'after-min',
    expandMode: 'after-max',
    overlapMode: 'pane-surface',
  },
]

export const PLUGIN_TOOL_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
  {
    id: PLUGIN_TOOL_NATIVE_MAIN_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
]

export const AGENT_CONNECTION_WORKSPACE_PANES: RouteLayoutPaneSpec[] = [
  {
    id: AGENT_CONNECTION_THREADS_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
  {
    id: AGENT_CONNECTION_EVENTS_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
  {
    id: AGENT_CONNECTION_RAW_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
]

export const WORKSPACE_CONFIG_PANES: RouteLayoutPaneSpec[] = [
  {
    id: WORKSPACE_CONFIG_FILE_TREE_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
  {
    id: WORKSPACE_CONFIG_EDITOR_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
]

export const WORKSPACE_REVIEW_PANES: RouteLayoutPaneSpec[] = [
  {
    id: WORKSPACE_REVIEW_SUMMARY_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
  {
    id: WORKSPACE_REVIEW_RAW_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
]

export const TOOL_DOCUMENT_ROUTE = {
  kind: 'page' as const,
  surface: 'tool' as const,
  scrollMode: 'document' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_TOOL_PANES,
}

export const TOOL_WORKSPACE_ROUTE = {
  kind: 'page' as const,
  surface: 'tool' as const,
  scrollMode: 'workspace' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_TOOL_PANES,
}

export const SETTINGS_WORKSPACE_ROUTE = {
  kind: 'page' as const,
  surface: 'settings' as const,
  chrome: 'settings' as const,
  preserveWorkMode: true,
  scrollMode: 'workspace' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_SETTINGS_PANES,
}

export const AGENT_SETTINGS_DOCUMENT_ROUTE = {
  kind: 'page' as const,
  surface: 'settings' as const,
  chrome: 'settings' as const,
  preserveWorkMode: true,
  scrollMode: 'document' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_SETTINGS_PANES,
}

export const PROJECT_WORKSPACE_ROUTE = {
  kind: 'page' as const,
  surface: 'project' as const,
  scrollMode: 'workspace' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_PROJECT_PANES,
}

export const HOME_ROUTE = {
  kind: 'page' as const,
  surface: 'home' as const,
  scrollMode: 'document' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_PROJECT_PANES,
}

export const REDIRECT_ROUTE = {
  kind: 'redirect' as const,
  surface: 'tool' as const,
  scrollMode: 'hidden' as const,
  shellLayout: 'stacked' as const,
  panes: [],
}

export { PLUGIN_TOOL_NATIVE_LAYOUT_NOTE }
