import React, { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  Sidebar,
  clampSidebarWidth,
} from './features/app-shell/components/Sidebar'
import { Header } from './features/app-shell/components/Header'
import {
  AccountSettingsPageContent,
  AccountSettingsPageSidebar,
  type AccountSettingsPageTab,
} from './features/app-shell/components/AccountSettingsDialog'
import { WorkspaceShell } from '@movscript/ui'
import { Toaster } from './shared/ui/Toaster'
import { useProjectStore } from './shared/infrastructure/session/projectStore'
import { useUserStore } from './shared/infrastructure/session/userStore'
import { useAppSettingsStore } from './shared/infrastructure/appSettingsStore'
import { canManageLocalBackend, isBackendBootStatus, probeLocalBackendStatus, type BackendBootStatus } from '@/shared/infrastructure/backendBoot'
import {
  clampAgentModeContentPanelWidth,
  clampAgentModeSidebarWidth,
} from './features/agent/presentation/agentModePanelSizing'
import i18n from './i18n'
import { ElectronMCPContextBridge } from './electron/ElectronMCPContextBridge'
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, BriefcaseBusiness, Cable, CircleUserRound, Clapperboard, HardDrive, Image as ImageIcon, Loader2, Lightbulb, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Plug, Plus, RefreshCw, Save, Settings, Terminal, Video, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { runtimeNavItems, runtimeRoutes } from '@runtime'
import { getProjectWorkbenchDefinition } from './features/project-workbenches/domain/projectWorkbenchRegistry'
import { ROUTES } from './routes/projectRoutes'
import {
  WORKSPACE_CHANGE_HANDOFF_EVENT,
  workspaceChangeHandoffPathFromEventDetail,
} from './shared/contracts/workspaceChangeHandoff'
import { canvasBackPath, getAppRouteLayoutSpec, routeForWorkMode, type AppRouteSurface } from './routes/appRouteModel'
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_ASSISTANT_DOCK_PANE_ID,
  APP_SHELL_DETAIL_SIDEBAR_PANE_ID,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  appRouteViewportScrollForMode,
} from './routes/routeLayoutRegistry'
import { useRouteLayoutPaneController } from './features/app-shell/application/useRouteLayoutPaneController'
import { useCanvasHeaderStore } from './features/canvas/presentation/canvasHeaderStore'
import { useInlineTitleEditor } from './features/canvas/presentation/useInlineTitleEditor'
import { useAgentPanelUiStore } from './features/agent/presentation/agentPanelUiStore'
import { clampDetailAgentPanelWidth } from './features/agent/presentation/agentDetailAssistantPaneSizing'
import { useHasOpenAgentConversations } from './features/agent/presentation/useHasOpenAgentConversations'
import { providerRoute, providerRouteForKey } from './features/agent/application/providerRoutes'
import {
  enabledProviders,
  normalizeProviderSettings,
  usesAppServerProtocol,
  useProviderConfigStore,
} from './shared/infrastructure/providerConfigStore'
import { AppBackendBootActionButton, AppBackendBootOverlay, AppContentLayout, AppErrorFallback, AppRouteViewport, AppWindowIconButton, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label, Textarea, UiDebugInspector } from '@movscript/ui'
import { useAppShellDialogStore } from './features/app-shell/application/appShellDialogStore'
import { api } from './shared/infrastructure/api'
import { projectListQueryKey } from './features/project/application/projectQueries'
import { initializeProjectGitWorkspace } from './features/project/application/projectGitWorkspace'
import type { Project } from './types'

const AIAgentPanel = React.lazy(() => import('./features/agent/components/AIAgentPanel').then((module) => ({ default: module.AIAgentPanel })))
const ProjectAgentContentPanel = React.lazy(() => import('./features/agent/components/ProjectAgentModePage').then((module) => ({ default: module.ProjectAgentContentPanel })))
const ProjectAgentModeSidebar = React.lazy(() => import('./features/agent/components/ProjectAgentModePage').then((module) => ({ default: module.ProjectAgentModeSidebar })))
const AgentTerminalPanel = React.lazy(() => import('./features/agent/components/AgentTerminalPanel').then((module) => ({ default: module.AgentTerminalPanel })))
const SETTINGS_RETURN_PATH_STORAGE_KEY = 'movscript-settings-return-path'

