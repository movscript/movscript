import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { APP_SIDEBAR_WIDTH_STORAGE_KEY } from '@movscript/ui/layout'
import {
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
  LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
} from '@/features/agent/presentation/agentModePanelSizing'
import {
  TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_ID,
  TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY,
} from '@/features/tools/presentation/toolWorkbenchLayoutSpec'
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY,
  APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
  routeLayoutSpecForPathname,
} from '@/routes/routeLayoutRegistry'
import {
  allowedRouteLayoutPaneState,
  readRouteLayoutPaneSize,
  readRouteLayoutPaneState,
  routeLayoutPaneById,
  routeLayoutPaneDefaultState,
  routeLayoutPaneStateStorageKey,
} from './useRouteLayoutPaneController'
import {
  routeLayoutOverlapPaneControllerOptionsForPane,
  routeLayoutOverlapPaneGroupPropsForVisibility,
} from './useRouteLayoutOverlapPaneController'

test('route layout pane controller derives tool sidebar state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/tools/ref-image-gen')
  const pane = routeLayoutPaneById(routeLayout, APP_SHELL_TOOL_SIDEBAR_PANE_ID)

  assert.equal(pane?.storageKey, APP_SIDEBAR_WIDTH_STORAGE_KEY)
  assert.equal(routeLayoutPaneStateStorageKey(pane), `${APP_SIDEBAR_WIDTH_STORAGE_KEY}.state`)
  assert.equal(routeLayoutPaneDefaultState(pane), 'default')
  assert.equal(allowedRouteLayoutPaneState(pane, 'hidden'), 'hidden')
  assert.equal(allowedRouteLayoutPaneState(pane, 'expanded'), 'default')
})

test('route layout pane controller derives terminal dock state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/agent')
  const pane = routeLayoutPaneById(routeLayout, APP_SHELL_TERMINAL_DOCK_PANE_ID)

  assert.equal(routeLayoutPaneStateStorageKey(pane), APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY)
  assert.equal(pane?.storageKey, APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY)
  assert.equal(pane?.defaultSize, APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT)
  assert.equal(pane?.minSize, APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT)
  assert.equal(pane?.maxSize, APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT)
  assert.equal(routeLayoutPaneDefaultState(pane), 'hidden')
  assert.equal(allowedRouteLayoutPaneState(pane, 'default'), 'default')
  assert.equal(allowedRouteLayoutPaneState(pane, 'collapsed'), 'default')
})

test('route layout pane controller derives agent shell pane state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/agent')
  const sidebarPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_SIDEBAR_PANE_ID)
  const contentPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_CONTENT_PANE_ID)

  assert.equal(sidebarPane?.storageKey, AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY)
  assert.equal(sidebarPane?.stateStorageKey, AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)
  assert.equal(sidebarPane?.collapsedSize, 0)
  assert.equal(sidebarPane?.defaultState, 'default')
  assert.equal(allowedRouteLayoutPaneState(sidebarPane, 'collapsed'), 'default')
  assert.equal(allowedRouteLayoutPaneState(sidebarPane, 'hidden'), 'hidden')
  assert.notEqual(sidebarPane?.stateStorageKey, LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)

  assert.equal(contentPane?.storageKey, AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY)
  assert.equal(contentPane?.stateStorageKey, AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  assert.equal(contentPane?.defaultState, 'default')
  assert.equal(contentPane?.collapsedSize, 0)
  assert.equal(allowedRouteLayoutPaneState(contentPane, 'hidden'), 'default')
  assert.notEqual(contentPane?.stateStorageKey, LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
})

test('route layout pane controller restores persisted agent shell pane sizes and states', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const sidebarPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_SIDEBAR_PANE_ID)
    const contentPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_CONTENT_PANE_ID)

    storage.set(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY, '340')
    storage.set(AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY, 'collapsed')
    storage.set(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, '980')
    storage.set(AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY, 'default')

    assert.equal(readRouteLayoutPaneSize(sidebarPane?.storageKey, sidebarPane?.defaultSize ?? 0), 340)
    assert.equal(readRouteLayoutPaneState(sidebarPane, routeLayoutPaneStateStorageKey(sidebarPane)), 'default')
    assert.equal(readRouteLayoutPaneSize(contentPane?.storageKey, contentPane?.defaultSize ?? 0), 980)
    assert.equal(readRouteLayoutPaneState(contentPane, routeLayoutPaneStateStorageKey(contentPane)), 'default')

    storage.set(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, 'not-a-number')
    storage.set(AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY, 'hidden')

    assert.equal(readRouteLayoutPaneSize(contentPane?.storageKey, contentPane?.defaultSize ?? 0), contentPane?.defaultSize)
    assert.equal(readRouteLayoutPaneState(contentPane, routeLayoutPaneStateStorageKey(contentPane)), 'default')
  } finally {
    globalThis.window = previousWindow
  }
})

