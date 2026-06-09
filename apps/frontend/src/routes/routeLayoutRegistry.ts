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
import {
  SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
  SCRIPT_WORKBENCH_DETAIL_PANE_ID,
  SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
  SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
  scriptWorkbenchDetailPaneMaxWidth,
} from '@/features/scripts/presentation/scriptsWorkbenchLayoutSpec'
import {
  CONTENT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
  CONTENT_WORKBENCH_DETAIL_PANE_ID,
  CONTENT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
  CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
  contentWorkbenchDetailPaneMaxWidth,
} from '@/features/content/presentation/contentWorkbenchLayoutSpec'
import {
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID,
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
  preProductionWorkbenchDetailPaneMaxWidth,
} from '@/features/pre-production/presentation/preProductionWorkbenchLayoutSpec'
import {
  TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_ID,
  TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY,
  toolWorkbenchResourcePaneMaxWidth,
} from '@/features/tools/presentation/toolWorkbenchLayoutSpec'
import {
  APP_SIDEBAR_DEFAULT_WIDTH,
  APP_SIDEBAR_MAX_WIDTH,
  APP_SIDEBAR_MIN_WIDTH,
  APP_SIDEBAR_WIDTH_STORAGE_KEY,
} from '@movscript/ui'

import { ROUTES } from './projectRoutes'

export type RouteLayoutKind = 'page' | 'redirect' | 'overlay-action' | 'runtime'
export type RouteLayoutSurface = 'detail' | 'agent' | 'canvas'
export type RouteScrollMode = 'document' | 'workspace' | 'canvas' | 'hidden'
export type RouteShellLayout = 'flush' | 'stacked'
export type RouteLayoutPaneSide = 'left' | 'right' | 'bottom'
export type RouteLayoutPaneState = 'default' | 'collapsed' | 'expanded' | 'hidden'
export type RouteLayoutOverlapMode = 'none' | 'offset-stack' | 'pane-surface' | 'overlay'
export type RouteLayoutViewportScroll = 'auto' | 'owned' | 'hidden'
export type RouteLayoutPaneSizeLimit = number | ((containerRect: DOMRectReadOnly) => number)
export type RouteLayoutPaneCollapseMode = 'button' | 'after-min' | 'none'
export type RouteLayoutPaneExpandMode = 'button' | 'after-max' | 'none'

export const APP_SHELL_DETAIL_SIDEBAR_PANE_ID = 'app-shell.detail-sidebar'
export const APP_SHELL_ASSISTANT_DOCK_PANE_ID = 'app-shell.assistant-dock'
export const APP_SHELL_AGENT_SIDEBAR_PANE_ID = 'app-shell.agent-sidebar'
export const APP_SHELL_AGENT_CONTENT_PANE_ID = 'app-shell.agent-content-pane'
export const APP_SHELL_TERMINAL_DOCK_PANE_ID = 'app-shell.terminal-dock'
export const APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY = 'movscript.appShell.terminal.open'
export const AGENT_CONSOLE_MAIN_PANE_ID = 'agent.console.main-pane'
export const AGENT_CONSOLE_LOGS_PANE_ID = 'agent.console.logs-pane'
export const AGENT_CONNECTION_THREADS_PANE_ID = 'agent.connections.threads-pane'
export const AGENT_CONNECTION_EVENTS_PANE_ID = 'agent.connections.events-pane'
export const AGENT_CONNECTION_RAW_PANE_ID = 'agent.connections.raw-pane'
export const WORKSPACE_CONFIG_FILE_TREE_PANE_ID = 'workspace.config.file-tree-pane'
export const WORKSPACE_CONFIG_EDITOR_PANE_ID = 'workspace.config.editor-pane'
export const WORKSPACE_REVIEW_SUMMARY_PANE_ID = 'workspace.review.summary-pane'
export const WORKSPACE_REVIEW_RAW_PANE_ID = 'workspace.review.raw-pane'
export const AGENT_RUN_SIDEBAR_PANE_ID = 'agent.run.sidebar-pane'
export const AGENT_RUN_TRACE_PANE_ID = 'agent.run.trace-pane'

