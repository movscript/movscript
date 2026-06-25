import { type ReactNode } from 'react'
import { AppTopControls } from '@/features/app-shell/components/AppTopControls'
import { useTranslation } from 'react-i18next'
import { AppWindowBrandButton, AppWindowControls, AppWindowHeader, AppWindowMacTrafficLights } from '@movscript/ui/layout'
import { Clapperboard } from 'lucide-react'
import { useAppWindowController } from '@/features/app-shell/application/useAppWindowController'

export function Header({
  titleKey: _titleKey,
  leftControlsLayout,
  centerContent,
  navigationControls,
  layoutControls,
  primaryActions,
  contextActions,
  globalActions,
  showWindowControls = true,
  showAppControls = true,
  showFallbackBrand = true,
  showSettingsAction = true,
  showAppUpdateAction = false,
}: {
  titleKey?: string
  leftControlsLayout?: 'default' | 'fill'
  centerContent?: ReactNode
  navigationControls?: ReactNode
  layoutControls?: ReactNode
  primaryActions?: ReactNode
  contextActions?: ReactNode
  globalActions?: ReactNode
  showWindowControls?: boolean
  showAppControls?: boolean
  showFallbackBrand?: boolean
  showSettingsAction?: boolean
  showAppUpdateAction?: boolean
}) {
  const { t } = useTranslation()
  const { isMacOS, windowControl, windowState } = useAppWindowController()
  const resolvedGlobalActions = globalActions ?? (
    <AppTopControls
      compact
      showSettingsAction={showSettingsAction}
      showAppUpdateAction={showAppUpdateAction}
    />
  )
  const controls = (
    <AppWindowControls>
      <HeaderActionGroup roleName="primary">{primaryActions}</HeaderActionGroup>
      <HeaderActionGroup roleName="context">{contextActions}</HeaderActionGroup>
      <HeaderActionGroup roleName="global">{resolvedGlobalActions}</HeaderActionGroup>
    </AppWindowControls>
  )
  const generatedLeftControls = navigationControls || layoutControls ? (
    <>
      <HeaderActionGroup roleName="navigation">{navigationControls}</HeaderActionGroup>
      <HeaderActionGroup roleName="layout">{layoutControls}</HeaderActionGroup>
    </>
  ) : undefined
  return (
    <AppWindowHeader
      isMacOS={isMacOS}
      windowControls={isMacOS && showWindowControls ? (
        <AppWindowMacTrafficLights
          focused={windowState.focused}
          fullscreen={windowState.fullscreen}
          closeLabel={t('common.close')}
          minimizeLabel={t('header.window.minimize', { defaultValue: 'Minimize' })}
          fullscreenLabel={t('header.window.fullscreen', { defaultValue: 'Enter fullscreen' })}
          restoreLabel={t('header.window.restore', { defaultValue: 'Exit fullscreen' })}
          onClose={() => windowControl('close')}
          onMinimize={() => windowControl('minimize')}
          onToggleFullscreen={() => windowControl('toggleFullscreen')}
        />
      ) : undefined}
      leftControls={generatedLeftControls}
      leftControlsLayout={leftControlsLayout}
      controls={showAppControls ? controls : undefined}
      centerContent={centerContent}
      fallbackBrand={showFallbackBrand ? (
        <AppWindowBrandButton>
          <Clapperboard className="app-window-brand-button__icon" size={13} />
          <span>Movscript</span>
        </AppWindowBrandButton>
      ) : undefined}
    />
  )
}

function HeaderActionGroup({
  children,
  roleName,
}: {
  children?: ReactNode
  roleName: 'navigation' | 'layout' | 'primary' | 'context' | 'global'
}) {
  if (!children) return null
  return (
    <div className="app-window-header-action-group" data-role={roleName}>
      {children}
    </div>
  )
}
