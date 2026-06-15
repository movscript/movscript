import { useEffect } from 'react'

import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

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
