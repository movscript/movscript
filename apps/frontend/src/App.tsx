import React, { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
} from './features/app-shell/components/Sidebar'
import { Header } from './features/app-shell/components/Header'
import { AccountSettingsDialog } from './features/app-shell/components/AccountSettingsDialog'
import { AIAgentPanel } from './features/agent/components/AIAgentPanel'
import { WorkspaceShell } from '@movscript/ui'
import { Toaster } from './shared/ui/Toaster'
import { useProjectStore } from './shared/infrastructure/session/projectStore'
import { useUserStore } from './shared/infrastructure/session/userStore'
import { useAppSettingsStore } from './shared/infrastructure/appSettingsStore'
import { canManageLocalBackend, isBackendBootStatus, probeLocalBackendStatus, type BackendBootStatus } from '@/shared/infrastructure/backendBoot'
import PreProductionPage from './pages/pre-production/PreProductionPage'
import TasksPage from './pages/project/tasks/TasksPage'
import AuthPage from './pages/AuthPage'
import OnboardingPage from './pages/onboarding/OnboardingPage'
import AppSettingsPage from './pages/app-settings/AppSettingsPage'
import CanvasListPage from './pages/canvas/CanvasListPage'
import CanvasEditorPage from './pages/canvas/CanvasEditorPage'
import RefImageGenPage from './pages/tools/RefImageGenPage'
import RefVideoGenPage from './pages/tools/RefVideoGenPage'
import MotionImitationPage from './pages/tools/MotionImitationPage'
import StyleTransferPage from './pages/tools/StyleTransferPage'
import MultiAnglePage from './pages/tools/MultiAnglePage'
import ProductionOrchestrationPage from './pages/project/production/ProductionOrchestrationPage'
import { ContentUnitWorkbenchPage } from './features/content/components/ContentUnitWorkbenchPage'
import OrgSelectPage from './pages/org/OrgSelectPage'
import InvitePage from './pages/auth/InvitePage'
import ResourcesPage from './pages/resources/ResourcesPage'
import ExternalResourcesPage from './pages/resources/ExternalResourcesPage'
import ShotLibraryPage from './pages/shot-library/ShotLibraryPage'
import JobsPage from './pages/jobs/JobsPage'
import PluginToolPage from './pages/plugins/PluginToolPage'
import GlobalHomePage from './pages/home/GlobalHomePage'
import ProjectStandardsPage from './pages/project/standards/ProjectStandardsPage'
import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  clampAgentModeContentPanelWidth,
  ProjectAgentContentPanel,
  ProjectAgentModeSidebar,
} from './features/agent/components/ProjectAgentModePage'
import AgentModePage from './pages/agent-mode/AgentModePage'
import AgentModeCanvasListPage from './pages/agent-mode/AgentModeCanvasListPage'
import ScriptsPage from './pages/scripts/ScriptsPage'
import DeliveryPage from './pages/project/delivery/DeliveryPage'
import DeliveryWorkbenchPage from './pages/project/delivery/DeliveryWorkbenchPage'
import AIWorkspacesPage from './pages/agent/AIWorkspacesPage'
import AgentConsolePage from './pages/agent/AgentConsolePage'
import AIAgentRunPage from './pages/agent/AIAgentRunPage'
import AIAgentSettingsPage from './pages/agent/AIAgentSettingsPage'
import AgentRunsPage from './pages/agent/AgentRunsPage'
import ClientPluginsPage from './pages/plugins/ClientPluginsPage'
import i18n from './i18n'
import { ElectronMCPContextBridge } from './electron/ElectronMCPContextBridge'
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, Clapperboard, HardDrive, Image as ImageIcon, Loader2, Lightbulb, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Plug, Plus, Save, Video, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { runtimeNavItems, runtimeRoutes } from '@runtime'
import { getProjectWorkbenchDefinition } from './features/project-workbenches/domain/projectWorkbenchRegistry'
import { ROUTES } from './routes/projectRoutes'
import { canvasBackPath, getAppRouteSurface, routeForWorkMode, type AppRouteSurface } from './routes/appRouteModel'
import { useCanvasHeaderStore } from './features/canvas/presentation/canvasHeaderStore'
import { useInlineTitleEditor } from './features/canvas/presentation/useInlineTitleEditor'
import { installAgentPerformanceObservers } from './features/agent/state/agentPerformanceStore'
import { installAgentTelemetryReporter } from './features/agent/state/agentTelemetryReporter'
import { useAgentPanelUiStore } from './features/agent/presentation/agentPanelUiStore'
import { useHasOpenAgentConversations } from './features/agent/presentation/useHasOpenAgentConversations'
import { AppBackendBootActionButton, AppBackendBootOverlay, AppContentLayout, AppErrorFallback, AppRouteViewport, AppWindowIconButton, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label, Textarea, UiDebugInspector } from '@movscript/ui'
import { useAppShellDialogStore, type AccountSettingsDialogTab } from './features/app-shell/application/appShellDialogStore'
import { api } from './shared/infrastructure/api'
import { projectListQueryKey } from './features/project/application/projectQueries'
import type { Project } from './types'

