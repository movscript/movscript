import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { WorkspaceShell, useResizablePanel } from '@movscript/ui/layout'
import { Sidebar, clampSidebarWidth } from '@/features/app-shell/components/Sidebar'
import { Header } from '@/features/app-shell/components/Header'
import { ProjectGitHeaderActions } from '@/features/app-shell/components/ProjectGitHeaderActions'
import { ProjectEntryDeckHeader } from '@/features/project/components/ProjectEntryDeckHeader'
import {
  AccountSettingsPageSidebar,
} from '@/features/app-shell/components/AccountSettingsDialog'
import {
  AgentTerminalPanel,
  ProjectAIAssistantPanel,
  ProjectAgentContentPanel,
  ProjectAgentModeSidebar,
} from '@/features/app-shell/application/appRouteComponents'
import { RouteErrorBoundary, RouteSuspense, OrgGuard } from '@/features/app-shell/application/AppRouteBoundaries'
import {
  accountSettingsRouteHeaderTitle,
  accountSettingsTabForLocation,
  projectRouteHeaderTitle,
  readSettingsReturnPath,
  toolRouteHeaderTitle,
  useRememberSettingsReturnPath,
} from '@/features/app-shell/application/appShellRouteHeaders'
import { GlobalNavigationEffects } from '@/features/app-shell/application/GlobalNavigationEffects'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import {
  AppShellAgentContentToggle,
  AppShellHistoryNavigationControls,
  AppShellHomeControl,
  AppShellLeftPaneToggle,
  AppShellProjectAgentToggle,
  AppShellSettingsExitControl,
  AppShellTerminalToggle,
} from '@/features/app-shell/application/AppShellLayoutControls'
import {
  appShellCollapsedSlotStyle,
  appShellHiddenSlotStyle,
} from '@/features/app-shell/application/AppShellLayoutSlots'
import {
  clampAgentModeContentPanelWidth,
  clampAgentModeSidebarWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import { routeForWorkMode, getAppRouteLayoutSpec, type AppRouteSurface } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_PROJECT_AGENT_PANE_ID,
  APP_SHELL_SETTINGS_SIDEBAR_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
  appRouteViewportScrollForMode,
} from '@/routes/routeLayoutRegistry'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import { AppRouteViewport } from '@movscript/ui/layout'

function clampTerminalDockHeight(size: number): number {
  return Math.min(APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT, Math.max(APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT, size))
}

