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
  DETAIL_AGENT_PANEL_DEFAULT_WIDTH,
  DETAIL_AGENT_PANEL_MIN_WIDTH,
  DETAIL_AGENT_PANEL_WIDTH_STORAGE_KEY,
} from '@/features/agent/presentation/agentDetailAssistantPaneSizing'
import {
  SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH,
  SCRIPT_WORKBENCH_DETAIL_PANE_ID,
  SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH,
  SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY,
} from '@/features/scripts/presentation/scriptsWorkbenchLayoutSpec'
import {
  TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_ID,
  TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY,
} from '@/features/tools/presentation/toolWorkbenchLayoutSpec'
import { PLUGIN_TOOL_NATIVE_MAIN_PANE_ID } from '@/features/plugins/presentation/pluginToolLayoutSpec'

import {
  AGENT_CONNECTION_EVENTS_PANE_ID,
  AGENT_CONNECTION_RAW_PANE_ID,
  AGENT_CONNECTION_THREADS_PANE_ID,
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_ASSISTANT_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY,
  APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
  appRouteViewportScrollForMode,
  registeredRouteLayoutSpecs,
  routeLayoutSpecForPathname,
  WORKSPACE_CONFIG_EDITOR_PANE_ID,
  WORKSPACE_CONFIG_FILE_TREE_PANE_ID,
  WORKSPACE_REVIEW_RAW_PANE_ID,
  WORKSPACE_REVIEW_SUMMARY_PANE_ID,
} from './routeLayoutRegistry'
import {
  routeLayoutInventory,
  routeLayoutInventoryItemForRouteId,
} from './routeLayoutInventory'

