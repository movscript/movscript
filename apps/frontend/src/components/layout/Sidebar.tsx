import { useState, useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  Atom,
  Badge,
  Bot,
  BrainCircuit,
  Building2,
  Cable,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  CircleUserRound,
  ExternalLink,
  Component,
  Factory,
  FlaskConical,
  FolderArchive,
  FolderOpen,
  Gem,
  Hammer,
  Home,
  Images,
  ListChecks,
  ListTodo,
  LogOut,
  Move,
  Palette,
  Plug,
  Puzzle,
  Radar,
  ScanSearch,
  ScrollText,
  Shapes,
  Telescope,
  ToyBrick,
  Truck,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import { Avatar, AvatarFallback } from '@movscript/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movscript/ui'
import { loadClientPlugins } from '@/lib/clientPlugins'
import { openAdminConsole } from '@/lib/adminConsole'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { runtimeNavItems } from '@runtime'
import { projectWorkbenchDefinitions } from '@/pages/project/projectSurfaces'
import { ROUTES } from '@/routes/projectRoutes'

const PLUGIN_NAV_ICONS: LucideIcon[] = [
  Puzzle,
  Plug,
  Cable,
  Component,
  Wrench,
  Bot,
  Atom,
  Badge,
  FlaskConical,
  Gem,
  Hammer,
  Radar,
  ScanSearch,
  Telescope,
  ToyBrick,
]

export const SIDEBAR_WIDTH_STORAGE_KEY = 'movscript-sidebar-width'
export const SIDEBAR_DEFAULT_WIDTH = 216
export const SIDEBAR_MIN_WIDTH = 176
export const SIDEBAR_MAX_WIDTH = 312

export function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed = false,
  indent = false,
  end = false,
}: {
  to: string
  icon: LucideIcon
  label: string
  collapsed?: boolean
  indent?: boolean
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-md type-body-sm transition-colors',
          collapsed ? 'h-9 justify-center px-0' : 'gap-2.5 px-3 py-1.5',
          !collapsed && indent && 'ml-5',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )
      }
    >
      <Icon size={14} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

function ActionNavItem({
  icon: Icon,
  label,
  collapsed = false,
  onClick,
}: {
  icon: LucideIcon
  label: string
  collapsed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center rounded-md type-body-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
        collapsed ? 'h-9 justify-center px-0' : 'gap-2.5 px-3 py-1.5'
      )}
    >
      <Icon size={14} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

