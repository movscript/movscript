import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { APP_SIDEBAR_WIDTH_STORAGE_KEY } from '@movscript/ui'
import {
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH,
  AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
  LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
} from '@/features/agent/presentation/agentModePanelSizing'
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
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_ASSISTANT_DOCK_PANE_ID,
  APP_SHELL_DETAIL_SIDEBAR_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
  routeLayoutSpecForPathname,
} from '@/routes/routeLayoutRegistry'
import {
  DETAIL_AGENT_PANEL_DEFAULT_WIDTH,
  DETAIL_AGENT_PANEL_WIDTH_STORAGE_KEY,
} from '@/features/agent/presentation/agentDetailAssistantPaneSizing'
import {
  allowedRouteLayoutPaneState,
  routeLayoutPaneById,
  routeLayoutPaneDefaultState,
  routeLayoutPaneStateStorageKey,
} from './useRouteLayoutPaneController'
import {
  routeLayoutOverlapPaneControllerOptionsForPane,
  routeLayoutOverlapPaneGroupPropsForVisibility,
} from './useRouteLayoutOverlapPaneController'

test('route layout pane controller derives sidebar state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/scripts/workbench')
  const pane = routeLayoutPaneById(routeLayout, APP_SHELL_DETAIL_SIDEBAR_PANE_ID)

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
  assert.equal(routeLayoutPaneDefaultState(pane), 'hidden')
  assert.equal(allowedRouteLayoutPaneState(pane, 'default'), 'default')
  assert.equal(allowedRouteLayoutPaneState(pane, 'collapsed'), 'default')
})

test('route layout pane controller derives detail assistant dock sizing from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/scripts/workbench')
  const pane = routeLayoutPaneById(routeLayout, APP_SHELL_ASSISTANT_DOCK_PANE_ID)

  assert.equal(pane?.storageKey, DETAIL_AGENT_PANEL_WIDTH_STORAGE_KEY)
  assert.equal(pane?.defaultSize, DETAIL_AGENT_PANEL_DEFAULT_WIDTH)
  assert.equal(routeLayoutPaneStateStorageKey(pane), undefined)
  assert.equal(routeLayoutPaneDefaultState(pane, 'hidden'), 'hidden')
  assert.equal(allowedRouteLayoutPaneState(pane, 'hidden'), 'hidden')
  assert.equal(allowedRouteLayoutPaneState(pane, 'default'), 'default')
  assert.equal(allowedRouteLayoutPaneState(pane, 'collapsed', 'hidden'), 'hidden')
})

test('route layout pane controller derives agent shell pane state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/agent')
  const sidebarPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_SIDEBAR_PANE_ID)
  const contentPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_CONTENT_PANE_ID)

  assert.equal(sidebarPane?.storageKey, AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY)
  assert.equal(sidebarPane?.stateStorageKey, AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)
  assert.equal(sidebarPane?.collapsedSize, AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH)
  assert.equal(sidebarPane?.defaultState, 'default')
  assert.equal(allowedRouteLayoutPaneState(sidebarPane, 'collapsed'), 'collapsed')
  assert.equal(allowedRouteLayoutPaneState(sidebarPane, 'hidden'), 'default')
  assert.notEqual(sidebarPane?.stateStorageKey, LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)

  assert.equal(contentPane?.storageKey, AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY)
  assert.equal(contentPane?.stateStorageKey, AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  assert.equal(contentPane?.defaultState, 'default')
  assert.equal(contentPane?.collapsedSize, 0)
  assert.equal(allowedRouteLayoutPaneState(contentPane, 'hidden'), 'default')
  assert.notEqual(contentPane?.stateStorageKey, LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
})

