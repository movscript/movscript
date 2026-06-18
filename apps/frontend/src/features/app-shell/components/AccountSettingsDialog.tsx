import React, { Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, Bot, CircleUserRound, ExternalLink, Settings, UsersRound } from 'lucide-react'
import {
  APP_SIDEBAR_MAX_WIDTH,
  APP_SIDEBAR_MIN_WIDTH,
  AppSidebarActionItem,
  AppSidebarFooter,
  AppSidebarNav,
  AppSidebarNavItemContent,
  AppSidebarShell,
  PanelResizeHandle,
  useResizablePanel
} from '@movscript/ui/layout'
import { Button } from '@movscript/ui/primitives'

import type { AccountSettingsDialogTab } from '@/features/app-shell/application/appShellDialogStore'
import OrgSelectPage from '@/features/organization/components/OrgSelectPage'
import { AppSettingsPanel } from '@/features/settings/components/AppSettingsPage'
import { UserProfilePanel } from '@/features/user/components/UserProfilePage'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import { runtimeNavItems, runtimeRoutes } from '@runtime'
import {
  agentConsoleEnvironmentLinks,
  agentConsoleSettingsRoute,
  isAgentConsoleTab,
  type AgentConsoleTab,
} from '@/features/agent/application/agentConsoleRouteModel'
import './AccountSettingsDialog.css'

const AgentConsolePage = React.lazy(() => import('@/pages/agent/AgentConsolePage'))
const ModelProvidersPage = React.lazy(() => import('@/pages/agent/ModelProvidersPage'))
const AgentsPage = React.lazy(() => import('@/pages/agent/AgentsPage'))
const AgentConnectionsPage = React.lazy(() => import('@/pages/agent/AgentConnectionsPage'))

type AccountSettingsRuntimeTab = `runtime:${string}`
type AccountSettingsEnvironmentTab = `environment:${(typeof agentConsoleEnvironmentLinks)[number]['id']}`

export type AccountSettingsPageTab = AccountSettingsDialogTab | AgentConsoleTab | AccountSettingsRuntimeTab | AccountSettingsEnvironmentTab

const agentConsolePanels: Record<AgentConsoleTab, React.LazyExoticComponent<React.ComponentType<unknown>>> = {
  console: AgentConsolePage,
  'console:model-providers': ModelProvidersPage,
  'console:agents': AgentsPage,
  'console:connections': AgentConnectionsPage,
}

const baseTabs: Array<{ key: AccountSettingsPageTab; icon: LucideIcon; labelKey: string }> = [
  { key: 'profile', icon: CircleUserRound, labelKey: 'user.title' },
  { key: 'settings', icon: Settings, labelKey: 'appSettings.title' },
  { key: 'workspace', icon: UsersRound, labelKey: 'sidebar.items.workspace' },
  { key: 'console', icon: Bot, labelKey: 'sidebar.items.agentConsole' },
]

export function AccountSettingsDialog() {
  return <AccountSettingsPage activeTab="settings" />
}

export function AccountSettingsPage({ activeTab }: { activeTab: AccountSettingsPageTab }) {
  return (
    <div className="account-settings-page">
      <div className="account-settings-page__frame">
        <AccountSettingsPageSidebar activeTab={activeTab} />
        <AccountSettingsPageContent activeTab={activeTab} framed />
      </div>
    </div>
  )
}

export function AccountSettingsPageSidebar({
  activeTab,
  width = 220,
  onWidthChange,
  onHide,
  onExitSettings,
}: {
  activeTab: AccountSettingsPageTab
  width?: number
  onWidthChange?: (width: number) => void
  onHide?: () => void
  onExitSettings?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentUser = useUserStore((s) => s.currentUser)
  const runtimeTabs = runtimeNavItems
    .filter((item) => (item.section ?? 'manage') === 'manage')
    .map((item) => ({ key: `runtime:${item.to}` as AccountSettingsPageTab, icon: item.icon, label: item.label }))
  const managementTabs = [...baseTabs, ...runtimeTabs]
  const environmentTabs = agentConsoleEnvironmentLinks.map((link) => ({
    key: `environment:${link.id}` as AccountSettingsPageTab,
    icon: link.icon,
    label: link.label,
  }))

  function selectTab(tab: AccountSettingsPageTab) {
    navigate(routeForSettingsTab(tab))
  }

  return (
    <AccountSettingsSidebarFrame
      width={width}
      onWidthChange={onWidthChange}
      onHide={onHide}
    >
      <AppSidebarNav className="account-settings-page__nav" aria-label={t('appSettings.title')}>
        <AccountSettingsSidebarGroup label="Settings">
          {managementTabs.map((tab) => {
            const Icon = tab.icon
            const label = 'labelKey' in tab ? t(tab.labelKey) : tab.label
            return (
              <Button
                key={tab.key}
                type="button"
                variant="ghost"
                size="sm"
                fullWidth
                align="start"
                className="account-settings-page__nav-button"
                data-active={settingsSidebarTabActive(activeTab, tab.key) ? 'true' : undefined}
                onClick={() => selectTab(tab.key)}
              >
                <AppSidebarNavItemContent icon={Icon} label={label} />
              </Button>
            )
          })}
        </AccountSettingsSidebarGroup>

        <AccountSettingsSidebarGroup label="全局环境">
          {environmentTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <Button
                key={tab.key}
                type="button"
                variant="ghost"
                size="sm"
                fullWidth
                align="start"
                className="account-settings-page__nav-button"
                data-active={settingsSidebarTabActive(activeTab, tab.key) ? 'true' : undefined}
                onClick={() => selectTab(tab.key)}
              >
                <AppSidebarNavItemContent icon={Icon} label={tab.label} />
              </Button>
            )
          })}
        </AccountSettingsSidebarGroup>
      </AppSidebarNav>
      {onExitSettings || currentUser?.system_role === 'super_admin' ? (
        <AppSidebarFooter className="account-settings-page__footer">
          {onExitSettings ? (
            <AppSidebarActionItem
              icon={ArrowLeft}
              label="退出设置"
              className="account-settings-page__exit-button"
              onClick={onExitSettings}
            />
          ) : null}
          {currentUser?.system_role === 'super_admin' ? (
            <AppSidebarActionItem
              icon={ExternalLink}
              label={t('sidebar.items.adminConsole')}
              className="account-settings-page__admin-button"
              onClick={() => void openAdminConsole()}
            />
          ) : null}
        </AppSidebarFooter>
      ) : null}
    </AccountSettingsSidebarFrame>
  )
}

function AccountSettingsSidebarGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="account-settings-page__nav-group" aria-label={label}>
      <div className="account-settings-page__nav-group-title">{label}</div>
      {children}
    </section>
  )
}

function AccountSettingsSidebarFrame({
  width,
  onWidthChange,
  onHide,
  children,
}: {
  width: number
  onWidthChange?: (width: number) => void
  onHide?: () => void
  children: React.ReactNode
}) {
  const sidebarResize = useResizablePanel({
    size: width,
    onSizeChange: (nextWidth) => onWidthChange?.(nextWidth),
    minSize: APP_SIDEBAR_MIN_WIDTH,
    maxSize: APP_SIDEBAR_MAX_WIDTH,
    resizeEdge: 'right',
    onCollapsedChange: (collapsed) => {
      if (collapsed) onHide?.()
    },
    collapseMode: 'after-min',
    ariaLabel: '调整设置左侧栏宽度',
  })

  return (
    <AppSidebarShell className="account-settings-page__sidebar" width={width}>
      {children}
      {onWidthChange ? (
        <PanelResizeHandle
          {...sidebarResize.resizeHandleProps}
          side="right"
        />
      ) : null}
    </AppSidebarShell>
  )
}

function settingsSidebarTabActive(activeTab: AccountSettingsPageTab, tab: AccountSettingsPageTab): boolean {
  if (activeTab === tab) return true
  return tab === 'console' && activeTab.startsWith('console:')
}

export function AccountSettingsPageContent({
  activeTab,
  framed = false,
}: {
  activeTab: AccountSettingsPageTab
  framed?: boolean
}) {
  const contentKind = activeTab.startsWith('console') ? 'console' : 'settings'
  return (
    <main
      className={framed ? 'account-settings-page__main account-settings-page__main--framed' : 'account-settings-page__main'}
      data-content-kind={contentKind}
    >
      <AccountSettingsPagePanel activeTab={activeTab} />
    </main>
  )
}

export function routeForSettingsTab(tab: AccountSettingsPageTab): string {
  if (tab === 'profile') return ROUTES.user
  if (tab === 'workspace') return ROUTES.orgSettings
  if (isAgentConsoleTab(tab)) return agentConsoleSettingsRoute(tab)
  if (tab.startsWith('environment:')) {
    const id = tab.slice('environment:'.length)
    return agentConsoleEnvironmentLinks.find((link) => link.id === id)?.canonicalPath ?? ROUTES.agentConsole
  }
  if (tab.startsWith('runtime:')) return `${ROUTES.appSettings}?tab=${encodeURIComponent(tab)}`
  return ROUTES.appSettings
}

function AccountSettingsPagePanel({ activeTab }: { activeTab: AccountSettingsPageTab }) {
  if (activeTab === 'profile') return <UserProfilePanel />
  if (activeTab === 'settings') return <AppSettingsPanel host="dialog" />
  if (activeTab === 'workspace') return <OrgSelectPage />
  if (isAgentConsoleTab(activeTab)) {
    const ConsolePanel = agentConsolePanels[activeTab]
    return (
      <Suspense fallback={<div className="account-settings-page__loading">Loading...</div>}>
        <ConsolePanel />
      </Suspense>
    )
  }
  if (activeTab.startsWith('runtime:')) {
    const path = activeTab.slice('runtime:'.length)
    return runtimeRoutes.find((route) => route.path === path)?.element ?? null
  }
  return null
}
