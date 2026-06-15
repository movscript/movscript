export function listenToWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const eventListener = listener as EventListener
  window.addEventListener(type, eventListener, options)
  return () => window.removeEventListener(type, eventListener, options)
}

export function publishWindowEvent<K extends keyof WindowEventMap>(event: WindowEventMap[K]): boolean {
  if (typeof window === 'undefined') return false
  return window.dispatchEvent(event)
}
