import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Bug, Building2, ChevronsLeft, ChevronsRight, CloudUpload, Database, FileText, FolderKanban, HardDrive, LogOut, Moon, Route as RouteIcon, ScrollText, Settings, Settings2, ShieldCheck, Sun, UsersRound, type LucideIcon } from 'lucide-react'
import { queryClient } from '@/lib/queryClient'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import AdminPage, { CloudFileConfigPage, FeatureConfigPage, ModelManagementPage, ProjectOwnerManagementPage, StoragePage } from '@admin/pages/admin/AdminPage'
import { AuditLogsPage } from '@admin/pages/admin/AuditLogsPage'
import { DebugPage } from '@admin/pages/admin/DebugPage'
import { UsageLogsPage } from '@admin/pages/admin/UsageLogsPage'
import { UserManagementPage } from '@admin/pages/admin/UserManagementPage'
import { OrgManagementPage } from '@admin/pages/admin/OrgManagementPage'
import { SystemSettingsPage } from '@admin/pages/admin/SystemSettingsPage'
import { runtimeNavItems, runtimeRoutes } from '@admin-runtime'
import { Toaster } from '@/components/ui/Toaster'
import { initTheme, useTheme } from '@/hooks/useTheme'
import { useTranslation } from 'react-i18next'
import '@/i18n'
import './styles.css'

initTheme()

function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useUserStore((s) => s.setSession)
  const currentUser = useUserStore((s) => s.currentUser)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
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
        setError(t('admin.login.superAdminRequired'))
        setSession(null)
        return
      }
      setSession(session)
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || t('admin.login.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-background text-foreground p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggleButton />
      </div>
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center">
        <form onSubmit={submit} className="w-full rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck size={20} />
            </div>
            <h1 className="text-xl font-semibold">Movscript Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('admin.login.description')}</p>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.login.username')}</span>
              <input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.login.password')}</span>
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
              {loading ? t('admin.login.loading') : t('admin.login.submit')}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

const baseNavItems: { to: string; labelKey: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', labelKey: 'admin.nav.overview', icon: Database, end: true },
  { to: '/models', labelKey: 'admin.tabs.models', icon: Settings2 },
  { to: '/features', labelKey: 'admin.tabs.features', icon: RouteIcon },
  { to: '/user-management', labelKey: 'admin.tabs.users', icon: UsersRound },
  { to: '/orgs', labelKey: 'admin.tabs.orgs', icon: Building2 },
  { to: '/projects', labelKey: 'admin.tabs.projects', icon: FolderKanban },
  { to: '/audit-logs', labelKey: 'admin.tabs.auditLogs', icon: ScrollText },
  { to: '/usage-logs', labelKey: 'admin.tabs.logs', icon: BarChart3 },
  { to: '/storage', labelKey: 'admin.tabs.storage', icon: HardDrive },
  { to: '/cloud-files', labelKey: 'admin.tabs.cloudFiles', icon: CloudUpload },
  { to: '/settings', labelKey: 'admin.tabs.settings', icon: Settings },
  { to: '/debug', labelKey: 'admin.tabs.debug', icon: Bug },
]

const adminBasename = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  ? '/admin'
  : undefined

const ADMIN_SIDEBAR_COLLAPSED_KEY = 'movscript-admin-sidebar-collapsed'

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
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? t('admin.shell.lightMode') : t('admin.shell.darkMode')

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      title={label}
      aria-label={label}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const user = useUserStore((s) => s.currentUser)
  const location = useLocation()
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === 'true'
  })

  React.useEffect(() => {
    window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  if (!user || getSystemRole(user) !== 'super_admin') return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const navItems = [
    ...baseNavItems.map((item) => ({ ...item, label: t(item.labelKey) })),
    ...runtimeNavItems,
  ]
  const sidebarToggleLabel = collapsed ? t('admin.shell.expandSidebar') : t('admin.shell.collapseSidebar')
  const logoutLabel = t('admin.shell.logout')

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className={cn(
        'flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}>
        <div className={cn(
          'flex h-12 items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-3',
        )}>
          <div className={cn('flex min-w-0 items-center gap-2', collapsed && 'hidden')}>
            <ShieldCheck size={17} className="shrink-0" />
            <span className="truncate text-sm font-semibold">Movscript Admin</span>
          </div>
          <div className="flex items-center gap-1">
            {!collapsed && <ThemeToggleButton />}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((value) => !value)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title={sidebarToggleLabel}
              aria-label={sidebarToggleLabel}
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </Button>
          </div>
        </div>
        <nav className={cn('flex-1 space-y-1 overflow-y-auto', collapsed ? 'p-1.5' : 'p-2')}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                'flex items-center rounded-md text-sm transition-colors',
                collapsed ? 'h-10 justify-center px-0' : 'gap-2 px-3 py-2',
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={15} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className={cn('border-t border-border', collapsed ? 'p-1.5' : 'p-2')}>
          {!collapsed && (
            <div className="mb-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <FileText size={13} className="shrink-0" />
              <span className="truncate">{user.username}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCurrentUser(null)}
            className={cn(
              'flex w-full items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
              collapsed ? 'h-10 justify-center px-0' : 'gap-2 px-3 py-2',
            )}
            title={collapsed ? logoutLabel : undefined}
            aria-label={logoutLabel}
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && logoutLabel}
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
        <Route path="/user-management" element={<AdminShell><UserManagementPage /></AdminShell>} />
        <Route path="/orgs" element={<AdminShell><OrgManagementPage /></AdminShell>} />
        <Route path="/projects" element={<AdminShell><ProjectOwnerManagementPage /></AdminShell>} />
        <Route path="/audit-logs" element={<AdminShell><AuditLogsPage /></AdminShell>} />
        <Route path="/usage-logs" element={<AdminShell><UsageLogsPage /></AdminShell>} />
        <Route path="/storage" element={<AdminShell><StoragePage /></AdminShell>} />
        <Route path="/cloud-files" element={<AdminShell><CloudFileConfigPage /></AdminShell>} />
        <Route path="/settings" element={<AdminShell><SystemSettingsPage /></AdminShell>} />
        {runtimeRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={<AdminShell>{route.element}</AdminShell>} />
        ))}
        <Route path="/debug" element={<AdminShell><DebugPage /></AdminShell>} />
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
