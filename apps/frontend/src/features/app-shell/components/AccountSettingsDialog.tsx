import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { Bot, CircleUserRound, ExternalLink, Maximize2, Minimize2, Settings, UsersRound } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@movscript/ui'

import { useAppShellDialogStore, type AccountSettingsDialogTab } from '@/features/app-shell/application/appShellDialogStore'
import OrgSelectPage from '@/features/organization/components/OrgSelectPage'
import { AppSettingsPanel } from '@/features/settings/components/AppSettingsPage'
import { UserProfilePanel } from '@/features/user/components/UserProfilePage'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import { runtimeNavItems, runtimeRoutes } from '@runtime'

const baseTabs: Array<{ key: AccountSettingsDialogTab; icon: LucideIcon; labelKey: string }> = [
  { key: 'profile', icon: CircleUserRound, labelKey: 'user.title' },
  { key: 'settings', icon: Settings, labelKey: 'appSettings.title' },
  { key: 'workspace', icon: UsersRound, labelKey: 'sidebar.items.workspace' },
]

export function AccountSettingsDialog() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [fullscreen, setFullscreen] = useState(false)
  const currentUser = useUserStore((s) => s.currentUser)
  const apiBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL)
  const open = useAppShellDialogStore((s) => s.accountSettingsOpen)
  const activeTab = useAppShellDialogStore((s) => s.accountSettingsTab)
  const close = useAppShellDialogStore((s) => s.closeAccountSettings)
  const setTab = useAppShellDialogStore((s) => s.setAccountSettingsTab)
  const FullscreenIcon = fullscreen ? Minimize2 : Maximize2
  const fullscreenLabel = fullscreen
    ? t('common.restore', { defaultValue: '还原为弹窗' })
    : t('common.fullscreen', { defaultValue: '全屏' })

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) return
    setFullscreen(false)
    close()
  }

  function openAgentConsolePage() {
    setFullscreen(false)
    close()
    navigate(ROUTES.agentConsole)
  }

  const runtimeTabs = runtimeNavItems
    .filter((item) => (item.section ?? 'manage') === 'manage')
    .map((item) => ({ key: `runtime:${item.to}` as AccountSettingsDialogTab, icon: item.icon, label: item.label }))
  const tabs = [...baseTabs, ...runtimeTabs]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`grid max-w-none grid-cols-[180px_minmax(0,1fr)] gap-0 overflow-hidden p-0 [--ms-surface-backdrop-filter:none] ${fullscreen ? 'h-[calc(100vh-16px)] w-[calc(100vw-16px)]' : 'h-[min(760px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))]'}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-14 top-4 z-10"
          title={fullscreenLabel}
          aria-label={fullscreenLabel}
          onClick={() => setFullscreen((value) => !value)}
        >
          <FullscreenIcon size={14} />
        </Button>
        <aside className="min-h-0 border-r border-border bg-muted/35 p-4">
          <DialogHeader className="mb-4 pr-8">
            <DialogTitle>{t('appSettings.title')}</DialogTitle>
            <DialogDescription>{t('user.subtitle')}</DialogDescription>
          </DialogHeader>
          <nav className="grid gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <Button
                  key={tab.key}
                  type="button"
                  variant={activeTab === tab.key ? 'soft' : 'ghost'}
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => setTab(tab.key)}
                >
                  <Icon size={14} />
                  {'labelKey' in tab ? t(tab.labelKey) : tab.label}
                </Button>
              )
            })}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start gap-2"
              onClick={openAgentConsolePage}
            >
              <Bot size={14} />
              {t('sidebar.items.agentConsole')}
              <ExternalLink size={13} className="ml-auto opacity-70" />
            </Button>
          </nav>
          {currentUser?.system_role === 'super_admin' ? (
            <div className="mt-4 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => void openAdminConsole(apiBaseURL)}
              >
                <ExternalLink size={14} />
                {t('sidebar.items.adminConsole')}
              </Button>
            </div>
          ) : null}
        </aside>
        <main className="min-h-0 overflow-y-auto overscroll-contain p-6 pr-8 text-sm [&_.app-settings-choice-tile__detail]:text-xs [&_.app-settings-choice-tile__title]:text-sm [&_.app-settings-field__help]:text-xs [&_.app-settings-feedback]:text-xs [&_.app-settings-info-surface]:text-xs [&_.app-settings-intro__description]:text-sm [&_.app-settings-intro__title]:text-base [&_.user-profile-identity__name]:text-base [&_.user-profile-identity__role]:text-sm [&_.user-profile-logout-button]:text-sm">
          <AccountSettingsDialogPanel activeTab={activeTab} />
        </main>
      </DialogContent>
    </Dialog>
  )
}

function AccountSettingsDialogPanel({ activeTab }: { activeTab: AccountSettingsDialogTab }) {
  if (activeTab === 'profile') return <UserProfilePanel />
  if (activeTab === 'settings') return <AppSettingsPanel host="dialog" />
  if (activeTab === 'workspace') return <OrgSelectPage />
  if (activeTab.startsWith('runtime:')) {
    const path = activeTab.slice('runtime:'.length)
    return runtimeRoutes.find((route) => route.path === path)?.element ?? null
  }
  return null
}
