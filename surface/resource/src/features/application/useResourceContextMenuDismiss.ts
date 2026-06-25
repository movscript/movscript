import { useEffect } from 'react'

import { listenToWindowEvent } from '@movscript/shared/browser'

export function useResourceContextMenuDismiss(onClose: () => void) {
  useEffect(() => {
    const close = () => onClose()
    const cleanupClick = listenToWindowEvent('click', close)
    const cleanupKeydown = listenToWindowEvent('keydown', close)
    return () => {
      cleanupClick()
      cleanupKeydown()
    }
  }, [onClose])
}
