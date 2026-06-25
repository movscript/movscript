import { useCallback, useEffect, useState } from 'react'
import type { ElectronWindowControlAction, ElectronWindowState } from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

const DEFAULT_WINDOW_STATE: ElectronWindowState = { fullscreen: false, focused: true }

export function useAppWindowController() {
  const windowApi = readElectronApi()
  const platform = windowApi?.platform
  const isMacOS = platform === undefined || platform === 'darwin'
  const [windowState, setWindowState] = useState(DEFAULT_WINDOW_STATE)

  const windowControl = useCallback((action: ElectronWindowControlAction) => {
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

  return {
    isMacOS,
    windowControl,
    windowState,
  }
}
