import React, { useCallback, useEffect, useState } from 'react'
import {
  AppRouteViewport,
} from '@movscript/ui/layout'
import { StatusDot } from '@movscript/ui/primitives'
import {
  getMovScriptThemeMeta,
  nextMovScriptThemeName,
  readMovScriptTheme,
  setMovScriptTheme,
  type MovScriptThemeName,
} from '@movscript/theme'
import {
  Clapperboard,
  Home,
  Images,
  Languages,
  LayoutDashboard,
  MonitorCog,
  Moon,
  Scissors,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'
import { adminSurfacePath } from '@movscript/admin-surface'
import { ROUTES } from '../routes/projectRoutes.js'
import { hrefWithSearch } from '../routes/localRouteLinks.js'

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
  const mcpApiBaseURL = query.get('mcpApiBaseURL') ?? ''
  const tabs = localSurfacePrimaryTabs(query, t)
  const headerDescription = description || (mcpApiBaseURL ? t('localSurfaceHost.home.mcpReady') : '')
  return (
    <div className="local-surface-shell">
      <header className="local-surface-topbar">
        <div className="local-surface-topbar__brand">
          <span className="local-surface-topbar__mark">
            <Clapperboard size={16} />
          </span>
          <span className="local-surface-topbar__copy">
            <strong>MovScript</strong>
            <small>{title}</small>
          </span>
        </div>
        <nav className="local-surface-primary-tabs" aria-label={t('localSurfaceHost.tabs.primary')}>
          {tabs.map((tab) => (
            <LocalSurfacePrimaryTab
              key={tab.to}
              to={tab.to}
              icon={tab.icon}
              label={tab.label}
              active={tab.isActive(location.pathname)}
              end={tab.end}
            />
          ))}
        </nav>
        <div className="local-surface-topbar__actions">
          {headerDescription ? (
            <div className="local-surface-header-status">
              <StatusDot tone={mcpApiBaseURL ? 'success' : 'neutral'} />
              <span>{headerDescription}</span>
            </div>
          ) : null}
          <a className="local-surface-admin-button" href={adminSurfacePath('overview')} title={t('localSurfaceHost.sidebar.admin')}>
            <MonitorCog size={14} />
            <span>{t('localSurfaceHost.sidebar.admin')}</span>
          </a>
          <LocalSurfacePreferenceControls />
        </div>
      </header>
      <section className="local-surface-workspace">
        <main className="local-surface-shell__main">
          <AppRouteViewport scroll="auto">
            {children}
          </AppRouteViewport>
        </main>
      </section>
    </div>
  )
}

function localSurfacePrimaryTabs(
  query: URLSearchParams,
  t: ReturnType<typeof useTranslation>['t'],
): Array<{
  to: string
  icon: LucideIcon
  label: string
  end?: boolean
  isActive: (pathname: string) => boolean
}> {
  return [
    {
      to: hrefWithSearch(ROUTES.root, query),
      icon: Home,
      label: t('localSurfaceHost.tabs.app'),
      end: true,
      isActive: (pathname) => pathname === ROUTES.root,
    },
    {
      to: hrefWithSearch(ROUTES.toolHome, query),
      icon: Images,
      label: t('localSurfaceHost.tabs.tool'),
      isActive: isToolPath,
    },
    {
      to: hrefWithSearch(ROUTES.projects, query),
      icon: LayoutDashboard,
      label: t('localSurfaceHost.tabs.project'),
      isActive: (pathname) => pathname === ROUTES.projects || pathname === '/studio' || pathname.startsWith('/studio/'),
    },
    {
      to: hrefWithSearch(ROUTES.editing, query),
      icon: Scissors,
      label: t('localSurfaceHost.tabs.edit'),
      isActive: (pathname) => pathname === ROUTES.editing || pathname.startsWith('/editing/'),
    },
    {
      to: hrefWithSearch(ROUTES.canvases, query),
      icon: Clapperboard,
      label: t('localSurfaceHost.tabs.canvas'),
      isActive: (pathname) => pathname === ROUTES.canvases || pathname.startsWith('/canvases/'),
    },
  ]
}

function isToolPath(pathname: string): boolean {
  return pathname === ROUTES.toolHome
    || pathname.startsWith('/tools/')
    || pathname === ROUTES.shotLibrary
    || pathname === ROUTES.jobs
    || pathname === ROUTES.resources
    || pathname === ROUTES.externalResources
    || pathname === ROUTES.agentResources
    || pathname.startsWith(`${ROUTES.agentResources}/`)
}

function LocalSurfacePrimaryTab({
  to,
  icon: Icon,
  label,
  active,
  end,
}: {
  to: string
  icon: LucideIcon
  label: string
  active: boolean
  end?: boolean
}) {
  return (
    <NavLink
      className={active ? 'local-surface-primary-tab local-surface-primary-tab--active' : 'local-surface-primary-tab'}
      to={to}
      end={end}
    >
      <Icon size={15} />
      <span>{label}</span>
    </NavLink>
  )
}

function LocalSurfacePreferenceControls() {
  const { t, i18n } = useTranslation()
  const [theme, setTheme] = useState<MovScriptThemeName>(() => readMovScriptTheme())

  useEffect(() => {
    setMovScriptTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => setMovScriptTheme(nextMovScriptThemeName(current)))
  }, [])

  const toggleLanguage = useCallback(() => {
    const current = i18n.resolvedLanguage || i18n.language
    void i18n.changeLanguage(current?.startsWith('zh') ? 'en-US' : 'zh-CN')
  }, [i18n])

  const themeMeta = getMovScriptThemeMeta(theme)
  const nextTheme = nextMovScriptThemeName(theme)
  const languageLabel = (i18n.resolvedLanguage || i18n.language)?.startsWith('zh') ? '中文' : 'EN'

  return (
    <div className="local-surface-preferences" aria-label="Local Surface preferences">
      <button
        type="button"
        className="local-surface-preference-button"
        onClick={toggleTheme}
        title={nextTheme === 'dark' ? t('localSurfaceHost.preferences.switchToDark') : t('localSurfaceHost.preferences.switchToLight')}
      >
        {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
        <span>{t('localSurfaceHost.preferences.theme')}</span>
        <strong>{t(`localSurfaceHost.preferences.${themeMeta.name}`)}</strong>
      </button>
      <button
        type="button"
        className="local-surface-preference-button"
        onClick={toggleLanguage}
        title={t('localSurfaceHost.preferences.switchLanguage')}
      >
        <Languages size={13} />
        <span>{t('localSurfaceHost.preferences.language')}</span>
        <strong>{languageLabel}</strong>
      </button>
    </div>
  )
}
