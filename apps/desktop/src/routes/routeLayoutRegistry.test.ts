import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { APP_SIDEBAR_WIDTH_STORAGE_KEY } from '@movscript/ui/layout'
import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
  AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/features/agent/presentation/agentModePanelSizing'
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
  APP_SHELL_SETTINGS_SIDEBAR_PANE_ID,
  APP_SHELL_SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY,
  APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY,
  APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
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

test('route layout panes delegate app shell pane specs to the app shell pane module', () => {
  const routeLayoutPanesSource = readFileSync(resolve('src/routes/routeLayoutPanes.ts'), 'utf8')
  const routeAppShellPanesSource = readFileSync(resolve('src/routes/routeAppShellPanes.ts'), 'utf8')

  assert.match(routeLayoutPanesSource, /from '\.\/routeAppShellPanes'/)
  assert.match(routeAppShellPanesSource, /export const APP_SHELL_TOOL_PANES/)
  assert.match(routeAppShellPanesSource, /export const APP_SHELL_SETTINGS_PANES/)
  assert.match(routeAppShellPanesSource, /export const APP_SHELL_AGENT_PANES/)
  assert.match(routeAppShellPanesSource, /const terminalDockPane/)
  assert.doesNotMatch(routeLayoutPanesSource, /export const APP_SHELL_TOOL_PANES: RouteLayoutPaneSpec/)
  assert.doesNotMatch(routeLayoutPanesSource, /export const APP_SHELL_AGENT_PANES: RouteLayoutPaneSpec/)
})

test('route layout registry declares current project entry routes', () => {
  assert.deepEqual(projectEntryRoute('/project/standards'), {
    routeId: 'project.standards',
    projectEntryId: 'project_standards',
    scrollMode: 'workspace',
    viewportScroll: 'owned',
  })
  assert.deepEqual(projectEntryRoute('/project/scripts/workbench'), {
    routeId: 'project.scripts',
    projectEntryId: 'orchestration_production',
    scrollMode: 'workspace',
    viewportScroll: 'owned',
  })
  assert.deepEqual(projectEntryRoute('/project/content'), {
    routeId: 'project.content',
    projectEntryId: 'content_preview',
    scrollMode: 'canvas',
    viewportScroll: 'owned',
  })
  assert.deepEqual(projectEntryRoute('/project/content/canvas'), {
    routeId: 'project.content.canvas',
    projectEntryId: 'content_canvas',
    scrollMode: 'canvas',
    viewportScroll: 'owned',
  })
  assert.deepEqual(projectEntryRoute('/project/content/preview'), {
    routeId: 'project.content.preview',
    projectEntryId: 'content_preview',
    scrollMode: 'canvas',
    viewportScroll: 'owned',
  })
  assert.deepEqual(projectEntryRoute('/project/settings/preview'), {
    routeId: 'project.setting.preview',
    projectEntryId: 'setting_preview',
    scrollMode: 'canvas',
    viewportScroll: 'owned',
  })
})