export function ShellLayout({ children, requireOrg = true }: { children: React.ReactNode; requireOrg?: boolean }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)
  const routeSurface = routeLayout.surface
  const routeChrome = routeLayout.chrome ?? routeSurface
  const routeViewportScroll = appRouteViewportScrollForMode(routeLayout.scrollMode)
  const agentChrome = routeChrome === 'agent'
  const projectChrome = routeChrome === 'project'
  const toolChrome = routeChrome === 'tool'
  const settingsChrome = routeChrome === 'settings'
  const homeChrome = routeChrome === 'home'
  const currentUser = useUserStore((s) => s.currentUser)
  const currentProject = useProjectStore((s) => s.current)
  const userId = currentUser ? String(currentUser.ID) : ''
  const toolSidebarPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_TOOL_SIDEBAR_PANE_ID,
    clampSize: clampSidebarWidth,
  })
  const settingsSidebarPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_SETTINGS_SIDEBAR_PANE_ID,
    clampSize: clampSidebarWidth,
  })
  const terminalPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_TERMINAL_DOCK_PANE_ID,
    fallbackSize: APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
    clampSize: clampTerminalDockHeight,
    fallbackState: 'hidden',
  })
  const toolSidebarHidden = !toolChrome || toolSidebarPane.hidden
  const settingsSidebarHidden = !settingsChrome || settingsSidebarPane.hidden
  const terminalOpen = !terminalPane.hidden
  const agentSidebarPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID,
    clampSize: clampAgentModeSidebarWidth,
  })
  const agentContentPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_AGENT_CONTENT_PANE_ID,
    clampSize: clampAgentModeContentPanelWidth,
    fallbackState: 'default',
  })
  const projectAgentPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_PROJECT_AGENT_PANE_ID,
    clampSize: clampAgentModeContentPanelWidth,
    fallbackState: 'collapsed',
  })
  const agentModeContentPanelOpen = !agentContentPane.collapsed && !agentContentPane.hidden
  const projectAgentPanelClosed = projectAgentPane.collapsed || projectAgentPane.hidden
  const agentSidebarVisible = agentChrome && !agentSidebarPane.hidden
  const accountSettingsActiveTab = accountSettingsTabForLocation(pathname, search)
  const agentSettingsActive = pathname === ROUTES.agentSettings
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const settingsActive = !!accountSettingsActiveTab || agentSettingsActive
  const settingsExitPath = settingsActive
    ? readSettingsReturnPath() ?? routeForWorkMode(workMode, !!currentProject)
    : undefined
  const toolCenterContent = accountSettingsActiveTab
    ? accountSettingsRouteHeaderTitle(accountSettingsActiveTab)
    : toolRouteHeaderTitle(pathname)
  const projectCenterContent = currentProject?.name ? (
    <ProjectEntryDeckHeader
      activeEntryId={routeLayout.projectEntryId}
      projectId={currentProject.ID}
      projectName={currentProject.name}
    />
  ) : projectRouteHeaderTitle(pathname)
  const terminalWorkspaceContext = React.useMemo(() => {
    if (currentProject?.ID) {
      return {
        scope: 'project' as const,
        userId: userId || undefined,
        projectId: currentProject.ID,
      }
    }
    return {
      scope: 'global' as const,
      userId: userId || undefined,
    }
  }, [currentProject?.ID, userId])
  const terminalPlacement = agentChrome ? 'center-right' : 'center'
  const terminalResize = useResizablePanel({
    size: terminalPane.size,
    onSizeChange: terminalPane.setSize,
    minSize: APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
    maxSize: APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
    resizeEdge: 'top',
    collapsed: !terminalOpen,
    ariaLabel: '调整 Terminal 高度',
  })
  const { active: terminalResizeActive, ...terminalResizeHandleProps } = terminalResize.resizeHandleProps
  const terminalHeaderControl = (
    <AppShellTerminalToggle open={terminalOpen} onToggle={terminalOpen ? terminalPane.hide : terminalPane.show} />
  )
  const homeHeaderControl = <AppShellHomeControl />
  const settingsExitControl = (
    <AppShellSettingsExitControl
      active={settingsActive}
      onExit={() => navigate(settingsExitPath ?? routeForWorkMode(workMode, !!currentProject), { replace: true })}
    />
  )
  const projectHistoryNavigationControls = <AppShellHistoryNavigationControls navClassName="project-window-controls__nav" />
  const agentContentPanelClosed = agentContentPane.collapsed || agentContentPane.hidden
  const agentContentPanelHeaderControl = (
    <AppShellAgentContentToggle
      closed={agentContentPanelClosed}
      onShow={agentContentPane.show}
      onCollapse={agentContentPane.collapse}
    />
  )
  const projectAgentPanelHeaderControl = (
    <AppShellProjectAgentToggle
      closed={projectAgentPanelClosed}
      onShow={projectAgentPane.show}
      onCollapse={projectAgentPane.collapse}
    />
  )
  const terminalPanel = (
    <div
      className="app-shell-terminal-panel-frame"
      data-resizing={terminalResize.resizing ? 'true' : undefined}
      style={{
        height: terminalPane.size,
        minHeight: APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
        maxHeight: APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
        flexBasis: terminalPane.size,
      }}
    >
      <div
        className="app-shell-terminal-resize-handle"
        data-active={terminalResizeActive ? 'true' : undefined}
        {...terminalResizeHandleProps}
      />
      <React.Suspense fallback={null}>
        <AgentTerminalPanel
          open={terminalOpen}
          onOpenChange={(open) => {
            if (open) terminalPane.show()
            else terminalPane.hide()
          }}
          shellPlacement={terminalPlacement}
          workspaceContext={terminalWorkspaceContext}
        />
      </React.Suspense>
    </div>
  )
  const showToolSidebar = React.useCallback(() => {
    toolSidebarPane.show()
  }, [toolSidebarPane])
  const hideToolSidebar = React.useCallback(() => {
    toolSidebarPane.hide()
  }, [toolSidebarPane])
  const showSettingsSidebar = React.useCallback(() => {
    settingsSidebarPane.show()
  }, [settingsSidebarPane])
  const hideSettingsSidebar = React.useCallback(() => {
    settingsSidebarPane.hide()
  }, [settingsSidebarPane])
  const toolSidebarLayoutControls = (
    <div className="tool-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppShellLeftPaneToggle hidden={toolSidebarHidden} onShow={showToolSidebar} onHide={hideToolSidebar} />
      <AppShellHistoryNavigationControls navClassName="tool-sidebar-window-controls__nav" />
    </div>
  )
  const settingsSidebarLayoutControls = (
    <div className="tool-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppShellLeftPaneToggle hidden={settingsSidebarHidden} onShow={showSettingsSidebar} onHide={hideSettingsSidebar} />
    </div>
  )
  const agentSidebarLayoutControls = (
    <div className="agent-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppShellLeftPaneToggle hidden={!agentSidebarVisible} onShow={agentSidebarPane.show} onHide={agentSidebarPane.hide} />
      {agentSettingsActive ? null : <AppShellHistoryNavigationControls navClassName="agent-sidebar-window-controls__nav" />}
    </div>
  )
  const agentNavigationControls = <>{homeHeaderControl}{settingsExitControl}</>
  const toolLeftHeader = toolChrome && !toolSidebarHidden ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      navigationControls={<>{homeHeaderControl}{settingsExitControl}</>}
      layoutControls={accountSettingsActiveTab ? settingsSidebarLayoutControls : toolSidebarLayoutControls}
      leftControlsLayout="fill"
    />
  ) : undefined
  const toolCenterNavigationControls = toolChrome && toolSidebarHidden ? <>{homeHeaderControl}{settingsExitControl}</> : undefined
  const toolCenterLayoutControls = toolChrome && toolSidebarHidden
    ? accountSettingsActiveTab ? settingsSidebarLayoutControls : toolSidebarLayoutControls
    : undefined
  const toolCenterHeader = (
    <Header
      showWindowControls={!toolLeftHeader}
      showAppControls
      showFallbackBrand={false}
      showSettingsAction={false}
      navigationControls={toolCenterNavigationControls}
      layoutControls={toolCenterLayoutControls}
      contextActions={terminalHeaderControl}
      centerContent={toolCenterContent}
    />
  )
  const settingsLeftHeader = settingsChrome && !settingsSidebarHidden ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      navigationControls={<>{homeHeaderControl}{settingsExitControl}</>}
      layoutControls={settingsSidebarLayoutControls}
      leftControlsLayout="fill"
    />
  ) : undefined
  const settingsCenterHeader = (
    <Header
      showWindowControls={!settingsLeftHeader}
      showAppControls
      showFallbackBrand={false}
      showSettingsAction={false}
      navigationControls={settingsSidebarHidden ? <>{homeHeaderControl}{settingsExitControl}</> : undefined}
      layoutControls={settingsSidebarHidden ? settingsSidebarLayoutControls : undefined}
      contextActions={terminalHeaderControl}
      centerContent={accountSettingsActiveTab ? accountSettingsRouteHeaderTitle(accountSettingsActiveTab) : undefined}
    />
  )
  const homeCenterHeader = (
    <Header
      showWindowControls
      showAppControls
      showFallbackBrand={false}
      showAppUpdateAction
    />
  )
  const projectCenterHeader = (
    <Header
      showWindowControls
      showAppControls
      showFallbackBrand={false}
      navigationControls={<>{homeHeaderControl}{projectHistoryNavigationControls}</>}
      primaryActions={<ProjectGitHeaderActions compact />}
      contextActions={projectAgentPanelClosed ? <>{projectAgentPanelHeaderControl}{terminalHeaderControl}</> : undefined}
      globalActions={projectAgentPanelClosed ? undefined : <></>}
      centerContent={projectCenterContent}
    />
  )
  const agentLeftHeader = agentSidebarVisible ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      navigationControls={agentNavigationControls}
      layoutControls={agentSidebarLayoutControls}
      leftControlsLayout="fill"
    />
  ) : undefined
  const agentCenterHeader = (
    <Header
      titleKey="header.titles.projectAgentMode"
      showWindowControls={!agentLeftHeader}
      showAppControls={!agentModeContentPanelOpen}
      showFallbackBrand={false}
      navigationControls={!agentSidebarVisible ? agentNavigationControls : undefined}
      layoutControls={!agentSidebarVisible ? agentSidebarLayoutControls : undefined}
      contextActions={<>{agentContentPanelClosed ? agentContentPanelHeaderControl : null}{terminalHeaderControl}</>}
    />
  )
  const agentRightHeader = agentModeContentPanelOpen ? (
    <Header
      showWindowControls={false}
      showAppControls
      showFallbackBrand={false}
      contextActions={<>{agentContentPanelHeaderControl}{terminalHeaderControl}</>}
    />
  ) : undefined
  const agentRightSlotStyle = appShellCollapsedSlotStyle({
    collapsed: agentContentPane.collapsed,
    size: agentContentPane.size,
    collapsedSize: agentContentPane.pane?.collapsedSize,
  })
  const agentLeftSlotStyle = appShellHiddenSlotStyle(!agentSidebarVisible, agentSidebarPane.size)
  const toolLeftSlotStyle = appShellHiddenSlotStyle(toolSidebarHidden, toolSidebarPane.size)
  const projectRightSlotStyle = appShellCollapsedSlotStyle({
    collapsed: projectAgentPane.collapsed,
    size: projectAgentPane.size,
    collapsedSize: projectAgentPane.pane?.collapsedSize,
  })
  const settingsLeftSlotStyle = appShellHiddenSlotStyle(settingsSidebarHidden, settingsSidebarPane.size)

  const shellSurface: AppRouteSurface = routeSurface
  const shell = (
    <>
      <GlobalNavigationEffects />
      {agentChrome ? (
        <WorkspaceShell
          surface={shellSurface}
          chrome="immersive"
          sidebar={(
            <React.Suspense fallback={null}>
              <ProjectAgentModeSidebar
                width={agentSidebarPane.size}
                onWidthChange={agentSidebarPane.setSize}
              />
            </React.Suspense>
          )}
          leftHeader={agentLeftHeader}
          centerHeader={agentCenterHeader}
          rightHeader={agentRightHeader}
          leftSlotStyle={agentLeftSlotStyle}
          sidebarCollapsed={false}
          leftPaneHidden={!agentSidebarVisible}
          rightSlotStyle={agentRightSlotStyle}
          rightPaneCollapsed={agentContentPane.collapsed}
          terminalPanel={terminalPanel}
          terminalOpen={terminalOpen}
          terminalPlacement={terminalPlacement}
          assistantPanel={(
            <React.Suspense fallback={null}>
              <ProjectAgentContentPanel
                collapsed={agentContentPane.collapsed}
                onCollapsedChange={(collapsed) => {
                  if (collapsed) agentContentPane.collapse()
                  else agentContentPane.show()
                }}
                width={agentContentPane.size}
                onWidthChange={agentContentPane.setSize}
              />
            </React.Suspense>
          )}
        >
          <AppRouteViewport scroll={routeViewportScroll}>
            <RouteErrorBoundary>
              <RouteSuspense>{children}</RouteSuspense>
            </RouteErrorBoundary>
          </AppRouteViewport>
        </WorkspaceShell>
      ) : (
        <WorkspaceShell
          surface={shellSurface}
          chrome={settingsChrome || toolChrome || projectChrome || homeChrome ? 'workspace' : undefined}
          sidebar={settingsChrome ? (
            accountSettingsActiveTab ? (
              <AccountSettingsPageSidebar
                activeTab={accountSettingsActiveTab}
                width={settingsSidebarPane.size}
                onWidthChange={settingsSidebarPane.setSize}
                onHide={hideSettingsSidebar}
                onExitSettings={() => navigate(settingsExitPath ?? routeForWorkMode(workMode, !!currentProject), { replace: true })}
              />
            ) : null
          ) : toolChrome ? (
              <Sidebar
                width={toolSidebarPane.size}
                onWidthChange={toolSidebarPane.setSize}
                onHide={hideToolSidebar}
              />
          ) : undefined}
          leftHeader={settingsChrome ? settingsLeftHeader : toolLeftHeader}
          centerHeader={settingsChrome ? settingsCenterHeader : toolChrome ? toolCenterHeader : homeChrome ? homeCenterHeader : projectCenterHeader}
          leftSlotStyle={settingsChrome ? settingsLeftSlotStyle : toolChrome ? toolLeftSlotStyle : undefined}
          terminalPanel={terminalPanel}
          terminalOpen={terminalOpen}
          terminalPlacement={terminalPlacement}
          leftPaneHidden={settingsChrome ? settingsSidebarHidden : toolChrome ? toolSidebarHidden : false}
          rightHeader={projectChrome && !projectAgentPanelClosed ? (
            <Header
              showWindowControls={false}
              showAppControls
              showFallbackBrand={false}
              contextActions={<>{projectAgentPanelHeaderControl}{terminalHeaderControl}</>}
            />
          ) : undefined}
          rightSlotStyle={projectChrome ? projectRightSlotStyle : undefined}
          rightPaneCollapsed={projectChrome ? projectAgentPane.collapsed : true}
          assistantPanel={projectChrome ? (
            <React.Suspense fallback={null}>
              <ProjectAIAssistantPanel
                userId={userId}
                project={currentProject}
                collapsed={projectAgentPane.collapsed}
                onCollapsedChange={(collapsed) => {
                  if (collapsed) projectAgentPane.collapse()
                  else projectAgentPane.show()
                }}
                width={projectAgentPane.size}
                onWidthChange={projectAgentPane.setSize}
              />
            </React.Suspense>
          ) : undefined}
        >
          <AppRouteViewport scroll={routeViewportScroll}>
            <RouteErrorBoundary>
              <RouteSuspense>{children}</RouteSuspense>
            </RouteErrorBoundary>
          </AppRouteViewport>
        </WorkspaceShell>
      )}
    </>
  )

  return requireOrg && !accountSettingsActiveTab ? <OrgGuard>{shell}</OrgGuard> : shell
}
