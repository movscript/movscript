import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Bug, Building2, ChevronsLeft, ChevronsRight, CloudUpload, Database, FileText, FolderKanban, HardDrive, Palette, ScrollText, Settings, Settings2, ShieldCheck, UsersRound, type LucideIcon } from 'lucide-react'
import { queryClient } from '@/lib/queryClient'
import { useUserStore, type AuthSession } from '@/store/userStore'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AppFeedbackText } from '@movscript/ui/business/app'
import { UiDebugInspector } from '@movscript/ui/debug'
import { AppWindowControls, AppWindowHeader, AppWindowMacTrafficLights } from '@movscript/ui/layout'
import { Button } from '@movscript/ui/primitives'
import AdminPage, { CloudFileConfigPage, ModelManagementPage, ProjectOwnerManagementPage, StoragePage } from '@admin/pages/admin/AdminPage'
import { AuditLogsPage } from '@admin/pages/admin/AuditLogsPage'
import { DebugPage } from '@admin/pages/admin/DebugPage'
import { UsageLogsPage } from '@admin/pages/admin/UsageLogsPage'
import { UserManagementPage } from '@admin/pages/admin/UserManagementPage'
import { OrgManagementPage } from '@admin/pages/admin/OrgManagementPage'
import { ShotVectorPage } from '@admin/pages/admin/ShotVectorPage'
import { SystemSettingsPage } from '@admin/pages/admin/SystemSettingsPage'
import { runtimeCapabilities, runtimeNavItems, runtimeRoutes } from '@admin-runtime'
import { Toaster } from '@/components/ui/Toaster'
import { initTheme, useTheme } from '@/hooks/useTheme'
import { APP_SETTINGS_STORAGE_KEY, normalizeAPIBaseURL } from '@/lib/config'
import { useTranslation } from 'react-i18next'
import i18n, { type SupportedLanguage } from '@/i18n'
import { isMovScriptThemeName, setMovScriptTheme, type MovScriptThemeName } from '@movscript/theme'
import './styles.css'

const adminLaunchContext = readAdminLaunchContextFromHash()
applyAdminLaunchContext(adminLaunchContext)
initTheme()
bootstrapElectronAdminSession(adminLaunchContext)

type AdminLaunchContext = (AuthSession & {
  current_org_id?: number | null
  api_base_url?: string | null
  theme?: MovScriptThemeName | null
  language?: SupportedLanguage | null
}) | null

function bootstrapElectronAdminSession(session: AdminLaunchContext) {
  if (typeof window === 'undefined') return
  if (!session?.token || !session.user) return
  const store = useUserStore.getState()
  store.setSession(session)
  if (typeof session.current_org_id === 'number') {
    store.setCurrentOrg(session.current_org_id)
  }
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  hash.delete('authSession')
  url.hash = hash.toString()
  window.history.replaceState(null, '', url.toString())
}

function applyAdminLaunchContext(session: AdminLaunchContext) {
  if (!session) return
  if (isMovScriptThemeName(session.theme)) {
    setMovScriptTheme(session.theme)
  }
  if (session.language === 'zh-CN' || session.language === 'en-US') {
    void i18n.changeLanguage(session.language)
  }
  persistLaunchContextAPIBaseURL(session.api_base_url)
}

function persistLaunchContextAPIBaseURL(apiBaseURL: unknown) {
  if (typeof window === 'undefined' || typeof apiBaseURL !== 'string' || !apiBaseURL.trim()) return
  try {
    const normalized = normalizeAPIBaseURL(apiBaseURL)
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const state = parsed && typeof parsed === 'object' && 'state' in parsed
      ? {
          ...(parsed as { state?: { settings?: Record<string, unknown> } }).state,
          settings: {
            ...((parsed as { state?: { settings?: Record<string, unknown> } }).state?.settings ?? {}),
            apiBaseURL: normalized,
          },
        }
      : undefined
    const next = state
      ? { ...(parsed as Record<string, unknown>), state }
      : { ...(parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}), apiBaseURL: normalized }
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({ apiBaseURL: normalizeAPIBaseURL(apiBaseURL) }))
  }
}