test('route layout registry separates canvas, agent, document, redirect, and overlay routes', () => {
  assert.equal(routeLayoutSpecForPathname('/canvases/42').surface, 'canvas')
  assert.equal(routeLayoutSpecForPathname('/canvases/42').scrollMode, 'canvas')
  assert.equal(appRouteViewportScrollForMode(routeLayoutSpecForPathname('/canvases/42').scrollMode), 'owned')
  assert.equal(routeLayoutSpecForPathname('/project/content').surface, 'project')
  assert.equal(routeLayoutSpecForPathname('/project/content').scrollMode, 'canvas')
  assert.equal(routeLayoutSpecForPathname('/project/content/canvas').routeId, 'project.content.canvas')
  assert.equal(routeLayoutSpecForPathname('/project/content/preview').routeId, 'project.content.preview')
  assert.equal(routeLayoutSpecForPathname('/project/settings/preview').routeId, 'project.setting.preview')
  assert.equal(routeLayoutSpecForPathname('/studio/proj_uid_7/edit-desk').routeId, 'studio.editDesk')
  assert.equal(routeLayoutSpecForPathname('/studio/proj_uid_7/edit-desk').scrollMode, 'workspace')

  assert.equal(routeLayoutSpecForPathname('/project/agent').surface, 'agent')
  assert.equal(routeLayoutSpecForPathname('/project/agent').scrollMode, 'workspace')
  assert.equal(routeLayoutSpecForPathname('/project/agent/canvases').surface, 'agent')
  assert.equal(routeLayoutSpecForPathname('/project/agent/canvases').scrollMode, 'document')

  assert.equal(routeLayoutSpecForPathname('/').surface, 'home')
  assert.equal(routeLayoutSpecForPathname('/').scrollMode, 'document')

  assert.equal(routeLayoutSpecForPathname('/project').kind, 'redirect')
  assert.equal(routeLayoutSpecForPathname('/project').scrollMode, 'hidden')
  assert.equal(routeLayoutSpecForPathname('/project/scripts/workbench').surface, 'project')

  assert.equal(routeLayoutSpecForPathname('/canvases').surface, 'canvas')
  assert.equal(routeLayoutSpecForPathname('/canvases').scrollMode, 'document')

  assert.equal(routeLayoutSpecForPathname('/editing').surface, 'tool')
  assert.equal(routeLayoutSpecForPathname('/editing').scrollMode, 'document')
  assert.equal(routeLayoutSpecForPathname('/editing').projectEntryId, undefined)
  assert.equal(routeLayoutSpecForPathname('/editing/editing_project_123').surface, 'tool')
  assert.equal(routeLayoutSpecForPathname('/editing/editing_project_123').scrollMode, 'workspace')
  assert.equal(routeLayoutSpecForPathname('/editing/editing_project_123').projectEntryId, undefined)

  assert.equal(routeLayoutSpecForPathname('/resources').surface, 'tool')
  assert.equal(routeLayoutSpecForPathname('/resources').scrollMode, 'document')
  assert.equal(appRouteViewportScrollForMode(routeLayoutSpecForPathname('/resources').scrollMode), 'auto')
  assert.match(routeLayoutSpecForPathname('/resources').notes ?? '', /resource-surface/)
  assert.equal(routeLayoutSpecForPathname('/project-data').surface, 'home')
  assert.equal(routeLayoutSpecForPathname('/project-data').scrollMode, 'document')
  assert.ok(!routeLayoutSpecForPathname('/project-data').panes.some((pane) => pane.id === APP_SHELL_TOOL_SIDEBAR_PANE_ID))
  assert.match(routeLayoutSpecForPathname('/project-data').notes ?? '', /outside tool navigation/)
  assert.equal(routeLayoutSpecForPathname('/resources/external').surface, 'tool')
  assert.equal(routeLayoutSpecForPathname('/resources/external').scrollMode, 'document')
  assert.equal(routeLayoutSpecForPathname('/agents/mova').surface, 'settings')
  assert.equal(routeLayoutSpecForPathname('/agents/mova').chrome, 'settings')
  assert.equal(routeLayoutSpecForPathname('/agents/mova').scrollMode, 'document')
  assert.equal(appRouteViewportScrollForMode(routeLayoutSpecForPathname('/agents/mova').scrollMode), 'auto')

  assert.equal(routeLayoutSpecForPathname('/invite/abc123').scrollMode, 'document')

  for (const pathname of ['/app/settings', '/user', '/org/settings', '/agent']) {
    const settingsRoute = routeLayoutSpecForPathname(pathname)
    assert.equal(settingsRoute.kind, 'page')
    assert.equal(settingsRoute.surface, 'settings')
    assert.equal(settingsRoute.chrome, 'settings')
    assert.equal(settingsRoute.preserveWorkMode, true)
    assert.equal(settingsRoute.scrollMode, 'workspace')
    assert.equal(appRouteViewportScrollForMode(settingsRoute.scrollMode), 'owned')
    const settingsSidebar = settingsRoute.panes.find((pane) => pane.id === APP_SHELL_SETTINGS_SIDEBAR_PANE_ID)
    assert.equal(settingsSidebar?.owner, 'app-shell')
    assert.equal(settingsSidebar?.storageKey, APP_SHELL_SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY)
    assert.ok(!settingsRoute.panes.some((pane) => pane.id === APP_SHELL_TOOL_SIDEBAR_PANE_ID))
    assert.ok(!settingsRoute.panes.some((pane) => pane.id === 'app-shell.assistant-dock'))
  }

  for (const pathname of ['/agent/settings', '/agents/mova']) {
    const agentSettingsRoute = routeLayoutSpecForPathname(pathname)
    assert.equal(agentSettingsRoute.surface, 'settings')
    assert.equal(agentSettingsRoute.chrome, 'settings')
    assert.equal(agentSettingsRoute.preserveWorkMode, true)
    assert.ok(agentSettingsRoute.panes.some((pane) => pane.id === APP_SHELL_SETTINGS_SIDEBAR_PANE_ID))
    assert.ok(!agentSettingsRoute.panes.some((pane) => pane.id === APP_SHELL_AGENT_SIDEBAR_PANE_ID))
    assert.ok(!agentSettingsRoute.panes.some((pane) => pane.id === APP_SHELL_TOOL_SIDEBAR_PANE_ID))
  }
})

