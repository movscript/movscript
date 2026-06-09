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
  APP_SHELL_DETAIL_SIDEBAR_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_STATE_STORAGE_KEY,
  routeLayoutSpecForPathname,
} from '@/routes/routeLayoutRegistry'
import {
  allowedRouteLayoutPaneState,
  routeLayoutPaneById,
  routeLayoutPaneDefaultState,
  routeLayoutPaneStateStorageKey,
} from './useRouteLayoutPaneController'
import { routeLayoutOverlapPaneControllerOptionsForPane } from './useRouteLayoutOverlapPaneController'

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

  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_DETAIL_SIDEBAR_PANE_ID/)
  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_TERMINAL_DOCK_PANE_ID[\s\S]*fallbackState: 'hidden'/)
  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID[\s\S]*clampSize: clampAgentModeSidebarWidth[\s\S]*controlledState: agentModeSidebarCollapsed \? 'collapsed' : 'default'/)
  assert.match(appSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_CONTENT_PANE_ID[\s\S]*clampSize: clampAgentModeContentPanelWidth[\s\S]*controlledState: agentModeContentPanelCollapsed \? 'collapsed' : 'default'/)
  assert.match(appSource, /detailSidebarPane\.hidden/)
  assert.match(appSource, /detailSidebarPane\.setSize/)
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
  assert.match(appSource, /<ProjectAgentModeSidebar[\s\S]*width=\{agentSidebarPane\.size\}[\s\S]*onWidthChange=\{agentSidebarPane\.setSize\}/)
  assert.match(appSource, /<ProjectAgentContentPanel[\s\S]*width=\{agentContentPane\.size\}[\s\S]*onWidthChange=\{agentContentPane\.setSize\}/)
  assert.match(projectAgentModePageSource, /const controlledByRouteLayout = typeof width === 'number' && onWidthChange !== undefined/)
  assert.match(projectAgentModePageSource, /const renderedSidebarWidth = sidebarCollapsed \? AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth/)
  assert.match(projectAgentModePageSource, /useState\(\(\) => \{\s*if \(controlledByRouteLayout\) return clampAgentModeSidebarWidth\(width\)[\s\S]*window\.localStorage\.getItem\(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY\)/)
  assert.match(projectAgentModePageSource, /useState\(\(\) => \{\s*if \(controlledByRouteLayout\) return clampAgentModeContentPanelWidth\(width\)[\s\S]*window\.localStorage\.getItem\(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY\)/)
  assert.match(projectAgentModePageSource, /if \(controlledByRouteLayout\) return[\s\S]*window\.localStorage\.setItem\(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY/)
  assert.match(projectAgentModePageSource, /if \(controlledByRouteLayout\) return[\s\S]*window\.localStorage\.setItem\(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(appSource, /const \[detailSidebarState/)
  assert.doesNotMatch(appSource, /const \[terminalOpen/)
  assert.doesNotMatch(appSource, /const \[agentModeContentPanelWidth/)
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

  const preProductionPane = routeLayoutPaneById(
    routeLayoutSpecForPathname('/project/pre-production'),
    PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID,
  )
  const preProductionOptions = routeLayoutOverlapPaneControllerOptionsForPane(preProductionPane, {
    resizeEdge: 'left',
    ariaLabel: '调整详情宽度',
  })
  assert.equal(preProductionOptions.storageKey, PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY)
  assert.equal(preProductionOptions.defaultSize, PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH)
  assert.equal(preProductionOptions.minSize, PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_MIN_WIDTH)
  assert.equal(preProductionOptions.collapseMode, 'after-min')
  assert.equal(preProductionOptions.expandMode, 'after-max')

  const contentPane = routeLayoutPaneById(
    routeLayoutSpecForPathname('/project/content-units/editor'),
    CONTENT_WORKBENCH_DETAIL_PANE_ID,
  )
  const contentOptions = routeLayoutOverlapPaneControllerOptionsForPane(contentPane, {
    resizeEdge: 'left',
    ariaLabel: '调整内容编排详情面板宽度',
  })
  assert.equal(contentOptions.storageKey, CONTENT_WORKBENCH_DETAIL_PANE_WIDTH_STORAGE_KEY)
  assert.equal(contentOptions.defaultSize, CONTENT_WORKBENCH_DETAIL_PANE_DEFAULT_WIDTH)
  assert.equal(contentOptions.minSize, CONTENT_WORKBENCH_DETAIL_PANE_MIN_WIDTH)
  assert.equal(contentOptions.collapseMode, 'after-min')
  assert.equal(contentOptions.expandMode, 'after-max')

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

test('workbench pages consume overlap pane sizing through the route layout adapter', () => {
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const preProductionSource = readFileSync(resolve('src/features/pre-production/components/PreProductionPage.tsx'), 'utf8')
  const contentWorkbenchSource = readFileSync(resolve('src/features/content/components/ContentWorkbenchPage.tsx'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')

  assert.match(toolDialogSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: TOOL_WORKBENCH_RESOURCE_PANE_ID/)
  assert.match(scriptsSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: SCRIPT_WORKBENCH_DETAIL_PANE_ID/)
  assert.match(preProductionSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: PRE_PRODUCTION_WORKBENCH_DETAIL_PANE_ID/)
  assert.match(contentWorkbenchSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: CONTENT_WORKBENCH_DETAIL_PANE_ID/)
  assert.doesNotMatch(toolDialogSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(scriptsSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(preProductionSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(contentWorkbenchSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(toolDialogSource, /movscript:tools:resource-pane-width/)
  assert.doesNotMatch(scriptsSource, /movscript\.scriptWorkbench\.detailPaneWidth/)
  assert.doesNotMatch(preProductionSource, /movscript\.preProduction\.detailPaneWidth/)
  assert.doesNotMatch(contentWorkbenchSource, /movscript\.contentWorkbench\.detailPaneWidth/)
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
    assert.match(source, /AgentWorkspacesPageSidebar/)
    assert.match(source, /AgentWorkspacesPageMain/)
    assert.doesNotMatch(source, /AgentPageShellBody/)
    assert.doesNotMatch(source, /grid min-h-0 flex-1 gap-4/)
    assert.doesNotMatch(source, /grid-cols-\[minmax/)
  }

  assert.match(workspaceFilesSource, /AgentWorkspacesPageList/)
  assert.match(workspaceFilesSource, /AgentWorkspacesPageSidebarControls/)

  assert.match(agentPageSource, /export function AgentThreePanePageBody/)
  assert.match(agentPageSource, /export function AgentThreePanePagePane/)
  assert.match(agentPageStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-template-columns: 1fr;/)
  assert.match(agentPageStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-template-columns: minmax\(240px, 280px\) minmax\(260px, 0\.9fr\) minmax\(320px, 1\.1fr\);/)
  assert.match(businessExports, /AgentThreePanePageBody/)
  assert.match(businessExports, /AgentThreePanePagePane/)
  assert.match(agentConnectionsSource, /AgentThreePanePageBody/)
  assert.match(agentConnectionsSource, /AgentThreePanePagePane/)
  assert.doesNotMatch(agentConnectionsSource, /AgentPageShellBody/)
  assert.doesNotMatch(agentConnectionsSource, /grid h-full min-h-\[620px\]/)
  assert.doesNotMatch(agentConnectionsSource, /grid-cols-\[280px/)

  assert.match(agentConsoleSource, /<AgentPageShellBody scroll="responsive-split" className="agent-console-page-body">/)
  assert.match(agentConsoleSource, /<AgentConsoleMainGrid className="agent-console-main-grid--control-logs">/)
  assert.match(agentConsoleStyles, /\.agent-console-page-body \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.match(agentConsoleStyles, /\.agent-console-main-grid--control-logs > \.agent-console-main-column,[\s\S]*overflow-y: auto;/)
})