export interface RouteLayoutPaneSpec {
  id: string
  side: RouteLayoutPaneSide
  owner: 'app-shell' | 'workbench' | 'canvas' | 'dialog'
  defaultSize?: number
  minSize?: RouteLayoutPaneSizeLimit
  maxSize?: RouteLayoutPaneSizeLimit
  collapsedSize?: number
  defaultState?: RouteLayoutPaneState
  allowedStates?: RouteLayoutPaneState[]
  storageKey?: string
  stateStorageKey?: string
  persistState?: boolean
  collapsible?: boolean
  expandable?: boolean
  collapseMode?: RouteLayoutPaneCollapseMode
  expandMode?: RouteLayoutPaneExpandMode
  overlapMode?: RouteLayoutOverlapMode
}

export interface RouteLayoutSpec {
  routeId: string
  pathnamePattern: string
  kind: RouteLayoutKind
  surface: RouteLayoutSurface
  scrollMode: RouteScrollMode
  shellLayout: RouteShellLayout
  contentWidth?: 'narrow' | 'normal' | 'wide' | 'xwide' | 'full'
  workbenchId?: 'project_standards' | 'pre_production' | 'orchestration_production' | 'content_orchestration'
  panes: RouteLayoutPaneSpec[]
  notes?: string
}

interface RouteLayoutRegistryEntry extends RouteLayoutSpec {
  match: (pathname: string) => boolean
}

const APP_SHELL_DETAIL_PANES: RouteLayoutPaneSpec[] = [
  {
    id: APP_SHELL_DETAIL_SIDEBAR_PANE_ID,
    side: 'left',
    owner: 'app-shell',
    defaultSize: APP_SIDEBAR_DEFAULT_WIDTH,
    minSize: APP_SIDEBAR_MIN_WIDTH,
    maxSize: APP_SIDEBAR_MAX_WIDTH,
    collapsedSize: 44,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'hidden'],
    storageKey: APP_SIDEBAR_WIDTH_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
  {
    id: APP_SHELL_ASSISTANT_DOCK_PANE_ID,
    side: 'right',
    owner: 'app-shell',
    defaultState: 'hidden',
    allowedStates: ['default', 'hidden'],
    persistState: false,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
  {
    id: APP_SHELL_TERMINAL_DOCK_PANE_ID,
    side: 'bottom',
    owner: 'app-shell',
    defaultState: 'hidden',
    allowedStates: ['default', 'hidden'],
    stateStorageKey: APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'none',
  },
]

const APP_SHELL_AGENT_PANES: RouteLayoutPaneSpec[] = [
  {
    id: APP_SHELL_AGENT_SIDEBAR_PANE_ID,
    side: 'left',
    owner: 'app-shell',
    defaultSize: AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
    minSize: AGENT_MODE_SIDEBAR_MIN_WIDTH,
    maxSize: AGENT_MODE_SIDEBAR_MAX_WIDTH,
    collapsedSize: 44,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'hidden'],
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
    defaultState: 'collapsed',
    allowedStates: ['default', 'collapsed', 'hidden'],
    collapsedSize: 0,
    storageKey: AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
    stateStorageKey: AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'offset-stack',
  },
  {
    id: APP_SHELL_TERMINAL_DOCK_PANE_ID,
    side: 'bottom',
    owner: 'app-shell',
    defaultState: 'hidden',
    allowedStates: ['default', 'hidden'],
    stateStorageKey: APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    overlapMode: 'none',
  },
]