test('registered route layout specs expose pane ownership for app shell surfaces', () => {
  const projectRoute = routeLayoutSpecForPathname('/project/scripts/workbench')
  assert.equal(projectRoute.surface, 'project')
  assert.ok(!projectRoute.panes.some((pane) => pane.id === APP_SHELL_TOOL_SIDEBAR_PANE_ID))
  assert.ok(!projectRoute.panes.some((pane) => pane.id === 'app-shell.assistant-dock'))
  assert.ok(projectRoute.panes.some((pane) => pane.id === 'app-shell.terminal-dock' && pane.side === 'bottom'))
  assert.ok(!projectRoute.panes.some((pane) => pane.owner === 'workbench'))
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
    '/tools/image',
    '/tools/video',
    '/tools/ref-image-gen',
    '/tools/ref-video-gen',
    '/tools/motion-imitation',
    '/tools/style-transfer',
    '/tools/multi-angle',
  ]) {
    const route = routeLayoutSpecForPathname(pathname)
    assert.equal(route.surface, 'tool')
    assert.equal(route.scrollMode, 'workspace')
    const toolSidebarPane = route.panes.find((pane) => pane.id === APP_SHELL_TOOL_SIDEBAR_PANE_ID)
    assert.equal(toolSidebarPane?.owner, 'app-shell')
    assert.equal(toolSidebarPane?.storageKey, APP_SIDEBAR_WIDTH_STORAGE_KEY)
    assert.ok(!route.panes.some((pane) => pane.id === 'app-shell.assistant-dock'))
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

  for (const pathname of ['/tools/audio', '/tools/text', '/tools/audio-gen', '/tools/audio-transcribe', '/tools/audio-translate', '/tools/music-gen', '/tools/audio-sfx', '/tools/voice-clone', '/tools/voice-design']) {
    const audioRoute = routeLayoutSpecForPathname(pathname)
    assert.equal(audioRoute.surface, 'tool')
    assert.equal(audioRoute.scrollMode, 'workspace')
    assert.ok(audioRoute.panes.some((pane) => pane.id === APP_SHELL_TOOL_SIDEBAR_PANE_ID))
    assert.ok(!audioRoute.panes.some((pane) => pane.id === TOOL_WORKBENCH_RESOURCE_PANE_ID))
  }
})

test('route layout registry declares content preview managed panes', () => {
  const route = routeLayoutSpecForPathname('/project/content/preview')
  assert.equal(route.routeId, 'project.content.preview')
  assert.equal(route.surface, 'project')
  assert.equal(route.scrollMode, 'canvas')
  assert.equal(route.projectEntryId, 'content_preview')

  assert.ok(!route.panes.some((pane) => pane.id === 'content-canvas.setting-catalog-pane'))

  const structurePane = route.panes.find((pane) => pane.id === CONTENT_CANVAS_STRUCTURE_PANE_ID)
  assert.equal(structurePane?.owner, 'workbench')
  assert.equal(structurePane?.side, 'left')
  assert.equal(structurePane?.defaultSize, CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH)
  assert.equal(structurePane?.minSize, CONTENT_CANVAS_STRUCTURE_MIN_WIDTH)
  assert.equal(structurePane?.maxSize, CONTENT_CANVAS_STRUCTURE_MAX_WIDTH)
  assert.equal(structurePane?.storageKey, CONTENT_CANVAS_STRUCTURE_WIDTH_STORAGE_KEY)
  assert.equal(structurePane?.persistState, true)

  const inspectorPane = route.panes.find((pane) => pane.id === CONTENT_CANVAS_INSPECTOR_PANE_ID)
  assert.equal(inspectorPane?.owner, 'workbench')
  assert.equal(inspectorPane?.side, 'right')
  assert.equal(inspectorPane?.defaultSize, CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH)
  assert.equal(inspectorPane?.minSize, CONTENT_CANVAS_INSPECTOR_MIN_WIDTH)
  assert.equal(inspectorPane?.maxSize, CONTENT_CANVAS_INSPECTOR_MAX_WIDTH)
  assert.equal(inspectorPane?.storageKey, CONTENT_CANVAS_INSPECTOR_WIDTH_STORAGE_KEY)
  assert.equal(inspectorPane?.persistState, true)

  const timelinePane = route.panes.find((pane) => pane.id === CONTENT_CANVAS_TIMELINE_PANE_ID)
  assert.equal(timelinePane?.owner, 'workbench')
  assert.equal(timelinePane?.side, 'bottom')
  assert.equal(timelinePane?.defaultSize, CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT)
  assert.equal(timelinePane?.minSize, CONTENT_CANVAS_TIMELINE_MIN_HEIGHT)
  assert.equal(timelinePane?.maxSize, CONTENT_CANVAS_TIMELINE_MAX_HEIGHT)
  assert.equal(timelinePane?.storageKey, CONTENT_CANVAS_TIMELINE_HEIGHT_STORAGE_KEY)
  assert.equal(timelinePane?.persistState, true)
})

