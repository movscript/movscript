import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  Atom,
  Bot,
  BrainCircuit,
  Cable,
  Clapperboard,
  CirclePlay,
  Component,
  FlaskConical,
  FolderArchive,
  FolderOpen,
  Gem,
  Hammer,
  Home,
  Images,
  ListChecks,
  ListTodo,
  Move,
  Palette,
  Plug,
  Puzzle,
  Radar,
  ScanSearch,
  ScrollText,
  Shapes,
  Telescope,
  Tag,
  ToyBrick,
  Truck,
  Video,
  Wrench,
} from 'lucide-react'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { api } from '@/shared/infrastructure/api'
import {
  APP_SIDEBAR_DEFAULT_WIDTH,
  APP_SIDEBAR_MAX_WIDTH,
  APP_SIDEBAR_MIN_WIDTH,
  APP_SIDEBAR_WIDTH_STORAGE_KEY,
  AppSidebarDivider,
  AppSidebarHeader,
  AppSidebarNav,
  AppSidebarNavItemFrame,
  AppSidebarNavItemContent,
  AppSidebarProjectCurrent,
  AppSidebarProjectRow,
  AppSidebarSection,
  AppSidebarShell,
  PanelResizeHandle,
  clampAppSidebarWidth,
  useResizablePanel,
} from '@movscript/ui'
import { loadClientPlugins } from '@/features/plugins/application/clientPlugins'
import { projectWorkbenchDefinitions } from '@/features/project-workbenches/domain/projectWorkbenchRegistry'
import { ROUTES } from '@/routes/projectRoutes'

const PLUGIN_NAV_ICONS: LucideIcon[] = [
  Puzzle,
  Plug,
  Cable,
  Component,
  Wrench,
  Bot,
  Atom,
  Tag,
  FlaskConical,
  Gem,
  Hammer,
  Radar,
  ScanSearch,
  Telescope,
  ToyBrick,
]

export const SIDEBAR_WIDTH_STORAGE_KEY = APP_SIDEBAR_WIDTH_STORAGE_KEY
export const SIDEBAR_DEFAULT_WIDTH = APP_SIDEBAR_DEFAULT_WIDTH
export const SIDEBAR_MIN_WIDTH = APP_SIDEBAR_MIN_WIDTH
export const SIDEBAR_MAX_WIDTH = APP_SIDEBAR_MAX_WIDTH

export function clampSidebarWidth(width: number) {
  return clampAppSidebarWidth(width)
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
    >
      {({ isActive }) => (
        <AppSidebarNavItemFrame active={isActive} collapsed={collapsed} indent={indent}>
          <AppSidebarNavItemContent icon={Icon} label={label} collapsed={collapsed} />
        </AppSidebarNavItemFrame>
      )}
    </NavLink>
  )
}

interface SidebarProps {
  collapsed?: boolean
  width?: number
  headerActions?: ReactNode
  reserveHeader?: boolean
  onWidthChange?: (width: number) => void
  onHide?: () => void
}

export function Sidebar({
  collapsed = false,
  width = SIDEBAR_DEFAULT_WIDTH,
  headerActions,
  reserveHeader = false,
  onWidthChange,
  onHide,
}: SidebarProps) {
  const { t } = useTranslation()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const { pathname } = useLocation()
  const sidebarResize = useResizablePanel({
    size: width,
    onSizeChange: (nextWidth) => onWidthChange?.(clampSidebarWidth(nextWidth)),
    minSize: SIDEBAR_MIN_WIDTH,
    maxSize: SIDEBAR_MAX_WIDTH,
    resizeEdge: 'right',
    collapsed,
    onCollapsedChange: (nextCollapsed) => {
      if (nextCollapsed) onHide?.()
    },
    collapseMode: 'after-min',
    ariaLabel: '调整左侧栏宽度',
  })

  const [installedPlugins, setInstalledPlugins] = useState<import('@/features/plugins/application/clientPlugins').ClientPluginManifest[]>([])
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
    <AppSidebarShell collapsed={collapsed} width={width}>
      {(reserveHeader || headerActions) ? (
        <AppSidebarHeader className="app-sidebar__header--actions">
          {headerActions}
        </AppSidebarHeader>
      ) : null}
      <AppSidebarNav collapsed={collapsed}>

        {current && (
          <>
            {/* Project */}
            <AppSidebarSection title={t('sidebar.sections.project')} collapsed={collapsed}>
              {collapsed ? (
                <AppSidebarNavItemFrame collapsed>
                  <AppSidebarNavItemContent icon={FolderOpen} label={current.name} collapsed />
                </AppSidebarNavItemFrame>
              ) : (
                <AppSidebarProjectRow>
                  <AppSidebarProjectCurrent
                    icon={FolderOpen}
                    name={current.name}
                    switchControl={null}
                  />
                </AppSidebarProjectRow>
              )}
              <NavItem to={ROUTES.project.overview} icon={Home} label={t('sidebar.items.projectHome')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.tasks} icon={ListChecks} label={t('sidebar.items.productionTasks')} collapsed={collapsed} />
              <NavItem to={ROUTES.project.delivery} icon={Truck} label={t('sidebar.items.delivery')} collapsed={collapsed} end />
            </AppSidebarSection>

            <AppSidebarDivider collapsed={collapsed} />
            <AppSidebarSection title={t('sidebar.sections.workspace')} collapsed={collapsed}>
              {projectWorkbenchDefinitions.filter((item) => item.id !== 'content_orchestration').map((item, index) => (
                <Fragment key={item.id}>
                  <NavItem to={item.route} icon={item.icon} label={t(item.sidebarTitleKey)} collapsed={collapsed} />
                  {index === 0 ? (
                    <NavItem to={ROUTES.project.scripts} icon={ScrollText} label={t('sidebar.items.script')} collapsed={collapsed} />
                  ) : null}
                </Fragment>
              ))}
              <NavItem to={ROUTES.project.contentUnitEditor} icon={Clapperboard} label={t('sidebar.items.shotEditWorkbench')} collapsed={collapsed} />
            </AppSidebarSection>
          </>
        )}

        {current ? <AppSidebarDivider collapsed={collapsed} /> : null}

        {/* Tools */}
        <AppSidebarSection title={t('sidebar.sections.tools')} collapsed={collapsed}>
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
        </AppSidebarSection>

        <AppSidebarDivider collapsed={collapsed} />

        {/* Files */}
        <AppSidebarSection title={t('sidebar.sections.files')} collapsed={collapsed}>
          <NavItem to={ROUTES.resources} icon={FolderArchive} label={t('sidebar.items.resources')} collapsed={collapsed} end />
          <NavItem to={ROUTES.externalResources} icon={ScanSearch} label={t('sidebar.items.externalResources', { defaultValue: '外部资源' })} collapsed={collapsed} />
          <NavItem to={ROUTES.shotLibrary} icon={Video} label={t('sidebar.items.shotLibrary')} collapsed={collapsed} />
          <NavItem to={ROUTES.jobs} icon={ListTodo} label={t('sidebar.items.jobs')} collapsed={collapsed} />
        </AppSidebarSection>

      </AppSidebarNav>

      {!collapsed && onWidthChange ? (
        <PanelResizeHandle
          {...sidebarResize.resizeHandleProps}
          side="right"
        />
      ) : null}
    </AppSidebarShell>
  )
}
