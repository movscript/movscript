import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  Atom,
  Badge,
  Blocks,
  Bot,
  BrainCircuit,
  Building2,
  Cable,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  CircleUserRound,
  ClipboardCheck,
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
  Layers3,
  LogOut,
  Move,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plug,
  Puzzle,
  Radar,
  Route,
  Scissors,
  ScanSearch,
  ScrollText,
  Settings,
  Shapes,
  Terminal,
  Telescope,
  ToyBrick,
  Truck,
  WandSparkles,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import { Avatar, AvatarFallback } from '@movscript/ui'
import { Button } from '@movscript/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movscript/ui'
import { loadClientPlugins } from '@/lib/clientPlugins'
import { openAdminConsole } from '@/lib/adminConsole'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { runtimeNavItems } from '@runtime'
import { ROUTES } from '@/routes/projectRoutes'

const SIDEBAR_COLLAPSED_KEY = 'movscript-sidebar-collapsed'
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
  Terminal,
  Telescope,
  ToyBrick,
]

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed = false,
  indent = false,
}: {
  to: string
  icon: LucideIcon
  label: string
  collapsed?: boolean
  indent?: boolean
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-md text-sm transition-colors',
          collapsed ? 'h-9 justify-center px-0' : 'gap-2.5 px-3 py-1.5',
          !collapsed && indent && 'ml-5',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )
      }
    >
      <Icon size={collapsed ? 16 : 15} className="shrink-0" />
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
        'flex w-full items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
        collapsed ? 'h-9 justify-center px-0' : 'gap-2.5 px-3 py-1.5'
      )}
    >
      <Icon size={collapsed ? 16 : 15} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

function Section({ title, defaultOpen = true, children, collapsed = false }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
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
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-muted-foreground transition-colors"
      >
        {title}
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const orgMemberships = useUserStore((s) => s.orgMemberships)
  const setCurrentOrg = useUserStore((s) => s.setCurrentOrg)
  const apiBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const currentMembership = orgMemberships.find((m) => m.org_id === currentOrgID)
  const isOrgAdmin = currentMembership && ['owner', 'admin'].includes(currentMembership.role)
  const nonPersonalOrgs = orgMemberships.filter((m) => !m.is_personal)

  const [installedPlugins, setInstalledPlugins] = useState<import('@/lib/clientPlugins').ClientPluginManifest[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })
  useEffect(() => { loadClientPlugins().then(setInstalledPlugins) }, [pathname])

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { }
      return next
    })
  }

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
    <aside className={cn(
      'bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 overflow-hidden transition-all duration-200',
      collapsed ? 'w-14' : 'w-56'
    )}>
      <div className="flex h-12 items-center gap-2 border-b border-sidebar-border px-2 shrink-0">
        {!collapsed && (
          <p className="flex-1 truncate px-2 text-xs font-bold text-foreground tracking-widest uppercase">Movscript</p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          title={collapsed ? t('common.expand') : t('common.collapse')}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </Button>
      </div>

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
                  <span className="text-sm text-foreground truncate flex-1">{current.name}</span>
                  <NavLink
                    to={ROUTES.projects}
                    className="text-xs text-muted-foreground hover:text-muted-foreground shrink-0 transition-colors"
                  >
                    {t('common.switch')}
                  </NavLink>
                </div>
              ) : (
                <NavLink
                  to={ROUTES.projects}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
              <NavItem to={ROUTES.project.production} icon={Factory} label={t('sidebar.items.projectProduction')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.tasks} icon={ListChecks} label={t('sidebar.items.productionTasks')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.delivery} icon={Truck} label={t('sidebar.items.delivery')} collapsed={collapsed} />
            </>
          )}
        </Section>

        {current && (
          <>
            <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />
            <Section title={t('sidebar.sections.workspace')} collapsed={collapsed}>
              <NavItem to={ROUTES.project.standards} icon={Layers3} label={t('sidebar.items.projectWorkspace')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.preProduction} icon={Telescope} label={t('sidebar.items.preProduction')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.productionOrchestration} icon={Route} label={t('sidebar.items.productionOrchestration')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.contentUnitWorkbench} icon={WandSparkles} label={t('sidebar.items.workbenchContentGeneration')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.deliveryWorkbench} icon={ClipboardCheck} label={t('sidebar.items.workbenchDelivery')} collapsed={collapsed} />
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
          <NavItem to={ROUTES.tools.videoEdit} icon={Scissors} label={t('sidebar.items.videoEdit')} collapsed={collapsed} />
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
          <NavItem to={ROUTES.agentDrafts} icon={ClipboardCheck} label={t('sidebar.items.aiDrafts')} collapsed={collapsed} />
          <NavItem to={ROUTES.agentSettings} icon={Settings} label={t('sidebar.items.agentSettings')} collapsed={collapsed} />
          <NavItem to={ROUTES.agentDebug} icon={Terminal} label={t('sidebar.items.agentDebug')} collapsed={collapsed} />
          <NavItem to={ROUTES.plugins} icon={Blocks} label={t('sidebar.items.plugins')} collapsed={collapsed} />
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
          {isOrgAdmin && (
            <NavItem to={ROUTES.orgSettings} icon={Settings} label={t('sidebar.items.orgSettings')} collapsed={collapsed} />
          )}
        </Section>

      </nav>

      {/* User footer */}
      {currentUser && (
        <div className={cn('border-t border-sidebar-border shrink-0', collapsed ? 'px-1.5 py-2' : 'px-2 py-2')}>
          {/* Org switcher row */}
          {!collapsed && currentMembership && nonPersonalOrgs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors mb-0.5">
                  <Building2 size={12} className="shrink-0" />
                  <span className="flex-1 truncate text-left font-medium">{currentMembership.org_name}</span>
                  <ChevronDown size={11} className="shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {orgMemberships.map((m) => (
                  <DropdownMenuItem
                    key={m.org_id}
                    onClick={() => { setCurrentOrg(m.org_id); setCurrent(null); navigate(ROUTES.projects) }}
                    className={cn(m.org_id === currentOrgID && 'font-medium')}
                  >
                    {m.is_personal ? <CircleUserRound size={13} className="mr-2 shrink-0" /> : <Building2 size={13} className="mr-2 shrink-0" />}
                    <span className="truncate">{m.org_name}</span>
                  </DropdownMenuItem>
                ))}
                {nonPersonalOrgs.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => navigate(ROUTES.orgSelect)}>
                  <Settings size={13} className="mr-2 shrink-0" />
                  {t('org.switchOrg')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* User row */}
          <div
            className={cn(
              'flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors rounded-md',
              collapsed ? 'justify-center px-0 py-2' : 'px-2 py-1.5'
            )}
            onClick={() => navigate(ROUTES.user)}
            title={collapsed ? currentUser.username : undefined}
          >
            <Avatar className="w-6 h-6 shrink-0">
              <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                {currentUser.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!collapsed && <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{currentUser.username}</p>
              <p className="text-xs text-muted-foreground truncate">
                {currentMembership
                  ? t(`org.roles.${currentMembership.role}`, { defaultValue: currentMembership.role })
                  : currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')
                }
              </p>
            </div>}
            {!collapsed && <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); setCurrentUser(null) }}
              className="text-muted-foreground hover:text-muted-foreground h-6 w-6 shrink-0"
              title={t('sidebar.logout')}
            >
              <LogOut size={13} />
            </Button>}
          </div>
        </div>
      )}
    </aside>
  )
}