const AuthPage = React.lazy(() => import('./pages/AuthPage'))
const OnboardingPage = React.lazy(() => import('./pages/onboarding/OnboardingPage'))
const AppSettingsPage = React.lazy(() => import('./pages/app-settings/AppSettingsPage'))
const CanvasListPage = React.lazy(() => import('./pages/canvas/CanvasListPage'))
const CanvasEditorPage = React.lazy(() => import('./pages/canvas/CanvasEditorPage'))
const RefImageGenPage = React.lazy(() => import('./pages/tools/RefImageGenPage'))
const RefVideoGenPage = React.lazy(() => import('./pages/tools/RefVideoGenPage'))
const MotionImitationPage = React.lazy(() => import('./pages/tools/MotionImitationPage'))
const StyleTransferPage = React.lazy(() => import('./pages/tools/StyleTransferPage'))
const MultiAnglePage = React.lazy(() => import('./pages/tools/MultiAnglePage'))
const ContentSourceWorkspacePage = React.lazy(() => import('./features/content-workbench/components/ContentSourceWorkspacePage'))
const OrgSelectPage = React.lazy(() => import('./pages/org/OrgSelectPage'))
const InvitePage = React.lazy(() => import('./pages/auth/InvitePage'))
const ResourcesPage = React.lazy(() => import('./pages/resources/ResourcesPage'))
const ExternalResourcesPage = React.lazy(() => import('./pages/resources/ExternalResourcesPage'))
const ShotLibraryPage = React.lazy(() => import('./pages/shot-library/ShotLibraryPage'))
const JobsPage = React.lazy(() => import('./pages/jobs/JobsPage'))
const PluginToolPage = React.lazy(() => import('./pages/plugins/PluginToolPage'))
const GlobalHomePage = React.lazy(() => import('./pages/home/GlobalHomePage'))
const ProjectStandardsPage = React.lazy(() => import('./pages/project/standards/ProjectStandardsPage'))
const AgentModePage = React.lazy(() => import('./pages/agent-mode/AgentModePage'))
const AgentModeCanvasListPage = React.lazy(() => import('./pages/agent-mode/AgentModeCanvasListPage'))
const ScriptsPage = React.lazy(() => import('./pages/scripts/ScriptsPage'))
const AgentConnectionsPage = React.lazy(() => import('./pages/agent/AgentConnectionsPage'))
const MovScriptWorkspaceFilesPage = React.lazy(() => import('./pages/agent/MovScriptWorkspaceFilesPage'))
const MovScriptWorkspaceReviewPage = React.lazy(() => import('./pages/agent/MovScriptWorkspaceReviewPage'))
const ModelProvidersPage = React.lazy(() => import('./pages/agent/ModelProvidersPage'))
const AgentsPage = React.lazy(() => import('./pages/agent/AgentsPage'))
const AIAgentSettingsPage = React.lazy(() => import('./pages/agent/AIAgentSettingsPage'))
const ClientPluginsPage = React.lazy(() => import('./pages/plugins/ClientPluginsPage'))
function AgentsRedirect() {
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const settings = normalizeProviderSettings(savedSettings)
  const enabledProviderList = enabledProviders(settings)
  const defaultProvider = settings.providers.find((provider) => provider.id === settings.defaultProviderId)
  const appServerProvider = usesAppServerProtocol(defaultProvider)
    ? defaultProvider
    : enabledProviderList.find(usesAppServerProtocol)
  return <Navigate to={appServerProvider ? providerRoute(appServerProvider) : providerRouteForKey('mova')} replace />
}

// ── Error boundary ───────────────────────────────────────────────────────────

function reportContentWorkbenchRouteMismatch() {
  const route = getProjectWorkbenchDefinition('content_orchestration').route
  if (route === ROUTES.project.sourceWorkspace) return
  console.warn('content_orchestration workbench route mismatch', {
    registryRoute: route,
    routeConstant: ROUTES.project.sourceWorkspace,
  })
}

