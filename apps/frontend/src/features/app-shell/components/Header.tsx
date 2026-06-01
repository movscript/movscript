import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AppTopControls } from '@/features/app-shell/components/AppTopControls'
import { useTranslation } from 'react-i18next'
import {
  AppTopControlButton,
  AppTopMenuItemText,
  AppWindowBrandButton,
  AppWindowControls,
  AppWindowHeader,
  AppWindowMacTrafficLights,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@movscript/ui'

export function Header({
  titleKey: _titleKey,
  appControls,
  leftControls,
  centerContent,
  showWindowControls = true,
  showAppControls = true,
  showFallbackBrand = true,
  showAssistantShortcut,
  showAgentContentPanelShortcut,
}: {
  titleKey?: string
  appControls?: ReactNode
  leftControls?: ReactNode
  centerContent?: ReactNode
  showWindowControls?: boolean
  showAppControls?: boolean
  showFallbackBrand?: boolean
  showAssistantShortcut?: boolean
  showAgentContentPanelShortcut?: boolean
}) {
  const { t } = useTranslation()
  const platform = typeof window === 'undefined' ? undefined : window.api?.platform
  const isMacOS = platform === undefined || platform === 'darwin'
  const windowApi = typeof window === 'undefined' ? undefined : window.api
  const [windowState, setWindowState] = useState({ fullscreen: false, focused: true })
  const controls = (
    <AppWindowControls>
      {appControls}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <AppTopControlButton
            type="button"
            variant="ghost"
            density="compact"
            title="Movscript"
            aria-label="Movscript"
          >
            M
          </AppTopControlButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled>
            <AppTopMenuItemText>Movscript</AppTopMenuItemText>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AppTopControls
        compact
        showAssistantShortcut={showAssistantShortcut}
        showAgentContentPanelShortcut={showAgentContentPanelShortcut}
      />
    </AppWindowControls>
  )
  const windowControl = useCallback((action: 'close' | 'minimize' | 'toggleFullscreen') => {
    void windowApi?.windowControl?.(action).then((state) => {
      if (state) setWindowState(state)
    })
  }, [windowApi])

  useEffect(() => {
    if (!isMacOS || !windowApi) return undefined

    void windowApi.getWindowState?.().then((state) => {
      if (state) setWindowState(state)
    })

    return windowApi.onWindowState?.((state) => setWindowState(state))
  }, [isMacOS, windowApi])

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
      leftControls={leftControls}
      controls={showAppControls ? controls : undefined}
      centerContent={centerContent}
      fallbackBrand={showFallbackBrand ? (
        <AppWindowBrandButton>
          <span>Movscript</span>
        </AppWindowBrandButton>
      ) : undefined}
    />
  )
}
