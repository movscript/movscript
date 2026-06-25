export function listenToWindowEvent(
  type: string,
  listener: EventListenerOrEventListenerObject | ((event: any) => void),
  options?: AddEventListenerOptions,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const eventListener = listener as EventListenerOrEventListenerObject
  window.addEventListener(type, eventListener, options)
  return () => window.removeEventListener(type, eventListener, options)
}

export function publishWindowEvent(eventOrType: Event | string, detail?: unknown): void {
  if (typeof window === 'undefined') return
  if (typeof eventOrType === 'string') {
    window.dispatchEvent(new CustomEvent(eventOrType, { detail }))
    return
  }
  window.dispatchEvent(eventOrType)
}
