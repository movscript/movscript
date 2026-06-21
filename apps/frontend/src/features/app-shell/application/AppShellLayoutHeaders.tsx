import React from 'react'
import { Header } from '@/features/app-shell/components/Header'
import { ProjectGitHeaderActions } from '@/features/app-shell/components/ProjectGitHeaderActions'
import { ProjectEntryDeckHeader } from '@/features/project/components/ProjectEntryDeckHeader'
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
  accountSettingsRouteHeaderTitle,
  projectRouteHeaderTitle,
  toolRouteHeaderTitle,
} from '@/features/app-shell/application/appShellRouteHeaders'
import type { RouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import type { AccountSettingsPageTab } from '@/features/app-shell/components/AccountSettingsDialog'
import type { RouteLayoutSpec } from '@/routes/routeLayoutRegistry'
import { ROUTES } from '@/routes/projectRoutes'
import type { Project } from '@/types'

interface AppShellLayoutHeadersInput {
  pathname: string
  routeLayout: Pick<RouteLayoutSpec, 'projectEntryId'>
  currentProject: Project | null
  accountSettingsActiveTab: AccountSettingsPageTab | undefined
  agentSettingsActive: boolean
  settingsActive: boolean
  settingsExitPath: string | undefined
  agentChrome: boolean
  projectChrome: boolean
  toolChrome: boolean
  settingsChrome: boolean
  toolSidebarHidden: boolean
  settingsSidebarHidden: boolean
  agentSidebarVisible: boolean
  terminalOpen: boolean
  agentModeContentPanelOpen: boolean
  agentContentPanelClosed: boolean
  projectAgentPanelClosed: boolean
  toolSidebarPane: RouteLayoutPaneController
  settingsSidebarPane: RouteLayoutPaneController
  agentSidebarPane: RouteLayoutPaneController
  agentContentPane: RouteLayoutPaneController
  projectAgentPane: RouteLayoutPaneController
  navigateProjectHome: () => void
  onExitSettings: () => void
  onToggleTerminal: () => void
}

interface AppShellLayoutHeaders {
  toolLeftHeader: React.ReactNode | undefined
  toolCenterHeader: React.ReactNode
  settingsLeftHeader: React.ReactNode | undefined
  settingsCenterHeader: React.ReactNode
  homeCenterHeader: React.ReactNode
  projectCenterHeader: React.ReactNode
  projectRightHeader: React.ReactNode | undefined
  agentLeftHeader: React.ReactNode | undefined
  agentCenterHeader: React.ReactNode
  agentRightHeader: React.ReactNode | undefined
}

export function createAppShellLayoutHeaders({
  pathname,
  routeLayout,
  currentProject,
  accountSettingsActiveTab,
  agentSettingsActive,
  settingsActive,
  settingsExitPath,
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
  onExitSettings,
  onToggleTerminal,
}: AppShellLayoutHeadersInput): AppShellLayoutHeaders {
  const terminalHeaderControl = (
    <AppShellTerminalToggle open={terminalOpen} onToggle={onToggleTerminal} />
  )
  const homeHeaderControl = <AppShellHomeControl />
  const projectHomeHeaderControl = (
    <AppShellHomeControl
      onClick={navigateProjectHome}
      title="回到项目 Home"
      ariaLabel="回到项目 Home"
    />
  )
  const useProjectHomeHeaderControl = !!currentProject && (
    projectChrome
    || agentChrome
    || (settingsActive && (settingsExitPath ?? '').startsWith(ROUTES.project.root))
  )
  const navigationHomeControl = useProjectHomeHeaderControl ? projectHomeHeaderControl : homeHeaderControl
  const settingsExitControl = (
    <AppShellSettingsExitControl
      active={settingsActive}
      onExit={onExitSettings}
    />
  )
  const projectHistoryNavigationControls = <AppShellHistoryNavigationControls navClassName="project-window-controls__nav" />
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
  const toolSidebarLayoutControls = (
    <div className="tool-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppShellLeftPaneToggle hidden={toolSidebarHidden} onShow={toolSidebarPane.show} onHide={toolSidebarPane.hide} />
      <AppShellHistoryNavigationControls navClassName="tool-sidebar-window-controls__nav" />
    </div>
  )
  const settingsSidebarLayoutControls = (
    <div className="tool-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppShellLeftPaneToggle hidden={settingsSidebarHidden} onShow={settingsSidebarPane.show} onHide={settingsSidebarPane.hide} />
    </div>
  )
  const agentSidebarLayoutControls = (
    <div className="agent-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppShellLeftPaneToggle hidden={!agentSidebarVisible} onShow={agentSidebarPane.show} onHide={agentSidebarPane.hide} />
      {agentSettingsActive ? null : <AppShellHistoryNavigationControls navClassName="agent-sidebar-window-controls__nav" />}
    </div>
  )
  const agentNavigationControls = <>{navigationHomeControl}{settingsExitControl}</>
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

  const toolLeftHeader = toolChrome && !toolSidebarHidden ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      navigationControls={<>{navigationHomeControl}{settingsExitControl}</>}
      layoutControls={accountSettingsActiveTab ? settingsSidebarLayoutControls : toolSidebarLayoutControls}
      leftControlsLayout="fill"
    />
  ) : undefined
  const toolCenterNavigationControls = toolChrome && toolSidebarHidden ? <>{navigationHomeControl}{settingsExitControl}</> : undefined
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
      navigationControls={<>{navigationHomeControl}{settingsExitControl}</>}
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
      navigationControls={settingsSidebarHidden ? <>{navigationHomeControl}{settingsExitControl}</> : undefined}
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
      navigationControls={<>{navigationHomeControl}{projectHistoryNavigationControls}</>}
      primaryActions={<ProjectGitHeaderActions compact />}
      contextActions={projectAgentPanelClosed ? <>{projectAgentPanelHeaderControl}{terminalHeaderControl}</> : undefined}
      globalActions={projectAgentPanelClosed ? undefined : <></>}
      centerContent={projectCenterContent}
    />
  )
  const projectRightHeader = projectChrome && !projectAgentPanelClosed ? (
    <Header
      showWindowControls={false}
      showAppControls
      showFallbackBrand={false}
      contextActions={<>{projectAgentPanelHeaderControl}{terminalHeaderControl}</>}
    />
  ) : undefined
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

  return {
    toolLeftHeader,
    toolCenterHeader,
    settingsLeftHeader,
    settingsCenterHeader,
    homeCenterHeader,
    projectCenterHeader,
    projectRightHeader,
    agentLeftHeader,
    agentCenterHeader,
    agentRightHeader,
  }
}
