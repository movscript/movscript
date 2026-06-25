import { useEffect, type ReactNode } from 'react'
import { AudioLines, BriefcaseBusiness, CircleUserRound, Clapperboard, GitBranch, HardDrive, Image as ImageIcon, Plug, Scissors, Settings, Video, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { runtimeNavItems } from '@runtime'
import { ROUTES } from '@/routes/projectRoutes'
import type { AccountSettingsPageTab } from '@/features/app-shell/components/AccountSettingsDialog'
import {
  agentConsoleEnvironmentLinks,
  agentConsoleSectionForTab,
  agentConsoleTabFromLocation,
  isAgentConsoleTab,
} from '@/features/agent/application/agentConsoleRouteModel'
import i18n from '@/i18n'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'

const SETTINGS_RETURN_PATH_STORAGE_KEY = 'movscript-settings-return-path'

export function projectRouteHeaderTitle(pathname: string): ReactNode | undefined {
  const routeTitles: Array<{
    match: (value: string) => boolean
    icon: LucideIcon
    title: ReactNode
  }> = [
    { match: (value) => value === ROUTES.project.content, icon: GitBranch, title: '创作' },
    { match: (value) => value === ROUTES.project.contentLegacy, icon: GitBranch, title: '创作' },
    { match: (value) => value === ROUTES.project.contentLegacyNext, icon: GitBranch, title: '创作' },
    { match: (value) => value === ROUTES.project.settings, icon: Settings, title: 'Project Settings' },
  ]
  return routeHeaderTitleFrom(pathname, routeTitles)
}

export function toolRouteHeaderTitle(pathname: string): ReactNode | undefined {
  const settingsTab = accountSettingsTabForLocation(pathname, '')
  if (settingsTab) return accountSettingsRouteHeaderTitle(settingsTab)

  const routeTitles: Array<{
    match: (value: string) => boolean
    icon: LucideIcon
    title: ReactNode
  }> = [
    { match: (value) => value === ROUTES.resources, icon: HardDrive, title: i18n.t('header.titles.resources') },
    { match: (value) => value === ROUTES.editing || value.startsWith('/editing/'), icon: Scissors, title: i18n.t('header.titles.editing', { defaultValue: '剪辑' }) },
    { match: (value) => value === ROUTES.externalResources, icon: ImageIcon, title: i18n.t('header.titles.externalResources', { defaultValue: '外部资源' }) },
    { match: (value) => value === ROUTES.shotLibrary, icon: Clapperboard, title: i18n.t('header.titles.shotLibrary') },
    { match: (value) => value === ROUTES.jobs, icon: BriefcaseBusiness, title: i18n.t('header.titles.jobs') },
    { match: (value) => value === ROUTES.plugins, icon: Plug, title: i18n.t('sidebar.items.plugins') },
    { match: (value) => value === ROUTES.workspaceConfig || value === ROUTES.workspaceReview, icon: HardDrive, title: 'Workspace' },
    { match: (value) => value === ROUTES.tools.refImageGen, icon: ImageIcon, title: i18n.t('sidebar.items.refImageGen') },
    { match: (value) => value === ROUTES.tools.refVideoGen, icon: Video, title: i18n.t('sidebar.items.refVideoGen') },
    { match: (value) => value === ROUTES.tools.audioGen, icon: AudioLines, title: i18n.t('sidebar.items.audioGen') },
    { match: (value) => value === ROUTES.tools.motionImitation, icon: Workflow, title: i18n.t('sidebar.items.motionImitation') },
    { match: (value) => value === ROUTES.tools.styleTransfer, icon: Zap, title: i18n.t('sidebar.items.styleTransfer') },
    { match: (value) => value === ROUTES.tools.multiAngle, icon: Workflow, title: i18n.t('sidebar.items.multiAngle') },
    { match: (value) => value.startsWith('/tools/plugin/'), icon: Plug, title: i18n.t('sidebar.items.plugins') },
  ]
  return routeHeaderTitleFrom(pathname, routeTitles)
}

function routeHeaderTitleFrom(
  pathname: string,
  routeTitles: Array<{
    match: (value: string) => boolean
    icon: LucideIcon
    title: ReactNode
  }>,
): ReactNode | undefined {
  const matched = routeTitles.find((route) => route.match(pathname))
  if (!matched) return undefined
  return <AppRouteHeaderTitle icon={matched.icon} title={matched.title} />
}

export function accountSettingsTabForLocation(pathname: string, search: string): AccountSettingsPageTab | undefined {
  if (pathname === ROUTES.user) return 'profile'
  if (pathname === ROUTES.orgSettings) return 'workspace'
  if (pathname === ROUTES.plugins) return 'environment:plugins'
  if (pathname === ROUTES.workspaceConfig || pathname === ROUTES.workspaceReview) return 'environment:workspace'
  const consoleTab = agentConsoleTabFromLocation(pathname, search)
  if (consoleTab) return consoleTab
  if (pathname !== ROUTES.appSettings) return undefined

  const runtimeTab = new URLSearchParams(search).get('tab')
  if (runtimeTab?.startsWith('runtime:')) {
    return `runtime:${runtimeTab.slice('runtime:'.length)}` as AccountSettingsPageTab
  }
  return 'settings'
}

export function readSettingsReturnPath(): string | undefined {
  return normalizeSettingsReturnPath(readBrowserStorageItem('session', SETTINGS_RETURN_PATH_STORAGE_KEY))
}

export function settingsRouteWithReturnPath(pathname: string, search: string): string {
  rememberSettingsReturnPath(pathname, search)
  return ROUTES.appSettings
}

export function useRememberSettingsReturnPath(pathname: string, search: string) {
  useEffect(() => {
    rememberSettingsReturnPath(pathname, search)
  }, [pathname, search])
}

export function accountSettingsRouteHeaderTitle(tab: AccountSettingsPageTab): ReactNode {
  if (tab === 'profile') return <AppRouteHeaderTitle icon={CircleUserRound} title={i18n.t('user.title')} />
  if (tab === 'workspace') return <AppRouteHeaderTitle icon={BriefcaseBusiness} title={i18n.t('sidebar.items.workspace')} />
  if (isAgentConsoleTab(tab)) {
    const section = agentConsoleSectionForTab(tab)
    return <AppRouteHeaderTitle icon={section.icon} title={tab === 'console' ? i18n.t('sidebar.items.agentConsole') : section.label} />
  }
  if (tab.startsWith('environment:')) {
    const id = tab.slice('environment:'.length)
    const environmentLink = agentConsoleEnvironmentLinks.find((link) => link.id === id)
    if (environmentLink) return <AppRouteHeaderTitle icon={environmentLink.icon} title={environmentLink.label} />
  }
  if (tab.startsWith('runtime:')) {
    const path = tab.slice('runtime:'.length)
    const runtimeItem = runtimeNavItems.find((item) => item.to === path)
    return <AppRouteHeaderTitle icon={runtimeItem?.icon ?? Settings} title={runtimeItem?.label ?? i18n.t('appSettings.title')} />
  }
  return <AppRouteHeaderTitle icon={Settings} title={i18n.t('appSettings.title')} />
}

function isAccountSettingsShellPath(pathname: string): boolean {
  return accountSettingsTabForLocation(pathname, '') !== undefined
}

function normalizeSettingsReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('/') || value.startsWith('//')) return undefined
  const [pathname] = value.split(/[?#]/, 1)
  if (!pathname || isAccountSettingsShellPath(pathname)) return undefined
  return value
}

function rememberSettingsReturnPath(pathname: string, search: string) {
  const path = normalizeSettingsReturnPath(`${pathname}${search}`)
  if (!path) return
  writeBrowserStorageItem('session', SETTINGS_RETURN_PATH_STORAGE_KEY, path)
}

function AppRouteHeaderTitle({
  icon: Icon,
  title,
}: {
  icon: LucideIcon
  title: ReactNode
}) {
  return (
    <div className="app-window-route-title app-window-no-drag">
      <span className="app-window-route-title__icon">
        <Icon size={13} />
      </span>
      <span className="app-window-route-title__text">{title}</span>
    </div>
  )
}
