import assert from 'node:assert/strict'
import test from 'node:test'

import { APP_SIDEBAR_WIDTH_STORAGE_KEY } from '@movscript/ui'
import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
  AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/features/agent/presentation/agentModePanelSizing'
import {
  SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
  SCRIPT_WORKBENCH_DETAIL_PANE_ID,
  SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
  SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
} from '@/features/scripts/presentation/scriptsWorkbenchLayoutSpec'
import {
  CONTENT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
  CONTENT_WORKBENCH_DETAIL_PANE_ID,
  CONTENT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
  CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
} from '@/features/content/presentation/contentWorkbenchLayoutSpec'
import {
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID,
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
  PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
} from '@/features/pre-production/presentation/preProductionWorkbenchLayoutSpec'
import {
  TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_ID,
  TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY,
} from '@/features/tools/presentation/toolWorkbenchLayoutSpec'

import {
  AGENT_CONNECTION_EVENTS_PANE_ID,
  AGENT_CONNECTION_RAW_PANE_ID,
  AGENT_CONNECTION_THREADS_PANE_ID,
  AGENT_CONSOLE_LOGS_PANE_ID,
  AGENT_CONSOLE_MAIN_PANE_ID,
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
  AGENT_RUN_SIDEBAR_PANE_ID,
  AGENT_RUN_TRACE_PANE_ID,
  appRouteViewportScrollForMode,
  registeredRouteLayoutSpecs,
  routeLayoutSpecForPathname,
  WORKSPACE_CONFIG_EDITOR_PANE_ID,
  WORKSPACE_CONFIG_FILE_TREE_PANE_ID,
  WORKSPACE_REVIEW_RAW_PANE_ID,
  WORKSPACE_REVIEW_SUMMARY_PANE_ID,
} from './routeLayoutRegistry'

test('route layout registry declares current high-density workbench routes', () => {
  assert.deepEqual(workbenchRoute('/project/standards'), {
    routeId: 'project.standards',
    workbenchId: 'project_standards',
    scrollMode: 'workspace',
    viewportScroll: 'owned',
  })
  assert.deepEqual(workbenchRoute('/project/pre-production'), {
    routeId: 'project.preProduction',
    workbenchId: 'pre_production',
    scrollMode: 'workspace',
    viewportScroll: 'owned',
  })
  assert.deepEqual(workbenchRoute('/project/scripts/workbench'), {
    routeId: 'project.scripts',
    workbenchId: 'orchestration_production',
    scrollMode: 'workspace',
    viewportScroll: 'owned',
  })
  assert.deepEqual(workbenchRoute('/project/content-units/editor'), {
    routeId: 'project.contentUnitEditor',
    workbenchId: 'content_orchestration',
    scrollMode: 'workspace',
    viewportScroll: 'owned',
  })
})

test('route layout registry separates canvas, agent, document, redirect, and overlay routes', () => {
  assert.equal(routeLayoutSpecForPathname('/canvases/42').surface, 'canvas')
  assert.equal(routeLayoutSpecForPathname('/canvases/42').scrollMode, 'canvas')
  assert.equal(appRouteViewportScrollForMode(routeLayoutSpecForPathname('/canvases/42').scrollMode), 'owned')

  assert.equal(routeLayoutSpecForPathname('/project/agent').surface, 'agent')
  assert.equal(routeLayoutSpecForPathname('/project/agent').scrollMode, 'workspace')
  assert.equal(routeLayoutSpecForPathname('/project/agent/canvases').surface, 'agent')
  assert.equal(routeLayoutSpecForPathname('/project/agent/canvases').scrollMode, 'document')

  assert.equal(routeLayoutSpecForPathname('/resources').surface, 'detail')
  assert.equal(routeLayoutSpecForPathname('/resources').scrollMode, 'document')
  assert.equal(appRouteViewportScrollForMode(routeLayoutSpecForPathname('/resources').scrollMode), 'auto')
  assert.equal(routeLayoutSpecForPathname('/agents/mova').surface, 'detail')
  assert.equal(routeLayoutSpecForPathname('/agents/mova').scrollMode, 'document')
  assert.equal(appRouteViewportScrollForMode(routeLayoutSpecForPathname('/agents/mova').scrollMode), 'auto')

  assert.equal(routeLayoutSpecForPathname('/onboarding').shellLayout, 'flush')
  assert.equal(routeLayoutSpecForPathname('/invite/abc123').scrollMode, 'document')

  assert.equal(routeLayoutSpecForPathname('/project/production/orchestration').kind, 'redirect')
  assert.equal(routeLayoutSpecForPathname('/project/production/orchestration').scrollMode, 'hidden')
  assert.equal(routeLayoutSpecForPathname('/user').kind, 'overlay-action')
  assert.equal(routeLayoutSpecForPathname('/user').scrollMode, 'hidden')
})

