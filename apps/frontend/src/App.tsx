import React, { useEffect } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { AIAgentPanel } from './components/layout/AIAgentPanel'
import { WorkspaceShell } from './components/layout/WorkspaceShell'
import { Toaster } from './components/ui/Toaster'
import { useProjectStore } from './store/projectStore'
import { useUserStore } from './store/userStore'
import { useAppSettingsStore } from './store/appSettingsStore'
import { canManageLocalBackend, isBackendBootStatus, probeLocalBackendStatus, type BackendBootStatus } from './lib/backendBoot'
import ProjectsPage from './pages/projects/ProjectsPage'
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
import BrainstormPage from './pages/tools/BrainstormPage'
import ReferenceRelationsPage from './pages/reference-relations/ReferenceRelationsPage'
import ProductionPage from './pages/project/production/ProductionPage'
import ProductionOrchestrationPage from './pages/project/production/ProductionOrchestrationPage'
import ContentUnitsPage from './pages/project/content-units/ContentUnitsPage'
import UserProfilePage from './pages/user/UserProfilePage'
import OrgSelectPage from './pages/org/OrgSelectPage'
import OrgSettingsPage from './pages/org/OrgSettingsPage'
import InvitePage from './pages/auth/InvitePage'
import ResourcesPage from './pages/resources/ResourcesPage'
import JobsPage from './pages/jobs/JobsPage'
import ClientPluginsPage from './pages/plugins/ClientPluginsPage'
import PluginToolPage from './pages/plugins/PluginToolPage'
import ProjectOverviewPage from './pages/project/overview/ProjectOverviewPage'
import ProjectStandardsPage from './pages/project/standards/ProjectStandardsPage'
import WorkbenchPage from './pages/workbench/WorkbenchPage'
import ProjectAgentModePage, { ProjectAgentModeSidebar } from './pages/project/agent/ProjectAgentModePage'
import ScriptsPage from './pages/scripts/ScriptsPage'
import SegmentsPage from './pages/segments/SegmentsPage'
import SceneMomentsPage from './pages/scene-moments/SceneMomentsPage'
import DeliveryPage from './pages/project/delivery/DeliveryPage'
import DeliveryWorkbenchPage from './pages/project/delivery/DeliveryWorkbenchPage'
import AIDraftsPage from './pages/agent/AIDraftsPage'
import AIAgentRunPage from './pages/agent/AIAgentRunPage'
import AIAgentDebugPage from './pages/agent/AIAgentDebugPage'
import AIAgentSettingsPage from './pages/agent/AIAgentSettingsPage'
import i18n from './i18n'
import { MCPContextBridge } from './mcp/MCPContextBridge'
import { ArrowLeft, BriefcaseBusiness, HardDrive, Loader2, Lightbulb, PanelLeftClose, PanelLeftOpen, Play, Save, Workflow, Zap } from 'lucide-react'
import { runtimeRoutes } from '@runtime'
import { getProjectWorkbenchDefinition } from './pages/project/projectSurfaces'
import { LEGACY_ROUTES, ROUTES, mergeSearch, withSearch } from './routes/projectRoutes'
import { useCanvasHeaderStore } from './store/canvasHeaderStore'
import { Badge, Button } from '@movscript/ui'

// ── Error boundary ───────────────────────────────────────────────────────────