test('shell layout consumes detail sidebar state through the route pane controller', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8')
  const projectAgentModePageSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8')
  const agentTerminalPanelSource = readFileSync(resolve('src/features/agent/components/AgentTerminalPanel.tsx'), 'utf8')

  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_DETAIL_SIDEBAR_PANE_ID/)
  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_ASSISTANT_DOCK_PANE_ID[\s\S]*clampSize: clampDetailAgentPanelWidth[\s\S]*controlledState: detailAgentPanelOpen \? 'default' : 'hidden'/)
  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_TERMINAL_DOCK_PANE_ID[\s\S]*fallbackState: 'hidden'/)
  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID[\s\S]*clampSize: clampAgentModeSidebarWidth[\s\S]*\}\)/)
  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_CONTENT_PANE_ID[\s\S]*clampSize: clampAgentModeContentPanelWidth[\s\S]*fallbackState: 'default'[\s\S]*\}\)/)
  assert.match(appSource, /detailSidebarPane\.hidden/)
  assert.match(appSource, /detailSidebarPane\.setSize/)
  assert.match(appSource, /detailAssistantPane\.hidden/)
  assert.match(appSource, /detailAssistantPane\.size/)
  assert.match(appSource, /onWidthChange=\{detailAssistantPane\.setSize\}/)
  assert.match(appSource, /const terminalOpen = !terminalPane\.hidden/)
  assert.match(appSource, /agentSidebarPane\.collapse/)
  assert.match(appSource, /agentContentPane\.collapsed/)
  assert.match(appSource, /fallbackState: 'default'/)
  assert.match(appSource, /const agentSidebarVisible = !agentSidebarPane\.collapsed && !agentSidebarPane\.hidden/)
  assert.match(appSource, /const agentLeftSlotWidth = !agentSidebarVisible[\s\S]*agentSidebarPane\.size/)
  assert.match(appSource, /const agentLeftSlotStyle = \{[\s\S]*agentLeftSlotWidth/)
  assert.match(appSource, /const agentRightCollapsedWidth = agentContentPane\.pane\?\.collapsedSize \?\? 0/)
  assert.match(appSource, /const agentRightSlotStyle = \{[\s\S]*agentRightCollapsedWidth[\s\S]*agentContentPane\.size/)
  assert.match(appSource, /onClick=\{agentContentPanelClosed \? agentContentPane\.show : agentContentPane\.collapse\}/)
  assert.match(appSource, /showAgentContentPanelShortcut=\{false\}/)
  assert.match(appSource, /sidebarCollapsed=\{agentSidebarPane\.collapsed\}/)
  assert.match(appSource, /leftPaneHidden=\{!agentSidebarVisible\}/)
  assert.match(appSource, /<ProjectAgentModeSidebar[\s\S]*collapsed=\{agentSidebarPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentSidebarPane\.collapse\(\)[\s\S]*agentSidebarPane\.show\(\)[\s\S]*width=\{agentSidebarPane\.size\}[\s\S]*onWidthChange=\{agentSidebarPane\.setSize\}/)
  assert.match(appSource, /<ProjectAgentContentPanel[\s\S]*collapsed=\{agentContentPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentContentPane\.collapse\(\)[\s\S]*agentContentPane\.show\(\)[\s\S]*width=\{agentContentPane\.size\}[\s\S]*onWidthChange=\{agentContentPane\.setSize\}/)
  assert.match(appSource, /<AgentTerminalPanel[\s\S]*open=\{terminalOpen\}[\s\S]*onOpenChange=\{\(open\) => \{[\s\S]*terminalPane\.show\(\)[\s\S]*terminalPane\.hide\(\)/)
  assert.doesNotMatch(agentTerminalPanelSource, /AGENT_TERMINAL_PANEL_OPEN_KEY/)
  assert.doesNotMatch(agentTerminalPanelSource, /movscript\.agentMode\.terminal\.open/)
  assert.doesNotMatch(agentTerminalPanelSource, /window\.localStorage\.(getItem|setItem)\(/)
  assert.match(projectAgentModePageSource, /function ProjectAgentModeFullscreen\(\{ userId \}: \{ userId: string \}\)/)
  assert.match(projectAgentModePageSource, /useRouteLayoutPaneController\(\{[\s\S]*routeLayout: PROJECT_AGENT_ROUTE_LAYOUT[\s\S]*paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID[\s\S]*clampSize: clampAgentModeSidebarWidth/)
  assert.match(projectAgentModePageSource, /useRouteLayoutPaneController\(\{[\s\S]*routeLayout: PROJECT_AGENT_ROUTE_LAYOUT[\s\S]*paneId: APP_SHELL_AGENT_CONTENT_PANE_ID[\s\S]*clampSize: clampAgentModeContentPanelWidth/)
  assert.match(projectAgentModePageSource, /<ProjectAgentModeSidebar[\s\S]*collapsed=\{agentSidebarPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentSidebarPane\.collapse\(\)[\s\S]*agentSidebarPane\.show\(\)[\s\S]*width=\{agentSidebarPane\.size\}[\s\S]*onWidthChange=\{agentSidebarPane\.setSize\}/)
  assert.match(projectAgentModePageSource, /<ProjectAgentContentPanel[\s\S]*manageOwnWidth[\s\S]*collapsed=\{agentContentPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentContentPane\.collapse\(\)[\s\S]*agentContentPane\.show\(\)[\s\S]*width=\{agentContentPane\.size\}[\s\S]*onWidthChange=\{agentContentPane\.setSize\}/)
  assert.match(projectAgentModePageSource, /const renderedSidebarWidth = collapsed \? AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth/)
  assert.match(projectAgentModePageSource, /const sidebarWidth = clampAgentModeSidebarWidth\(width \?\? AGENT_MODE_SIDEBAR_DEFAULT_WIDTH\)/)
  assert.match(projectAgentModePageSource, /const panelWidth = clampAgentModeContentPanelWidth\(width \?\? AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH\)/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(projectAgentModePageSource, /window\.localStorage\.getItem/)
  assert.doesNotMatch(projectAgentModePageSource, /window\.localStorage\.setItem\(AGENT_MODE/)
  assert.doesNotMatch(appSource, /const \[detailSidebarState/)
  assert.doesNotMatch(appSource, /const \[terminalOpen/)
  assert.doesNotMatch(appSource, /const \[agentModeContentPanelWidth/)
  assert.doesNotMatch(appSource, /agentModeSidebarCollapsed/)
  assert.doesNotMatch(appSource, /agentModeContentPanelCollapsed/)
  assert.doesNotMatch(appSource, /handleAgentModeContentPanelWidthChange/)
  assert.doesNotMatch(appSource, /APP_TERMINAL_OPEN_STORAGE_KEY/)
  assert.doesNotMatch(appSource, /toggleAgentModeSidebarCollapsed/)
  assert.doesNotMatch(appSource, /window\.localStorage\.getItem\(SIDEBAR_WIDTH_STORAGE_KEY\)/)
  assert.doesNotMatch(appSource, /window\.localStorage\.setItem\(SIDEBAR_WIDTH_STORAGE_KEY/)
})

test('workbench overlap pane controller options are derived from route pane specs', () => {
  const scriptPane = routeLayoutPaneById(
    routeLayoutSpecForPathname('/project/scripts/workbench'),
    SCRIPT_WORKBENCH_DETAIL_PANE_ID,
  )
  const scriptOptions = routeLayoutOverlapPaneControllerOptionsForPane(scriptPane, {
    resizeEdge: 'left',
    ariaLabel: '调整剧本正文宽度',
  })
  assert.equal(scriptOptions.storageKey, SCRIPT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY)
  assert.equal(scriptOptions.defaultSize, SCRIPT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH)
  assert.equal(scriptOptions.minSize, SCRIPT_WORKBENCH_DETAIL_PANE_MIN_WIDTH)
  assert.equal(scriptOptions.collapseMode, 'after-min')
  assert.equal(scriptOptions.expandMode, 'after-max')

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

  assert.match(toolDialogSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: TOOL_WORKBENCH_RESOURCE_PANE_ID/)
  assert.match(scriptsSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: SCRIPT_WORKBENCH_DETAIL_PANE_ID/)
  for (const pageSource of [scriptsSource]) {
    assert.match(pageSource, /routeLayoutOverlapPaneGroupPropsForVisibility\([^)]*\.groupProps,/)
    assert.doesNotMatch(pageSource, /'data-overlap-pane-collapsed': 'true'/)
    assert.doesNotMatch(pageSource, /'data-overlap-pane-expanded': undefined/)
  }
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
  const agentPageSource = readFileSync(resolve('../../packages/ui/src/components/business/agent/page/index.tsx'), 'utf8')
  const agentPageStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/page/styles.css'), 'utf8')
  const agentConsoleStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/console/styles.css'), 'utf8')
  const businessExports = readFileSync(resolve('../../packages/ui/src/components/business/index.ts'), 'utf8')

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

  assert.match(agentPageSource, /export function AgentThreePanePageBody/)
  assert.match(agentPageSource, /export function AgentThreePanePagePane/)
  assert.match(agentPageSource, /export function AgentThreePanePagePaneScroller/)
  assert.match(agentPageSource, /export function AgentThreePanePageItemButton/)
  assert.match(agentPageSource, /export function AgentThreePanePageListStack/)
  assert.match(agentPageSource, /export function AgentWorkspaceEditorLayout/)
  assert.match(agentPageSource, /export function AgentWorkspaceEditorTitleBlock/)
  assert.match(agentPageSource, /export function AgentWorkspaceReviewSummaryPane/)
  assert.match(agentPageSource, /export function AgentWorkspaceReviewPaneTitle/)
  assert.match(agentPageSource, /export function AgentWorkspaceReviewJsonBlock/)
  assert.match(agentPageSource, /export function AgentWorkspaceStateRow/)
  assert.match(agentPageSource, /export function AgentWorkspaceStateSpinner/)
  assert.match(agentPageSource, /export function AgentWorkspaceListStack/)
  assert.match(agentPageSource, /export function AgentWorkspaceReviewEffectsList/)
  assert.match(agentPageStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 300px\), 1fr\)\);[\s\S]*overflow: auto;/)
  assert.match(agentPageStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-auto-rows: minmax\(360px, 1fr\);/)
  assert.doesNotMatch(agentPageStyles, /grid-template-columns: minmax\(240px, 280px\) minmax\(260px, 0\.9fr\) minmax\(320px, 1\.1fr\);/)
  assert.match(agentPageStyles, /\.agent-three-pane-page-item \{[\s\S]*display: block;[\s\S]*width: 100%;/)
  assert.match(agentPageStyles, /\.agent-three-pane-page-list-stack \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-2\);/)
  assert.match(agentPageStyles, /\.agent-workspace-editor-layout \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.match(agentPageStyles, /\.agent-workspace-editor-title-block \{[\s\S]*min-width: 0;/)
  assert.match(agentPageStyles, /\.agent-workspace-review-summary-pane \{[\s\S]*overflow: auto;[\s\S]*padding: var\(--ms-space-4\);/)
  assert.match(agentPageStyles, /\.agent-workspace-review-pane-title,[\s\S]*\.agent-workspace-review-json-block__title \{[\s\S]*font-weight: 500;/)
  assert.match(agentPageStyles, /\.agent-workspace-state-row \{[\s\S]*min-height: 8rem;[\s\S]*justify-content: center;/)
  assert.match(agentPageStyles, /\.agent-workspace-state-spinner \{[\s\S]*animation: ms-spin 1s linear infinite;/)
  assert.match(agentPageStyles, /\.agent-workspace-list-stack \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-1\);/)
  assert.match(agentPageStyles, /\.agent-workspace-review-effects-list \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-2\);/)
  assert.match(businessExports, /AgentThreePanePageBody/)
  assert.match(businessExports, /AgentThreePanePagePane/)
  assert.match(businessExports, /AgentThreePanePageItemButton/)
  assert.match(businessExports, /AgentThreePanePageListStack/)
  assert.match(businessExports, /AgentWorkspaceEditorLayout/)
  assert.match(businessExports, /AgentWorkspaceEditorTitleBlock/)
  assert.match(businessExports, /AgentWorkspaceReviewSummaryPane/)
  assert.match(businessExports, /AgentWorkspaceReviewPaneTitle/)
  assert.match(businessExports, /AgentWorkspaceReviewJsonBlock/)
  assert.match(businessExports, /AgentWorkspaceStateRow/)
  assert.match(businessExports, /AgentWorkspaceStateSpinner/)
  assert.match(businessExports, /AgentWorkspaceListStack/)
  assert.match(businessExports, /AgentWorkspaceReviewEffectsList/)
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
  assert.match(agentConsoleSource, /AgentConsoleLogSummary/)
  assert.match(agentConsoleSource, /AgentConsoleLogStream/)
  assert.match(agentConsoleSource, /AgentConsoleLogLineText/)
  assert.doesNotMatch(agentConsoleSource, /className="agent-console-log-/)
  assert.match(agentConsoleStyles, /\.agent-console-page-body \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.match(agentConsoleStyles, /\.agent-console-main-grid\[data-layout="control-logs"\] > \.agent-console-main-column,[\s\S]*overflow-y: auto;/)
})