function readAdminLaunchContextFromHash(): AdminLaunchContext {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const encoded = hash.get('authSession')
    if (!encoded) return null
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = decodeURIComponent(Array.from(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useUserStore((s) => s.setSession)
  const currentUser = useUserStore((s) => s.currentUser)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [bootstrapRequired, setBootstrapRequired] = React.useState(false)
  const redirectTo = resolveLoginRedirect(location.state)

  React.useEffect(() => {
    let cancelled = false
    api.get('/auth/config')
      .then((response) => {
        if (!cancelled) setBootstrapRequired(!!response.data?.bootstrap_required)
      })
      .catch(() => {
        if (!cancelled) setBootstrapRequired(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (getSystemRole(currentUser) === 'super_admin') {
      navigate(redirectTo, { replace: true })
    }
  }, [currentUser, navigate, redirectTo])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (bootstrapRequired && password !== confirmPassword) {
      setError(t('admin.login.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      const response = bootstrapRequired
        ? await api.post('/auth/register', { username, password, localAdmin: true })
        : await api.post('/auth/login', { username, password })
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
            <p className="mt-1 text-sm text-muted-foreground">
              {bootstrapRequired ? t('admin.login.bootstrapDescription') : t('admin.login.description')}
            </p>
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
            {bootstrapRequired && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.login.confirmPassword')}</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                />
              </label>
            )}
            {error && <AppFeedbackText>{error}</AppFeedbackText>}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password || (bootstrapRequired && !confirmPassword)}
              className="h-9 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t('admin.login.loading') : bootstrapRequired ? t('admin.login.bootstrapSubmit') : t('admin.login.submit')}
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
  { to: '/user-management', labelKey: 'admin.tabs.users', icon: UsersRound },
  { to: '/orgs', labelKey: 'admin.tabs.orgs', icon: Building2 },
  { to: '/projects', labelKey: 'admin.tabs.projects', icon: FolderKanban },
  { to: '/audit-logs', labelKey: 'admin.tabs.auditLogs', icon: ScrollText },
  { to: '/usage-logs', labelKey: 'admin.tabs.logs', icon: BarChart3 },
  { to: '/shot-vectors', labelKey: 'admin.tabs.shotVectors', icon: Database },
  { to: '/storage', labelKey: 'admin.tabs.storage', icon: HardDrive },
  { to: '/cloud-files', labelKey: 'admin.tabs.cloudFiles', icon: CloudUpload },
  { to: '/settings', labelKey: 'admin.tabs.settings', icon: Settings },
  { to: '/debug', labelKey: 'admin.tabs.debug', icon: Bug },
]

const runtimeRoutePaths = new Set(runtimeRoutes.map((route) => route.path))
const runtimeNavPaths = new Set(runtimeNavItems.map((item) => item.to))

const adminBasename = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  ? '/admin'
  : undefined

const ADMIN_SIDEBAR_COLLAPSED_KEY = 'movscript-admin-sidebar-collapsed'
const ADMIN_SIDEBAR_WIDTH_STORAGE_KEY = 'movscript-admin-sidebar-width'
const ADMIN_SIDEBAR_DEFAULT_WIDTH = 224
const ADMIN_SIDEBAR_MIN_WIDTH = 184
const ADMIN_SIDEBAR_MAX_WIDTH = 340
const DEFAULT_WINDOW_STATE: ElectronWindowState = { fullscreen: false, focused: true }

type ElectronWindowControlAction = 'close' | 'minimize' | 'toggleFullscreen'
type ElectronWindowState = {
  fullscreen: boolean
  focused: boolean
}
type ElectronAPI = {
  platform?: string
  windowControl?: (action: ElectronWindowControlAction) => Promise<ElectronWindowState | undefined>
  getWindowState?: () => Promise<ElectronWindowState>
  onWindowState?: (handler: (state: ElectronWindowState) => void) => () => void
}

function clampAdminSidebarWidth(width: number) {
  return Math.min(ADMIN_SIDEBAR_MAX_WIDTH, Math.max(ADMIN_SIDEBAR_MIN_WIDTH, width))
}

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
  const { themeMeta, nextThemeMeta, toggleTheme } = useTheme()
  const label = `${themeMeta.label} -> ${nextThemeMeta.label}`

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
      <Palette size={14} />
    </Button>
  )
}

function useAdminWindowController() {
  const electronApi = readElectronApi()
  const platform = electronApi?.platform
  const isMacOS = platform === undefined || platform === 'darwin'
  const [windowState, setWindowState] = React.useState<ElectronWindowState>(DEFAULT_WINDOW_STATE)

  const windowControl = React.useCallback((action: ElectronWindowControlAction) => {
    void electronApi?.windowControl?.(action).then((state) => {
      if (state) setWindowState(state)
    })
  }, [electronApi])

  React.useEffect(() => {
    if (!isMacOS || !electronApi) return undefined
    void electronApi.getWindowState?.().then((state) => {
      if (state) setWindowState(state)
    })
    return electronApi.onWindowState?.((state) => setWindowState(state))
  }, [electronApi, isMacOS])

  return { isMacOS, windowControl, windowState }
}

function readElectronApi() {
  if (typeof window === 'undefined') return undefined
  return (window as typeof window & { api?: ElectronAPI }).api
}

function AdminWindowHeader() {
  const { t } = useTranslation()
  const { isMacOS, windowControl, windowState } = useAdminWindowController()
  return (
    <AppWindowHeader
      isMacOS={isMacOS}
      windowControls={isMacOS ? (
        <AppWindowMacTrafficLights
          focused={windowState.focused}
          fullscreen={windowState.fullscreen}
          closeLabel={t('common.close')}
          minimizeLabel={t('admin.shell.minimizeWindow', { defaultValue: '最小化' })}
          fullscreenLabel={t('admin.shell.fullscreenWindow', { defaultValue: '进入全屏' })}
          restoreLabel={t('admin.shell.restoreWindow', { defaultValue: '退出全屏' })}
          onClose={() => windowControl('close')}
          onMinimize={() => windowControl('minimize')}
          onToggleFullscreen={() => windowControl('toggleFullscreen')}
        />
      ) : undefined}
      controls={!isMacOS ? (
        <AppWindowControls>
          <Button type="button" variant="ghost" size="sm" onClick={() => windowControl('close')}>
            {t('common.close')}
          </Button>
        </AppWindowControls>
      ) : undefined}
      centerContent={<div className="text-xs font-medium text-muted-foreground">Movscript Admin</div>}
    />
  )
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const user = useUserStore((s) => s.currentUser)
  const location = useLocation()
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === 'true'
  })
  const resizeStart = React.useRef({ x: 0, width: ADMIN_SIDEBAR_DEFAULT_WIDTH })
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    if (typeof window === 'undefined') return ADMIN_SIDEBAR_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(ADMIN_SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAdminSidebarWidth(saved) : ADMIN_SIDEBAR_DEFAULT_WIDTH
  })
  const [resizing, setResizing] = React.useState(false)

  React.useEffect(() => {
    window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  React.useEffect(() => {
    if (collapsed) return
    window.localStorage.setItem(ADMIN_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [collapsed, sidebarWidth])

  React.useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeStart.current.x
      setSidebarWidth(clampAdminSidebarWidth(resizeStart.current.width + delta))
    }
    const handlePointerUp = () => setResizing(false)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizing])

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return
    event.preventDefault()
    resizeStart.current = { x: event.clientX, width: sidebarWidth }
    setResizing(true)
  }

  const adjustSidebarWidth = (delta: number) => {
    setSidebarWidth((width) => clampAdminSidebarWidth(width + delta))
  }

  if (!user || getSystemRole(user) !== 'super_admin') return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const navItems = [
    ...baseNavItems
      .filter((item) => !(runtimeCapabilities.hideModelManagement && item.to === '/models'))
      .filter((item) => !runtimeNavPaths.has(item.to))
      .map((item) => ({ ...item, label: t(item.labelKey) })),
    ...runtimeNavItems,
  ]
  const sidebarToggleLabel = collapsed ? t('admin.shell.expandSidebar') : t('admin.shell.collapseSidebar')

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AdminWindowHeader />
      <div className="flex min-h-0 flex-1">
      <aside className={cn(
        'relative flex shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar',
        resizing ? '' : 'transition-[width] duration-200',
        collapsed && 'w-14',
      )}
      style={collapsed ? undefined : { width: sidebarWidth }}
      >
        <div className={cn(
          'flex h-12 items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-3',
        )}>
          <div className={cn('flex min-w-0 items-center gap-2', collapsed && 'hidden')}>
            <ShieldCheck size={15} className="shrink-0" />
            <span className="truncate text-xs font-semibold">Movscript Admin</span>
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
              {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
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
                'flex items-center rounded-md text-xs transition-colors',
                collapsed ? 'h-10 justify-center px-0' : 'gap-2 px-3 py-2',
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={14} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className={cn('border-t border-border', collapsed ? 'p-1.5' : 'p-2')}>
          {!collapsed && (
            <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
              <FileText size={12} className="shrink-0" />
              <span className="truncate">{user.username}</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整左侧栏宽度"
            aria-valuemin={ADMIN_SIDEBAR_MIN_WIDTH}
            aria-valuemax={ADMIN_SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            className={cn(
              'absolute right-0 top-0 h-full w-2 translate-x-1 cursor-col-resize outline-none',
              'after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors',
              'hover:after:bg-border focus-visible:after:bg-ring',
              resizing && 'after:bg-ring',
            )}
            onPointerDown={startResize}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                adjustSidebarWidth(event.shiftKey ? -32 : -12)
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                adjustSidebarWidth(event.shiftKey ? 32 : 12)
              }
            }}
          />
        )}
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6">
        {children}
      </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter basename={adminBasename}>
      <Toaster />
      <UiDebugInspector />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AdminShell><AdminPage /></AdminShell>} />
        <Route path="/models" element={runtimeCapabilities.hideModelManagement ? <Navigate to={runtimeCapabilities.modelManagementRedirect || '/'} replace /> : <AdminShell><ModelManagementPage /></AdminShell>} />
        {!runtimeRoutePaths.has('/user-management') && (
          <Route path="/user-management" element={<AdminShell><UserManagementPage /></AdminShell>} />
        )}
        <Route path="/orgs" element={<AdminShell><OrgManagementPage /></AdminShell>} />
        <Route path="/projects" element={<AdminShell><ProjectOwnerManagementPage /></AdminShell>} />
        <Route path="/audit-logs" element={<AdminShell><AuditLogsPage /></AdminShell>} />
        <Route path="/usage-logs" element={<AdminShell><UsageLogsPage /></AdminShell>} />
        <Route path="/shot-vectors" element={<AdminShell><ShotVectorPage /></AdminShell>} />
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
