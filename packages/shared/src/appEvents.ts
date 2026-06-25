export type AppEventScopeKind = 'system' | 'project' | 'editing' | 'resource' | 'canvas' | 'workspace' | 'thread' | 'global'

export interface AppEventScope {
  kind: AppEventScopeKind
  id?: string
}

export type AppEventTopic =
  | 'system.status.changed'
  | 'project.session.changed'
  | 'project.mutation'
  | 'project.workspace.updated'
  | 'content-canvas.mutation'
  | 'resource.mutation'
  | 'script.mutation'
  | 'canvas.mutation'
  | 'job.mutation'
  | 'organization.mutation'
  | 'shot-library.mutation'
  | 'agent-output.mutation'
  | 'agent.activity.started'
  | 'agent.activity.updated'
  | 'agent.activity.completed'
  | 'agent.activity.failed'
  | 'agent.tool.started'
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.output.created'
  | 'agent.output.selected'
  | 'agent.plan.updated'
  | 'agent.user-input.requested'
  | 'agent.approval.requested'
  | 'workspace-files.mutation'
  | 'semantic-entity.mutation'
  | 'editing.session.changed'
  | 'editing.project.changed'
  | 'editing.task.changed'

export interface AppEventEnvelope<TPayload = unknown> {
  id: string
  topic: AppEventTopic
  scope: AppEventScope
  source: string
  surfaceId?: string
  actorId?: string
  emittedAt: string
  payload: TPayload
  causationId?: string
  delivery?: 'local' | 'cross-surface'
  raw?: unknown
}

export type AppEvent<TPayload = unknown> = AppEventEnvelope<TPayload>
export type AppEventDraft<TPayload = unknown> = Omit<AppEventEnvelope<TPayload>, 'id' | 'emittedAt'> & {
  id?: string
  emittedAt?: string
}

export interface SurfaceAppEventBridge {
  publish?: <TPayload>(event: AppEventDraft<TPayload>) => boolean
  subscribe?: (handler: (event: AppEvent) => void, filter?: (event: AppEvent) => boolean) => () => void
}

let bridge: SurfaceAppEventBridge = {}
const handlers = new Set<(event: AppEvent) => void>()
const recentEventIds = new Set<string>()
const recentEventIdOrder: string[] = []
const RECENT_EVENT_ID_LIMIT = 1000
const recentAppEvents: AppEvent[] = []
const RECENT_APP_EVENT_LIMIT = 200

export function configureSurfaceAppEvents(nextBridge: SurfaceAppEventBridge): void {
  bridge = nextBridge
}

export function publishAppEvent<TPayload>(event: AppEventDraft<TPayload>): boolean {
  if (bridge.publish) return bridge.publish(event)
  const envelope = appEventEnvelope(event)
  if (wasAppEventSeen(envelope.id)) return false
  rememberAppEvent(envelope)
  for (const handler of Array.from(handlers)) handler(envelope)
  return true
}

export function subscribeAppEvents(
  handler: (event: AppEvent) => void,
  filter?: (event: AppEvent) => boolean,
): () => void {
  if (bridge.subscribe) return bridge.subscribe(handler, filter)
  const wrapped = (event: AppEvent) => {
    if (filter && !filter(event)) return
    handler(event)
  }
  handlers.add(wrapped)
  return () => {
    handlers.delete(wrapped)
  }
}

export function appEventMatchesScope(event: AppEvent, scope: AppEventScope): boolean {
  if (scope.kind === 'global') return event.scope.kind === 'global'
  return event.scope.kind === scope.kind && event.scope.id === scope.id
}

export function appEventIsExternalToSurface(event: AppEvent, surfaceId: string | null | undefined): boolean {
  const normalized = surfaceId?.trim()
  return !normalized || event.surfaceId !== normalized
}

export function projectAppEventScope(projectId: number | string | null | undefined): AppEventScope {
  const id = projectId === null || projectId === undefined || projectId === '' ? undefined : String(projectId)
  return id ? { kind: 'project', id } : { kind: 'global' }
}

export function resetAppEventDedupeForTests(): void {
  recentEventIds.clear()
  recentEventIdOrder.length = 0
  recentAppEvents.length = 0
}

export function recentAppEventSnapshots(): AppEvent[] {
  return [...recentAppEvents]
}

function appEventEnvelope<TPayload>(event: AppEventDraft<TPayload>): AppEventEnvelope<TPayload> {
  return {
    ...event,
    id: event.id ?? createAppEventId(event.topic),
    emittedAt: event.emittedAt ?? new Date().toISOString(),
  }
}

function wasAppEventSeen(id: string): boolean {
  if (recentEventIds.has(id)) return true
  recentEventIds.add(id)
  recentEventIdOrder.push(id)
  while (recentEventIdOrder.length > RECENT_EVENT_ID_LIMIT) {
    const expired = recentEventIdOrder.shift()
    if (expired) recentEventIds.delete(expired)
  }
  return false
}

function createAppEventId(topic: AppEventTopic): string {
  return `${topic}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}

function rememberAppEvent(event: AppEvent): void {
  recentAppEvents.push(event)
  while (recentAppEvents.length > RECENT_APP_EVENT_LIMIT) recentAppEvents.shift()
}