const CANVAS_PANES: RouteLayoutPaneSpec[] = [
  {
    id: 'canvas.palette-pane',
    side: 'left',
    owner: 'canvas',
    defaultState: 'default',
    allowedStates: ['default', 'collapsed'],
    collapsible: true,
    overlapMode: 'none',
  },
  {
    id: 'canvas.workflow-pane',
    side: 'right',
    owner: 'canvas',
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'expanded'],
    collapsible: true,
    expandable: true,
    overlapMode: 'pane-surface',
  },
]

const SCRIPT_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
  {
    id: SCRIPT_WORKBENCH_DETAIL_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultSize: SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
    minSize: SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
    maxSize: scriptWorkbenchDetailPaneMaxWidth,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'expanded'],
    storageKey: SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    expandable: true,
    collapseMode: 'after-min',
    expandMode: 'after-max',
    overlapMode: 'pane-surface',
  },
]

const PRE_PRODUCTION_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
  {
    id: PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultSize: PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
    minSize: PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
    maxSize: preProductionWorkbenchDetailPaneMaxWidth,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'expanded'],
    storageKey: PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    expandable: true,
    collapseMode: 'after-min',
    expandMode: 'after-max',
    overlapMode: 'pane-surface',
  },
]

const CONTENT_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
  {
    id: CONTENT_WORKBENCH_DETAIL_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultSize: CONTENT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
    minSize: CONTENT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
    maxSize: contentWorkbenchDetailPaneMaxWidth,
    defaultState: 'default',
    allowedStates: ['default', 'collapsed', 'expanded'],
    storageKey: CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
    persistState: true,
    collapsible: true,
    expandable: true,
    collapseMode: 'after-min',
    expandMode: 'after-max',
    overlapMode: 'pane-surface',
  },
]

