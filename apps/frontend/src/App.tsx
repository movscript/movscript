import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Toaster } from './components/ui/Toaster'
import { useProjectStore } from './store/projectStore'
import { useUserStore } from './store/userStore'
import ProjectsPage from './pages/projects/ProjectsPage'
import AssetsPage from './pages/assets/AssetsPage'
import CollaborationPage from './pages/collaboration/CollaborationPage'
import AuthPage from './pages/AuthPage'
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
import DeliveryPage from './pages/delivery/DeliveryPage'
import ProductionFramePage from './pages/production/ProductionFramePage'
import ContentsPage from './pages/contents/ContentsPage'
import ProjectPreviewPage from './pages/project-preview/ProjectPreviewPage'
import PreviewProgressPage from './pages/preview-progress/PreviewProgressPage'
import UserProfilePage from './pages/user/UserProfilePage'
import AdminPage from './pages/admin/AdminPage'
import ResourcesPage from './pages/resources/ResourcesPage'
import JobsPage from './pages/jobs/JobsPage'
import ClientPluginsPage from './pages/plugins/ClientPluginsPage'
import PluginToolPage from './pages/plugins/PluginToolPage'
import ProjectHomeV2Page from './pages/project-home/ProjectHomeV2Page'
import WorkbenchPage from './pages/workbench/WorkbenchPage'
import AgentDebugPage from './pages/agent/AgentDebugPage'
import ScriptsPage from './pages/scripts/ScriptsPage'
import ScenesPage from './pages/scenes/ScenesPage'
import SceneMomentsPage from './pages/scene-moments/SceneMomentsPage'
import FinalVideosPage from './pages/final-videos/FinalVideosPage'
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
                      <Route path="/creative-references" element={<ProjectGuard><CreativeReferencesPage /></ProjectGuard>} />
                      <Route path="/reference-relations" element={<ProjectGuard><ReferenceRelationsPage /></ProjectGuard>} />
                      <Route path="/assets" element={<ProjectGuard><AssetsPage /></ProjectGuard>} />

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
                      <Route path="/segments" element={<ProjectGuard><ScenesPage /></ProjectGuard>} />
                      <Route path="/scene-moments" element={<ProjectGuard><SceneMomentsPage /></ProjectGuard>} />
                      <Route path="/scenes" element={<ProjectGuard><SceneMomentsPage /></ProjectGuard>} />
                      <Route path="/contents" element={<ProjectGuard><ContentsPage /></ProjectGuard>} />
                      <Route path="/final-videos" element={<ProjectGuard><FinalVideosPage /></ProjectGuard>} />
                      <Route path="/project-preview" element={<ProjectGuard><ProjectPreviewPage /></ProjectGuard>} />
                      <Route path="/production-management" element={<ProjectGuard><Navigate to="/project-preview" replace /></ProjectGuard>} />
                      <Route path="/production-preview" element={<ProjectGuard><Navigate to="/project-preview" replace /></ProjectGuard>} />
                      <Route path="/preview-progress" element={<ProjectGuard><PreviewProgressPage /></ProjectGuard>} />
                      <Route path="/production" element={<ProjectGuard><ProductionFramePage /></ProjectGuard>} />
                      <Route path="/collaboration" element={<ProjectGuard><Padded><CollaborationPage /></Padded></ProjectGuard>} />
                      <Route path="/delivery" element={<ProjectGuard><DeliveryPage /></ProjectGuard>} />
                      <Route path="/project-home" element={<ProjectGuard><ProjectHomeV2Page /></ProjectGuard>} />
                      <Route path="/project-plan" element={<ProjectGuard><Navigate to="/project-preview" replace /></ProjectGuard>} />
                      <Route path="/creation" element={<ProjectGuard><Navigate to="/project-home" replace /></ProjectGuard>} />
                      <Route path="/workbench" element={<ProjectGuard><Navigate to="/workbench/script" replace /></ProjectGuard>} />
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

                      {/* 文件 */}
                      <Route path="/resources" element={<ResourcesPage />} />
                      <Route path="/jobs" element={<JobsPage />} />
                      <Route path="/plugins" element={<ClientPluginsPage />} />

                      {/* Agent */}
                      <Route path="/agent/debug" element={<AgentDebugPage />} />
                      <Route path="/agent/settings" element={<Navigate to="/agent/debug" replace />} />
                      <Route path="/agents" element={<Navigate to="/agent/debug" replace />} />

                      {/* 管理后台 — super_admin only */}
                      <Route path="/admin" element={<AdminGuard><Padded><AdminPage /></Padded></AdminGuard>} />
                      <Route path="/admin/ai-config" element={<Navigate to="/admin" replace />} />
                    </Routes>
                  </RouteErrorBoundary>
                </div>
              </main>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
