import type { ReactNode } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { runtimeNavItems, runtimeRoutes } from '@runtime'
import {
  AccountSettingsPageContent,
  type AccountSettingsPageTab,
} from '@/features/app-shell/components/AccountSettingsDialog'
import { ElectronMCPContextBridge } from '@/electron/ElectronMCPContextBridge'
import { Toaster } from '@/shared/ui/Toaster'
import { UiDebugInspector } from '@movscript/ui/debug'
import { BackendBootBoundary } from '@/features/app-shell/application/BackendBootBoundary'
import { ProjectRequiredDialog } from '@/features/app-shell/components/ProjectRequiredDialog'
import { ShellLayout } from '@/features/app-shell/application/AppShellLayout'
import { CanvasListShellRoute } from '@/features/app-shell/application/AppCanvasListShellRoute'
import { CanvasEditorShellRoute } from '@/features/app-shell/application/AppCanvasEditorShellRoute'
import { EditingListShellRoute, EditingProjectShellRoute } from '@/features/app-shell/application/AppEditingShellRoutes'
import { ToolShellRoute } from '@/features/app-shell/application/AppToolShellRoute'
import { AppDockShortcutBridge } from '@/features/app-shell/application/AppDockShortcutBridge'
import {
  ErrorBoundary,
  OrgAdminGuard,
  ProjectGuard,
  RouteContentShell,
  RouteSuspense,
} from '@/features/app-shell/application/AppRouteBoundaries'
import {
  normalizeProviderSettings,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { fallbackAgentProfileRoute } from '@/features/agent/application/agentProfileModel'
import { ROUTES } from '@/routes/projectRoutes'
import { isAgentConsoleTab } from '@/features/agent/application/agentConsoleRouteModel'
import {
  AgentConnectionsPage,
  AgentContentCandidatesPage,
  AgentContentPromptPage,
  AgentGenerationJobPage,
  AgentImpactPage,
  AgentPreviewTimelinePage,
  AgentProjectStatusPage,
  AgentResourceDetailPage,
  AgentResourceLibraryPage,
  AgentModeCanvasListPage,
  AgentModePage,
  AgentsPage,
  AIAgentSettingsPage,
  AppSettingsPage,
  AuthPage,
  ClientPluginsPage,
  ContentCanvasPage,
  ContentCanvasPreviewPage,
  ExternalResourcesPage,
  GlobalHomePage,
  InvitePage,
  JobsPage,
  ModelProvidersPage,
  MovScriptWorkspaceFilesPage,
  MovScriptWorkspaceReviewPage,
  OnboardingPage,
  OrgSelectPage,
  ProjectDataPage,
  ProjectOverviewPage,
  ProjectSettingsPage,
  ProjectStandardsPage,
  ProjectsPage,
  ResourcesPage,
  ScriptsPage,
  ShotLibraryPage,
} from '@/features/app-shell/application/appRouteComponents'

const AppRouter = typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter

export function AnonymousAppRouter() {
  const onboardingCompleted = useAppSettingsStore((state) => state.settings.onboardingCompleted)

  return (
    <ErrorBoundary>
      <AppRouter>
        <ElectronMCPContextBridge />
        <Toaster />
        <UiDebugInspector />
        <BackendBootBoundary />
        <RouteSuspense fullScreen>
          <Routes>
            <Route path={ROUTES.agentResources} element={<AgentResourceLibraryPage />} />
            <Route path={ROUTES.agentResourceDetail} element={<AgentResourceDetailPage />} />
            <Route path={ROUTES.agentContentPrompt} element={<AgentContentPromptPage />} />
            <Route path={ROUTES.agentContentCandidates} element={<AgentContentCandidatesPage />} />
            <Route path={ROUTES.agentGenerationJob} element={<AgentGenerationJobPage />} />
            <Route path={ROUTES.agentPreviewTimeline} element={<AgentPreviewTimelinePage />} />
            <Route path={ROUTES.agentImpact} element={<AgentImpactPage />} />
            <Route path={ROUTES.agentProjectStatus} element={<AgentProjectStatusPage />} />
            <Route path={ROUTES.codexResources} element={<AgentResourceLibraryPage />} />
            <Route path={ROUTES.invite} element={<InvitePage />} />
            <Route path={ROUTES.onboarding} element={onboardingCompleted ? <Navigate to={ROUTES.root} replace /> : <OnboardingPage />} />
            <Route path={ROUTES.appSettings} element={onboardingCompleted ? <AppSettingsPage /> : <Navigate to={ROUTES.onboarding} replace />} />
            <Route path="*" element={onboardingCompleted ? <AuthPage /> : <OnboardingPage />} />
          </Routes>
        </RouteSuspense>
      </AppRouter>
    </ErrorBoundary>
  )
}

export function AuthenticatedAppRouter() {
  return (
    <ErrorBoundary>
      <AppRouter>
        <ElectronMCPContextBridge />
        <Toaster />
        <UiDebugInspector />
        <BackendBootBoundary />
        <ProjectRequiredDialog />
        <AppDockShortcutBridge />
        <RouteSuspense fullScreen>
          <Routes>
            <Route path={ROUTES.agentResources} element={<AgentResourceLibraryPage />} />
            <Route path={ROUTES.agentResourceDetail} element={<AgentResourceDetailPage />} />
            <Route path={ROUTES.agentContentPrompt} element={<AgentContentPromptPage />} />
            <Route path={ROUTES.agentContentCandidates} element={<AgentContentCandidatesPage />} />
            <Route path={ROUTES.agentGenerationJob} element={<AgentGenerationJobPage />} />
            <Route path={ROUTES.agentPreviewTimeline} element={<AgentPreviewTimelinePage />} />
            <Route path={ROUTES.agentImpact} element={<AgentImpactPage />} />
            <Route path={ROUTES.agentProjectStatus} element={<AgentProjectStatusPage />} />
            <Route path={ROUTES.codexResources} element={<AgentResourceLibraryPage />} />
            <Route path={ROUTES.canvases} element={<CanvasListShellRoute />} />
            <Route path={ROUTES.canvasEditor} element={<CanvasEditorShellRoute />} />
            <Route path={ROUTES.editing} element={<EditingListShellRoute />} />
            <Route path={ROUTES.editingProject} element={<EditingProjectShellRoute />} />
            <Route path="/tools/*" element={<ToolShellRoute />} />
            <Route path={ROUTES.orgSelect} element={
              <ShellLayout requireOrg={false}>
                <RouteContentShell width="wide"><OrgSelectPage /></RouteContentShell>
              </ShellLayout>
            } />
            <Route path={ROUTES.invite} element={<InvitePage />} />
            <Route path="*" element={
              <ShellLayout>
                <Routes>
                  <Route path={ROUTES.root} element={<GlobalHomePage />} />
                  <Route path={ROUTES.projects} element={<ProjectsPage />} />
                  <Route path={ROUTES.projectData} element={<ProjectDataPage />} />
                  <Route path="/admin/*" element={<Navigate to={ROUTES.root} replace />} />
                  <Route path={ROUTES.appSettings} element={<AccountSettingsRoute tab="settings" />} />
                  <Route path={ROUTES.user} element={<AccountSettingsRoute tab="profile" />} />
                  <Route path={ROUTES.orgSettings} element={<AccountSettingsRoute tab="workspace" />} />
                  <Route path={ROUTES.agentConsole} element={<AccountSettingsRoute tab="console" />} />

                  <Route path={ROUTES.project.root} element={<Navigate to={ROUTES.project.home} replace />} />
                  <Route path={ROUTES.project.home} element={<ProjectGuard><ProjectOverviewPage /></ProjectGuard>} />
                  <Route path={ROUTES.project.settings} element={<ProjectGuard><ProjectSettingsPage /></ProjectGuard>} />
                  <Route path={ROUTES.project.scripts} element={<ProjectGuard><ScriptsPage /></ProjectGuard>} />
                  <Route path={ROUTES.project.agent} element={<ProjectAgentModeRoute />} />
                  <Route path={ROUTES.project.agentCanvases} element={<ProjectGuard><AgentModeRoute><AgentModeCanvasListPage /></AgentModeRoute></ProjectGuard>} />
                  <Route path={ROUTES.project.standards} element={<ProjectGuard><ProjectStandardsPage /></ProjectGuard>} />
                  <Route path={ROUTES.project.content} element={<ProjectGuard><ContentCanvasPreviewPage /></ProjectGuard>} />
                  <Route path={ROUTES.project.contentCanvas} element={<ProjectGuard><ContentCanvasPage /></ProjectGuard>} />
                  <Route path={ROUTES.project.contentPreview} element={<ProjectGuard><ContentCanvasPreviewPage /></ProjectGuard>} />
                  <Route path={ROUTES.project.contentLegacy} element={<Navigate to={ROUTES.project.contentCanvas} replace />} />
                  <Route path={ROUTES.project.contentLegacyNext} element={<Navigate to={ROUTES.project.contentCanvas} replace />} />
                  <Route path={ROUTES.studioOverview} element={<ProjectGuard><ProjectOverviewPage /></ProjectGuard>} />
                  <Route path={ROUTES.studioSettings} element={<ProjectGuard><ProjectSettingsPage /></ProjectGuard>} />
                  <Route path={ROUTES.studioScripts} element={<ProjectGuard><ScriptsPage /></ProjectGuard>} />
                  <Route path={ROUTES.studioStandards} element={<ProjectGuard><ProjectStandardsPage /></ProjectGuard>} />
                  <Route path={ROUTES.studioContent} element={<ProjectGuard><ContentCanvasPreviewPage /></ProjectGuard>} />
                  <Route path={ROUTES.studioContentCanvas} element={<ProjectGuard><ContentCanvasPage /></ProjectGuard>} />
                  <Route path={ROUTES.studioContentPreview} element={<ProjectGuard><ContentCanvasPreviewPage /></ProjectGuard>} />

                  {runtimeRoutes.map((route) => {
                    const manageNavItem = runtimeNavItems.find((item) => item.to === route.path && (item.section ?? 'manage') === 'manage')
                    let element = manageNavItem
                      ? <Navigate to={`${ROUTES.appSettings}?tab=${encodeURIComponent(`runtime:${route.path}`)}`} replace />
                      : route.element
                    if (route.requireProject) element = <ProjectGuard>{element}</ProjectGuard>
                    if (route.requireOrgAdmin) element = <OrgAdminGuard>{element}</OrgAdminGuard>
                    if (route.padded ?? true) element = <RouteContentShell>{element}</RouteContentShell>
                    return <Route key={route.path} path={route.path} element={element} />
                  })}

                  <Route path={ROUTES.resources} element={<ResourcesPage />} />
                  <Route path={ROUTES.externalResources} element={<ExternalResourcesPage />} />
                  <Route path={ROUTES.shotLibrary} element={<ShotLibraryPage />} />
                  <Route path={ROUTES.jobs} element={<JobsPage />} />
                  <Route path={ROUTES.plugins} element={<ClientPluginsPage />} />
                  <Route path={ROUTES.agentConnections} element={<AgentConnectionsPage />} />
                  <Route path={ROUTES.modelProviders} element={<ModelProvidersPage />} />
                  <Route path={ROUTES.agents} element={<AgentsRedirect />} />
                  <Route path={ROUTES.agentProvider} element={<AgentsPage />} />
                  <Route path={ROUTES.workspaceConfig} element={<MovScriptWorkspaceFilesPage />} />
                  <Route path={ROUTES.workspaceReview} element={<MovScriptWorkspaceReviewPage />} />
                  <Route path={ROUTES.agentSettings} element={<AIAgentSettingsPage />} />
                </Routes>
              </ShellLayout>
            } />
          </Routes>
        </RouteSuspense>
      </AppRouter>
    </ErrorBoundary>
  )
}

function AgentsRedirect() {
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const settings = normalizeProviderSettings(savedSettings)
  return <Navigate to={fallbackAgentProfileRoute(settings)} replace />
}

function ProjectAgentModeRoute() {
  return <AgentModePage />
}

function AgentModeRoute({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function AccountSettingsRoute({ tab = 'settings' }: { tab?: AccountSettingsPageTab }) {
  const { search } = useLocation()
  const runtimeTab = new URLSearchParams(search).get('tab')
  const activeTab: AccountSettingsPageTab = isAgentConsoleTab(runtimeTab)
    ? runtimeTab
    : runtimeTab === 'mode'
    ? 'mode'
    : runtimeTab?.startsWith('runtime:')
    ? (`runtime:${runtimeTab.slice('runtime:'.length)}` as AccountSettingsPageTab)
    : tab
  return <AccountSettingsPageContent activeTab={activeTab} />
}