const TOOL_WORKBENCH_PANES: RouteLayoutPaneSpec[] = [
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

const AGENT_CONSOLE_WORKSPACE_PANES: RouteLayoutPaneSpec[] = [
  {
    id: AGENT_CONSOLE_MAIN_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
  {
    id: AGENT_CONSOLE_LOGS_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
]

const AGENT_CONNECTION_WORKSPACE_PANES: RouteLayoutPaneSpec[] = [
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

const WORKSPACE_CONFIG_PANES: RouteLayoutPaneSpec[] = [
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

const WORKSPACE_REVIEW_PANES: RouteLayoutPaneSpec[] = [
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

const AGENT_RUN_WORKSPACE_PANES: RouteLayoutPaneSpec[] = [
  {
    id: AGENT_RUN_SIDEBAR_PANE_ID,
    side: 'left',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
  {
    id: AGENT_RUN_TRACE_PANE_ID,
    side: 'right',
    owner: 'workbench',
    defaultState: 'default',
    allowedStates: ['default'],
    overlapMode: 'none',
  },
]

const DETAIL_DOCUMENT_ROUTE = {
  kind: 'page' as const,
  surface: 'detail' as const,
  scrollMode: 'document' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_DETAIL_PANES,
}

const DETAIL_WORKSPACE_ROUTE = {
  kind: 'page' as const,
  surface: 'detail' as const,
  scrollMode: 'workspace' as const,
  shellLayout: 'stacked' as const,
  panes: APP_SHELL_DETAIL_PANES,
}

const REDIRECT_ROUTE = {
  kind: 'redirect' as const,
  surface: 'detail' as const,
  scrollMode: 'hidden' as const,
  shellLayout: 'stacked' as const,
  panes: [],
}

const routeLayoutRegistry: RouteLayoutRegistryEntry[] = [
  route({
    routeId: 'onboarding',
    pathnamePattern: '/onboarding',
    kind: 'page',
    surface: 'detail',
    scrollMode: 'document',
    shellLayout: 'flush',
    panes: [],
    notes: 'Standalone onboarding recovery surface; it must not depend on app shell panes.',
  }, exact('/onboarding')),
  route({
    routeId: 'invite',
    pathnamePattern: ROUTES.invite,
    kind: 'page',
    surface: 'detail',
    scrollMode: 'document',
    shellLayout: 'flush',
    panes: [],
    notes: 'Standalone invite recovery surface; authenticated direct route also bypasses ShellLayout.',
  }, (pathname) => /^\/invite\/[^/]+\/?$/.test(pathname)),
  route({
    routeId: 'canvas.editor',
    pathnamePattern: ROUTES.canvasEditor,
    kind: 'page',
    surface: 'canvas',
    scrollMode: 'canvas',
    shellLayout: 'flush',
    panes: CANVAS_PANES,
  }, (pathname) => /^\/canvases\/[^/]+\/?$/.test(pathname)),
  route({
    routeId: 'project.agent',
    pathnamePattern: ROUTES.project.agent,
    kind: 'page',
    surface: 'agent',
    scrollMode: 'workspace',
    shellLayout: 'stacked',
    workbenchId: undefined,
    panes: APP_SHELL_AGENT_PANES,
  }, (pathname) => pathname === ROUTES.project.agent),
  route({
    routeId: 'project.agentCanvases',
    pathnamePattern: ROUTES.project.agentCanvases,
    kind: 'page',
    surface: 'agent',
    scrollMode: 'document',
    shellLayout: 'stacked',
    panes: APP_SHELL_AGENT_PANES,
  }, exact(ROUTES.project.agentCanvases)),
  route({
    routeId: 'project.standards',
    pathnamePattern: ROUTES.project.standards,
    ...DETAIL_WORKSPACE_ROUTE,
    workbenchId: 'project_standards',
  }, exact(ROUTES.project.standards)),
  route({
    routeId: 'project.preProduction',
    pathnamePattern: ROUTES.project.preProduction,
    ...DETAIL_WORKSPACE_ROUTE,
    workbenchId: 'pre_production',
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...PRE_PRODUCTION_WORKBENCH_PANES],
  }, exact(ROUTES.project.preProduction)),
  route({
    routeId: 'project.scripts',
    pathnamePattern: ROUTES.project.scripts,
    ...DETAIL_WORKSPACE_ROUTE,
    workbenchId: 'orchestration_production',
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...SCRIPT_WORKBENCH_PANES],
  }, exact(ROUTES.project.scripts)),
  route({
    routeId: 'project.contentUnitEditor',
    pathnamePattern: ROUTES.project.contentUnitEditor,
    ...DETAIL_WORKSPACE_ROUTE,
    workbenchId: 'content_orchestration',
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...CONTENT_WORKBENCH_PANES],
  }, exact(ROUTES.project.contentUnitEditor)),
  route({
    routeId: 'tools.refImageGen',
    pathnamePattern: ROUTES.tools.refImageGen,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...TOOL_WORKBENCH_PANES],
  }, exact(ROUTES.tools.refImageGen)),
  route({
    routeId: 'tools.refVideoGen',
    pathnamePattern: ROUTES.tools.refVideoGen,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...TOOL_WORKBENCH_PANES],
  }, exact(ROUTES.tools.refVideoGen)),
  route({
    routeId: 'tools.motionImitation',
    pathnamePattern: ROUTES.tools.motionImitation,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...TOOL_WORKBENCH_PANES],
  }, exact(ROUTES.tools.motionImitation)),
  route({
    routeId: 'tools.styleTransfer',
    pathnamePattern: ROUTES.tools.styleTransfer,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...TOOL_WORKBENCH_PANES],
  }, exact(ROUTES.tools.styleTransfer)),
  route({
    routeId: 'tools.multiAngle',
    pathnamePattern: ROUTES.tools.multiAngle,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...TOOL_WORKBENCH_PANES],
  }, exact(ROUTES.tools.multiAngle)),
  route({
    routeId: 'tools.plugin',
    pathnamePattern: ROUTES.tools.plugin,
    ...DETAIL_WORKSPACE_ROUTE,
    notes: 'Plugin route must provide or inherit a plugin layout spec before adding local layout escape hatches.',
  }, (pathname) => /^\/tools\/plugin\/[^/]+\/?$/.test(pathname)),
  route({
    routeId: 'project.contentUnitWorkbench.redirect',
    pathnamePattern: ROUTES.project.contentUnitWorkbench,
    ...REDIRECT_ROUTE,
  }, exact(ROUTES.project.contentUnitWorkbench)),
  route({
    routeId: 'project.legacyScripts.redirect',
    pathnamePattern: ROUTES.project.legacyScripts,
    ...REDIRECT_ROUTE,
  }, exact(ROUTES.project.legacyScripts)),
  route({
    routeId: 'project.productionOrchestration.redirect',
    pathnamePattern: ROUTES.project.productionOrchestration,
    ...REDIRECT_ROUTE,
  }, exact(ROUTES.project.productionOrchestration)),
  route({
    routeId: 'project.overview.redirect',
    pathnamePattern: ROUTES.project.overview,
    ...REDIRECT_ROUTE,
  }, exact(ROUTES.project.overview)),
  route({
    routeId: 'agent.files.redirect',
    pathnamePattern: ROUTES.agentFiles,
    ...REDIRECT_ROUTE,
  }, exact(ROUTES.agentFiles)),
  route({
    routeId: 'agent.modelProviders.redirect',
    pathnamePattern: '/agent/model-providers',
    ...REDIRECT_ROUTE,
  }, exact('/agent/model-providers')),
  route({
    routeId: 'admin.redirect',
    pathnamePattern: '/admin/*',
    ...REDIRECT_ROUTE,
  }, (pathname) => pathname === '/admin' || pathname.startsWith('/admin/')),
  route({
    routeId: 'account.settings',
    pathnamePattern: ROUTES.appSettings,
    kind: 'overlay-action',
    surface: 'detail',
    scrollMode: 'hidden',
    shellLayout: 'stacked',
    panes: [],
  }, exact(ROUTES.appSettings)),
  route({
    routeId: 'account.profile',
    pathnamePattern: ROUTES.user,
    kind: 'overlay-action',
    surface: 'detail',
    scrollMode: 'hidden',
    shellLayout: 'stacked',
    panes: [],
  }, exact(ROUTES.user)),
  route({
    routeId: 'account.workspace',
    pathnamePattern: ROUTES.orgSettings,
    kind: 'overlay-action',
    surface: 'detail',
    scrollMode: 'hidden',
    shellLayout: 'stacked',
    panes: [],
  }, exact(ROUTES.orgSettings)),
  route({
    routeId: 'org.select',
    pathnamePattern: ROUTES.orgSelect,
    ...DETAIL_DOCUMENT_ROUTE,
    contentWidth: 'wide',
  }, exact(ROUTES.orgSelect)),
  route({
    routeId: 'home',
    pathnamePattern: ROUTES.root,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.root)),
  route({
    routeId: 'projects',
    pathnamePattern: ROUTES.projects,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.projects)),
  route({
    routeId: 'canvases',
    pathnamePattern: ROUTES.canvases,
    ...DETAIL_DOCUMENT_ROUTE,
    contentWidth: 'normal',
  }, exact(ROUTES.canvases)),
  route({
    routeId: 'project.tasks',
    pathnamePattern: ROUTES.project.tasks,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.project.tasks)),
  route({
    routeId: 'resources',
    pathnamePattern: ROUTES.resources,
    ...DETAIL_DOCUMENT_ROUTE,
    notes: 'Resource page still needs a dedicated inventory pass before choosing document vs workspace scroll.',
  }, exact(ROUTES.resources)),
  route({
    routeId: 'resources.external',
    pathnamePattern: ROUTES.externalResources,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.externalResources)),
  route({
    routeId: 'shotLibrary',
    pathnamePattern: ROUTES.shotLibrary,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.shotLibrary)),
  route({
    routeId: 'jobs',
    pathnamePattern: ROUTES.jobs,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.jobs)),
  route({
    routeId: 'plugins',
    pathnamePattern: ROUTES.plugins,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.plugins)),
  route({
    routeId: 'agent.console',
    pathnamePattern: ROUTES.agentConsole,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...AGENT_CONSOLE_WORKSPACE_PANES],
  }, exact(ROUTES.agentConsole)),
  route({
    routeId: 'agent.connections',
    pathnamePattern: ROUTES.agentConnections,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...AGENT_CONNECTION_WORKSPACE_PANES],
  }, exact(ROUTES.agentConnections)),
  route({
    routeId: 'modelProviders',
    pathnamePattern: ROUTES.modelProviders,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.modelProviders)),
  route({
    routeId: 'agents.redirect',
    pathnamePattern: ROUTES.agents,
    ...REDIRECT_ROUTE,
  }, exact(ROUTES.agents)),
  route({
    routeId: 'agents.provider',
    pathnamePattern: ROUTES.agentProvider,
    ...DETAIL_DOCUMENT_ROUTE,
    notes: 'Provider agent settings are a tabbed document page; upgrade only if a fixed list/detail pane is introduced.',
  }, (pathname) => /^\/agents\/[^/]+\/?$/.test(pathname)),
  route({
    routeId: 'workspace.config',
    pathnamePattern: ROUTES.workspaceConfig,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...WORKSPACE_CONFIG_PANES],
  }, exact(ROUTES.workspaceConfig)),
  route({
    routeId: 'workspace.review',
    pathnamePattern: ROUTES.workspaceReview,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...WORKSPACE_REVIEW_PANES],
  }, exact(ROUTES.workspaceReview)),
  route({
    routeId: 'agent.settings',
    pathnamePattern: ROUTES.agentSettings,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.agentSettings)),
  route({
    routeId: 'agent.runs',
    pathnamePattern: ROUTES.agentRuns,
    ...DETAIL_DOCUMENT_ROUTE,
  }, exact(ROUTES.agentRuns)),
  route({
    routeId: 'agent.run',
    pathnamePattern: ROUTES.agentRun,
    ...DETAIL_WORKSPACE_ROUTE,
    panes: [...DETAIL_WORKSPACE_ROUTE.panes, ...AGENT_RUN_WORKSPACE_PANES],
  }, (pathname) => /^\/agent\/runs\/[^/]+\/?$/.test(pathname)),
]

