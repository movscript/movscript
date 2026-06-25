import React from 'react'
import {
  AppRouteViewport,
  AppSidebarDivider,
  AppSidebarNav,
  AppSidebarNavItemContent,
  AppSidebarNavItemFrame,
  AppSidebarProjectCurrent,
  AppSidebarProjectRow,
  AppSidebarProjectSwitch,
  AppSidebarSection,
  AppSidebarShell,
  AppWindowBrandButton,
  AppWindowControls,
  AppWindowHeader,
} from '@movscript/ui/layout'
import { StatusDot } from '@movscript/ui/primitives'
import {
  Clapperboard,
  FolderArchive,
  Gauge,
  HardDrive,
  Home,
  Images,
  LayoutDashboard,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'
import { ROUTES } from '../routes/projectRoutes.js'
import { hrefWithSearch, projectHostHref, projectRouteContext, projectRouteHref } from '../routes/localRouteLinks.js'

export function LocalSurfaceAppChrome({
  title,
  description,
  query,
  children,
}: {
  title: string
  description?: string
  query: URLSearchParams
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const location = useLocation()
  const routeContext = projectRouteContext(location.pathname, query)
  const mcpApiBaseURL = query.get('mcpApiBaseURL') ?? ''
  const isAppHome = location.pathname === ROUTES.root
  const isProjectRoute = location.pathname === '/studio' || location.pathname.startsWith('/studio/')
  const showSidebar = isProjectRoute && Boolean(routeContext.projectDir.trim())
  return (
    <div className="local-surface-shell">
      <AppWindowHeader
        isMacOS={false}
        centerContent={(
          <div className="app-window-route-title">
            <span className="app-window-route-title__icon"><Clapperboard size={13} /></span>
            <span className="app-window-route-title__text">{title}</span>
          </div>
        )}
        controls={(
          <AppWindowControls>
            <div className="local-surface-header-status">
              <StatusDot tone={mcpApiBaseURL ? 'success' : 'neutral'} />
              {description ? <span>{description}</span> : null}
            </div>
          </AppWindowControls>
        )}
        fallbackBrand={(
          <AppWindowBrandButton>
            <Clapperboard className="app-window-brand-button__icon" size={13} />
            <span>Movscript</span>
          </AppWindowBrandButton>
        )}
      />
      <div className="local-surface-shell__body">
        {showSidebar ? (
          <LocalSurfaceSidebar query={query} projectId={routeContext.projectId} projectDir={routeContext.projectDir} />
        ) : null}
        <main className={isAppHome || !showSidebar ? 'local-surface-shell__main local-surface-shell__main--full' : 'local-surface-shell__main'}>
          <AppRouteViewport scroll="auto">
            {children}
          </AppRouteViewport>
        </main>
      </div>
    </div>
  )
}

function LocalSurfaceSidebar({
  query,
  projectId,
  projectDir,
}: {
  query: URLSearchParams
  projectId: string
  projectDir: string
}) {
  const { t } = useTranslation()
  return (
    <AppSidebarShell width={260}>
      <AppSidebarNav>
        <AppSidebarProjectRow>
          <AppSidebarProjectCurrent
            icon={HardDrive}
            name={projectDir.split('/').filter(Boolean).pop() ?? projectDir}
            switchControl={<AppSidebarProjectSwitch>{t('localSurfaceHost.sidebar.local')}</AppSidebarProjectSwitch>}
          />
        </AppSidebarProjectRow>
        <AppSidebarSection title={t('localSurfaceHost.sidebar.sections.home')}>
          <LocalSurfaceNavItem to={hrefWithSearch(ROUTES.root, query)} icon={Home} label={t('localSurfaceHost.sidebar.appHome')} end />
        </AppSidebarSection>
        <AppSidebarDivider />
        <AppSidebarSection title={t('localSurfaceHost.sidebar.sections.project', { defaultValue: 'Project' })}>
          <LocalSurfaceNavItem to={projectHostHref(projectId, query)} icon={LayoutDashboard} label={t('localSurfaceHost.sidebar.projectHome')} end />
          <LocalSurfaceNavItem to={projectRouteHref('overview', projectId, query)} icon={Gauge} label={t('localSurfaceHost.sidebar.projectOverview', { defaultValue: 'Overview' })} />
          <LocalSurfaceNavItem to={projectRouteHref('resources', projectId, query)} icon={FolderArchive} label={t('localSurfaceHost.sidebar.projectResources', { defaultValue: 'Project Resources' })} />
          <LocalSurfaceNavItem to={projectRouteHref('scripts', projectId, query)} icon={ScrollText} label={t('localSurfaceHost.sidebar.projectScripts', { defaultValue: 'Scripts' })} />
          <LocalSurfaceNavItem to={projectRouteHref('content', projectId, query)} icon={Images} label={t('localSurfaceHost.sidebar.projectContent', { defaultValue: 'Content' })} />
          <LocalSurfaceNavItem to={projectRouteHref('settings', projectId, query)} icon={Settings} label={t('localSurfaceHost.sidebar.projectSettings', { defaultValue: 'Settings' })} />
        </AppSidebarSection>
      </AppSidebarNav>
    </AppSidebarShell>
  )
}

function LocalSurfaceNavItem({
  to,
  icon,
  label,
  end,
}: {
  to: string
  icon: LucideIcon
  label: string
  end?: boolean
}) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <AppSidebarNavItemFrame active={isActive}>
          <AppSidebarNavItemContent icon={icon} label={label} />
        </AppSidebarNavItemFrame>
      )}
    </NavLink>
  )
}