// ── Error boundary ───────────────────────────────────────────────────────────

function reportContentWorkbenchRouteMismatch() {
  const route = getProjectWorkbenchDefinition('content_orchestration').route
  if (route === ROUTES.project.contentUnitWorkbench) return
  console.warn('content_orchestration workbench route mismatch', {
    registryRoute: route,
    routeConstant: ROUTES.project.contentUnitWorkbench,
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

function ContentWorkbenchRedirect() {
  const location = useLocation()
  useEffect(() => reportContentWorkbenchRouteMismatch(), [])
  return <Navigate to={`${ROUTES.project.productionOrchestration}${location.search}`} replace />
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

function ProjectAgentModeRoute() {
  return <AgentModePage />
}

function AgentModeRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function AccountSettingsRoute({ tab }: { tab: AccountSettingsDialogTab }) {
  const navigate = useNavigate()
  const openAccountSettings = useAppShellDialogStore((s) => s.openAccountSettings)
  const currentProject = useProjectStore((s) => s.current)
  const workMode = useAppSettingsStore((s) => s.settings.workMode)

  useEffect(() => {
    openAccountSettings(tab)
    navigate(routeForWorkMode(workMode, !!currentProject), { replace: true })
  }, [currentProject, navigate, openAccountSettings, tab, workMode])

  return null
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
  const routeTitles: Array<{
    match: (value: string) => boolean
    icon: LucideIcon
    title: React.ReactNode
  }> = [
    { match: (value) => value === ROUTES.resources, icon: HardDrive, title: i18n.t('header.titles.resources') },
    { match: (value) => value === ROUTES.externalResources, icon: ImageIcon, title: i18n.t('header.titles.externalResources', { defaultValue: '外部资源' }) },
    { match: (value) => value === ROUTES.shotLibrary, icon: Clapperboard, title: i18n.t('header.titles.shotLibrary') },
    { match: (value) => value === ROUTES.jobs, icon: BriefcaseBusiness, title: i18n.t('header.titles.jobs') },
    { match: (value) => value === ROUTES.project.contentUnitEditor, icon: Clapperboard, title: i18n.t('header.titles.shotEditWorkbench') },
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

function ShellLayout({ children, requireOrg = true }: { children: React.ReactNode; requireOrg?: boolean }) {
  const { pathname } = useLocation()
  const routeSurface = getAppRouteSurface(pathname)
  const agentMode = routeSurface === 'agent'
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const hasOpenConversations = useHasOpenAgentConversations(userId)
  const [detailSidebarState, setDetailSidebarState] = React.useState<'expanded' | 'hidden'>('expanded')
  const [detailSidebarWidth, setDetailSidebarWidth] = React.useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampSidebarWidth(saved) : SIDEBAR_DEFAULT_WIDTH
  })
  const detailSidebarHidden = detailSidebarState === 'hidden'
  const agentModeSidebarCollapsed = useAgentPanelUiStore((s) => s.agentModeSidebarCollapsed)
  const toggleAgentModeSidebarCollapsed = useAgentPanelUiStore((s) => s.toggleAgentModeSidebarCollapsed)
  const agentModeContentPanelCollapsed = useAgentPanelUiStore((s) => s.agentModeContentPanelCollapsed)
  const agentModeContentPanelOpen = !agentModeContentPanelCollapsed
  const detailAgentPanelOpen = useAgentPanelUiStore((s) => s.open)
  const detailAgentPanelWidth = useAgentPanelUiStore((s) => s.detailAgentPanelWidth)
  const detailHeaderActions = useAgentPanelUiStore((s) => s.detailHeaderActions)
  const [agentModeContentPanelWidth, setAgentModeContentPanelWidth] = React.useState(AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH)
  const handleAgentModeContentPanelWidthChange = React.useCallback((width: number) => {
    setAgentModeContentPanelWidth(clampAgentModeContentPanelWidth(width))
  }, [])
  const detailRightPaneOpen = detailAgentPanelOpen && hasOpenConversations
  const detailCenterContent = detailRouteHeaderTitle(pathname)
  React.useEffect(() => {
    if (detailSidebarHidden) return
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(detailSidebarWidth))
  }, [detailSidebarHidden, detailSidebarWidth])
  const showDetailSidebar = React.useCallback(() => {
    setDetailSidebarState('expanded')
  }, [])
  const hideDetailSidebar = React.useCallback(() => {
    setDetailSidebarState('hidden')
  }, [])
  const sidebarHeaderControl = (
    <div className="flex shrink-0 items-center gap-1">
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle"
        onClick={detailSidebarHidden ? showDetailSidebar : hideDetailSidebar}
        title={detailSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
        aria-label={detailSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
      >
        {detailSidebarHidden ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </AppWindowIconButton>
    </div>
  )
  const agentSidebarHeaderControl = (
    <div className="flex shrink-0 items-center gap-1">
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle"
        onClick={toggleAgentModeSidebarCollapsed}
        title={agentModeSidebarCollapsed ? i18n.t('agents.chat.expandAgentSidebar') : i18n.t('agents.chat.collapseAgentSidebar')}
        aria-label={agentModeSidebarCollapsed ? i18n.t('agents.chat.expandAgentSidebar') : i18n.t('agents.chat.collapseAgentSidebar')}
      >
        {agentModeSidebarCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </AppWindowIconButton>
    </div>
  )
  const detailLeftHeader = !detailSidebarHidden ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      leftControls={sidebarHeaderControl}
    />
  ) : undefined
  const detailCenterLeftControls = detailSidebarHidden ? sidebarHeaderControl : undefined
  const detailCenterHeader = (
    <Header
      showWindowControls={!detailLeftHeader}
      showAppControls={!detailRightPaneOpen}
      showFallbackBrand={false}
      leftControls={detailCenterLeftControls}
      centerContent={detailCenterContent}
      showAssistantShortcut
    />
  )
  const detailRightHeader = detailRightPaneOpen ? (
    <Header
      showWindowControls={false}
      showAppControls
      showFallbackBrand={false}
      appControls={detailHeaderActions}
      showAssistantShortcut
    />
  ) : undefined
  const agentLeftHeader = !agentModeSidebarCollapsed ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      leftControls={agentSidebarHeaderControl}
    />
  ) : undefined
  const agentCenterHeader = (
    <Header
      titleKey="header.titles.projectAgentMode"
      showWindowControls={!agentLeftHeader}
      showAppControls={!agentModeContentPanelOpen}
      showFallbackBrand={false}
      leftControls={agentModeSidebarCollapsed ? agentSidebarHeaderControl : undefined}
      showAgentContentPanelShortcut
    />
  )
  const agentRightHeader = agentModeContentPanelOpen ? (
    <Header
      showWindowControls={false}
      showAppControls
      showFallbackBrand={false}
      showAgentContentPanelShortcut
    />
  ) : undefined
  const agentRightSlotStyle = {
    width: agentModeContentPanelCollapsed ? 0 : agentModeContentPanelWidth,
    minWidth: agentModeContentPanelCollapsed ? 0 : agentModeContentPanelWidth,
    flexBasis: agentModeContentPanelCollapsed ? 0 : agentModeContentPanelWidth,
  }
  const detailLeftSlotStyle = {
    width: detailSidebarHidden ? 0 : detailSidebarWidth,
    minWidth: detailSidebarHidden ? 0 : detailSidebarWidth,
    flexBasis: detailSidebarHidden ? 0 : detailSidebarWidth,
  }
  const detailRightSlotStyle = {
    width: detailRightPaneOpen ? detailAgentPanelWidth : 0,
    minWidth: detailRightPaneOpen ? detailAgentPanelWidth : 0,
    flexBasis: detailRightPaneOpen ? detailAgentPanelWidth : 0,
  }

  const shellSurface: AppRouteSurface = agentMode ? 'agent' : 'detail'
  const shell = (
    <>
      <RedirectListener />
      {agentMode ? (
        <WorkspaceShell
          surface={shellSurface}
          sidebar={(
            <ProjectAgentModeSidebar />
          )}
          leftHeader={agentLeftHeader}
          centerHeader={agentCenterHeader}
          rightHeader={agentRightHeader}
          leftPaneHidden={agentModeSidebarCollapsed}
          rightSlotStyle={agentRightSlotStyle}
          rightPaneCollapsed={agentModeContentPanelCollapsed}
          assistantPanel={(
            <ProjectAgentContentPanel
              collapsed={agentModeContentPanelCollapsed}
              onWidthChange={handleAgentModeContentPanelWidthChange}
            />
          )}
        >
          <AppRouteViewport scroll="auto">
            <RouteErrorBoundary>{children}</RouteErrorBoundary>
          </AppRouteViewport>
        </WorkspaceShell>
      ) : (
        <WorkspaceShell
          surface={shellSurface}
          sidebar={(
            <Sidebar
              width={detailSidebarWidth}
              onWidthChange={setDetailSidebarWidth}
              onHide={hideDetailSidebar}
            />
          )}
          leftHeader={detailLeftHeader}
          centerHeader={detailCenterHeader}
          rightHeader={detailRightHeader}
          leftSlotStyle={detailLeftSlotStyle}
          rightSlotStyle={detailRightSlotStyle}
          assistantPanel={detailAgentPanelOpen || hasOpenConversations ? <AIAgentPanel /> : undefined}
          leftPaneHidden={detailSidebarHidden}
          rightPaneCollapsed={!detailRightPaneOpen}
        >
          <AppRouteViewport scroll="auto">
            <RouteErrorBoundary>{children}</RouteErrorBoundary>
          </AppRouteViewport>
        </WorkspaceShell>
      )}
    </>
  )

  return requireOrg ? <OrgGuard>{shell}</OrgGuard> : shell
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
    window.addEventListener('api:redirect', handler)
    return () => window.removeEventListener('api:redirect', handler)
  }, [navigate])
  return null
}

// ── App ──────────────────────────────────────────────────────────────────────

const AppRouter = typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter

export default function App() {
  const user = useUserStore((s) => s.currentUser)
  const settingsHydrated = useAppSettingsStore((s) => s.hydrated)
  const onboardingCompleted = useAppSettingsStore((s) => s.settings.onboardingCompleted)

  useEffect(() => {
    installAgentTelemetryReporter()
    installAgentPerformanceObservers()
  }, [])

  if (!settingsHydrated) {
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
          <Routes>
            <Route path={ROUTES.invite} element={<InvitePage />} />
            <Route path={ROUTES.appSettings} element={<AppSettingsPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="*" element={onboardingCompleted ? <AuthPage /> : <Navigate to="/onboarding" replace />} />
          </Routes>
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
        <AccountSettingsDialog />
        <ProjectRequiredDialog />
        <Routes>
          <Route path={ROUTES.canvasEditor} element={
            <OrgGuard>
              <WorkspaceShell
                surface="canvas"
                header={<Header leftControls={<CanvasHeaderLeft />} appControls={<CanvasHeaderActions />} centerContent={<CanvasHeaderTitle />} />}
              >
                <AppRouteViewport scroll="owned">
                  <RouteErrorBoundary>
                    <CanvasEditorPage embeddedInShell />
                  </RouteErrorBoundary>
                </AppRouteViewport>
              </WorkspaceShell>
            </OrgGuard>
          } />
          <Route path={ROUTES.orgSelect} element={
            <ShellLayout requireOrg={false}>
              <RouteContentShell width="wide"><OrgSelectPage /></RouteContentShell>
            </ShellLayout>
          } />
          {/* Invite page - accessible when logged in */}
          <Route path={ROUTES.invite} element={<InvitePage />} />
          <Route path={ROUTES.appSettings} element={<AccountSettingsRoute tab="settings" />} />
          {/* All other pages use the shell layout */}
          <Route path="*" element={
            <ShellLayout>
              <Routes>
                <Route path={ROUTES.root} element={<GlobalHomePage />} />
                <Route path={ROUTES.projects} element={<GlobalHomePage />} />
                <Route path="/admin/*" element={<Navigate to={ROUTES.root} replace />} />

              {/* 项目模块（Master-Detail 布局，无 Padded 包装） */}
              <Route path={ROUTES.project.preProduction} element={<ProjectGuard><PreProductionPage /></ProjectGuard>} />

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
              <Route path={ROUTES.project.legacyScripts} element={<Navigate to={ROUTES.project.scripts} replace />} />

              <Route path={ROUTES.project.productionOrchestration} element={<ProjectGuard><ProductionOrchestrationPage /></ProjectGuard>} />
              <Route path={ROUTES.project.tasks} element={<ProjectGuard><TasksPage /></ProjectGuard>} />
              <Route path={ROUTES.project.delivery} element={<ProjectGuard><DeliveryPage /></ProjectGuard>} />
              <Route path={ROUTES.project.deliveryWorkbench} element={<ProjectGuard><DeliveryWorkbenchPage /></ProjectGuard>} />
              <Route path={ROUTES.project.overview} element={<Navigate to={ROUTES.project.productionOrchestration} replace />} />
              <Route path={ROUTES.project.agent} element={<ProjectAgentModeRoute />} />
              <Route path={ROUTES.project.agentCanvases} element={<ProjectGuard><AgentModeRoute><AgentModeCanvasListPage /></AgentModeRoute></ProjectGuard>} />
              <Route path={ROUTES.project.standards} element={<ProjectGuard><ProjectStandardsPage /></ProjectGuard>} />
              <Route path={ROUTES.project.contentUnitWorkbench} element={<ProjectGuard><ContentWorkbenchRedirect /></ProjectGuard>} />
              <Route path={ROUTES.project.contentUnitEditor} element={<ProjectGuard><ContentUnitWorkbenchPage /></ProjectGuard>} />

              {/* 用户 */}
              <Route path={ROUTES.user} element={<AccountSettingsRoute tab="profile" />} />
              {runtimeRoutes.map((route) => {
                const manageNavItem = runtimeNavItems.find((item) => item.to === route.path && (item.section ?? 'manage') === 'manage')
                let element = manageNavItem
                  ? <AccountSettingsRoute tab={`runtime:${route.path}`} />
                  : route.element
                if (route.requireProject) element = <ProjectGuard>{element}</ProjectGuard>
                if (route.requireOrgAdmin) element = <OrgAdminGuard>{element}</OrgAdminGuard>
                if (route.padded ?? true) element = <RouteContentShell>{element}</RouteContentShell>
                return <Route key={route.path} path={route.path} element={element} />
              })}

              {/* 组织 */}
              <Route path={ROUTES.orgSettings} element={<AccountSettingsRoute tab="workspace" />} />

              {/* 文件 */}
              <Route path={ROUTES.resources} element={<ResourcesPage />} />
              <Route path={ROUTES.externalResources} element={<ExternalResourcesPage />} />
              <Route path={ROUTES.shotLibrary} element={<ShotLibraryPage />} />
              <Route path={ROUTES.jobs} element={<JobsPage />} />
              <Route path={ROUTES.plugins} element={<ClientPluginsPage />} />
              <Route path={ROUTES.agentConsole} element={<AgentConsolePage />} />
              <Route path={ROUTES.agentWorkspaces} element={<AIWorkspacesPage />} />
              <Route path={ROUTES.agentSettings} element={<AIAgentSettingsPage />} />
              <Route path={ROUTES.agentRuns} element={<AgentRunsPage />} />
              <Route path={ROUTES.agentRun} element={<AIAgentRunPage />} />

              <Route path="/agents" element={<Navigate to={ROUTES.agentConsole} replace />} />
              </Routes>
            </ShellLayout>
          } />
        </Routes>
      </AppRouter>
    </ErrorBoundary>
  )
}
