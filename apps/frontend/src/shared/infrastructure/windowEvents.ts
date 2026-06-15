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
