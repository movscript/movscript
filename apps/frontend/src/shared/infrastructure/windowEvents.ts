export function listenToWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): () => void
export function listenToWindowEvent(
  type: string,
  listener: ((event: Event) => void) | (() => void),
  options?: boolean | AddEventListenerOptions,
): () => void
export function listenToWindowEvent(
  type: string,
  listener: ((event: Event) => void) | (() => void),
  options?: boolean | AddEventListenerOptions,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const addEventListener = window.addEventListener
  if (typeof addEventListener !== 'function') return () => {}
  const eventListener = listener as EventListener
  addEventListener.call(window, type, eventListener, options)
  return () => {
    const removeEventListener = window.removeEventListener
    if (typeof removeEventListener !== 'function') return
    removeEventListener.call(window, type, eventListener, options)
  }
}

export function publishWindowEvent<K extends keyof WindowEventMap>(event: WindowEventMap[K]): boolean {
  if (typeof window === 'undefined') return false
  const dispatchEvent = window.dispatchEvent
  if (typeof dispatchEvent !== 'function') return false
  return dispatchEvent.call(window, event)
}