export const registeredRouteLayoutSpecs: readonly RouteLayoutSpec[] = routeLayoutRegistry.map(({ match: _match, ...spec }) => spec)

export const fallbackRouteLayoutSpec: RouteLayoutSpec = {
  routeId: 'fallback',
  pathnamePattern: '*',
  kind: 'runtime',
  surface: 'detail',
  scrollMode: 'document',
  shellLayout: 'stacked',
  panes: APP_SHELL_DETAIL_PANES,
}

export function routeLayoutSpecForPathname(pathname: string): RouteLayoutSpec {
  const normalizedPathname = normalizePathname(pathname)
  const match = routeLayoutRegistry.find((entry) => entry.match(normalizedPathname))
  if (!match) return fallbackRouteLayoutSpec
  const { match: _match, ...spec } = match
  return spec
}

export function appRouteViewportScrollForMode(scrollMode: RouteScrollMode): RouteLayoutViewportScroll {
  if (scrollMode === 'hidden') return 'hidden'
  if (scrollMode === 'workspace' || scrollMode === 'canvas') return 'owned'
  return 'auto'
}

function route<TSpec extends RouteLayoutSpec>(spec: TSpec, match: (pathname: string) => boolean): RouteLayoutRegistryEntry {
  return { ...spec, match }
}

function exact(pathname: string): (value: string) => boolean {
  return (value) => normalizePathname(value) === pathname
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}
