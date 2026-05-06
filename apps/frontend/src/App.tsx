import React, { useEffect } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { AIAgentPanel } from './components/layout/AIAgentPanel'
import { Toaster } from './components/ui/Toaster'
import { useProjectStore } from './store/projectStore'
import { useUserStore } from './store/userStore'
import { useAppSettingsStore } from './store/appSettingsStore'
import { isBackendBootStatus, type BackendBootStatus } from './lib/backendBoot'
import ProjectsPage from './pages/projects/ProjectsPage'
import AssetSlotsPage from './pages/asset-slots/AssetSlotsPage'
import CollaborationPage from './pages/collaboration/CollaborationPage'
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
import VideoEditPage from './pages/tools/VideoEditPage'
import BrainstormPage from './pages/tools/BrainstormPage'
import CreativeReferencesPage from './pages/creative-references/CreativeReferencesPage'
import ReferenceRelationsPage from './pages/reference-relations/ReferenceRelationsPage'
import ProductionFramePage from './pages/production/ProductionFramePage'
import ProductionOrchestratePage from './pages/production/ProductionOrchestratePage'
import ContentsPage from './pages/contents/ContentsPage'
import UserProfilePage from './pages/user/UserProfilePage'
import OrgSelectPage from './pages/org/OrgSelectPage'
import OrgSettingsPage from './pages/org/OrgSettingsPage'
import InvitePage from './pages/auth/InvitePage'
import ResourcesPage from './pages/resources/ResourcesPage'
import JobsPage from './pages/jobs/JobsPage'
import ClientPluginsPage from './pages/plugins/ClientPluginsPage'
import PluginToolPage from './pages/plugins/PluginToolPage'
import ProjectHomePage from './pages/project-home/ProjectHomePage'
import CreativeWorkbenchPage from './pages/creative-workbench/CreativeWorkbenchPage'
import WorkbenchPage from './pages/workbench/WorkbenchPage'
import ScriptsPage from './pages/scripts/ScriptsPage'
import SegmentsPage from './pages/segments/SegmentsPage'
import SceneMomentsPage from './pages/scene-moments/SceneMomentsPage'
import FinalVideosPage from './pages/final-videos/FinalVideosPage'
import i18n from './i18n'
import { MCPContextBridge } from './mcp/MCPContextBridge'
import { Loader2 } from 'lucide-react'

