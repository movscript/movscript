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
  if (typeof window === 'undefined') return () => {}

  const onKeyDown = (event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') onDismiss()
  }

  window.addEventListener('resize', onDismiss)
  window.addEventListener('scroll', onDismiss, true)
  if (pointerDown) window.addEventListener('pointerdown', onDismiss)
  if (escapeKey) window.addEventListener('keydown', onKeyDown)

  return () => {
    window.removeEventListener('resize', onDismiss)
    window.removeEventListener('scroll', onDismiss, true)
    if (pointerDown) window.removeEventListener('pointerdown', onDismiss)
    if (escapeKey) window.removeEventListener('keydown', onKeyDown)
  }
}