test('route layout pane controller restores persisted terminal dock height', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const terminalPane = routeLayoutPaneById(routeLayout, APP_SHELL_TERMINAL_DOCK_PANE_ID)

    storage.set(APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY, '420')
    storage.set(APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY, 'default')

    assert.equal(readRouteLayoutPaneSize(terminalPane?.storageKey, terminalPane?.defaultSize ?? 0), 420)
    assert.equal(readRouteLayoutPaneState(terminalPane, routeLayoutPaneStateStorageKey(terminalPane)), 'default')

    storage.set(APP_SHELL_TERMINAL_DOCK_HEIGHT_STORAGE_KEY, '1200')
    assert.equal(
      readRouteLayoutPaneSize(terminalPane?.storageKey, terminalPane?.defaultSize ?? 0, (size) => {
        return Math.min(terminalPane?.maxSize as number, Math.max(terminalPane?.minSize as number, size))
      }),
      APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
    )
  } finally {
    globalThis.window = previousWindow
  }
})

test('route layout pane controller clamps restored agent pane sizes', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const sidebarPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_SIDEBAR_PANE_ID)
    const contentPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_CONTENT_PANE_ID)

    storage.set(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY, '80')
    storage.set(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, '5000')

    assert.equal(
      readRouteLayoutPaneSize(sidebarPane?.storageKey, sidebarPane?.defaultSize ?? 0, (size) => {
        return Math.min(sidebarPane?.maxSize as number, Math.max(sidebarPane?.minSize as number, size))
      }),
      sidebarPane?.minSize,
    )
    assert.equal(
      readRouteLayoutPaneSize(contentPane?.storageKey, contentPane?.defaultSize ?? 0, (size) => {
        return Math.min(contentPane?.maxSize as number, Math.max(contentPane?.minSize as number, size))
      }),
      contentPane?.maxSize,
    )
  } finally {
    globalThis.window = previousWindow
  }
})