test('route layout registry declares current high-density workbench routes', () => {
  assert.deepEqual(workbenchRoute('/project/standards'), {
    routeId: 'project.standards',
    workbenchId: 'project_standards',
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
    routeId: 'project.sourceWorkspace',
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
  assert.match(routeLayoutSpecForPathname('/resources').notes ?? '', /shared resource drag contract/)
  assert.equal(routeLayoutSpecForPathname('/agents/mova').surface, 'detail')
  assert.equal(routeLayoutSpecForPathname('/agents/mova').scrollMode, 'document')
  assert.equal(appRouteViewportScrollForMode(routeLayoutSpecForPathname('/agents/mova').scrollMode), 'auto')

  assert.equal(routeLayoutSpecForPathname('/onboarding').shellLayout, 'flush')
  assert.equal(routeLayoutSpecForPathname('/invite/abc123').scrollMode, 'document')

  for (const pathname of ['/app/settings', '/user', '/org/settings', '/agent']) {
    const settingsRoute = routeLayoutSpecForPathname(pathname)
    assert.equal(settingsRoute.kind, 'page')
    assert.equal(settingsRoute.surface, 'detail')
    assert.equal(settingsRoute.scrollMode, 'workspace')
    assert.equal(appRouteViewportScrollForMode(settingsRoute.scrollMode), 'owned')
    assert.ok(settingsRoute.panes.some((pane) => pane.id === 'app-shell.detail-sidebar'))
    assert.ok(settingsRoute.panes.some((pane) => pane.id === APP_SHELL_ASSISTANT_DOCK_PANE_ID))
  }
})

test('registered route layout specs expose pane ownership for app shell surfaces', () => {
  const detailRoute = routeLayoutSpecForPathname('/project/scripts/workbench')
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.detail-sidebar' && pane.owner === 'app-shell'))
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.detail-sidebar' && pane.storageKey === APP_SIDEBAR_WIDTH_STORAGE_KEY))
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.assistant-dock' && pane.overlapMode === 'offset-stack'))
  assert.ok(detailRoute.panes.some((pane) => pane.id === 'app-shell.terminal-dock' && pane.side === 'bottom'))
  const assistantDockPane = detailRoute.panes.find((pane) => pane.id === APP_SHELL_ASSISTANT_DOCK_PANE_ID)
  assert.equal(assistantDockPane?.defaultSize, DETAIL_AGENT_PANEL_DEFAULT_WIDTH)
  assert.equal(assistantDockPane?.minSize, DETAIL_AGENT_PANEL_MIN_WIDTH)
  assert.equal(assistantDockPane?.storageKey, DETAIL_AGENT_PANEL_WIDTH_STORAGE_KEY)
  assert.equal(assistantDockPane?.defaultState, 'hidden')
  const scriptDetailPane = detailRoute.panes.find((pane) => pane.id === SCRIPT_WORKBENCH_DETAIL_PANE_ID)
  assert.equal(scriptDetailPane?.owner, 'workbench')
  assert.equal(scriptDetailPane?.side, 'right')
  assert.equal(scriptDetailPane?.defaultSize, SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH)
  assert.equal(scriptDetailPane?.minSize, SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH)
  assert.equal(scriptDetailPane?.storageKey, SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY)
  assert.equal(scriptDetailPane?.collapseMode, 'after-min')
  assert.equal(scriptDetailPane?.expandMode, 'after-max')
  assert.equal(scriptDetailPane?.overlapMode, 'pane-surface')

  const sourceWorkspaceRoute = routeLayoutSpecForPathname('/project/content-units/editor')
  assert.equal(sourceWorkspaceRoute.workbenchId, 'content_orchestration')
  assert.ok(sourceWorkspaceRoute.panes.every((pane) => pane.owner === 'app-shell'))

  const agentRoute = routeLayoutSpecForPathname('/project/agent')
  const agentSidebar = agentRoute.panes.find((pane) => pane.id === APP_SHELL_AGENT_SIDEBAR_PANE_ID)
  assert.equal(agentSidebar?.collapsedSize, 0)
  assert.equal(agentSidebar?.defaultState, 'default')
  assert.deepEqual(agentSidebar?.allowedStates, ['default', 'hidden'])
  assert.equal(agentSidebar?.defaultSize, AGENT_MODE_SIDEBAR_DEFAULT_WIDTH)
  assert.equal(agentSidebar?.storageKey, AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY)
  assert.equal(agentSidebar?.stateStorageKey, AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)
  const agentContentPane = agentRoute.panes.find((pane) => pane.id === APP_SHELL_AGENT_CONTENT_PANE_ID)
  assert.equal(agentContentPane?.owner, 'app-shell')
  assert.equal(agentContentPane?.defaultState, 'default')
  assert.equal(agentContentPane?.defaultSize, AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH)
  assert.equal(agentContentPane?.storageKey, AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY)
  assert.equal(agentContentPane?.stateStorageKey, AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  const terminalPane = agentRoute.panes.find((pane) => pane.id === APP_SHELL_TERMINAL_DOCK_PANE_ID)
  assert.equal(terminalPane?.defaultSize, APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT)
  assert.equal(terminalPane?.minSize, APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT)
  assert.equal(terminalPane?.maxSize, APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT)
  assert.equal(terminalPane?.storageKey, APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY)
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

test('route layout registry declares plugin tool native host pane', () => {
  const route = routeLayoutSpecForPathname('/tools/plugin/example')
  assert.equal(route.scrollMode, 'workspace')
  assert.match(route.notes ?? '', /native disabled host layout/)
  const nativeMainPane = route.panes.find((pane) => pane.id === PLUGIN_TOOL_NATIVE_MAIN_PANE_ID)
  assert.equal(nativeMainPane?.owner, 'workbench')
  assert.equal(nativeMainPane?.side, 'left')
  assert.equal(nativeMainPane?.overlapMode, 'none')
})

test('route layout registry declares agent and workspace split panes', () => {
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
})

test('route layout registry has one exported spec per registered route id', () => {
  const routeIds = registeredRouteLayoutSpecs.map((spec) => spec.routeId)
  assert.equal(new Set(routeIds).size, routeIds.length)
  assert.ok(routeIds.includes('project.scripts'))
  assert.ok(!routeIds.includes('project.production.redirect'))
  assert.ok(!routeIds.includes('project.productionOrchestration.redirect'))
  assert.ok(routeIds.includes('canvas.editor'))
  assert.ok(routeIds.includes('agent.connections'))
})

test('route layout inventory audits every registered route without duplicating pane specs', () => {
  const registeredRouteIds = registeredRouteLayoutSpecs.map((spec) => spec.routeId)
  const inventoryRouteIds = routeLayoutInventory.map((item) => item.routeId)
  assert.deepEqual(inventoryRouteIds, registeredRouteIds)

  for (const spec of registeredRouteLayoutSpecs) {
    const item = routeLayoutInventoryItemForRouteId(spec.routeId)
    assert.equal(item?.pathnamePattern, spec.pathnamePattern)
    assert.equal(item?.targetScrollMode, spec.scrollMode)
    assert.equal(item?.targetShellLayout, spec.shellLayout)
    assert.deepEqual(item?.escapeHatches, [])
    assert.deepEqual(
      item?.panes.map((pane) => ({
        id: pane.id,
        targetOwner: pane.targetOwner,
        storageKey: pane.storageKey,
        preferenceMigration: pane.preferenceMigration,
      })),
      spec.panes.map((pane) => ({
        id: pane.id,
        targetOwner: pane.owner,
        storageKey: pane.storageKey ?? pane.stateStorageKey ?? '',
        preferenceMigration: 'reset',
      })),
    )
    assert.ok(item?.tests.some((candidate) => candidate.path === 'src/routes/routeLayoutRegistry.test.ts' && candidate.action === 'keep'))
  }
})

test('route layout inventory declares high-risk drag surfaces and coordinate adapter status', () => {
  assert.deepEqual(routeLayoutInventoryItemForRouteId('canvas.editor')?.dragSurfaces, [
    {
      id: 'canvas.viewport',
      payloadKinds: ['canvas-node-template', 'canvas-workflow', 'resource', 'file'],
      coordinateAdapter: 'existing',
    },
  ])
  assert.deepEqual(routeLayoutInventoryItemForRouteId('project.sourceWorkspace')?.dragSurfaces, [])
  assert.deepEqual(routeLayoutInventoryItemForRouteId('tools.refImageGen')?.dragSurfaces, [
    {
      id: 'tools.resource-pane',
      payloadKinds: ['resource', 'file'],
      coordinateAdapter: 'none',
    },
  ])
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