const projectStandardsWorkbenchRoute = getProjectWorkbenchDefinition('project_standards').route
const preProductionWorkbenchRoute = getProjectWorkbenchDefinition('pre_production').route
const creativePlanWorkbenchRoute = getProjectWorkbenchDefinition('creative_plan').route
const contentOrchestrationWorkbenchRoute = getProjectWorkbenchDefinition('content_orchestration').route
const deliveryWorkbenchRoute = getProjectWorkbenchDefinition('delivery').route

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
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive type-title">!</span>
          </div>
          <div>
            <p className="type-body font-medium text-foreground mb-1">{i18n.t('errorBoundary.title')}</p>
            <p className="type-label text-muted-foreground font-mono max-w-sm break-all">{error.message}</p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="type-label border border-border text-muted-foreground px-4 py-2 rounded hover:bg-muted transition-colors"
          >
            {i18n.t('common.retry')}
          </button>
        </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/92 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-lg">
        <div className={`mx-auto mb-4 flex size-11 items-center justify-center rounded-md ${isError ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
          {isError ? <span className="type-title-sm font-semibold">!</span> : <Loader2 size={24} className="animate-spin" />}
        </div>
        <h2 className="type-body font-semibold">
          {isError ? i18n.t('backendBoot.errorTitle') : i18n.t('backendBoot.startingTitle')}
        </h2>
        <p className="mt-2 type-label leading-5 text-muted-foreground">
          {isError ? (displayStatus.message || i18n.t('backendBoot.errorDescription')) : i18n.t('backendBoot.startingDescription')}
        </p>
        <p className="mt-4 truncate rounded-md bg-muted px-3 py-2 font-mono type-label text-muted-foreground">
          {displayStatus.baseURL}
        </p>
        {isError && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void retryLocalBackend()}
              disabled={retrying}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 type-label font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retrying ? i18n.t('backendBoot.retrying') : i18n.t('backendBoot.retry')}
            </button>
            <Link
              to={ROUTES.appSettings}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 type-label font-medium text-foreground transition-colors hover:bg-muted"
            >
              {i18n.t('backendBoot.openSettings')}
            </Link>
          </div>
        )}
      </div>
    </div>
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
  if (!current) return <Navigate to={ROUTES.projects} replace />
  return <>{children}</>
}

function OrgAdminGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useUserStore((s) => s.hydrated)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const memberships = useUserStore((s) => s.orgMemberships)
  if (!hydrated) return <LoadingScreen fullScreen />
  const membership = memberships.find((m) => m.org_id === currentOrgID)
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
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

function Padded({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-auto p-5">{children}</div>
}

function LegacyDeliveryWorkbenchRedirect() {
  const { search } = useLocation()
  return <Navigate to={withSearch(deliveryWorkbenchRoute, search)} replace />
}

function LegacyContentUnitOrchestrateRedirect() {
  const { search } = useLocation()
  return <Navigate to={withSearch(contentOrchestrationWorkbenchRoute, search)} replace />
}

function LegacyPreProductionRedirect() {
  const { search } = useLocation()
  return <Navigate to={withSearch(preProductionWorkbenchRoute, search)} replace />
}

function LegacyPreProductionSettingsRedirect() {
  const { search } = useLocation()
  return <Navigate to={mergeSearch(preProductionWorkbenchRoute, search, { tab: 'settings' })} replace />
}

function LegacyPreProductionAssetsRedirect() {
  const { search } = useLocation()
  return <Navigate to={mergeSearch(preProductionWorkbenchRoute, search, { tab: 'assets' })} replace />
}

function LegacyProjectOverviewRedirect() {
  const { search } = useLocation()
  return <Navigate to={withSearch(ROUTES.project.overview, search)} replace />
}

function LegacyProjectStandardsRedirect() {
  const { search } = useLocation()
  return <Navigate to={withSearch(projectStandardsWorkbenchRoute, search)} replace />
}

function LegacyProductionOrchestrationRedirect() {
  const { search } = useLocation()
  return <Navigate to={withSearch(creativePlanWorkbenchRoute, search)} replace />
}

function LegacyRedirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={withSearch(to, search)} replace />
}

function CanvasHeaderControls() {
  const navigate = useNavigate()
  const iconButtonClass = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => navigate(ROUTES.canvases)}
        title={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
        aria-label={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
      >
        <ArrowLeft size={12} />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => navigate(ROUTES.resources)}
        title={i18n.t('header.titles.resources', { defaultValue: 'Resources' })}
        aria-label={i18n.t('header.titles.resources', { defaultValue: 'Resources' })}
      >
        <HardDrive size={12} />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => navigate(ROUTES.jobs)}
        title={i18n.t('header.titles.jobs', { defaultValue: 'Jobs' })}
        aria-label={i18n.t('header.titles.jobs', { defaultValue: 'Jobs' })}
      >
        <BriefcaseBusiness size={12} />
      </button>
    </div>
  )
}

function CanvasHeaderCenter() {
  const canvasName = useCanvasHeaderStore((s) => s.canvasName)
  const canvasType = useCanvasHeaderStore((s) => s.canvasType)
  const nodeCount = useCanvasHeaderStore((s) => s.nodeCount)
  const runningCount = useCanvasHeaderStore((s) => s.runningCount)
  const doneCount = useCanvasHeaderStore((s) => s.doneCount)
  const inputCount = useCanvasHeaderStore((s) => s.inputCount)
  const processorCount = useCanvasHeaderStore((s) => s.processorCount)
  const outputCount = useCanvasHeaderStore((s) => s.outputCount)
  const activeRunLabel = useCanvasHeaderStore((s) => s.activeRunLabel)
  const workflowRunningCount = useCanvasHeaderStore((s) => s.workflowRunningCount)
  const onNameChange = useCanvasHeaderStore((s) => s.onNameChange)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Badge variant="outline" className="h-6 shrink-0 gap-1 px-2 type-tiny font-medium">
        {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
        {i18n.t(`canvas.editor.canvasType.${canvasType}`)}
      </Badge>
      <input
        className="app-window-no-drag min-w-[120px] max-w-[260px] flex-1 border-none bg-transparent type-label font-semibold text-foreground outline-none"
        value={canvasName}
        onChange={(event) => onNameChange?.(event.target.value)}
        placeholder={i18n.t('canvas.editor.untitled')}
      />
      <Badge variant="outline" className="hidden h-6 shrink-0 items-center gap-1 border-border type-tiny font-medium leading-none text-muted-foreground sm:flex">
        <Workflow size={12} />
        {i18n.t('canvas.editor.nodesCount', { count: nodeCount })}
      </Badge>
      {runningCount > 0 && (
        <Badge variant="secondary" className="h-6 shrink-0 gap-1 type-tiny">
          <Loader2 size={12} className="animate-spin" />
          {i18n.t('canvas.editor.runningCount', { count: runningCount })}
        </Badge>
      )}
      {canvasType === 'workflow' && activeRunLabel && (
        <Badge variant="outline" className="hidden h-6 shrink-0 gap-1 type-tiny sm:flex">{activeRunLabel}</Badge>
      )}
      {canvasType === 'workflow' && workflowRunningCount > 1 && (
        <Badge variant="secondary" className="hidden h-6 shrink-0 type-tiny sm:flex">
          {i18n.t('canvas.editor.parallelRuns', { count: workflowRunningCount })}
        </Badge>
      )}
      <div className="hidden min-w-0 items-center gap-1.5 truncate type-tiny text-muted-foreground xl:flex">
        <span>{i18n.t('canvas.editor.stats.inputs', { count: inputCount })}</span>
        <span className="h-1 w-1 rounded-full bg-border" />
        <span>{i18n.t('canvas.editor.stats.processors', { count: processorCount })}</span>
        <span className="h-1 w-1 rounded-full bg-border" />
        <span>{i18n.t('canvas.editor.stats.outputs', { count: outputCount })}</span>
        <span className="h-1 w-1 rounded-full bg-border" />
        <span>{i18n.t('canvas.editor.stats.done', { count: doneCount })}</span>
      </div>
    </div>
  )
}

function CanvasHeaderActions() {
  const onRun = useCanvasHeaderStore((s) => s.onRun)
  const onSave = useCanvasHeaderStore((s) => s.onSave)
  const saving = useCanvasHeaderStore((s) => s.saving)
  const startingRun = useCanvasHeaderStore((s) => s.startingRun)
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button onClick={onRun} disabled={!onRun || startingRun} size="sm" className="h-6 rounded-md px-2 type-tiny">
        <Play size={12} /> {startingRun ? i18n.t('canvas.editor.starting') : i18n.t('canvas.editor.startRun')}
      </Button>
      <Button onClick={onSave} disabled={!onSave || saving} size="sm" variant="outline" className="h-6 rounded-md px-2 type-tiny">
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        {saving ? i18n.t('common.saving') : i18n.t('common.save')}
      </Button>
      <CanvasHeaderControls />
    </div>
  )
}

function isAgentCoveredProjectRoute(pathname: string) {
  if (pathname === ROUTES.project.agent) return true
  if (pathname.startsWith('/project/')) return true
  return Object.values(LEGACY_ROUTES).some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

function ShellLayout({ children, requireOrg = true }: { children: React.ReactNode; requireOrg?: boolean }) {
  const { pathname } = useLocation()
  const current = useProjectStore((s) => s.current)
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const agentMode = workMode === 'agent' && !!current && isAgentCoveredProjectRoute(pathname)
  const [detailSidebarState, setDetailSidebarState] = React.useState<'expanded' | 'collapsed' | 'hidden'>('expanded')
  const lastVisibleDetailSidebarState = React.useRef<'expanded' | 'collapsed'>('expanded')
  const detailSidebarHidden = detailSidebarState === 'hidden'
  const detailSidebarCollapsed = detailSidebarState === 'collapsed'
  const setVisibleDetailSidebarState = React.useCallback((state: 'expanded' | 'collapsed') => {
    lastVisibleDetailSidebarState.current = state
    setDetailSidebarState(state)
  }, [])
  const toggleHiddenDetailSidebar = React.useCallback(() => {
    setDetailSidebarState((state) => {
      if (state === 'hidden') return lastVisibleDetailSidebarState.current
      lastVisibleDetailSidebarState.current = state
      return 'hidden'
    })
  }, [])
  const sidebarHeaderControl = (
    <button
      type="button"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      onClick={toggleHiddenDetailSidebar}
      title={detailSidebarHidden ? '展开左侧栏' : '隐藏左侧栏'}
      aria-label={detailSidebarHidden ? '展开左侧栏' : '隐藏左侧栏'}
    >
      {detailSidebarHidden ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
    </button>
  )

  const shell = (
    <>
      <RedirectListener />
      {agentMode ? (
        <WorkspaceShell
          sidebar={<ProjectAgentModeSidebar />}
          header={<Header titleKey="header.titles.projectAgentMode" />}
          contentPaddingClassName="p-0"
          contentFrameClassName="rounded-none border-0"
        >
          <RouteErrorBoundary>
            <ProjectGuard><ProjectAgentModePage embeddedInShell /></ProjectGuard>
          </RouteErrorBoundary>
        </WorkspaceShell>
      ) : (
        <WorkspaceShell
          sidebar={detailSidebarHidden ? undefined : (
            <Sidebar
              collapsed={detailSidebarCollapsed}
              onCollapse={() => setVisibleDetailSidebarState('collapsed')}
              onExpand={() => setVisibleDetailSidebarState('expanded')}
            />
          )}
          header={<Header leftControls={sidebarHeaderControl} />}
          assistantPanel={<AIAgentPanel />}
        >
          <RouteErrorBoundary>{children}</RouteErrorBoundary>
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

  if (!settingsHydrated) {
    return <LoadingScreen fullScreen />
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <AppRouter>
          <MCPContextBridge />
          <Toaster />
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
        <MCPContextBridge />
        <Toaster />
        <BackendBootOverlay />
        <Routes>
          <Route path={ROUTES.canvasEditor} element={
            <OrgGuard>
              <WorkspaceShell
                header={<Header centerContent={<CanvasHeaderCenter />} appControls={<CanvasHeaderActions />} />}
                contentPaddingClassName="p-0"
                contentFrameClassName="rounded-none border-0"
              >
                <RouteErrorBoundary>
                  <CanvasEditorPage embeddedInShell />
                </RouteErrorBoundary>
              </WorkspaceShell>
            </OrgGuard>
          } />
          {/* Org select - full-screen, no sidebar */}
          <Route path={ROUTES.orgSelect} element={<OrgSelectPage />} />
          {/* Invite page - accessible when logged in */}
          <Route path={ROUTES.invite} element={<InvitePage />} />
          <Route path={ROUTES.appSettings} element={<AppSettingsPage />} />
          {/* All other pages use the shell layout */}
          <Route path="*" element={
            <ShellLayout>
              <Routes>
                <Route path={ROUTES.root} element={<Navigate to={ROUTES.projects} replace />} />
                <Route path={ROUTES.projects} element={<ProjectsPage />} />
                <Route path="/admin/*" element={<Navigate to={ROUTES.projects} replace />} />

              {/* 项目模块（Master-Detail 布局，无 Padded 包装） */}
              <Route path={ROUTES.project.preProduction} element={<ProjectGuard><PreProductionPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.preProduction} element={<ProjectGuard><LegacyPreProductionRedirect /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.creativeReferences} element={<ProjectGuard><LegacyPreProductionSettingsRedirect /></ProjectGuard>} />
              <Route path={ROUTES.project.referenceRelations} element={<ProjectGuard><ReferenceRelationsPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.assetSlots} element={<ProjectGuard><LegacyPreProductionAssetsRedirect /></ProjectGuard>} />

              {/* 工具模块 */}
              <Route path={ROUTES.canvases} element={<Padded><CanvasListPage /></Padded>} />
              <Route path={ROUTES.tools.refImageGen} element={<RefImageGenPage />} />
              <Route path={ROUTES.tools.refVideoGen} element={<RefVideoGenPage />} />
              <Route path={ROUTES.tools.motionImitation} element={<MotionImitationPage />} />
              <Route path={ROUTES.tools.styleTransfer} element={<StyleTransferPage />} />
              <Route path={ROUTES.tools.multiAngle} element={<MultiAnglePage />} />
              <Route path={ROUTES.tools.videoEdit} element={<Navigate to={ROUTES.tools.refVideoGen} replace />} />
              <Route path={ROUTES.tools.brainstorm} element={<BrainstormPage />} />
              <Route path={ROUTES.tools.plugin} element={<PluginToolPage />} />

              {/* 工作模块 */}
              <Route path={ROUTES.project.scripts} element={<ProjectGuard><ScriptsPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.scripts} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.scripts} /></ProjectGuard>} />
              <Route path={ROUTES.project.segments} element={<ProjectGuard><SegmentsPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.segments} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.segments} /></ProjectGuard>} />
              <Route path={ROUTES.project.sceneMoments} element={<ProjectGuard><SceneMomentsPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.sceneMoments} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.sceneMoments} /></ProjectGuard>} />
              <Route path={ROUTES.project.contentUnits} element={<ProjectGuard><ContentUnitsPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.contents} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.contentUnits} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.finalVideos} element={<LegacyRedirect to={ROUTES.project.delivery} />} />

              <Route path={ROUTES.project.production} element={<ProjectGuard><ProductionPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.production} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.production} /></ProjectGuard>} />
              <Route path={ROUTES.project.productionOrchestration} element={<ProjectGuard><ProductionOrchestrationPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.productionOrchestration} element={<ProjectGuard><LegacyProductionOrchestrationRedirect /></ProjectGuard>} />
              <Route path={ROUTES.project.tasks} element={<ProjectGuard><TasksPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.collaboration} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.tasks} /></ProjectGuard>} />
              <Route path={ROUTES.project.delivery} element={<ProjectGuard><DeliveryPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.delivery} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.delivery} /></ProjectGuard>} />
              <Route path={ROUTES.project.deliveryWorkbench} element={<ProjectGuard><DeliveryWorkbenchPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.deliveryWorkbench} element={<ProjectGuard><LegacyDeliveryWorkbenchRedirect /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.deliveryWorkbenchFlat} element={<ProjectGuard><LegacyDeliveryWorkbenchRedirect /></ProjectGuard>} />
              <Route path={ROUTES.project.overview} element={<ProjectGuard><ProjectOverviewPage /></ProjectGuard>} />
              <Route path={ROUTES.project.agent} element={<ProjectGuard><ProjectAgentModePage embeddedInShell /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.projectHome} element={<ProjectGuard><LegacyProjectOverviewRedirect /></ProjectGuard>} />
              <Route path={ROUTES.project.standards} element={<ProjectGuard><ProjectStandardsPage /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.projectWorkspace} element={<ProjectGuard><LegacyProjectStandardsRedirect /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.creativeWorkbench} element={<ProjectGuard><LegacyPreProductionSettingsRedirect /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.creation} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.overview} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbench} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.overview} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.scriptSplitWorkbench} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.scripts} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbenchScript} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.scripts} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbenchCreative} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.preProduction} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbenchAssets} element={<ProjectGuard><LegacyPreProductionAssetsRedirect /></ProjectGuard>} />
              <Route path={ROUTES.project.contentUnitWorkbench} element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="production" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.contentUnitOrchestrate} element={<ProjectGuard><LegacyContentUnitOrchestrateRedirect /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbenchProduction} element={<ProjectGuard><LegacyContentUnitOrchestrateRedirect /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbenchDelivery} element={<ProjectGuard><LegacyDeliveryWorkbenchRedirect /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbenchObject} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.scripts} /></ProjectGuard>} />
              <Route path={ROUTES.project.referenceRelationsWorkbench} element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="reference-relations" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path={LEGACY_ROUTES.workbenchReferenceRelations} element={<ProjectGuard><LegacyRedirect to={ROUTES.project.referenceRelationsWorkbench} /></ProjectGuard>} />

              {/* 用户 */}
              <Route path={ROUTES.user} element={<Padded><UserProfilePage /></Padded>} />
              {runtimeRoutes.map((route) => {
                let element = route.element
                if (route.requireProject) element = <ProjectGuard>{element}</ProjectGuard>
                if (route.requireOrgAdmin) element = <OrgAdminGuard>{element}</OrgAdminGuard>
                if (route.padded ?? true) element = <Padded>{element}</Padded>
                return <Route key={route.path} path={route.path} element={element} />
              })}

              {/* 组织 */}
              <Route path={ROUTES.orgSettings} element={<OrgAdminGuard><Padded><OrgSettingsPage /></Padded></OrgAdminGuard>} />

              {/* 文件 */}
              <Route path={ROUTES.resources} element={<ResourcesPage />} />
              <Route path={ROUTES.jobs} element={<JobsPage />} />
              <Route path={ROUTES.plugins} element={<ClientPluginsPage />} />
              <Route path={ROUTES.agentDrafts} element={<Padded><AIDraftsPage /></Padded>} />
              <Route path={ROUTES.agentSettings} element={<AIAgentSettingsPage />} />
              <Route path={ROUTES.agentDebug} element={<AIAgentDebugPage />} />
              <Route path={ROUTES.agentRun} element={<AIAgentRunPage />} />

              <Route path="/agents" element={<Navigate to={ROUTES.agentSettings} replace />} />
              </Routes>
            </ShellLayout>
          } />
        </Routes>
      </AppRouter>
    </ErrorBoundary>
  )
}