test('registered route layout specs expose pane ownership for app shell surfaces', () => {
  const detailRoute = routeLayoutSpecForPathname('/project/scripts/workbench')
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.detail-sidebar' && pane.owner === 'app-shell'))
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.detail-sidebar' && pane.storageKey === APP_SIDEBAR_WIDTH_STORAGE_KEY))
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.assistant-dock' && pane.overlapMode === 'offset-stack'))
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.terminal-dock' && pane.side === 'bottom'))
  const scriptDetailPane = detailRoute.panes.find((pane) => pane.id === SCRIPT_WORKBENCH_DETAIL_PANE_ID)
  assert.equal(scriptDetailPane?.owner, 'workbench')
  assert.equal(scriptDetailPane?.side, 'right')
  assert.equal(scriptDetailPane?.defaultSize, SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH)
  assert.equal(scriptDetailPane?.minSize, SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH)
  assert.equal(scriptDetailPane?.storageKey, SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY)
  assert.equal(scriptDetailPane?.collapseMode, 'after-min')
  assert.equal(scriptDetailPane?.expandMode, 'after-max')
  assert.equal(scriptDetailPane?.overlapMode, 'pane-surface')

  const preProductionRoute = routeLayoutSpecForPathname('/project/pre-production')
  const preProductionDetailPane = preProductionRoute.panes.find((pane) => pane.id === PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID)
  assert.equal(preProductionDetailPane?.owner, 'workbench')
  assert.equal(preProductionDetailPane?.side, 'right')
  assert.equal(preProductionDetailPane?.defaultSize, PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH)
  assert.equal(preProductionDetailPane?.minSize, PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_MIN_WIDTH)
  assert.equal(preProductionDetailPane?.storageKey, PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY)
  assert.equal(preProductionDetailPane?.collapseMode, 'after-min')
  assert.equal(preProductionDetailPane?.expandMode, 'after-max')
  assert.equal(preProductionDetailPane?.overlapMode, 'pane-surface')

  const contentEditorRoute = routeLayoutSpecForPathname('/project/content-units/editor')
  const contentDetailPane = contentEditorRoute.panes.find((pane) => pane.id === CONTENT_WORKBENCH_DETAIL_PANE_ID)
  assert.equal(contentDetailPane?.owner, 'workbench')
  assert.equal(contentDetailPane?.side, 'right')
  assert.equal(contentDetailPane?.defaultSize, CONTENT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH)
  assert.equal(contentDetailPane?.minSize, CONTENT_WORKBENCH_DETAIL_PANE_MIN_WIDTH)
  assert.equal(contentDetailPane?.storageKey, CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY)
  assert.equal(contentDetailPane?.collapseMode, 'after-min')
  assert.equal(contentDetailPane?.expandMode, 'after-max')
  assert.equal(contentDetailPane?.overlapMode, 'pane-surface')

  const agentRoute = routeLayoutSpecForPathname('/project/agent')
  const agentSidebar = agentRoute.panes.find((pane) => pane.id === APP_SHELL_AGENT_SIDEBAR_PANE_ID)
  assert.equal(agentSidebar?.collapsedSize, 44)
  assert.equal(agentSidebar?.defaultSize, AGENT_MODE_SIDEBAR_DEFAULT_WIDTH)
  assert.equal(agentSidebar?.storageKey, AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY)
  assert.equal(agentSidebar?.stateStorageKey, AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)
  const agentContentPane = agentRoute.panes.find((pane) => pane.id === APP_SHELL_AGENT_CONTENT_PANE_ID)
  assert.equal(agentContentPane?.owner, 'app-shell')
  assert.equal(agentContentPane?.defaultState, 'collapsed')
  assert.equal(agentContentPane?.defaultSize, AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH)
  assert.equal(agentContentPane?.storageKey, AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY)
  assert.equal(agentContentPane?.stateStorageKey, AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  const terminalPane = agentRoute.panes.find((pane) => pane.id === APP_SHELL_TERMINAL_DOCK_PANE_ID)
  assert.equal(terminalPane?.stateStorageKey, APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY)

  const canvasRoute = routeLayoutSpecForPathname('/canvases/42')
  assert.ok(canvasRoute.panes.some((pane) => pane.id === 'canvas.palette-pane' && pane.owner === 'canvas'))
  assert.ok(canvasRoute.panes.some((pane) => pane.id === 'canvas.workflow-pane' && pane.overlapMode === 'pane-surface'))
})

test('route layout registry declares shared tool workbench resource panes', () => {
  for (const pathname of [
    '/tools/ref-image-gen',
    '/tools/ref-video-gen',
    '/tools/motion-imitation',
    '/tools/style-transfer',
    '/tools/multi-angle',
  ]) {
    const route = routeLayoutSpecForPathname(pathname)
    assert.equal(route.scrollMode, 'workspace')
    const resourcePane = route.panes.find((pane) => pane.id === TOOL_WORKBENCH_RESOURCE_PANE_ID)
    assert.equal(resourcePane?.owner, 'workbench')
    assert.equal(resourcePane?.side, 'right')
    assert.equal(resourcePane?.defaultSize, TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH)
    assert.equal(resourcePane?.minSize, TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH)
    assert.equal(resourcePane?.storageKey, TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY)
    assert.equal(resourcePane?.collapseMode, 'after-min')
    assert.equal(resourcePane?.expandMode, 'after-max')
    assert.equal(resourcePane?.overlapMode, 'pane-surface')
  }
})

test('route layout registry declares agent and workspace split panes', () => {
  assertWorkspacePanes('/agent', [
    AGENT_CONSOLE_MAIN_PANE_ID,
    AGENT_CONSOLE_LOGS_PANE_ID,
  ])
  assertWorkspacePanes('/agent/connections', [
    AGENT_CONNECTION_THREADS_PANE_ID,
    AGENT_CONNECTION_EVENTS_PANE_ID,
    AGENT_CONNECTION_RAW_PANE_ID,
  ])
  assertWorkspacePanes('/workspace/config', [
    WORKSPACE_CONFIG_FILE_TREE_PANE_ID,
    WORKSPACE_CONFIG_EDITOR_PANE_ID,
  ])
  assertWorkspacePanes('/workspace/review', [
    WORKSPACE_REVIEW_SUMMARY_PANE_ID,
    WORKSPACE_REVIEW_RAW_PANE_ID,
  ])
  assertWorkspacePanes('/agent/runs/run-123', [
    AGENT_RUN_SIDEBAR_PANE_ID,
    AGENT_RUN_TRACE_PANE_ID,
  ])
})

test('route layout registry has one exported spec per registered route id', () => {
  const routeIds = registeredRouteLayoutSpecs.map((spec) => spec.routeId)
  assert.equal(new Set(routeIds).size, routeIds.length)
  assert.ok(routeIds.includes('project.scripts'))
  assert.ok(routeIds.includes('project.productionOrchestration.redirect'))
  assert.ok(routeIds.includes('canvas.editor'))
  assert.ok(routeIds.includes('agent.connections'))
})

function workbenchRoute(pathname: string) {
  const spec = routeLayoutSpecForPathname(pathname)
  return {
    routeId: spec.routeId,
    workbenchId: spec.workbenchId,
    scrollMode: spec.scrollMode,
    viewportScroll: appRouteViewportScrollForMode(spec.scrollMode),
  }
}

function assertWorkspacePanes(pathname: string, paneIds: string[]) {
  const spec = routeLayoutSpecForPathname(pathname)
  assert.equal(spec.surface, 'detail')
  assert.equal(spec.scrollMode, 'workspace')
  assert.equal(appRouteViewportScrollForMode(spec.scrollMode), 'owned')
  for (const paneId of paneIds) {
    const pane = spec.panes.find((candidate) => candidate.id === paneId)
    assert.equal(pane?.owner, 'workbench')
    assert.equal(pane?.defaultState, 'default')
    assert.deepEqual(pane?.allowedStates, ['default'])
    assert.equal(pane?.overlapMode, 'none')
  }
}
