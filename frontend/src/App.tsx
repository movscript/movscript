import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Toaster } from './components/ui/Toaster'
import { useProjectStore } from './store/projectStore'
import { useUserStore } from './store/userStore'
import ProjectsPage from './pages/projects/ProjectsPage'
import ScriptsPage from './pages/scripts/ScriptsPage'
import AssetsPage from './pages/assets/AssetsPage'
import EpisodesPage from './pages/episodes/EpisodesPage'
import ScenesPage from './pages/scenes/ScenesPage'
import StoryboardsPage from './pages/storyboards/StoryboardsPage'
import ShotsPage from './pages/shots/ShotsPage'
import CollaborationPage from './pages/collaboration/CollaborationPage'
import AuthPage from './pages/AuthPage'
import CanvasListPage from './pages/canvas/CanvasListPage'
import CanvasEditorPage from './pages/canvas/CanvasEditorPage'
import RefImageGenPage from './pages/tools/RefImageGenPage'
import RefVideoGenPage from './pages/tools/RefVideoGenPage'
import MotionImitationPage from './pages/tools/MotionImitationPage'
import StyleTransferPage from './pages/tools/StyleTransferPage'
import MultiAnglePage from './pages/tools/MultiAnglePage'
import BrainstormPage from './pages/tools/BrainstormPage'
import CreationPage from './pages/work/CreationPage'
import ProductionFramePage from './pages/production/ProductionFramePage'
import UserProfilePage from './pages/user/UserProfilePage'
import AdminPage from './pages/admin/AdminPage'
import ResourcesPage from './pages/resources/ResourcesPage'
import GenJobsPage from './pages/jobs/GenJobsPage'
import ClientPluginsPage from './pages/plugins/ClientPluginsPage'
import PluginToolPage from './pages/plugins/PluginToolPage'
import PipelineEditorPage from './pages/pipeline/PipelineEditorPage'
import StageWorkspacePage from './pages/pipeline/StageWorkspacePage'
import AgentSettingsPage from './pages/agent/AgentSettingsPage'
import AgentsPage from './pages/agent/AgentsPage'
import { AIAgentPanel } from './components/layout/AIAgentPanel'
import i18n from './i18n'
import { MCPContextBridge } from './mcp/MCPContextBridge'

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

function ProjectGuard({ children }: { children: React.ReactNode }) {
  const current = useProjectStore((s) => s.current)
  if (!current) return <Navigate to="/projects" replace />
  return <>{children}</>
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useUserStore((s) => s.currentUser)
  if (user?.system_role !== 'super_admin') return <Navigate to="/projects" replace />
  return <>{children}</>
}

function Padded({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-auto p-6">{children}</div>
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

export default function App() {
  const user = useUserStore((s) => s.currentUser)

  if (!user) {
    return (
      <BrowserRouter>
        <MCPContextBridge />
        <Toaster />
        <Routes>
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <MCPContextBridge />
      <Toaster />
      <Routes>
        {/* Canvas editor is full-screen, no sidebar/header */}
        <Route path="/canvases/:id" element={<CanvasEditorPage />} />
        {/* Pipeline editor is full-screen */}
        <Route path="/pipeline" element={<ProjectGuard><PipelineEditorPage /></ProjectGuard>} />
        {/* All other pages use the shell layout */}
        <Route path="*" element={
          <div className="flex h-screen bg-background text-foreground">
            <RedirectListener />
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <Header />
              <main className="flex-1 min-h-0 overflow-hidden flex">
              <div className="flex-1 min-w-0 overflow-hidden">
                <RouteErrorBoundary>
                  <Routes>
                    <Route path="/" element={<Navigate to="/projects" replace />} />
                    <Route path="/projects" element={<Padded><ProjectsPage /></Padded>} />

                    {/* 项目模块（Master-Detail 布局，无 Padded 包装） */}
                    <Route path="/scripts"     element={<ProjectGuard><ScriptsPage /></ProjectGuard>} />
                    <Route path="/assets"      element={<ProjectGuard><AssetsPage /></ProjectGuard>} />
                    <Route path="/episodes"    element={<ProjectGuard><EpisodesPage /></ProjectGuard>} />
                    <Route path="/scenes"      element={<ProjectGuard><ScenesPage /></ProjectGuard>} />
                    <Route path="/storyboards" element={<ProjectGuard><StoryboardsPage /></ProjectGuard>} />
                    <Route path="/shots"       element={<ProjectGuard><ShotsPage /></ProjectGuard>} />
                    <Route path="/pipeline/nodes/:nodeId" element={<ProjectGuard><StageWorkspacePage /></ProjectGuard>} />

                    {/* 工具模块 */}
                    <Route path="/canvases"                  element={<Padded><CanvasListPage /></Padded>} />
                    <Route path="/tools/ref-image-gen"       element={<RefImageGenPage />} />
                    <Route path="/tools/ref-video-gen"       element={<RefVideoGenPage />} />
                    <Route path="/tools/motion-imitation"    element={<MotionImitationPage />} />
                    <Route path="/tools/style-transfer"      element={<StyleTransferPage />} />
                    <Route path="/tools/multi-angle"         element={<MultiAnglePage />} />
                    <Route path="/tools/brainstorm"          element={<BrainstormPage />} />
                    <Route path="/tools/plugin/:pluginId"    element={<PluginToolPage />} />

                    {/* 工作模块 */}
                    <Route path="/production" element={<ProjectGuard><ProductionFramePage /></ProjectGuard>} />
                    <Route path="/collaboration" element={<ProjectGuard><Padded><CollaborationPage /></Padded></ProjectGuard>} />
                    <Route path="/creation"      element={<ProjectGuard><CreationPage /></ProjectGuard>} />

                    {/* 用户 */}
                    <Route path="/user" element={<Padded><UserProfilePage /></Padded>} />

                    {/* 文件 */}
                    <Route path="/resources" element={<ResourcesPage />} />
                    <Route path="/jobs" element={<GenJobsPage />} />
                    <Route path="/plugins" element={<ClientPluginsPage />} />

                    {/* Agent */}
                    <Route path="/agent/settings" element={<AgentSettingsPage />} />
                    <Route path="/agents" element={<Padded><AgentsPage /></Padded>} />

                    {/* 管理后台 — super_admin only */}
                    <Route path="/admin" element={<AdminGuard><Padded><AdminPage /></Padded></AdminGuard>} />
                    <Route path="/admin/ai-config" element={<Navigate to="/admin" replace />} />
                  </Routes>
                </RouteErrorBoundary>
              </div>
              <AIAgentPanel />
              </main>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
