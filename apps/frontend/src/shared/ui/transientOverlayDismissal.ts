import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

export interface TransientOverlayDismissalOptions {
  onDismiss: () => void
  pointerDown?: boolean
  escapeKey?: boolean
}

export function subscribeTransientOverlayDismissal({
  onDismiss,
  pointerDown = false,
  escapeKey = false,
}: TransientOverlayDismissalOptions) {
  const onKeyDown = (event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') onDismiss()
  }

  const cleanups = [
    listenToWindowEvent('resize', onDismiss),
    listenToWindowEvent('scroll', onDismiss, true),
    pointerDown ? listenToWindowEvent('pointerdown', onDismiss) : undefined,
    escapeKey ? listenToWindowEvent('keydown', onKeyDown) : undefined,
  ].filter((cleanup): cleanup is () => void => Boolean(cleanup))

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