function Section({ title, defaultOpen = true, children, collapsed = false }: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (collapsed) {
    return <div className="mb-1 space-y-0.5">{children}</div>
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 type-caption font-semibold text-muted-foreground uppercase tracking-wider hover:text-muted-foreground transition-colors"
      >
        {title}
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

interface SidebarProps {
  collapsed?: boolean
  width?: number
}

export function Sidebar({
  collapsed = false,
  width = SIDEBAR_DEFAULT_WIDTH,
}: SidebarProps) {
  const { t } = useTranslation()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const orgMemberships = useUserStore((s) => s.orgMemberships)
  const apiBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const currentMembership = orgMemberships.find((m) => m.org_id === currentOrgID)

  const [installedPlugins, setInstalledPlugins] = useState<import('@/lib/clientPlugins').ClientPluginManifest[]>([])
  useEffect(() => { loadClientPlugins().then(setInstalledPlugins) }, [pathname])


  const { isError: projectNotFound } = useQuery({
    queryKey: ['project', current?.ID],
    queryFn: () => api.get(`/projects/${current!.ID}`).then((r) => r.data),
    enabled: !!current,
    retry: false,
  })

  useEffect(() => {
    if (projectNotFound && current) setCurrent(null)
  }, [projectNotFound, current, setCurrent])

  return (
    <aside
      className={cn(
        'relative bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 overflow-hidden',
        'transition-[width] duration-200',
        collapsed && 'w-11'
      )}
      style={collapsed ? undefined : { width }}
    >
      {!collapsed && (
        <div className="flex shrink-0 items-center border-b border-sidebar-border px-2 py-1.5">
          <span className="min-w-0 truncate px-1 type-caption font-semibold text-muted-foreground">
            {t('sidebar.title', { defaultValue: '导航' })}
          </span>
        </div>
      )}
      <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-1.5' : 'px-2')}>

        {/* Project */}
        <Section title={t('sidebar.sections.project')} collapsed={collapsed}>
          {collapsed ? (
            <NavItem
              to={ROUTES.projects}
              icon={FolderOpen}
              label={current ? current.name : t('common.selectProject')}
              collapsed
            />
          ) : (
            <div className="px-3 py-1 mb-0.5">
              {current ? (
                <div className="flex items-center gap-2">
                  <FolderOpen size={13} className="text-muted-foreground shrink-0" />
                  <span className="type-body-sm text-foreground truncate flex-1">{current.name}</span>
                  <NavLink
                    to={ROUTES.projects}
                    className="type-caption text-muted-foreground hover:text-muted-foreground shrink-0 transition-colors"
                  >
                    {t('common.switch')}
                  </NavLink>
                </div>
              ) : (
                <NavLink
                  to={ROUTES.projects}
                  className="flex items-center gap-2 type-body-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <FolderOpen size={13} className="shrink-0" />
                  <span>{t('common.selectProject')}</span>
                </NavLink>
              )}
            </div>
          )}

          {current && (
            <>
              <NavItem to={ROUTES.project.overview} icon={Home} label={t('sidebar.items.projectHome')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.scripts} icon={ScrollText} label={t('sidebar.items.script')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.production} icon={Factory} label={t('sidebar.items.projectProduction')} collapsed={collapsed} end />
              <NavItem to={ROUTES.project.tasks} icon={ListChecks} label={t('sidebar.items.productionTasks')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.delivery} icon={Truck} label={t('sidebar.items.delivery')} collapsed={collapsed} end />
            </>
          )}
        </Section>

        {current && (
          <>
            <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />
            <Section title={t('sidebar.sections.workspace')} collapsed={collapsed}>
              {projectWorkbenchDefinitions.map((item) => (
                <NavItem key={item.id} to={item.route} icon={item.icon} label={t(item.sidebarTitleKey)} collapsed={collapsed} />
              ))}
            </Section>
          </>
        )}

        <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />

        {/* Tools */}
        <Section title={t('sidebar.sections.tools')} collapsed={collapsed}>
          <NavItem to={ROUTES.canvases} icon={AppWindow} label={t('sidebar.items.canvas')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.refImageGen} icon={Images} label={t('sidebar.items.refImageGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.refVideoGen} icon={CirclePlay} label={t('sidebar.items.refVideoGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.motionImitation} icon={Move} label={t('sidebar.items.motionImitation')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.styleTransfer} icon={Palette} label={t('sidebar.items.styleTransfer')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.multiAngle} icon={Shapes} label={t('sidebar.items.multiAngle')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.brainstorm} icon={BrainCircuit} label={t('sidebar.items.brainstorm')} collapsed={collapsed} />
          {installedPlugins.map((plugin, index) => (
            <NavItem key={plugin.id} to={`/tools/plugin/${encodeURIComponent(plugin.id)}`} icon={PLUGIN_NAV_ICONS[index % PLUGIN_NAV_ICONS.length]} label={plugin.name} collapsed={collapsed} />
          ))}
        </Section>

        <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />

        {/* Files */}
        <Section title={t('sidebar.sections.files')} collapsed={collapsed}>
          <NavItem to={ROUTES.resources} icon={FolderArchive} label={t('sidebar.items.resources')} collapsed={collapsed} />
          <NavItem to={ROUTES.jobs} icon={ListTodo} label={t('sidebar.items.jobs')} collapsed={collapsed} />
        </Section>

        <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />

        {/* Manage */}
        <Section title={t('sidebar.sections.manage')} collapsed={collapsed}>
          <NavItem to={ROUTES.orgSelect} icon={Building2} label={t('sidebar.items.workspace')} collapsed={collapsed} />
          <NavItem to={ROUTES.agentConsole} icon={Bot} label={t('sidebar.items.agentConsole')} collapsed={collapsed} />
          {runtimeNavItems.filter((item) => (item.section ?? 'manage') === 'manage').map((item) => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} collapsed={collapsed} />
          ))}
          {currentUser?.system_role === 'super_admin' && (
            <ActionNavItem
              icon={ExternalLink}
              label={t('sidebar.items.adminConsole')}
              collapsed={collapsed}
              onClick={() => void openAdminConsole(apiBaseURL)}
            />
          )}
        </Section>

      </nav>

      {/* User footer */}
      {currentUser && (
        <div className={cn('border-t border-sidebar-border shrink-0', collapsed ? 'px-1.5 py-2' : 'px-2 py-2')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-muted/50',
                  collapsed ? 'justify-center px-0 py-2' : 'px-2 py-1.5'
                )}
                title={collapsed ? currentUser.username : undefined}
              >
                <Avatar className="w-6 h-6 shrink-0">
                  <AvatarFallback className="bg-muted text-muted-foreground type-caption font-semibold">
                    {currentUser.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && <div className="flex-1 min-w-0">
                  <p className="type-caption font-medium text-foreground truncate">{currentUser.username}</p>
                  <p className="type-tiny text-muted-foreground truncate">
                    {currentMembership?.org_name
                      ?? (currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user'))}
                  </p>
                </div>}
                {!collapsed && <ChevronDown size={12} className="shrink-0 text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={() => navigate(ROUTES.user)}>
                <CircleUserRound size={14} className="mr-2 shrink-0" />
                {t('header.titles.user')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCurrentUser(null)}>
                <LogOut size={14} className="mr-2 shrink-0" />
                {t('sidebar.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </aside>
  )
}
