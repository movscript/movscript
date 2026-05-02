import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Bug,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Film,
  FolderOpen,
  GitBranch,
  ImagePlus,
  LayoutTemplate,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Move,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Puzzle,
  Scissors,
  ShieldAlert,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import { Avatar, AvatarFallback } from '@movscript/ui'
import { Button } from '@movscript/ui'
import { loadClientPlugins } from '@/lib/clientPlugins'

const SIDEBAR_COLLAPSED_KEY = 'movscript-sidebar-collapsed'

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
  const navigate = useNavigate()
  const { pathname } = useLocation()

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
              to="/projects"
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
                    to="/projects"
                    className="text-xs text-muted-foreground hover:text-muted-foreground shrink-0 transition-colors"
                  >
                    {t('common.switch')}
                  </NavLink>
                </div>
              ) : (
                <NavLink
                  to="/projects"
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
              <NavItem to="/project-home" icon={LayoutDashboard} label={t('sidebar.items.projectHome')} collapsed={collapsed} />
              <NavItem to="/scripts" icon={FileText} label={t('sidebar.items.script')} collapsed={collapsed} />
              <NavItem to="/production" icon={Boxes} label={t('sidebar.items.projectProduction')} collapsed={collapsed} />
              <NavItem to="/collaboration" icon={ClipboardList} label={t('sidebar.items.productionTasks')} collapsed={collapsed} />
              <NavItem to="/delivery" icon={Video} label={t('sidebar.items.delivery')} collapsed={collapsed} />
            </>
          )}
        </Section>

        {current && (
          <>
            <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />
            <Section title={t('sidebar.sections.contentArea')} collapsed={collapsed}>
              <NavItem to="/segments" icon={Film} label={t('sidebar.items.segments')} collapsed={collapsed} />
              <NavItem to="/scene-moments" icon={Film} label={t('sidebar.items.sceneMoments')} collapsed={collapsed} />
              <NavItem to="/creative-references" icon={Sparkles} label={t('sidebar.items.references')} collapsed={collapsed} />
              <NavItem to="/assets" icon={PackageCheck} label={t('sidebar.items.assets')} collapsed={collapsed} />
              <NavItem to="/reference-relations" icon={GitBranch} label={t('sidebar.items.relations')} collapsed={collapsed} />
              <NavItem to="/contents" icon={Boxes} label={t('sidebar.items.content')} collapsed={collapsed} />
            </Section>

            <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />
            <Section title={t('sidebar.sections.workspace')} collapsed={collapsed}>
              <NavItem to="/workbench/production-plan" icon={Film} label={t('sidebar.items.workbenchProjectPreview')} collapsed={collapsed} />
              <NavItem to="/workbench/assets" icon={PackageCheck} label={t('sidebar.items.workbenchAssetPreparation')} collapsed={collapsed} />
              <NavItem to="/workbench/production" icon={Wand2} label={t('sidebar.items.workbenchContentGeneration')} collapsed={collapsed} />
            </Section>
          </>
        )}

        <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />

        {/* Tools */}
        <Section title={t('sidebar.sections.tools')} collapsed={collapsed}>
          <NavItem to="/canvases" icon={LayoutTemplate} label={t('sidebar.items.canvas')} collapsed={collapsed} />
          <NavItem to="/tools/ref-image-gen" icon={ImagePlus} label={t('sidebar.items.refImageGen')} collapsed={collapsed} />
          <NavItem to="/tools/ref-video-gen" icon={Video} label={t('sidebar.items.refVideoGen')} collapsed={collapsed} />
          <NavItem to="/tools/motion-imitation" icon={Move} label={t('sidebar.items.motionImitation')} collapsed={collapsed} />
          <NavItem to="/tools/style-transfer" icon={Palette} label={t('sidebar.items.styleTransfer')} collapsed={collapsed} />
          <NavItem to="/tools/multi-angle" icon={Boxes} label={t('sidebar.items.multiAngle')} collapsed={collapsed} />
          <NavItem to="/tools/video-edit" icon={Scissors} label={t('sidebar.items.videoEdit')} collapsed={collapsed} />
          <NavItem to="/tools/brainstorm" icon={MessageSquare} label={t('sidebar.items.brainstorm')} collapsed={collapsed} />
          {installedPlugins.map((plugin) => (
            <NavItem key={plugin.id} to={`/tools/plugin/${encodeURIComponent(plugin.id)}`} icon={Puzzle} label={plugin.name} collapsed={collapsed} />
          ))}
        </Section>

        <div className={cn('border-t border-border my-2', collapsed && 'mx-2')} />

        {/* Manage */}
        <Section title={t('sidebar.sections.manage')} collapsed={collapsed}>
          <NavItem to="/plugins" icon={Puzzle} label={t('sidebar.items.plugins')} collapsed={collapsed} />
          <NavItem to="/agent/debug" icon={Bug} label={t('sidebar.items.agentDebug')} collapsed={collapsed} />
          {currentUser?.system_role === 'super_admin' && (
            <NavItem to="/admin" icon={ShieldAlert} label={t('sidebar.items.admin')} collapsed={collapsed} />
          )}
        </Section>

      </nav>

      {/* User footer */}
      {currentUser && (
        <div
          className={cn(
            'border-t border-sidebar-border flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors shrink-0',
            collapsed ? 'justify-center px-2 py-3' : 'px-3 py-3'
          )}
          onClick={() => navigate('/user')}
          title={collapsed ? currentUser.username : undefined}
        >
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
              {currentUser.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{currentUser.username}</p>
            <p className="text-xs text-muted-foreground truncate">
              {currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
            </p>
          </div>}
          {!collapsed && <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setCurrentUser(null) }}
            className="text-muted-foreground hover:text-muted-foreground h-7 w-7 shrink-0"
            title={t('sidebar.logout')}
          >
            <LogOut size={14} />
          </Button>}
        </div>
      )}
    </aside>
  )
}
