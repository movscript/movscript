export type RuntimeEventListener<TEvent> = (event: TEvent) => void

export class RuntimeEventSubscriberRegistry<TEvent> {
  private readonly subscribers = new Map<string, Set<RuntimeEventListener<TEvent>>>()

  subscribe(id: string, listener: RuntimeEventListener<TEvent>, replay?: (listener: RuntimeEventListener<TEvent>) => void): () => void {
    let listeners = this.subscribers.get(id)
    if (!listeners) {
      listeners = new Set()
      this.subscribers.set(id, listeners)
    }
    listeners.add(listener)
    replay?.(listener)
    return () => {
      const current = this.subscribers.get(id)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.subscribers.delete(id)
    }
  }

  has(id: string): boolean {
    const listeners = this.subscribers.get(id)
    return !!listeners && listeners.size > 0
  }

  emit(id: string, event: TEvent): boolean {
    const listeners = this.subscribers.get(id)
    if (!listeners || listeners.size === 0) return false
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch {
        listeners.delete(listener)
      }
    }
    if (listeners.size === 0) this.subscribers.delete(id)
    return true
  }

  close(id: string): void {
    this.subscribers.delete(id)
  }
}
