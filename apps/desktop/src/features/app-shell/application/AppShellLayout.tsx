import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { WorkspaceShell } from '@movscript/ui/layout'
import { Sidebar, clampSidebarWidth } from '@/features/app-shell/components/Sidebar'
import {
  AccountSettingsPageSidebar,
} from '@/features/app-shell/components/AccountSettingsDialog'
import {
  ProjectAIAssistantPanel,
  ProjectAgentContentPanel,
  ProjectAgentModeSidebar,
} from '@/features/app-shell/application/appRouteComponents'
import { RouteErrorBoundary, RouteSuspense, OrgGuard } from '@/features/app-shell/application/AppRouteBoundaries'
import {
  accountSettingsTabForLocation,
  useRememberSettingsReturnPath,
} from '@/features/app-shell/application/appShellRouteHeaders'
import { GlobalNavigationEffects } from '@/features/app-shell/application/GlobalNavigationEffects'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import {
  appShellCollapsedSlotStyle,
  appShellHiddenSlotStyle,
} from '@/features/app-shell/application/AppShellLayoutSlots'
import {
  AppShellTerminalDock,
  clampTerminalDockHeight,
} from '@/features/app-shell/application/AppShellTerminalDock'
import { agentWorkspaceContextFromProject } from '@/features/agent/presentation/agentComposerWorkspaceModel'
import {
  clampAgentModeContentPanelWidth,
  clampAgentModeSidebarWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import { useAgentAvailabilityGuard } from '@/features/agent/application/useAgentAvailabilityGuard'
import { getAppRouteLayoutSpec, type AppRouteSurface } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_PROJECT_AGENT_PANE_ID,
  APP_SHELL_SETTINGS_SIDEBAR_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
  appRouteViewportScrollForMode,
} from '@/routes/routeLayoutRegistry'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import { createAppShellLayoutHeaders } from '@/features/app-shell/application/AppShellLayoutHeaders'
import { AppRouteViewport } from '@movscript/ui/layout'

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
  const agentAvailability = useAgentAvailabilityGuard()
  const { runOrPrompt: runOrPromptAgentAvailability } = agentAvailability
  const agentModeContentPanelOpen = !agentContentPane.collapsed && !agentContentPane.hidden
  const projectAgentPanelClosed = projectAgentPane.collapsed || projectAgentPane.hidden
  const agentSidebarVisible = agentChrome && !agentSidebarPane.hidden
  const accountSettingsActiveTab = accountSettingsTabForLocation(pathname, search)
  const agentSettingsActive = pathname === ROUTES.agentSettings
  const terminalWorkspaceContext = React.useMemo(() => {
    if (currentProject?.ID) {
      return {
        ...agentWorkspaceContextFromProject(currentProject),
        userId: userId || undefined,
      }
    }
    return {
      scope: 'global' as const,
      userId: userId || undefined,
    }
  }, [currentProject, userId])
  const terminalPlacement = agentChrome ? 'center-right' : 'center'
  const navigateProjectHome = React.useCallback(() => {
    navigate(ROUTES.project.home, { replace: true })
  }, [navigate])
  const agentContentPanelClosed = agentContentPane.collapsed || agentContentPane.hidden
  const terminalPanel = (
    <AppShellTerminalDock
      open={terminalOpen}
      paneSize={terminalPane.size}
      placement={terminalPlacement}
      workspaceContext={terminalWorkspaceContext}
      onPaneSizeChange={terminalPane.setSize}
      onOpenChange={(open) => {
        if (open) terminalPane.show()
        else terminalPane.hide()
      }}
    />
  )
  const hideToolSidebar = React.useCallback(() => {
    toolSidebarPane.hide()
  }, [toolSidebarPane])
  const hideSettingsSidebar = React.useCallback(() => {
    settingsSidebarPane.hide()
  }, [settingsSidebarPane])
  const showProjectAgentPane = React.useCallback(() => {
    runOrPromptAgentAvailability(projectAgentPane.show)
  }, [projectAgentPane.show, runOrPromptAgentAvailability])
  const appShellHeaders = createAppShellLayoutHeaders({
    pathname,
    search,
    routeLayout,
    currentProject,
    accountSettingsActiveTab,
    agentSettingsActive,
    agentChrome,
    projectChrome,
    toolChrome,
    settingsChrome,
    toolSidebarHidden,
    settingsSidebarHidden,
    agentSidebarVisible,
    terminalOpen,
    agentModeContentPanelOpen,
    agentContentPanelClosed,
    projectAgentPanelClosed,
    toolSidebarPane,
    settingsSidebarPane,
    agentSidebarPane,
    agentContentPane,
    projectAgentPane,
    navigateProjectHome,
    onShowProjectAgentPane: showProjectAgentPane,
    onToggleTerminal: terminalOpen ? terminalPane.hide : terminalPane.show,
  })
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
          leftHeader={appShellHeaders.agentLeftHeader}
          centerHeader={appShellHeaders.agentCenterHeader}
          rightHeader={appShellHeaders.agentRightHeader}
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
              />
            ) : null
          ) : toolChrome ? (
              <Sidebar
                width={toolSidebarPane.size}
                onWidthChange={toolSidebarPane.setSize}
                onHide={hideToolSidebar}
              />
          ) : undefined}
          leftHeader={settingsChrome ? appShellHeaders.settingsLeftHeader : appShellHeaders.toolLeftHeader}
          centerHeader={settingsChrome ? appShellHeaders.settingsCenterHeader : toolChrome ? appShellHeaders.toolCenterHeader : homeChrome ? appShellHeaders.homeCenterHeader : appShellHeaders.projectCenterHeader}
          leftSlotStyle={settingsChrome ? settingsLeftSlotStyle : toolChrome ? toolLeftSlotStyle : undefined}
          terminalPanel={terminalPanel}
          terminalOpen={terminalOpen}
          terminalPlacement={terminalPlacement}
          leftPaneHidden={settingsChrome ? settingsSidebarHidden : toolChrome ? toolSidebarHidden : false}
          rightHeader={appShellHeaders.projectRightHeader}
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
      {agentAvailability.dialog}
    </>
  )

  return requireOrg && !accountSettingsActiveTab ? <OrgGuard>{shell}</OrgGuard> : shell
}
