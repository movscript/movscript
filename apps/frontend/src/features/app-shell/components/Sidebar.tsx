import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  Atom,
  Bot,
  BrainCircuit,
  Building2,
  Cable,
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
  Tag,
  ToyBrick,
  Truck,
  Wrench,
} from 'lucide-react'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import {
  APP_SIDEBAR_DEFAULT_WIDTH,
  APP_SIDEBAR_MAX_WIDTH,
  APP_SIDEBAR_MIN_WIDTH,
  APP_SIDEBAR_WIDTH_STORAGE_KEY,
  AppSidebarActionItem,
  AppSidebarDivider,
  AppSidebarFooter,
  AppSidebarHeader,
  AppSidebarMenuLeadingIcon,
  AppSidebarNav,
  AppSidebarNavItemFrame,
  AppSidebarNavItemContent,
  AppSidebarProjectCurrent,
  AppSidebarProjectLinkContent,
  AppSidebarProjectRow,
  AppSidebarProjectSwitch,
  AppSidebarSection,
  AppSidebarShell,
  AppSidebarTitle,
  AppSidebarUserButton,
  AppSidebarUserButtonContent,
  AppSidebarUserMenuContent,
  clampAppSidebarWidth,
} from '@movscript/ui'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movscript/ui'
import { loadClientPlugins } from '@/features/plugins/application/clientPlugins'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { runtimeNavItems } from '@runtime'
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
      {!collapsed && (
        <AppSidebarHeader>
          <AppSidebarTitle>
            {t('sidebar.title', { defaultValue: '导航' })}
          </AppSidebarTitle>
        </AppSidebarHeader>
      )}
      <AppSidebarNav collapsed={collapsed}>

        {/* Project */}
        <AppSidebarSection title={t('sidebar.sections.project')} collapsed={collapsed}>
          {collapsed ? (
            <NavItem
              to={ROUTES.projects}
              icon={FolderOpen}
              label={current ? current.name : t('common.selectProject')}
              collapsed
            />
          ) : (
            <AppSidebarProjectRow>
              {current ? (
                <AppSidebarProjectCurrent
                  icon={FolderOpen}
                  name={current.name}
                  switchControl={(
                  <NavLink
                    to={ROUTES.projects}
                  >
                    <AppSidebarProjectSwitch>{t('common.switch')}</AppSidebarProjectSwitch>
                  </NavLink>
                  )}
                />
              ) : (
                <NavLink to={ROUTES.projects}>
                  <AppSidebarProjectLinkContent icon={FolderOpen}>{t('common.selectProject')}</AppSidebarProjectLinkContent>
                </NavLink>
              )}
            </AppSidebarProjectRow>
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
        </AppSidebarSection>

        {current && (
          <>
            <AppSidebarDivider collapsed={collapsed} />
            <AppSidebarSection title={t('sidebar.sections.workspace')} collapsed={collapsed}>
              {projectWorkbenchDefinitions.map((item) => (
                <NavItem key={item.id} to={item.route} icon={item.icon} label={t(item.sidebarTitleKey)} collapsed={collapsed} />
              ))}
            </AppSidebarSection>
          </>
        )}

        <AppSidebarDivider collapsed={collapsed} />

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
          <NavItem to={ROUTES.resources} icon={FolderArchive} label={t('sidebar.items.resources')} collapsed={collapsed} />
          <NavItem to={ROUTES.jobs} icon={ListTodo} label={t('sidebar.items.jobs')} collapsed={collapsed} />
        </AppSidebarSection>

        <AppSidebarDivider collapsed={collapsed} />

        {/* Manage */}
        <AppSidebarSection title={t('sidebar.sections.manage')} collapsed={collapsed}>
          <NavItem to={ROUTES.orgSelect} icon={Building2} label={t('sidebar.items.workspace')} collapsed={collapsed} />
          <NavItem to={ROUTES.agentConsole} icon={Bot} label={t('sidebar.items.agentConsole')} collapsed={collapsed} />
          {runtimeNavItems.filter((item) => (item.section ?? 'manage') === 'manage').map((item) => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} collapsed={collapsed} />
          ))}
          {currentUser?.system_role === 'super_admin' && (
            <AppSidebarActionItem
              icon={ExternalLink}
              label={t('sidebar.items.adminConsole')}
              collapsed={collapsed}
              onClick={() => void openAdminConsole(apiBaseURL)}
            />
          )}
        </AppSidebarSection>

      </AppSidebarNav>

      {/* User footer */}
      {currentUser && (
        <AppSidebarFooter collapsed={collapsed}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AppSidebarUserButton collapsed={collapsed}>
                <AppSidebarUserButtonContent
                  collapsed={collapsed}
                  username={currentUser.username}
                  role={currentMembership?.org_name
                    ?? (currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user'))}
                />
              </AppSidebarUserButton>
            </DropdownMenuTrigger>
            <AppSidebarUserMenuContent>
              <DropdownMenuItem onClick={() => navigate(ROUTES.user)}>
                <AppSidebarMenuLeadingIcon icon={CircleUserRound} />
                {t('header.titles.user')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCurrentUser(null)}>
                <AppSidebarMenuLeadingIcon icon={LogOut} />
                {t('sidebar.logout')}
              </DropdownMenuItem>
            </AppSidebarUserMenuContent>
          </DropdownMenu>
        </AppSidebarFooter>
      )}
    </AppSidebarShell>
  )
}