test('route layout registry declares setting preview as a project preview workspace', () => {
  const route = routeLayoutSpecForPathname('/project/settings/preview')
  assert.equal(route.routeId, 'project.setting.preview')
  assert.equal(route.surface, 'project')
  assert.equal(route.scrollMode, 'canvas')
  assert.equal(route.projectEntryId, 'setting_preview')
  assert.ok(route.panes.some((pane) => pane.id === CONTENT_CANVAS_STRUCTURE_PANE_ID))
  assert.ok(route.panes.some((pane) => pane.id === CONTENT_CANVAS_INSPECTOR_PANE_ID))
})

test('route layout registry keeps content canvas as a single creation surface', () => {
  const route = routeLayoutSpecForPathname('/project/content/canvas')
  assert.equal(route.routeId, 'project.content.canvas')
  assert.equal(route.surface, 'project')
  assert.equal(route.scrollMode, 'canvas')
  assert.equal(route.projectEntryId, 'content_canvas')
  assert.ok(!route.panes.some((pane) => pane.id === CONTENT_CANVAS_STRUCTURE_PANE_ID))
  assert.ok(!route.panes.some((pane) => pane.id === CONTENT_CANVAS_INSPECTOR_PANE_ID))
  assert.ok(!route.panes.some((pane) => pane.id === CONTENT_CANVAS_TIMELINE_PANE_ID))
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
  ], 'settings')
  assertWorkspacePanes('/workspace/review', [
    WORKSPACE_REVIEW_SUMMARY_PANE_ID,
    WORKSPACE_REVIEW_RAW_PANE_ID,
  ], 'settings')
})

test('route layout registry has one exported spec per registered route id', () => {
  const routeIds = registeredRouteLayoutSpecs.map((spec) => spec.routeId)
  assert.equal(new Set(routeIds).size, routeIds.length)
  assert.ok(routeIds.includes('project.scripts'))
  assert.ok(routeIds.includes('project.content'))
  assert.ok(routeIds.includes('project.content.canvas'))
  assert.ok(routeIds.includes('project.content.preview'))
  assert.ok(routeIds.includes('editing'))
  assert.ok(routeIds.includes('editing.project'))
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
  assert.deepEqual(routeLayoutInventoryItemForRouteId('tools.refImageGen')?.dragSurfaces, [
    {
      id: 'tools.resource-pane',
      payloadKinds: ['resource', 'file'],
      coordinateAdapter: 'none',
    },
  ])
})

function projectEntryRoute(pathname: string) {
  const spec = routeLayoutSpecForPathname(pathname)
  return {
    routeId: spec.routeId,
    projectEntryId: spec.projectEntryId,
    scrollMode: spec.scrollMode,
    viewportScroll: appRouteViewportScrollForMode(spec.scrollMode),
  }
}

function assertWorkspacePanes(pathname: string, paneIds: string[], expectedSurface: 'tool' | 'settings' = 'tool') {
  const spec = routeLayoutSpecForPathname(pathname)
  assert.equal(spec.surface, expectedSurface)
  if (expectedSurface === 'settings') assert.equal(spec.chrome, 'settings')
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