interface EBState { error: Error | null }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { error: null }

  static getDerivedStateFromError(error: Error): EBState {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <AppErrorFallback
          icon={<AlertTriangle size={20} />}
          title={i18n.t('errorBoundary.title')}
          message={error.message}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function BackendBootOverlay() {
  const { pathname } = useLocation()
  const settings = useAppSettingsStore((s) => s.settings)
  const [status, setStatus] = React.useState<BackendBootStatus | null>(null)
  const [retrying, setRetrying] = React.useState(false)

  useEffect(() => {
    let disposed = false
    if (!canManageLocalBackend()) {
      setStatus({ state: 'starting', baseURL: settings.apiBaseURL })
      void probeLocalBackendStatus(settings.apiBaseURL).then((next) => {
        if (!disposed) setStatus(next)
      })
      return () => {
        disposed = true
      }
    }

    const off = window.api?.onBackendStatus?.((next) => {
      if (isBackendBootStatus(next)) setStatus(next)
    })
    void window.api?.getBackendStatus?.().then((next) => {
      if (!disposed && isBackendBootStatus(next)) setStatus(next)
    }).catch(() => {})
    return () => {
      disposed = true
      off?.()
    }
  }, [settings.apiBaseURL])

  const isRecoveryRoute = pathname === ROUTES.appSettings || pathname === '/onboarding'

  if (settings.launchMode !== 'local' || isRecoveryRoute) return null
  if (status?.state === 'ready') return null

  const displayStatus: BackendBootStatus = status ?? {
    state: 'starting',
    baseURL: settings.apiBaseURL,
  }
  const isError = displayStatus.state === 'error'
  async function retryLocalBackend() {
    setRetrying(true)
    setStatus({ state: 'starting', baseURL: settings.apiBaseURL })
    try {
      if (!canManageLocalBackend()) {
        setStatus(await probeLocalBackendStatus(settings.apiBaseURL))
        return
      }
      await window.api?.setAppSettings?.(settings)
      const next = await window.api?.getBackendStatus?.()
      if (isBackendBootStatus(next)) setStatus(next)
    } catch (error) {
      setStatus({
        state: 'error',
        baseURL: settings.apiBaseURL,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <AppBackendBootOverlay
      tone={isError ? 'danger' : 'info'}
      icon={isError ? <AlertTriangle size={20} /> : <Loader2 size={20} className="animate-spin" />}
      title={isError ? i18n.t('backendBoot.errorTitle') : i18n.t('backendBoot.startingTitle')}
      description={isError ? (displayStatus.message || i18n.t('backendBoot.errorDescription')) : i18n.t('backendBoot.startingDescription')}
      baseURL={displayStatus.baseURL}
      actions={isError ? (
        <>
            <AppBackendBootActionButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void retryLocalBackend()}
              disabled={retrying}
              loading={retrying}
            >
              {retrying ? i18n.t('backendBoot.retrying') : i18n.t('backendBoot.retry')}
            </AppBackendBootActionButton>
            <AppBackendBootActionButton asChild variant="outline" size="sm">
              <Link to={ROUTES.appSettings}>{i18n.t('backendBoot.openSettings')}</Link>
            </AppBackendBootActionButton>
        </>
      ) : null}
    />
  )
}

function LoadingScreen({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={fullScreen ? 'fixed inset-0 flex items-center justify-center bg-background type-body text-muted-foreground' : 'flex h-full items-center justify-center type-body text-muted-foreground'}>
      <Loader2 size={16} className="mr-2 animate-spin" />
      {i18n.t('common.loading')}
    </div>
  )
}

function RouteSuspense({ children, fullScreen = false }: { children: React.ReactNode; fullScreen?: boolean }) {
  return (
    <React.Suspense fallback={<LoadingScreen fullScreen={fullScreen} />}>
      {children}
    </React.Suspense>
  )
}

function scheduleIdleTask(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  const idleCallback = window.requestIdleCallback
  if (idleCallback) {
    const id = idleCallback(callback, { timeout: 2000 })
    return () => window.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(callback, 250)
  return () => window.clearTimeout(id)
}

function ProjectGuard({ children }: { children: React.ReactNode }) {
  const current = useProjectStore((s) => s.current)
  const hydrated = useProjectStore((s) => s.hydrated)
  if (!hydrated) return <LoadingScreen />
  if (!current) return <Navigate to={ROUTES.root} replace />
  return <>{children}</>
}

function OrgAdminGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useUserStore((s) => s.hydrated)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const memberships = useUserStore((s) => s.orgMemberships)
  if (!hydrated) return <LoadingScreen fullScreen />
  const membership = memberships.find((m) => m.org_id === currentOrgID)
  if (!membership || membership.is_personal || !['owner', 'admin'].includes(membership.role)) {
    return <Navigate to={ROUTES.projects} replace />
  }
  return <>{children}</>
}

function OrgGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useUserStore((s) => s.hydrated)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const memberships = useUserStore((s) => s.orgMemberships)
  if (!hydrated) return <LoadingScreen fullScreen />
  const currentMembership = memberships.find((m) => m.org_id === currentOrgID)
  if (!currentMembership) return <Navigate to={ROUTES.orgSelect} replace />
  return <>{children}</>
}

function RouteContentShell({ children, width = 'xwide' }: { children: React.ReactNode; width?: 'narrow' | 'normal' | 'wide' | 'xwide' | 'full' }) {
  return <AppContentLayout variant="contained" width={width}>{children}</AppContentLayout>
}

function CanvasEditorShellRoute() {
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)

  return (
    <OrgGuard>
      <WorkspaceShell
        surface="canvas"
        header={<Header leftControls={<CanvasHeaderLeft />} appControls={<CanvasHeaderActions />} centerContent={<CanvasHeaderTitle />} />}
      >
        <AppRouteViewport scroll={appRouteViewportScrollForMode(routeLayout.scrollMode)}>
          <RouteErrorBoundary>
            <RouteSuspense>
              <CanvasEditorPage embeddedInShell />
            </RouteSuspense>
          </RouteErrorBoundary>
        </AppRouteViewport>
      </WorkspaceShell>
    </OrgGuard>
  )
}

function ProjectAgentModeRoute() {
  return <AgentModePage />
}

function AgentModeRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function AccountSettingsRoute({ tab = 'settings' }: { tab?: AccountSettingsPageTab }) {
  const { search } = useLocation()
  const runtimeTab = new URLSearchParams(search).get('tab')
  const activeTab: AccountSettingsPageTab = runtimeTab?.startsWith('console')
    ? runtimeTab as AccountSettingsPageTab
    : runtimeTab?.startsWith('runtime:')
    ? (`runtime:${runtimeTab.slice('runtime:'.length)}` as AccountSettingsPageTab)
    : tab
  return <AccountSettingsPageContent activeTab={activeTab} />
}

function ProjectRequiredDialog() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const projectDialogOpen = useAppShellDialogStore((s) => s.projectDialogOpen)
  const closeProjectDialog = useAppShellDialogStore((s) => s.closeProjectDialog)
  const [projectName, setProjectName] = React.useState('')
  const [projectDescription, setProjectDescription] = React.useState('')
  const open = projectDialogOpen
  const createProject = useMutation({
    mutationFn: (input: { name: string; description: string }) => api.post('/projects', input).then((response) => response.data as Project),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectListQueryKey(currentOrgID) })
      void initializeProjectGitWorkspace(project, currentOrgID)
      selectProject(project)
      setProjectName('')
      setProjectDescription('')
    },
  })

  function selectProject(project: Project) {
    setCurrent(project)
    closeProjectDialog()
    navigate(routeForWorkMode(workMode, true))
  }

  function submitProject() {
    const name = projectName.trim()
    if (!name || createProject.isPending) return
    createProject.mutate({ name, description: projectDescription.trim() })
  }

  if (!open) return null

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        closeProjectDialog()
      }}
    >
      <DialogContent
        closeLabel={i18n.t('common.close')}
        className="w-[560px] max-w-[92vw]"
      >
        <DialogHeader>
          <DialogTitle>{i18n.t('pages.projects.newProject')}</DialogTitle>
          <DialogDescription>
            {i18n.t('pages.projects.emptyHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 type-label font-medium text-foreground">
              <Plus size={14} />
              {i18n.t('pages.projects.newProject')}
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="required-project-name">{i18n.t('pages.projects.nameRequired')}</Label>
                <Input
                  id="required-project-name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitProject()
                  }}
                  placeholder={i18n.t('pages.projects.namePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="required-project-description">{i18n.t('pages.projects.descriptionOptional')}</Label>
                <Textarea
                  id="required-project-description"
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  rows={3}
                  placeholder={i18n.t('pages.projects.descriptionPlaceholder')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeProjectDialog}>{i18n.t('common.cancel')}</Button>
                <Button type="button" onClick={submitProject} disabled={!projectName.trim() || createProject.isPending}>
                  <Plus size={14} />
                  {i18n.t('pages.projects.createProject')}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CanvasHeaderLeft() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const canvasType = useCanvasHeaderStore((s) => s.canvasType)
  const nodeCount = useCanvasHeaderStore((s) => s.nodeCount)
  const runningCount = useCanvasHeaderStore((s) => s.runningCount)
  const activeRunLabel = useCanvasHeaderStore((s) => s.activeRunLabel)
  const libraryCollapsed = useCanvasHeaderStore((s) => s.libraryCollapsed)
  const onToggleLibrary = useCanvasHeaderStore((s) => s.onToggleLibrary)
  const canvasTypeLabel = i18n.t(`canvas.editor.canvasType.${canvasType}`)
  const nodeCountLabel = i18n.t('canvas.editor.nodesCount', { count: nodeCount })
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(canvasBackPath(search))}
        title={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
        aria-label={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
      >
        <ArrowLeft size={12} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={onToggleLibrary}
        disabled={!onToggleLibrary}
        title={libraryCollapsed
          ? i18n.t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
          : i18n.t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
        aria-label={libraryCollapsed
          ? i18n.t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
          : i18n.t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
      >
        {libraryCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </AppWindowIconButton>
      <span
        className="app-window-icon-button inline-flex items-center justify-center"
        title={canvasTypeLabel}
        aria-label={canvasTypeLabel}
      >
        {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
      </span>
      <span
        className="app-window-icon-button hidden items-center justify-center sm:inline-flex"
        title={nodeCountLabel}
        aria-label={nodeCountLabel}
      >
        <Workflow size={12} />
      </span>
      {runningCount > 0 && (
        <span
          className="app-window-icon-button inline-flex items-center justify-center"
          title={i18n.t('canvas.editor.runningCount', { count: runningCount })}
          aria-label={i18n.t('canvas.editor.runningCount', { count: runningCount })}
        >
          <Loader2 size={12} className="animate-spin" />
        </span>
      )}
      {canvasType === 'workflow' && activeRunLabel && (
        <span
          className="app-window-icon-button hidden items-center justify-center 2xl:inline-flex"
          title={activeRunLabel}
          aria-label={activeRunLabel}
        >
          <Zap size={12} />
        </span>
      )}
    </div>
  )
}

function CanvasHeaderTitle() {
  const canvasName = useCanvasHeaderStore((s) => s.canvasName)
  const onNameChange = useCanvasHeaderStore((s) => s.onNameChange)
  const titleEditor = useInlineTitleEditor({
    value: canvasName,
    onCommit: (name) => onNameChange?.(name),
  })
  const displayName = canvasName.trim() || i18n.t('canvas.editor.untitled')
  if (titleEditor.editing) {
    return (
      <Input
        ref={titleEditor.inputRef}
        className="app-window-no-drag absolute left-1/2 top-1/2 h-7 w-[min(360px,38vw)] -translate-x-1/2 -translate-y-1/2 border-none bg-transparent px-2 text-center type-label font-semibold text-foreground outline-none"
        value={canvasName}
        onChange={(event) => {
          titleEditor.setWorkspace(event.target.value)
          onNameChange?.(event.target.value)
        }}
        onBlur={titleEditor.commitEditing}
        onKeyDown={titleEditor.handleInputKeyDown}
        placeholder={i18n.t('canvas.editor.untitled')}
        aria-label={i18n.t('canvas.editor.untitled')}
      />
    )
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="app-window-no-drag absolute left-1/2 top-1/2 h-7 w-[min(360px,38vw)] -translate-x-1/2 -translate-y-1/2 truncate rounded-sm border-none bg-transparent px-2 text-center type-label font-semibold text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
      onDoubleClick={titleEditor.startEditing}
      onKeyDown={titleEditor.handleDisplayKeyDown}
      title={i18n.t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
      aria-label={i18n.t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
    >
      {displayName}
    </Button>
  )
}

function CanvasHeaderActions() {
  const navigate = useNavigate()
  const onRun = useCanvasHeaderStore((s) => s.onRun)
  const onSave = useCanvasHeaderStore((s) => s.onSave)
  const saving = useCanvasHeaderStore((s) => s.saving)
  const startingRun = useCanvasHeaderStore((s) => s.startingRun)
  const workflowPanelCollapsed = useCanvasHeaderStore((s) => s.workflowPanelCollapsed)
  const onToggleWorkflowPanel = useCanvasHeaderStore((s) => s.onToggleWorkflowPanel)
  const runLabel = startingRun ? i18n.t('canvas.editor.starting') : i18n.t('canvas.editor.startRun')
  const saveLabel = saving ? i18n.t('common.saving') : i18n.t('common.save')
  const workflowPanelLabel = workflowPanelCollapsed
    ? i18n.t('canvas.editor.expandWorkflowPanel', { defaultValue: '展开右侧栏' })
    : i18n.t('canvas.editor.collapseWorkflowPanel', { defaultValue: '缩略右侧栏' })
  return (
    <div className="flex shrink-0 items-center gap-1">
      <AppWindowIconButton
        type="button"
        onClick={onToggleWorkflowPanel}
        disabled={!onToggleWorkflowPanel}
        title={workflowPanelLabel}
        aria-label={workflowPanelLabel}
      >
        {workflowPanelCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={onRun}
        disabled={!onRun || startingRun}
        title={runLabel}
        aria-label={runLabel}
      >
        {startingRun ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={onSave}
        disabled={!onSave || saving}
        title={saveLabel}
        aria-label={saveLabel}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(ROUTES.resources)}
        title={i18n.t('header.titles.resources', { defaultValue: 'Resources' })}
        aria-label={i18n.t('header.titles.resources', { defaultValue: 'Resources' })}
      >
        <HardDrive size={12} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(ROUTES.jobs)}
        title={i18n.t('header.titles.jobs', { defaultValue: 'Jobs' })}
        aria-label={i18n.t('header.titles.jobs', { defaultValue: 'Jobs' })}
      >
        <BriefcaseBusiness size={12} />
      </AppWindowIconButton>
    </div>
  )
}

function AppRouteHeaderTitle({
  icon: Icon,
  title,
}: {
  icon: LucideIcon
  title: React.ReactNode
}) {
  return (
    <div className="app-window-route-title app-window-no-drag">
      <span className="app-window-route-title__icon">
        <Icon size={13} />
      </span>
      <span className="app-window-route-title__text">{title}</span>
    </div>
  )
}

function detailRouteHeaderTitle(pathname: string): React.ReactNode | undefined {
  const settingsTab = accountSettingsTabForLocation(pathname, '')
  if (settingsTab) return accountSettingsRouteHeaderTitle(settingsTab)

  const routeTitles: Array<{
    match: (value: string) => boolean
    icon: LucideIcon
    title: React.ReactNode
  }> = [
    { match: (value) => value === ROUTES.resources, icon: HardDrive, title: i18n.t('header.titles.resources') },
    { match: (value) => value === ROUTES.externalResources, icon: ImageIcon, title: i18n.t('header.titles.externalResources', { defaultValue: '外部资源' }) },
    { match: (value) => value === ROUTES.shotLibrary, icon: Clapperboard, title: i18n.t('header.titles.shotLibrary') },
    { match: (value) => value === ROUTES.jobs, icon: BriefcaseBusiness, title: i18n.t('header.titles.jobs') },
    { match: (value) => value === ROUTES.project.sourceWorkspace, icon: Clapperboard, title: i18n.t('header.titles.shotEditWorkbench') },
    { match: (value) => value === ROUTES.tools.refImageGen, icon: ImageIcon, title: i18n.t('sidebar.items.refImageGen') },
    { match: (value) => value === ROUTES.tools.refVideoGen, icon: Video, title: i18n.t('sidebar.items.refVideoGen') },
    { match: (value) => value === ROUTES.tools.motionImitation, icon: Workflow, title: i18n.t('sidebar.items.motionImitation') },
    { match: (value) => value === ROUTES.tools.styleTransfer, icon: Zap, title: i18n.t('sidebar.items.styleTransfer') },
    { match: (value) => value === ROUTES.tools.multiAngle, icon: Workflow, title: i18n.t('sidebar.items.multiAngle') },
    { match: (value) => value.startsWith('/tools/plugin/'), icon: Plug, title: i18n.t('sidebar.items.plugins') },
  ]
  const matched = routeTitles.find((route) => route.match(pathname))
  if (!matched) return undefined
  return <AppRouteHeaderTitle icon={matched.icon} title={matched.title} />
}

function accountSettingsTabForLocation(pathname: string, search: string): AccountSettingsPageTab | undefined {
  if (pathname === ROUTES.user) return 'profile'
  if (pathname === ROUTES.orgSettings) return 'workspace'
  if (pathname === ROUTES.agentConsole) return 'console'
  if (pathname !== ROUTES.appSettings) return undefined

  const runtimeTab = new URLSearchParams(search).get('tab')
  if (runtimeTab?.startsWith('console')) {
    return runtimeTab as AccountSettingsPageTab
  }
  if (runtimeTab?.startsWith('runtime:')) {
    return `runtime:${runtimeTab.slice('runtime:'.length)}` as AccountSettingsPageTab
  }
  return 'settings'
}

function isAccountSettingsShellPath(pathname: string): boolean {
  return accountSettingsTabForLocation(pathname, '') !== undefined
}

function normalizeSettingsReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('/') || value.startsWith('//')) return undefined
  const [pathname] = value.split(/[?#]/, 1)
  if (!pathname || isAccountSettingsShellPath(pathname)) return undefined
  return value
}

function rememberSettingsReturnPath(pathname: string, search: string) {
  if (typeof window === 'undefined') return
  const path = normalizeSettingsReturnPath(`${pathname}${search}`)
  if (!path) return
  try {
    window.sessionStorage.setItem(SETTINGS_RETURN_PATH_STORAGE_KEY, path)
  } catch {
    // Ignore unavailable session storage; settings exit still has a work mode fallback.
  }
}

function readSettingsReturnPath(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return normalizeSettingsReturnPath(window.sessionStorage.getItem(SETTINGS_RETURN_PATH_STORAGE_KEY))
  } catch {
    return undefined
  }
}

function useRememberSettingsReturnPath(pathname: string, search: string) {
  useEffect(() => {
    rememberSettingsReturnPath(pathname, search)
  }, [pathname, search])
}

function accountSettingsRouteHeaderTitle(tab: AccountSettingsPageTab): React.ReactNode {
  if (tab === 'profile') return <AppRouteHeaderTitle icon={CircleUserRound} title={i18n.t('user.title')} />
  if (tab === 'workspace') return <AppRouteHeaderTitle icon={BriefcaseBusiness} title={i18n.t('sidebar.items.workspace')} />
  if (tab === 'console') return <AppRouteHeaderTitle icon={Bot} title={i18n.t('sidebar.items.agentConsole')} />
  if (tab === 'console:model-providers') return <AppRouteHeaderTitle icon={Settings} title="Model Providers" />
  if (tab === 'console:agents') return <AppRouteHeaderTitle icon={Bot} title="Agents" />
  if (tab === 'console:connections') return <AppRouteHeaderTitle icon={Cable} title="Connections" />
  if (tab === 'console:plugins') return <AppRouteHeaderTitle icon={Plug} title="Plugins" />
  if (tab === 'console:workspace') return <AppRouteHeaderTitle icon={HardDrive} title="Workspace" />
  if (tab.startsWith('runtime:')) {
    const path = tab.slice('runtime:'.length)
    const runtimeItem = runtimeNavItems.find((item) => item.to === path)
    return <AppRouteHeaderTitle icon={runtimeItem?.icon ?? Settings} title={runtimeItem?.label ?? i18n.t('appSettings.title')} />
  }
  return <AppRouteHeaderTitle icon={Settings} title={i18n.t('appSettings.title')} />
}

function ShellLayout({ children, requireOrg = true }: { children: React.ReactNode; requireOrg?: boolean }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)
  const routeSurface = routeLayout.surface
  const routeViewportScroll = appRouteViewportScrollForMode(routeLayout.scrollMode)
  const agentMode = routeSurface === 'agent'
  const currentUser = useUserStore((s) => s.currentUser)
  const currentProject = useProjectStore((s) => s.current)
  const userId = currentUser ? String(currentUser.ID) : ''
  const hasOpenConversations = useHasOpenAgentConversations(userId)
  const detailSidebarPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_DETAIL_SIDEBAR_PANE_ID,
    clampSize: clampSidebarWidth,
  })
  const terminalPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_TERMINAL_DOCK_PANE_ID,
    fallbackState: 'hidden',
  })
  const detailSidebarHidden = detailSidebarPane.hidden
  const terminalOpen = !terminalPane.hidden
  const detailAgentPanelOpen = useAgentPanelUiStore((s) => s.open)
  const setDetailAgentPanelOpen = useAgentPanelUiStore((s) => s.setOpen)
  const detailAssistantPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_ASSISTANT_DOCK_PANE_ID,
    clampSize: clampDetailAgentPanelWidth,
    controlledState: detailAgentPanelOpen ? 'default' : 'hidden',
    fallbackState: 'hidden',
    onStateChange: (state) => setDetailAgentPanelOpen(state !== 'hidden'),
  })
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
  const agentModeContentPanelOpen = !agentContentPane.collapsed && !agentContentPane.hidden
  const agentSidebarVisible = !agentSidebarPane.collapsed && !agentSidebarPane.hidden
  const detailHeaderActions = useAgentPanelUiStore((s) => s.detailHeaderActions)
  const detailRightPaneOpen = !detailAssistantPane.hidden
  const accountSettingsActiveTab = accountSettingsTabForLocation(pathname, search)
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const settingsExitPath = accountSettingsActiveTab
    ? readSettingsReturnPath() ?? routeForWorkMode(workMode, !!currentProject)
    : undefined
  const detailCenterContent = accountSettingsActiveTab
    ? accountSettingsRouteHeaderTitle(accountSettingsActiveTab)
    : detailRouteHeaderTitle(pathname)
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
  const terminalPlacement = agentMode ? 'center-right' : 'center'
  const terminalHeaderControl = (
    <AppWindowIconButton
      type="button"
      className="app-window-terminal-toggle"
      data-active={terminalOpen ? 'true' : undefined}
      onClick={terminalOpen ? terminalPane.hide : terminalPane.show}
      title={terminalOpen ? '收起 Terminal' : '展开 Terminal'}
      aria-label={terminalOpen ? '收起 Terminal' : '展开 Terminal'}
    >
      <Terminal size={13} />
    </AppWindowIconButton>
  )
  const agentContentPanelClosed = agentContentPane.collapsed || agentContentPane.hidden
  const agentContentPanelHeaderControl = (
    <AppWindowIconButton
      type="button"
      className="app-window-agent-content-toggle"
      data-active={!agentContentPanelClosed ? 'true' : undefined}
      onClick={agentContentPanelClosed ? agentContentPane.show : agentContentPane.collapse}
      title={agentContentPanelClosed ? i18n.t('agents.chat.expandAgentContentPanel') : i18n.t('agents.chat.collapseAgentContentPanel')}
      aria-label={agentContentPanelClosed ? i18n.t('agents.chat.expandAgentContentPanel') : i18n.t('agents.chat.collapseAgentContentPanel')}
    >
      {agentContentPanelClosed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
    </AppWindowIconButton>
  )
  const terminalPanel = (
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
  )
  const showDetailSidebar = React.useCallback(() => {
    detailSidebarPane.show()
  }, [detailSidebarPane])
  const hideDetailSidebar = React.useCallback(() => {
    detailSidebarPane.hide()
  }, [detailSidebarPane])
  const sidebarHeaderControl = (
    <div className="detail-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle"
        onClick={detailSidebarHidden ? showDetailSidebar : hideDetailSidebar}
        title={detailSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
        aria-label={detailSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
      >
        {detailSidebarHidden ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle detail-sidebar-window-controls__nav"
        onClick={() => window.history.back()}
        title="后退"
        aria-label="后退"
      >
        <ArrowLeft size={14} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle detail-sidebar-window-controls__nav"
        onClick={() => window.history.forward()}
        title="前进"
        aria-label="前进"
      >
        <ArrowRight size={14} />
      </AppWindowIconButton>
    </div>
  )
  const agentSidebarHeaderControl = (
    <div className="agent-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle agent-sidebar-window-controls__sidebar"
        onClick={agentSidebarPane.collapsed ? agentSidebarPane.show : agentSidebarPane.collapse}
        title={agentSidebarPane.collapsed ? i18n.t('agents.chat.expandAgentSidebar') : i18n.t('agents.chat.collapseAgentSidebar')}
        aria-label={agentSidebarPane.collapsed ? i18n.t('agents.chat.expandAgentSidebar') : i18n.t('agents.chat.collapseAgentSidebar')}
      >
        {agentSidebarPane.collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle agent-sidebar-window-controls__nav"
        onClick={() => window.history.back()}
        title="后退"
        aria-label="后退"
      >
        <ArrowLeft size={14} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle agent-sidebar-window-controls__nav"
        onClick={() => window.history.forward()}
        title="前进"
        aria-label="前进"
      >
        <ArrowRight size={14} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle agent-sidebar-window-controls__update"
        onClick={() => window.location.reload()}
        title="更新"
        aria-label="更新"
      >
        <RefreshCw size={12} />
        <span>更新</span>
      </AppWindowIconButton>
    </div>
  )
  const detailLeftHeader = !detailSidebarHidden ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      leftControls={sidebarHeaderControl}
      leftControlsLayout="fill"
    />
  ) : undefined
  const detailCenterLeftControls = detailSidebarHidden ? sidebarHeaderControl : undefined
  const detailCenterHeader = (
    <Header
      showWindowControls={!detailLeftHeader}
      showAppControls={!detailRightPaneOpen}
      showFallbackBrand={false}
      leftControls={detailCenterLeftControls}
      appControls={terminalHeaderControl}
      centerContent={detailCenterContent}
      showAssistantShortcut
    />
  )
  const detailRightHeader = detailRightPaneOpen ? (
    <Header
      showWindowControls={false}
      showAppControls
      showFallbackBrand={false}
      appControls={<>{detailHeaderActions}{terminalHeaderControl}</>}
      showAssistantShortcut
    />
  ) : undefined
  const agentLeftHeader = agentSidebarVisible ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      leftControls={agentSidebarHeaderControl}
      leftControlsLayout="fill"
    />
  ) : undefined
  const agentCenterHeader = (
    <Header
      titleKey="header.titles.projectAgentMode"
      showWindowControls={!agentLeftHeader}
      showAppControls={!agentModeContentPanelOpen}
      showFallbackBrand={false}
      leftControls={!agentSidebarVisible ? agentSidebarHeaderControl : undefined}
      appControls={<>{agentContentPanelClosed ? agentContentPanelHeaderControl : null}{terminalHeaderControl}</>}
      showAgentContentPanelShortcut={false}
    />
  )
  const agentRightHeader = agentModeContentPanelOpen ? (
    <Header
      showWindowControls={false}
      showAppControls
      showFallbackBrand={false}
      appControls={<>{agentContentPanelHeaderControl}{terminalHeaderControl}</>}
      showAgentContentPanelShortcut={false}
    />
  ) : undefined
  const agentRightCollapsedWidth = agentContentPane.pane?.collapsedSize ?? 0
  const agentRightSlotStyle = {
    width: agentContentPane.collapsed ? agentRightCollapsedWidth : agentContentPane.size,
    minWidth: agentContentPane.collapsed ? agentRightCollapsedWidth : agentContentPane.size,
    flexBasis: agentContentPane.collapsed ? agentRightCollapsedWidth : agentContentPane.size,
  }
  const agentLeftSlotWidth = !agentSidebarVisible
    ? 0
    : agentSidebarPane.size
  const agentLeftSlotStyle = {
    width: agentLeftSlotWidth,
    minWidth: agentLeftSlotWidth,
    flexBasis: agentLeftSlotWidth,
  }
  const detailLeftSlotStyle = {
    width: detailSidebarHidden ? 0 : detailSidebarPane.size,
    minWidth: detailSidebarHidden ? 0 : detailSidebarPane.size,
    flexBasis: detailSidebarHidden ? 0 : detailSidebarPane.size,
  }
  const detailRightSlotStyle = {
    width: detailRightPaneOpen ? detailAssistantPane.size : 0,
    minWidth: detailRightPaneOpen ? detailAssistantPane.size : 0,
    flexBasis: detailRightPaneOpen ? detailAssistantPane.size : 0,
  }

  const shellSurface: AppRouteSurface = agentMode ? 'agent' : 'detail'
  const shell = (
    <>
      <RedirectListener />
      {agentMode ? (
        <WorkspaceShell
          surface={shellSurface}
          sidebar={(
            <React.Suspense fallback={null}>
              <ProjectAgentModeSidebar
                collapsed={agentSidebarPane.collapsed}
                onCollapsedChange={(collapsed) => {
                  if (collapsed) agentSidebarPane.collapse()
                  else agentSidebarPane.show()
                }}
                width={agentSidebarPane.size}
                onWidthChange={agentSidebarPane.setSize}
              />
            </React.Suspense>
          )}
          leftHeader={agentLeftHeader}
          centerHeader={agentCenterHeader}
          rightHeader={agentRightHeader}
          leftSlotStyle={agentLeftSlotStyle}
          sidebarCollapsed={agentSidebarPane.collapsed}
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
          sidebar={(
            accountSettingsActiveTab ? (
              <AccountSettingsPageSidebar
                activeTab={accountSettingsActiveTab}
                width={detailSidebarPane.size}
                onWidthChange={detailSidebarPane.setSize}
                onHide={hideDetailSidebar}
                onExitSettings={() => navigate(settingsExitPath ?? routeForWorkMode(workMode, !!currentProject), { replace: true })}
              />
            ) : (
              <Sidebar
                width={detailSidebarPane.size}
                onWidthChange={detailSidebarPane.setSize}
                onHide={hideDetailSidebar}
              />
            )
          )}
          leftHeader={detailLeftHeader}
          centerHeader={detailCenterHeader}
          rightHeader={detailRightHeader}
          leftSlotStyle={detailLeftSlotStyle}
          rightSlotStyle={detailRightSlotStyle}
          terminalPanel={terminalPanel}
          terminalOpen={terminalOpen}
          terminalPlacement={terminalPlacement}
          assistantPanel={detailAgentPanelOpen || hasOpenConversations ? (
            <React.Suspense fallback={null}>
              <AIAgentPanel
                width={detailAssistantPane.size}
                onWidthChange={detailAssistantPane.setSize}
              />
            </React.Suspense>
          ) : undefined}
          leftPaneHidden={detailSidebarHidden}
          rightPaneCollapsed={!detailRightPaneOpen}
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

// Resets the error boundary whenever the route changes.
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

// Listens for api:redirect events (fired by the axios interceptor).
function RedirectListener() {
  const navigate = useNavigate()
  useEffect(() => {
    function handler(e: Event) {
      navigate((e as CustomEvent<string>).detail, { replace: true })
    }
    function workspaceReviewHandler(e: Event) {
      const path = workspaceChangeHandoffPathFromEventDetail((e as CustomEvent<unknown>).detail)
      if (path) navigate(path)
    }
    window.addEventListener('api:redirect', handler)
    window.addEventListener(WORKSPACE_CHANGE_HANDOFF_EVENT, workspaceReviewHandler)
    return () => {
      window.removeEventListener('api:redirect', handler)
      window.removeEventListener(WORKSPACE_CHANGE_HANDOFF_EVENT, workspaceReviewHandler)
    }
  }, [navigate])
  return null
}

// ── App ──────────────────────────────────────────────────────────────────────

const AppRouter = typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter

export default function App() {
  const user = useUserStore((s) => s.currentUser)
  const userHydrated = useUserStore((s) => s.hydrated)
  const settingsHydrated = useAppSettingsStore((s) => s.hydrated)
  const onboardingCompleted = useAppSettingsStore((s) => s.settings.onboardingCompleted)

  useEffect(() => {
    return scheduleIdleTask(() => {
      void import('./features/agent/state/agentTelemetryReporter').then((telemetry) => {
        telemetry.installAgentTelemetryReporter()
      }).catch((error) => {
        console.warn('[agent] failed to install telemetry reporter', error)
      })
    })
  }, [])

  useEffect(() => {
    if (!settingsHydrated) return
    return scheduleIdleTask(() => {
      void import('./features/plugins/application/builtinClientPlugins').then((module) => {
        return module.ensureBundledClientPluginsInstalled()
      }).catch((error) => {
        console.warn('[plugins] failed to install bundled client plugins', error)
      })
    })
  }, [settingsHydrated])

  if (!settingsHydrated || !userHydrated) {
    return <LoadingScreen fullScreen />
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <AppRouter>
          <ElectronMCPContextBridge />
          <Toaster />
          <UiDebugInspector />
          <BackendBootOverlay />
          <RouteSuspense fullScreen>
            <Routes>
              <Route path={ROUTES.invite} element={<InvitePage />} />
              <Route path={ROUTES.appSettings} element={<AppSettingsPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="*" element={onboardingCompleted ? <AuthPage /> : <Navigate to="/onboarding" replace />} />
            </Routes>
          </RouteSuspense>
        </AppRouter>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <AppRouter>
        <ElectronMCPContextBridge />
        <Toaster />
        <UiDebugInspector />
        <BackendBootOverlay />
        <ProjectRequiredDialog />
        <RouteSuspense fullScreen>
          <Routes>
            <Route path={ROUTES.canvasEditor} element={<CanvasEditorShellRoute />} />
            <Route path={ROUTES.orgSelect} element={
              <ShellLayout requireOrg={false}>
                <RouteContentShell width="wide"><OrgSelectPage /></RouteContentShell>
              </ShellLayout>
            } />
            {/* Invite page - accessible when logged in */}
            <Route path={ROUTES.invite} element={<InvitePage />} />
            {/* All other pages use the shell layout */}
            <Route path="*" element={
              <ShellLayout>
                <Routes>
                <Route path={ROUTES.root} element={<GlobalHomePage />} />
                <Route path={ROUTES.projects} element={<GlobalHomePage />} />
                <Route path="/admin/*" element={<Navigate to={ROUTES.root} replace />} />
                <Route path={ROUTES.appSettings} element={<AccountSettingsRoute tab="settings" />} />
                <Route path={ROUTES.user} element={<AccountSettingsRoute tab="profile" />} />
                <Route path={ROUTES.orgSettings} element={<AccountSettingsRoute tab="workspace" />} />
                <Route path={ROUTES.agentConsole} element={<AccountSettingsRoute tab="console" />} />

              {/* 工具模块 */}
              <Route path={ROUTES.canvases} element={<RouteContentShell width="normal"><CanvasListPage /></RouteContentShell>} />
              <Route path={ROUTES.tools.refImageGen} element={<RefImageGenPage />} />
              <Route path={ROUTES.tools.refVideoGen} element={<RefVideoGenPage />} />
              <Route path={ROUTES.tools.motionImitation} element={<MotionImitationPage />} />
              <Route path={ROUTES.tools.styleTransfer} element={<StyleTransferPage />} />
              <Route path={ROUTES.tools.multiAngle} element={<MultiAnglePage />} />
              <Route path={ROUTES.tools.plugin} element={<PluginToolPage />} />

              {/* 工作模块 */}
              <Route path={ROUTES.project.scripts} element={<ProjectGuard><ScriptsPage /></ProjectGuard>} />
              <Route path={ROUTES.project.agent} element={<ProjectAgentModeRoute />} />
              <Route path={ROUTES.project.agentCanvases} element={<ProjectGuard><AgentModeRoute><AgentModeCanvasListPage /></AgentModeRoute></ProjectGuard>} />
              <Route path={ROUTES.project.standards} element={<ProjectGuard><ProjectStandardsPage /></ProjectGuard>} />
              <Route path={ROUTES.project.sourceWorkspace} element={<ProjectGuard><ContentSourceWorkspacePage /></ProjectGuard>} />

              {/* 用户 */}
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

              {/* 组织 */}
              {/* 文件 */}
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
