import React, { useCallback, useEffect, useState } from 'react'
import {
  AppHostChrome,
  AppHostChromeActionLabel,
  AppHostChromeActions,
  AppHostChromeBrand,
  AppHostChromeBrandCopy,
  AppHostChromeBrandMark,
  AppHostChromeMain,
  AppHostChromePreferences,
  AppHostChromeStatus,
  AppHostChromeTopbar,
  AppHostChromeWorkspace,
} from '@movscript/ui/business/app'
import {
  AppPrimaryNav,
  AppPrimaryNavItem,
  AppPrimaryNavItemContent,
  AppRouteViewport,
} from '@movscript/ui/layout'
import { Button, StatusDot } from '@movscript/ui/primitives'
import {
  getMovScriptThemeMeta,
  nextMovScriptThemeName,
  readMovScriptTheme,
  setMovScriptTheme,
  type MovScriptThemeName,
} from '@movscript/theme'
import {
  Clapperboard,
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
import {
  sharedSurfacePrimaryNavItems,
  sharedSurfacePrimaryNavKeyForPathname,
  type SharedSurfacePrimaryNavKey,
} from '@movscript/shared'
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
  const tabs = localSurfacePrimaryTabs(query, t, location.pathname)
  const headerDescription = description || (mcpApiBaseURL ? t('localSurfaceHost.home.mcpReady') : '')
  return (
    <AppHostChrome>
      <AppHostChromeTopbar>
        <AppHostChromeBrand asChild>
          <NavLink to={hrefWithSearch(ROUTES.root, query)} end>
            <AppHostChromeBrandMark>
              <Clapperboard size={16} />
            </AppHostChromeBrandMark>
            <AppHostChromeBrandCopy>
              <strong>MovScript</strong>
              <small>{title}</small>
            </AppHostChromeBrandCopy>
          </NavLink>
        </AppHostChromeBrand>
        <AppPrimaryNav aria-label={t('localSurfaceHost.tabs.primary')}>
          {tabs.map((tab) => (
            <LocalSurfacePrimaryTab
              key={tab.to}
              to={tab.to}
              icon={tab.icon}
              label={tab.label}
              active={tab.active}
              end={tab.end}
            />
          ))}
        </AppPrimaryNav>
        <AppHostChromeActions>
          {headerDescription ? (
            <AppHostChromeStatus>
              <StatusDot tone={mcpApiBaseURL ? 'success' : 'neutral'} />
              <span>{headerDescription}</span>
            </AppHostChromeStatus>
          ) : null}
          <Button asChild variant="outline" tone="neutral" size="sm" title={t('localSurfaceHost.sidebar.admin')}>
            <a href={adminSurfacePath('overview')}>
              <MonitorCog size={14} />
              <AppHostChromeActionLabel>{t('localSurfaceHost.sidebar.admin')}</AppHostChromeActionLabel>
            </a>
          </Button>
          <LocalSurfacePreferenceControls />
        </AppHostChromeActions>
      </AppHostChromeTopbar>
      <AppHostChromeWorkspace>
        <AppHostChromeMain>
          <AppRouteViewport scroll="auto">
            {children}
          </AppRouteViewport>
        </AppHostChromeMain>
      </AppHostChromeWorkspace>
    </AppHostChrome>
  )
}

function localSurfacePrimaryTabs(
  query: URLSearchParams,
  t: ReturnType<typeof useTranslation>['t'],
  pathname: string,
): Array<{
  to: string
  icon: LucideIcon
  label: string
  end?: boolean
  active: boolean
}> {
  const activePrimaryNavKey = sharedSurfacePrimaryNavKeyForPathname(pathname, { host: 'local-web' })
  return sharedSurfacePrimaryNavItems.map((item) => ({
    to: hrefWithSearch(localSurfacePrimaryNavHref[item.key], query),
    icon: localSurfacePrimaryNavIcons[item.key],
    label: t(item.labelKey, { defaultValue: localSurfacePrimaryNavFallbackLabel(item.key, t) }),
    end: item.key === 'project' || item.key === 'workflow' || item.key === 'editing',
    active: activePrimaryNavKey === item.key,
  }))
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
    <AppPrimaryNavItem asChild active={active} title={label}>
      <NavLink to={to} end={end}>
        <AppPrimaryNavItemContent icon={Icon} label={label} />
      </NavLink>
    </AppPrimaryNavItem>
  )
}

const localSurfacePrimaryNavHref: Record<SharedSurfacePrimaryNavKey, string> = {
  project: ROUTES.projects,
  workflow: ROUTES.canvases,
  tool: ROUTES.toolHome,
  editing: ROUTES.editing,
}

const localSurfacePrimaryNavIcons: Record<SharedSurfacePrimaryNavKey, LucideIcon> = {
  project: LayoutDashboard,
  workflow: Clapperboard,
  tool: Images,
  editing: Scissors,
}

function localSurfacePrimaryNavFallbackLabel(
  key: SharedSurfacePrimaryNavKey,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (key === 'project') return t('localSurfaceHost.tabs.project')
  if (key === 'workflow') return t('localSurfaceHost.tabs.canvas')
  if (key === 'tool') return t('localSurfaceHost.tabs.tool')
  return t('localSurfaceHost.tabs.edit')
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
    <AppHostChromePreferences aria-label="Local Surface preferences">
      <Button
        type="button"
        variant="outline"
        tone="neutral"
        size="sm"
        onClick={toggleTheme}
        title={nextTheme === 'dark' ? t('localSurfaceHost.preferences.switchToDark') : t('localSurfaceHost.preferences.switchToLight')}
      >
        {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
        <AppHostChromeActionLabel>{t('localSurfaceHost.preferences.theme')}</AppHostChromeActionLabel>
        <strong>{t(`localSurfaceHost.preferences.${themeMeta.name}`)}</strong>
      </Button>
      <Button
        type="button"
        variant="outline"
        tone="neutral"
        size="sm"
        onClick={toggleLanguage}
        title={t('localSurfaceHost.preferences.switchLanguage')}
      >
        <Languages size={13} />
        <AppHostChromeActionLabel>{t('localSurfaceHost.preferences.language')}</AppHostChromeActionLabel>
        <strong>{languageLabel}</strong>
      </Button>
    </AppHostChromePreferences>
  )
}
