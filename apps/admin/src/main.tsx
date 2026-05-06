import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Bot, Bug, CloudUpload, Database, FileText, FolderKanban, HardDrive, LogOut, Moon, Route as RouteIcon, ScrollText, Settings2, ShieldCheck, SlidersHorizontal, Sun, UsersRound } from 'lucide-react'
import { queryClient } from '@/lib/queryClient'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import AdminPage, { CloudFileConfigPage, FeatureConfigPage, ModelManagementPage, ProjectOwnerManagementPage, StoragePage, UsageLogsPage, UserManagementPage } from '@admin/pages/admin/AdminPage'
import AgentDebugPage from '@admin/pages/admin/AgentDebugPage'
import { DebugPage } from '@admin/pages/admin/DebugPage'
import { UIPreviewPage } from '@admin/pages/admin/UIPreviewPage'
import { Toaster } from '@/components/ui/Toaster'
import { initTheme, useTheme } from '@/hooks/useTheme'
import '@/i18n'
import './styles.css'

initTheme()

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useUserStore((s) => s.setSession)
  const currentUser = useUserStore((s) => s.currentUser)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [bootstrapName, setBootstrapName] = React.useState('')
  const [bootstrapPassword, setBootstrapPassword] = React.useState('')
  const [bootstrapConfirm, setBootstrapConfirm] = React.useState('')
  const [bootstrapError, setBootstrapError] = React.useState('')
  const [bootstrapSuccess, setBootstrapSuccess] = React.useState('')
  const [bootstrapLoading, setBootstrapLoading] = React.useState(false)
  const redirectTo = resolveLoginRedirect(location.state)

  React.useEffect(() => {
    if (getSystemRole(currentUser) === 'super_admin') {
      navigate(redirectTo, { replace: true })
    }
  }, [currentUser, navigate, redirectTo])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await api.post('/auth/login', { username, password })
      const session = response.data
      if (session?.user?.system_role !== 'super_admin' && session?.user?.systemRole !== 'super_admin') {
        setError('当前账号不是超级管理员。')
        setSession(null)
        return
      }
      setSession(session)
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || '登录失败。')
    } finally {
      setLoading(false)
    }
  }

  async function bootstrapLocalAdmin() {
    if (bootstrapLoading) return
    if (bootstrapPassword.length < 8 || bootstrapPassword !== bootstrapConfirm) {
      setBootstrapError(bootstrapPassword !== bootstrapConfirm ? '两次密码不一致。' : '密码至少需要 8 位。')
      return
    }
    setBootstrapError('')
    setBootstrapSuccess('')
    setBootstrapLoading(true)
    try {
      const response = await api.post('/auth/local-bootstrap', {
        displayName: bootstrapName.trim(),
        password: bootstrapPassword,
      })
      const session = response.data
      const resolvedUsername = session?.user?.username || 'local'
      setUsername(resolvedUsername)
      setPassword(bootstrapPassword)
      setBootstrapSuccess(`已重设本地管理员密码。登录用户名：${resolvedUsername}`)
      setSession(session)
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      setBootstrapError(err.response?.data?.message || err.response?.data?.error || '本地管理员重设失败。')
    } finally {
      setBootstrapLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-background text-foreground p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggleButton />
      </div>
      <div className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck size={20} />
            </div>
            <h1 className="text-xl font-semibold">Movscript Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">独立管理后台，只允许超级管理员访问。</p>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">用户名</span>
              <input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="h-9 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? '登录中' : '登录'}
            </button>
          </div>
        </form>

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Bot size={20} />
            </div>
            <h2 className="text-xl font-semibold">本地管理员恢复</h2>
            <p className="mt-1 text-sm text-muted-foreground">本地模式下可直接创建或重设 super admin 密码。</p>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">显示名称</span>
              <input
                value={bootstrapName}
                onChange={(event) => setBootstrapName(event.target.value)}
                placeholder="例如：钱"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">新密码</span>
              <input
                type="password"
                value={bootstrapPassword}
                onChange={(event) => setBootstrapPassword(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">确认密码</span>
              <input
                type="password"
                value={bootstrapConfirm}
                onChange={(event) => setBootstrapConfirm(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
            {bootstrapError && <p className="text-xs text-destructive">{bootstrapError}</p>}
            {bootstrapSuccess && <p className="text-xs text-emerald-600">{bootstrapSuccess}</p>}
            <button
              type="button"
              onClick={bootstrapLocalAdmin}
              disabled={bootstrapLoading || bootstrapPassword.length < 8 || bootstrapPassword !== bootstrapConfirm}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bootstrapLoading ? '处理中' : '创建 / 重设本地管理员'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

const navItems = [
  { to: '/', label: '总览', icon: Database, end: true },
  { to: '/models', label: '模型管理', icon: Settings2 },
  { to: '/features', label: '功能配置', icon: RouteIcon },
  { to: '/users', label: '用户管理', icon: UsersRound },
  { to: '/projects', label: '项目管理', icon: FolderKanban },
  { to: '/usage', label: '用量日志', icon: ScrollText },
  { to: '/storage', label: '资源存储', icon: HardDrive },
  { to: '/cloud-files', label: '输入中转', icon: CloudUpload },
  { to: '/agent-debug', label: 'Agent 调试', icon: Bot },
  { to: '/debug', label: '调试', icon: Bug },
  { to: '/ui-preview', label: 'UI 预览', icon: SlidersHorizontal },
]

const adminBasename = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  ? '/admin'
  : undefined

function getSystemRole(user: unknown): string | undefined {
  if (!user || typeof user !== 'object') return undefined
  const candidate = user as { system_role?: string; systemRole?: string }
  return candidate.system_role ?? candidate.systemRole
}

function resolveLoginRedirect(state: unknown): string {
  const from = state && typeof state === 'object'
    ? (state as { from?: unknown }).from
    : undefined
  if (typeof from !== 'string' || !from.startsWith('/') || from === '/login') {
    return '/'
  }
  return from
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const user = useUserStore((s) => s.currentUser)
  const location = useLocation()

  if (!user || getSystemRole(user) !== 'super_admin') return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex h-12 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} />
            <span className="text-sm font-semibold">Movscript Admin</span>
          </div>
          <ThemeToggleButton />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <item.icon size={15} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-2">
          <div className="mb-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <FileText size={13} />
            <span className="truncate">{user.username}</span>
          </div>
          <button
            type="button"
            onClick={() => setCurrentUser(null)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <LogOut size={15} />
            退出登录
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter basename={adminBasename}>
      <Toaster />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AdminShell><AdminPage /></AdminShell>} />
        <Route path="/models" element={<AdminShell><ModelManagementPage /></AdminShell>} />
        <Route path="/features" element={<AdminShell><FeatureConfigPage /></AdminShell>} />
        <Route path="/users" element={<AdminShell><UserManagementPage /></AdminShell>} />
        <Route path="/projects" element={<AdminShell><ProjectOwnerManagementPage /></AdminShell>} />
        <Route path="/usage" element={<AdminShell><UsageLogsPage /></AdminShell>} />
        <Route path="/storage" element={<AdminShell><StoragePage /></AdminShell>} />
        <Route path="/cloud-files" element={<AdminShell><CloudFileConfigPage /></AdminShell>} />
        <Route path="/agent-debug" element={<AdminShell><AgentDebugPage /></AdminShell>} />
        <Route path="/debug" element={<AdminShell><DebugPage /></AdminShell>} />
        <Route path="/ui-preview" element={<AdminShell><UIPreviewPage /></AdminShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
