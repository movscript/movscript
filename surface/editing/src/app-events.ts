export type AppEventScopeKind = 'system' | 'project' | 'editing' | 'resource' | 'canvas' | 'workspace' | 'thread' | 'global'

export interface AppEventScope {
  kind: AppEventScopeKind
  id?: string
}

export interface AppEvent<TPayload = unknown> {
  id?: string
  topic: string
  scope: AppEventScope
  source: string
  surfaceId?: string
  actorId?: string
  emittedAt?: string
  payload: TPayload
  causationId?: string
  delivery?: 'local' | 'cross-surface'
  raw?: unknown
}

const listeners = new Set<(event: AppEvent) => void>()

export function publishAppEvent<TPayload>(event: AppEvent<TPayload>): boolean {
  const envelope: AppEvent<TPayload> = {
    ...event,
    id: event.id ?? `editing:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`,
    emittedAt: event.emittedAt ?? new Date().toISOString(),
  }
  listeners.forEach((listener) => listener(envelope))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movscript:app-event', { detail: envelope }))
  }
  return true
}

export function subscribeAppEvents(
  handler: (event: AppEvent) => void,
  filter?: (event: AppEvent) => boolean,
): () => void {
  const listener = (event: AppEvent) => {
    if (!filter || filter(event)) handler(event)
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function editingAppEventScope(editingProjectId: number | string | null | undefined): AppEventScope {
  const id = editingProjectId === null || editingProjectId === undefined || editingProjectId === '' ? undefined : String(editingProjectId)
  return id ? { kind: 'editing', id } : { kind: 'editing' }
}

export function resetAppEventDedupeForTests(): void {
  listeners.clear()
}
