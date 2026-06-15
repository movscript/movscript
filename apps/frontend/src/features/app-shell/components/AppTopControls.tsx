import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Languages,
  MoreHorizontal,
  Palette,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMovScriptThemeMeta, isMovScriptThemeName, movScriptThemeNames, type MovScriptThemeName } from '@movscript/theme'
import {
  AppTopControlButton,
  AppTopControlsRoot,
  AppTopMenuItemText,
  AppTopMenuLabelPrimary,
  AppTopMenuLabelSecondary,
  AppTopMenuLeadingIcon,
} from '@movscript/ui/business/app'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui/primitives'

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import { useTheme } from '@/features/app-shell/application/useTheme'
import { settingsRouteWithReturnPath } from '@/features/app-shell/application/appShellRouteHeaders'
import { checkForAppUpdate, openAppUpdateDownload, useAppUpdateStatus } from '@/shared/infrastructure/appUpdateStatus'
import { runtimeAppTopControls } from '@runtime'

interface AppTopControlsProps {
  className?: string
  compact?: boolean
  showSettingsAction?: boolean
  showAppUpdateAction?: boolean
}

export function AppTopControls({
  className = '',
  compact = false,
  showSettingsAction = true,
  showAppUpdateAction = false,
}: AppTopControlsProps) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { theme, selectTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false)

  const density = compact ? 'compact' : 'default'
  const iconSize = compact ? 11 : 16
  const settingsAction = runtimeAppTopControls.settingsAction ?? 'accountDialog'
  const globalMenuItems = runtimeAppTopControls.globalMenuItems ?? []
  const currentLanguageLabel = i18n.language
  const currentThemeLabel = getThemeLabel(theme, t)
  const globalMenuLabel = t('header.globalMenu', { defaultValue: '全局菜单' })
  const appUpdateStatus = useAppUpdateStatus()
  const hasAppUpdate = showAppUpdateAction && appUpdateStatus.available

  function handleLanguageSelect(language: string) {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) return
    i18n.changeLanguage(language as SupportedLanguage)
    setGlobalMenuOpen(false)
  }

  function handleThemeSelect(nextTheme: string) {
    if (!isMovScriptThemeName(nextTheme)) return
    selectTheme(nextTheme)
    setGlobalMenuOpen(false)
  }

  function openSettings() {
    if (settingsAction === 'appSettingsRoute' || settingsAction === 'accountDialog') {
      navigate(settingsRouteWithReturnPath(pathname, search))
    }
    setGlobalMenuOpen(false)
  }

  function openGlobalMenuItem(to: string) {
    navigate(to)
    setGlobalMenuOpen(false)
  }

  function handleAppUpdateAction() {
    if (appUpdateStatus.available) {
      void openAppUpdateDownload().catch(() => {})
    } else {
      void checkForAppUpdate().catch(() => {})
    }
    setGlobalMenuOpen(false)
  }

  return (
    <AppTopControlsRoot density={density} extraClassName={className}>
      <DropdownMenu open={globalMenuOpen} onOpenChange={(open) => {
        setGlobalMenuOpen(open)
      }}>
        <DropdownMenuTrigger asChild>
          <AppTopControlButton
            type="button"
            variant="ghost"
            density={density}
            title={globalMenuLabel}
            aria-label={globalMenuLabel}
          >
            <MoreHorizontal size={iconSize} />
            {hasAppUpdate ? (
              <span className="app-top-control-button__update-dot" aria-hidden="true" />
            ) : null}
          </AppTopControlButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="app-top-global-menu">
          <DropdownMenuLabel>
            <div className="ms-dropdown__label">
              <AppTopMenuLabelPrimary>{globalMenuLabel}</AppTopMenuLabelPrimary>
              <AppTopMenuLabelSecondary>{currentLanguageLabel} / {currentThemeLabel}</AppTopMenuLabelSecondary>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {showAppUpdateAction ? (
            <DropdownMenuItem onSelect={handleAppUpdateAction}>
              <AppTopMenuLeadingIcon icon={RefreshCw} />
              <AppTopMenuItemText>
                {appUpdateStatus.checking
                  ? t('header.actions.checkingAppUpdate', { defaultValue: '检查更新中' })
                  : hasAppUpdate
                    ? t('header.actions.downloadAppUpdate', { defaultValue: '下载更新' })
                    : t('header.actions.refreshApp', { defaultValue: '检查更新' })}
              </AppTopMenuItemText>
              {hasAppUpdate ? <span className="app-top-menu-item__update-dot" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          ) : null}
          {showSettingsAction ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openSettings}>
                <AppTopMenuLeadingIcon icon={Settings} />
                <AppTopMenuItemText>{t('appSettings.title')}</AppTopMenuItemText>
              </DropdownMenuItem>
            </>
          ) : null}
          {globalMenuItems.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {globalMenuItems.map((item) => (
                <DropdownMenuItem key={item.id} onSelect={() => openGlobalMenuItem(item.to)}>
                  <AppTopMenuLeadingIcon icon={item.icon} />
                  <AppTopMenuItemText>{item.label}</AppTopMenuItemText>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            <div className="ms-dropdown__label">
              <AppTopMenuLabelPrimary>
                <span className="app-top-menu-label__icon-text">
                  <Languages size={12} />
                  {t('header.language')}
                </span>
              </AppTopMenuLabelPrimary>
              <AppTopMenuLabelSecondary>{currentLanguageLabel}</AppTopMenuLabelSecondary>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={i18n.language} onValueChange={handleLanguageSelect}>
            {SUPPORTED_LANGUAGES.map((language) => (
              <DropdownMenuRadioItem key={language} value={language}>
                <AppTopMenuItemText>{language}</AppTopMenuItemText>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            <div className="ms-dropdown__label">
              <AppTopMenuLabelPrimary>
                <span className="app-top-menu-label__icon-text">
                  <Palette size={12} />
                  {t('header.theme.select')}
                </span>
              </AppTopMenuLabelPrimary>
              <AppTopMenuLabelSecondary>{currentThemeLabel}</AppTopMenuLabelSecondary>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeSelect}>
            {movScriptThemeNames.map((themeName) => (
              <DropdownMenuRadioItem key={themeName} value={themeName}>
                <AppTopMenuItemText>{getThemeLabel(themeName, t)}</AppTopMenuItemText>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </AppTopControlsRoot>
  )
}

function getThemeLabel(themeName: MovScriptThemeName, t: ReturnType<typeof useTranslation>['t']) {
  return t(`header.theme.options.${themeName}`, {
    defaultValue: getMovScriptThemeMeta(themeName).label,
  })
}