// ── Error boundary ───────────────────────────────────────────────────────────

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
            <span className="text-destructive text-xl">!</span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground mb-1">{i18n.t('errorBoundary.title')}</p>
            <p className="text-xs text-muted-foreground font-mono max-w-sm break-all">{error.message}</p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs border border-border text-muted-foreground px-4 py-2 rounded hover:bg-muted transition-colors"
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
  const settings = useAppSettingsStore((s) => s.settings)
  const [status, setStatus] = React.useState<BackendBootStatus | null>(null)

  useEffect(() => {
    let disposed = false
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
  }, [])

  if (settings.launchMode !== 'local') return null
  if (status?.state === 'ready') return null

  const displayStatus: BackendBootStatus = status ?? {
    state: 'starting',
    baseURL: settings.apiBaseURL,
  }
  const isError = displayStatus.state === 'error'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/92 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-lg">
        <div className={`mx-auto mb-4 flex size-11 items-center justify-center rounded-md ${isError ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
          {isError ? <span className="text-lg font-semibold">!</span> : <Loader2 size={22} className="animate-spin" />}
        </div>
        <h2 className="text-sm font-semibold">
          {isError ? i18n.t('backendBoot.errorTitle') : i18n.t('backendBoot.startingTitle')}
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {isError ? (displayStatus.message || i18n.t('backendBoot.errorDescription')) : i18n.t('backendBoot.startingDescription')}
        </p>
        <p className="mt-4 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
          {displayStatus.baseURL}
        </p>
      </div>
    </div>
  )
}

function ProjectGuard({ children }: { children: React.ReactNode }) {
  const current = useProjectStore((s) => s.current)
  if (!current) return <Navigate to="/projects" replace />
  return <>{children}</>
}

function OrgAdminGuard({ children }: { children: React.ReactNode }) {
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const memberships = useUserStore((s) => s.orgMemberships)
  const membership = memberships.find((m) => m.org_id === currentOrgID)
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return <Navigate to="/projects" replace />
  }
  return <>{children}</>
}

function OrgGuard({ children }: { children: React.ReactNode }) {
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const memberships = useUserStore((s) => s.orgMemberships)
  const currentMembership = memberships.find((m) => m.org_id === currentOrgID)
  if (!currentMembership) return <Navigate to="/org/select" replace />
  return <>{children}</>
}

function Padded({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-auto p-6">{children}</div>
}

function LegacyAgentDebugRedirect() {
  const adminBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL.replace(/\/+$/, ''))

  useEffect(() => {
    window.location.replace(`${adminBaseURL}/admin/agent-debug`)
  }, [adminBaseURL])

  return null
}

function ShellLayout({ children, requireOrg = true }: { children: React.ReactNode; requireOrg?: boolean }) {
  const shell = (
    <div className="flex h-dvh w-dvw overflow-hidden bg-background text-foreground">
      <RedirectListener />
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="min-w-0 flex-1 min-h-0 overflow-hidden bg-muted/20 p-3">
          <div className="flex h-full min-h-0 min-w-0 overflow-hidden gap-3">
            <div className="flex-1 min-w-0 overflow-hidden rounded-md border border-border bg-background">
              <RouteErrorBoundary>{children}</RouteErrorBoundary>
            </div>
            <div className="h-full min-h-0 min-w-0 shrink-0 overflow-hidden rounded-md border border-border bg-background shadow-sm">
              <AIAgentPanel />
            </div>
          </div>
        </main>
      </div>
    </div>
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
  const onboardingCompleted = useAppSettingsStore((s) => s.settings.onboardingCompleted)

  if (!user) {
    return (
      <ErrorBoundary>
        <AppRouter>
          <MCPContextBridge />
          <Toaster />
          <BackendBootOverlay />
          <Routes>
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/app/settings" element={<AppSettingsPage />} />
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
          {/* Canvas editor is full-screen, no sidebar/header */}
          <Route path="/canvases/:id" element={<CanvasEditorPage />} />
          {/* Org select - full-screen, no sidebar */}
          <Route path="/org/select" element={<OrgSelectPage />} />
          {/* Invite page - accessible when logged in */}
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/app/settings" element={<AppSettingsPage />} />
          {/* All other pages use the shell layout */}
          <Route path="*" element={
            <ShellLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="/projects" element={<Padded><ProjectsPage /></Padded>} />
                <Route path="/admin/*" element={<Navigate to="/projects" replace />} />

              {/* 项目模块（Master-Detail 布局，无 Padded 包装） */}
              <Route path="/creative-references" element={<ProjectGuard><CreativeReferencesPage /></ProjectGuard>} />
              <Route path="/reference-relations" element={<ProjectGuard><ReferenceRelationsPage /></ProjectGuard>} />
              <Route path="/asset-slots" element={<ProjectGuard><AssetSlotsPage /></ProjectGuard>} />

              {/* 工具模块 */}
              <Route path="/canvases" element={<Padded><CanvasListPage /></Padded>} />
              <Route path="/tools/ref-image-gen" element={<RefImageGenPage />} />
              <Route path="/tools/ref-video-gen" element={<RefVideoGenPage />} />
              <Route path="/tools/motion-imitation" element={<MotionImitationPage />} />
              <Route path="/tools/style-transfer" element={<StyleTransferPage />} />
              <Route path="/tools/multi-angle" element={<MultiAnglePage />} />
              <Route path="/tools/video-edit" element={<VideoEditPage />} />
              <Route path="/tools/brainstorm" element={<BrainstormPage />} />
              <Route path="/tools/plugin/:pluginId" element={<PluginToolPage />} />

              {/* 工作模块 */}
              <Route path="/scripts" element={<ProjectGuard><ScriptsPage /></ProjectGuard>} />
              <Route path="/segments" element={<ProjectGuard><SegmentsPage /></ProjectGuard>} />
              <Route path="/scene-moments" element={<ProjectGuard><SceneMomentsPage /></ProjectGuard>} />
              <Route path="/contents" element={<ProjectGuard><ContentsPage /></ProjectGuard>} />
              <Route path="/final-videos" element={<Navigate to="/delivery" replace />} />

              <Route path="/production" element={<ProjectGuard><ProductionFramePage /></ProjectGuard>} />
              <Route path="/production-orchestrate" element={<ProjectGuard><ProductionOrchestratePage /></ProjectGuard>} />
              <Route path="/collaboration" element={<ProjectGuard><CollaborationPage /></ProjectGuard>} />
              <Route path="/delivery" element={<ProjectGuard><FinalVideosPage /></ProjectGuard>} />
              <Route path="/project-home" element={<ProjectGuard><ProjectHomePage /></ProjectGuard>} />
              <Route path="/creative-workbench" element={<ProjectGuard><CreativeWorkbenchPage /></ProjectGuard>} />
              <Route path="/creation" element={<ProjectGuard><Navigate to="/project-home" replace /></ProjectGuard>} />
              <Route path="/workbench" element={<ProjectGuard><Navigate to="/script-split-workbench" replace /></ProjectGuard>} />
              <Route path="/script-split-workbench" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="script" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path="/workbench/script" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="script" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path="/workbench/production-plan" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="preview" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path="/workbench/preview" element={<ProjectGuard><Navigate to="/workbench/production-plan" replace /></ProjectGuard>} />
              <Route path="/workbench/creative" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="creative" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path="/workbench/assets" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="assets" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path="/workbench/production" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="production" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path="/workbench/delivery" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="delivery" showCategoryTabs={false} /></ProjectGuard>} />
              <Route path="/workbench/object" element={<ProjectGuard><Navigate to="/workbench/script" replace /></ProjectGuard>} />
              <Route path="/workbench/reference-relations" element={<ProjectGuard><WorkbenchPage mode="free" initialCategory="reference-relations" showCategoryTabs={false} /></ProjectGuard>} />

              {/* 用户 */}
              <Route path="/user" element={<Padded><UserProfilePage /></Padded>} />

              {/* 组织 */}
              <Route path="/org/settings" element={<OrgAdminGuard><Padded><OrgSettingsPage /></Padded></OrgAdminGuard>} />

              {/* 文件 */}
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/plugins" element={<ClientPluginsPage />} />

              {/* Agent debug moved to the admin application. */}
              <Route path="/agent/debug" element={<LegacyAgentDebugRedirect />} />
              <Route path="/agent/settings" element={<LegacyAgentDebugRedirect />} />
              <Route path="/agents" element={<LegacyAgentDebugRedirect />} />
              </Routes>
            </ShellLayout>
          } />
        </Routes>
      </AppRouter>
    </ErrorBoundary>
  )
}
