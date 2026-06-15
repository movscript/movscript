import { useEffect } from 'react'

import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

export function useCanvasSaveShortcut(onSave: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        onSave()
      }
    }
    return listenToWindowEvent('keydown', onKeyDown)
  }, [onSave])
}

export function useCanvasBeforeUnloadGuard(shouldBlockExit: boolean) {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldBlockExit) return
      event.preventDefault()
      event.returnValue = ''
    }
    return listenToWindowEvent('beforeunload', onBeforeUnload)
  }, [shouldBlockExit])
}