test('shell layout consumes mode pane state through the route pane controller', () => {
  const appShellSource = readFileSync(resolve('src/features/app-shell/application/AppShellLayout.tsx'), 'utf8')
  const projectAgentModePageSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const projectAgentContentPanelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentContentPanel.tsx'), 'utf8')
  const agentTerminalPanelSource = readFileSync(resolve('src/features/agent/components/AgentTerminalPanel.tsx'), 'utf8')

  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_TOOL_SIDEBAR_PANE_ID/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_SETTINGS_SIDEBAR_PANE_ID/)
  assert.doesNotMatch(appShellSource, /APP_SHELL_ASSISTANT_DOCK_PANE_ID/)
  assert.doesNotMatch(appShellSource, /clampDetailAgentPanelWidth/)
  assert.doesNotMatch(appShellSource, /AIAgentPanel/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_TERMINAL_DOCK_PANE_ID[\s\S]*fallbackState: 'hidden'/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_TERMINAL_DOCK_PANE_ID[\s\S]*fallbackSize: APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT[\s\S]*clampSize: clampTerminalDockHeight[\s\S]*fallbackState: 'hidden'/)
  assert.match(appShellSource, /useResizablePanel\(\{[\s\S]*size: terminalPane\.size[\s\S]*onSizeChange: terminalPane\.setSize[\s\S]*resizeEdge: 'top'/)
  assert.match(appShellSource, /className="app-shell-terminal-resize-handle"[\s\S]*\{...terminalResizeHandleProps\}/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID[\s\S]*clampSize: clampAgentModeSidebarWidth[\s\S]*\}\)/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_CONTENT_PANE_ID[\s\S]*clampSize: clampAgentModeContentPanelWidth[\s\S]*fallbackState: 'default'[\s\S]*\}\)/)
  assert.match(appShellSource, /toolSidebarPane\.hidden/)
  assert.match(appShellSource, /toolSidebarPane\.setSize/)
  assert.match(appShellSource, /settingsSidebarPane\.hidden/)
  assert.match(appShellSource, /settingsSidebarPane\.setSize/)
  assert.match(appShellSource, /sidebar=\{settingsChrome \? \(/)
  assert.match(appShellSource, /: toolChrome \? \(/)
  assert.match(appShellSource, /centerHeader=\{settingsChrome \? settingsCenterHeader : toolChrome \? toolCenterHeader : homeChrome \? homeCenterHeader : projectCenterHeader\}/)
  assert.match(appShellSource, /leftPaneHidden=\{settingsChrome \? settingsSidebarHidden : toolChrome \? toolSidebarHidden : false\}/)
  assert.match(appShellSource, /const terminalOpen = !terminalPane\.hidden/)
  assert.doesNotMatch(appShellSource, /agentSidebarPane\.collapse/)
  assert.match(appShellSource, /agentContentPane\.collapsed/)
  assert.match(appShellSource, /fallbackState: 'default'/)
  assert.match(appShellSource, /const agentSidebarVisible = agentChrome && !agentSidebarPane\.hidden/)
  assert.match(appShellSource, /const agentLeftSlotStyle = appShellHiddenSlotStyle\(!agentSidebarVisible, agentSidebarPane\.size\)/)
  assert.match(appShellSource, /const agentRightSlotStyle = appShellCollapsedSlotStyle\(\{[\s\S]*collapsed: agentContentPane\.collapsed,[\s\S]*size: agentContentPane\.size,[\s\S]*collapsedSize: agentContentPane\.pane\?\.collapsedSize,/)
  assert.match(appShellSource, /<AppShellAgentContentToggle[\s\S]*closed=\{agentContentPanelClosed\}[\s\S]*onShow=\{agentContentPane\.show\}[\s\S]*onCollapse=\{agentContentPane\.collapse\}/)
  assert.doesNotMatch(appShellSource, /showAgentContentPanelShortcut/)
  assert.match(appShellSource, /sidebarCollapsed=\{false\}/)
  assert.match(appShellSource, /leftPaneHidden=\{!agentSidebarVisible\}/)
  assert.match(appShellSource, /<AppShellLeftPaneToggle hidden=\{!agentSidebarVisible\} onShow=\{agentSidebarPane\.show\} onHide=\{agentSidebarPane\.hide\}/)
  assert.match(appShellSource, /<ProjectAgentModeSidebar[\s\S]*width=\{agentSidebarPane\.size\}[\s\S]*onWidthChange=\{agentSidebarPane\.setSize\}/)
  assert.match(appShellSource, /<ProjectAgentContentPanel[\s\S]*collapsed=\{agentContentPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentContentPane\.collapse\(\)[\s\S]*agentContentPane\.show\(\)[\s\S]*width=\{agentContentPane\.size\}[\s\S]*onWidthChange=\{agentContentPane\.setSize\}/)
  assert.match(appShellSource, /<AgentTerminalPanel[\s\S]*open=\{terminalOpen\}[\s\S]*onOpenChange=\{\(open\) => \{[\s\S]*terminalPane\.show\(\)[\s\S]*terminalPane\.hide\(\)/)
  assert.doesNotMatch(agentTerminalPanelSource, /AGENT_TERMINAL_PANEL_OPEN_KEY/)
  assert.doesNotMatch(agentTerminalPanelSource, /movscript\.agentMode\.terminal\.open/)
  assert.doesNotMatch(agentTerminalPanelSource, /window\.localStorage\.(getItem|setItem)\(/)
  assert.match(projectAgentModePageSource, /function ProjectAgentModeFullscreen\(\{ userId \}: \{ userId: string \}\)/)
  assert.match(projectAgentModePageSource, /useRouteLayoutPaneController\(\{[\s\S]*routeLayout: PROJECT_AGENT_ROUTE_LAYOUT[\s\S]*paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID[\s\S]*clampSize: clampAgentModeSidebarWidth/)
  assert.match(projectAgentModePageSource, /useRouteLayoutPaneController\(\{[\s\S]*routeLayout: PROJECT_AGENT_ROUTE_LAYOUT[\s\S]*paneId: APP_SHELL_AGENT_CONTENT_PANE_ID[\s\S]*clampSize: clampAgentModeContentPanelWidth/)
  assert.match(projectAgentModePageSource, /<ProjectAgentModeSidebar[\s\S]*width=\{agentSidebarPane\.size\}[\s\S]*onWidthChange=\{agentSidebarPane\.setSize\}/)
  assert.match(projectAgentModePageSource, /<ProjectAgentContentPanel[\s\S]*manageOwnWidth[\s\S]*collapsed=\{agentContentPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentContentPane\.collapse\(\)[\s\S]*agentContentPane\.show\(\)[\s\S]*width=\{agentContentPane\.size\}[\s\S]*onWidthChange=\{agentContentPane\.setSize\}/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH/)
  assert.doesNotMatch(projectAgentModePageSource, /sidebarToggleLabel/)
  assert.match(projectAgentModePageSource, /const sidebarWidth = clampAgentModeSidebarWidth\(width \?\? AGENT_MODE_SIDEBAR_DEFAULT_WIDTH\)/)
  assert.match(projectAgentContentPanelSource, /const panelWidth = clampAgentModeContentPanelWidth\(width \?\? AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH\)/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(projectAgentModePageSource, /window\.localStorage\.getItem/)
  assert.doesNotMatch(projectAgentModePageSource, /window\.localStorage\.setItem\(AGENT_MODE/)
  assert.doesNotMatch(appShellSource, /const \[detailSidebarState/)
  assert.doesNotMatch(appShellSource, /const \[terminalOpen/)
  assert.doesNotMatch(appShellSource, /const \[agentModeContentPanelWidth/)
  assert.doesNotMatch(appShellSource, /agentModeSidebarCollapsed/)
  assert.doesNotMatch(appShellSource, /agentModeContentPanelCollapsed/)
  assert.doesNotMatch(appShellSource, /handleAgentModeContentPanelWidthChange/)
  assert.doesNotMatch(appShellSource, /APP_TERMINAL_OPEN_STORAGE_KEY/)
  assert.doesNotMatch(appShellSource, /toggleAgentModeSidebarCollapsed/)
  assert.doesNotMatch(appShellSource, /window\.localStorage\.getItem\(SIDEBAR_WIDTH_STORAGE_KEY\)/)
  assert.doesNotMatch(appShellSource, /window\.localStorage\.setItem\(SIDEBAR_WIDTH_STORAGE_KEY/)
})

test('workbench overlap pane controller options are derived from route pane specs', () => {
  assert.ok(!routeLayoutSpecForPathname('/project/scripts/workbench').panes.some((pane) => pane.owner === 'workbench'))

  const toolPane = routeLayoutPaneById(
    routeLayoutSpecForPathname('/tools/ref-image-gen'),
    TOOL_WORKBENCH_RESOURCE_PANE_ID,
  )
  const toolOptions = routeLayoutOverlapPaneControllerOptionsForPane(toolPane, {
    resizeEdge: 'left',
    ariaLabel: '调整资源面板宽度',
  })
  assert.equal(toolOptions.storageKey, TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY)
  assert.equal(toolOptions.defaultSize, TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH)
  assert.equal(toolOptions.minSize, TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH)
  assert.equal(toolOptions.collapseMode, 'after-min')
  assert.equal(toolOptions.expandMode, 'after-max')
})

test('workbench overlap pane group props visibility is normalized by the route layout adapter', () => {
  const groupProps = {
    'data-overlap-pane-collapsed': undefined,
    'data-overlap-pane-expanded': 'true',
    'data-overlap-pane-resized': 'true',
    style: { '--overlap-pane-size': '720px' },
  } as Parameters<typeof routeLayoutOverlapPaneGroupPropsForVisibility>[0]

  assert.equal(routeLayoutOverlapPaneGroupPropsForVisibility(groupProps, true), groupProps)
  assert.deepEqual(routeLayoutOverlapPaneGroupPropsForVisibility(groupProps, false), {
    ...groupProps,
    'data-overlap-pane-collapsed': 'true',
    'data-overlap-pane-expanded': undefined,
  })
})

test('workbench pages consume overlap pane sizing through the route layout adapter', () => {
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')

  assert.ok(!routeLayoutSpecForPathname('/tools/audio-gen').panes.some((pane) => pane.id === TOOL_WORKBENCH_RESOURCE_PANE_ID))
  assert.match(toolDialogSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: TOOL_WORKBENCH_RESOURCE_PANE_ID/)
  assert.match(toolDialogSource, /function ReferenceWorkbenchToolDialog/)
  assert.doesNotMatch(scriptsSource, /useRouteLayoutOverlapPaneController/)
  assert.doesNotMatch(scriptsSource, /routeLayoutOverlapPaneGroupPropsForVisibility/)
  assert.doesNotMatch(toolDialogSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(scriptsSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(toolDialogSource, /movscript:tools:resource-pane-width/)
  assert.doesNotMatch(scriptsSource, /movscript\.scriptWorkbench\.detailPaneWidth/)
})

test('agent workspace split pages use the shared split primitive', () => {
  const workspaceFilesSource = readFileSync(resolve('src/features/agent/components/MovScriptWorkspaceFilesPage.tsx'), 'utf8')
  const workspaceReviewSource = readFileSync(resolve('src/features/agent/components/MovScriptWorkspaceReviewPage.tsx'), 'utf8')
  const agentConnectionsSource = readFileSync(resolve('src/features/agent/components/AgentConnectionsPage.tsx'), 'utf8')
  const agentConsoleSource = readFileSync(resolve('src/features/agent/components/AgentConsolePage.tsx'), 'utf8')
  const agentConsoleRealtimeLogPanelSource = readFileSync(
    resolve('src/features/agent/components/AgentConsoleRealtimeLogPanel.tsx'),
    'utf8',
  )
  const agentConsoleSurfaceSource = `${agentConsoleSource}\n${agentConsoleRealtimeLogPanelSource}`
  const agentPageUiSource = readFileSync(resolve('src/features/agent/components/AgentPageUi.tsx'), 'utf8')
  const agentPageUiStyles = readFileSync(resolve('src/features/agent/components/AgentPageUi.css'), 'utf8')
  const agentPageWorkspaceUiSource = readFileSync(resolve('src/features/agent/components/AgentPageWorkspaceUi.tsx'), 'utf8')
  const agentPageWorkspaceUiStyles = readFileSync(resolve('src/features/agent/components/AgentPageWorkspaceUi.css'), 'utf8')
  const agentPageThreePaneUiSource = readFileSync(resolve('src/features/agent/components/AgentPageThreePaneUi.tsx'), 'utf8')
  const agentPageThreePaneUiStyles = readFileSync(resolve('src/features/agent/components/AgentPageThreePaneUi.css'), 'utf8')
  const agentConsoleStyles = readFileSync(resolve('src/features/agent/components/AgentConsoleUi.css'), 'utf8')

  for (const source of [workspaceFilesSource, workspaceReviewSource]) {
    assert.match(source, /AgentWorkspacesPageBody/)
    assert.doesNotMatch(source, /AgentPageShellBody/)
    assert.doesNotMatch(source, /grid min-h-0 flex-1 gap-4/)
    assert.doesNotMatch(source, /grid-cols-\[minmax/)
  }

  assert.match(workspaceFilesSource, /AgentWorkspacesPageSidebar/)
  assert.match(workspaceFilesSource, /AgentWorkspacesPageMain/)
  assert.match(workspaceFilesSource, /AgentWorkspacesPageList/)
  assert.match(workspaceFilesSource, /AgentWorkspacesPageSidebarControls/)
  assert.match(workspaceFilesSource, /AgentWorkspaceSidebarPathRow/)
  assert.match(workspaceFilesSource, /AgentWorkspaceListStack/)
  assert.match(workspaceFilesSource, /AgentWorkspaceListItemContent/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorLayout/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorTextarea/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorTitleBlock/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorSubtitle/)
  assert.match(workspaceFilesSource, /AgentWorkspaceListItemButton/)
  assert.match(workspaceFilesSource, /AgentWorkspaceStateRow/)
  assert.match(workspaceFilesSource, /AgentWorkspaceStateSpinner/)
  assert.doesNotMatch(workspaceFilesSource, /className="space-y-/)
  assert.doesNotMatch(workspaceFilesSource, /className="min-w-0/)
  assert.doesNotMatch(workspaceFilesSource, /className="truncate/)
  assert.doesNotMatch(workspaceFilesSource, /animate-spin/)
  assert.doesNotMatch(workspaceFilesSource, /className=\{`/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewSummaryPane/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewRawPane/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewTextarea/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewPaneTitle/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewJsonBlock/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewSection/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewEffectsList/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewEmptyBlock/)
  assert.match(workspaceReviewSource, /AgentWorkspaceStateRow/)
  assert.match(workspaceReviewSource, /AgentWorkspaceStateSpinner/)
  assert.match(workspaceReviewSource, /AgentWorkspacesPageFullMain/)
  assert.doesNotMatch(workspaceReviewSource, /className="space-y-/)
  assert.doesNotMatch(workspaceReviewSource, /className="mb-2/)
  assert.doesNotMatch(workspaceReviewSource, /className="text-sm/)
  assert.doesNotMatch(workspaceReviewSource, /animate-spin/)
  assert.doesNotMatch(workspaceReviewSource, /className=\{`/)

  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePageBody/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePagePane/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePagePaneScroller/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePageItemButton/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePageListStack/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceEditorLayout/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceEditorTitleBlock/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewSummaryPane/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewPaneTitle/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewJsonBlock/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceStateRow/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceStateSpinner/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceListStack/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewEffectsList/)
  assert.doesNotMatch(agentPageUiSource, /export function AgentThreePanePageBody/)
  assert.doesNotMatch(agentPageUiSource, /export function AgentWorkspaceEditorLayout/)
  assert.match(agentPageUiSource, /export function AgentPageShell/)
  assert.match(agentPageUiSource, /from '@movscript\/ui\/layout'/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 300px\), 1fr\)\);[\s\S]*overflow: auto;/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-auto-rows: minmax\(360px, 1fr\);/)
  assert.doesNotMatch(agentPageThreePaneUiStyles, /grid-template-columns: minmax\(240px, 280px\) minmax\(260px, 0\.9fr\) minmax\(320px, 1\.1fr\);/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-item \{[\s\S]*display: block;[\s\S]*width: 100%;/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-list-stack \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-2\);/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-editor-layout \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-editor-title-block \{[\s\S]*min-width: 0;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-review-summary-pane \{[\s\S]*overflow: auto;[\s\S]*padding: var\(--ms-space-4\);/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-review-pane-title,[\s\S]*\.agent-workspace-review-json-block__title \{[\s\S]*font-weight: 500;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-state-row \{[\s\S]*min-height: 8rem;[\s\S]*justify-content: center;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-state-spinner \{[\s\S]*animation: ms-spin 1s linear infinite;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-list-stack \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-1\);/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-review-effects-list \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-2\);/)
  assert.doesNotMatch(agentPageUiStyles, /\.agent-three-pane-page-body \{/)
  assert.doesNotMatch(agentPageUiStyles, /\.agent-workspace-editor-layout \{/)
  assert.match(agentConnectionsSource, /AgentThreePanePageBody/)
  assert.match(agentConnectionsSource, /AgentThreePanePagePane/)
  assert.match(agentConnectionsSource, /AgentThreePanePagePaneScroller/)
  assert.match(agentConnectionsSource, /AgentThreePanePagePaneRaw/)
  assert.match(agentConnectionsSource, /AgentThreePanePageItemButton/)
  assert.match(agentConnectionsSource, /AgentThreePanePageListStack/)
  assert.match(agentConnectionsSource, /AgentThreePanePageEmptyText/)
  assert.doesNotMatch(agentConnectionsSource, /AgentPageShellBody/)
  assert.doesNotMatch(agentConnectionsSource, /className=\{active/)
  assert.doesNotMatch(agentConnectionsSource, /className=\{event\.direction/)
  assert.doesNotMatch(agentConnectionsSource, /className="space-y-/)
  assert.doesNotMatch(agentConnectionsSource, /grid h-full min-h-\[620px\]/)
  assert.doesNotMatch(agentConnectionsSource, /grid-cols-\[280px/)

  assert.match(agentConsoleSource, /<AgentConsolePageBody>/)
  assert.doesNotMatch(agentConsoleSource, /className="agent-console-page-body"/)
  assert.match(agentConsoleSource, /<AgentConsoleMainGrid layout="control-logs">/)
  assert.match(agentConsoleSource, /<AgentConsoleMainColumn pane="config">/)
  assert.match(agentConsoleSource, /<AgentConsoleSidebar pane="logs">/)
  assert.match(agentConsoleSurfaceSource, /AgentConsoleLogSummary/)
  assert.match(agentConsoleSurfaceSource, /AgentConsoleLogStream/)
  assert.match(agentConsoleSurfaceSource, /AgentConsoleLogLineText/)
  assert.doesNotMatch(agentConsoleSurfaceSource, /className="agent-console-log-/)
  assert.match(agentConsoleStyles, /\.agent-console-page-body \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.doesNotMatch(agentConsoleStyles, /\.agent-console-main-grid\[data-layout="control-logs"\] > \.agent-console-main-column,[\s\S]*overflow-y: auto;/)
})
