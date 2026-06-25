import { createEventBus } from './eventBus'
import { configureSurfaceAppEvents } from '@movscript/shared/app-events'

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

type AppEventMap = {
  event: AppEvent
}

const appEventBus = createEventBus<AppEventMap>()
const recentEventIds = new Set<string>()
const recentEventIdOrder: string[] = []
const RECENT_EVENT_ID_LIMIT = 1000
const recentAppEvents: AppEvent[] = []
const RECENT_APP_EVENT_LIMIT = 200

export function publishAppEvent<TPayload>(event: Omit<AppEventEnvelope<TPayload>, 'id' | 'emittedAt'> & {
  id?: string
  emittedAt?: string
}): boolean {
  const envelope: AppEventEnvelope<TPayload> = {
    ...event,
    id: event.id ?? createAppEventId(event.topic),
    emittedAt: event.emittedAt ?? new Date().toISOString(),
  }
  if (wasAppEventSeen(envelope.id)) return false
  rememberAppEvent(envelope)
  appEventBus.publish('event', envelope)
  return true
}

export function subscribeAppEvents(
  handler: (event: AppEvent) => void,
  filter?: (event: AppEvent) => boolean,
): () => void {
  return appEventBus.subscribe('event', (event) => {
    if (filter && !filter(event)) return
    handler(event)
  })
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

export function editingAppEventScope(editingProjectId: number | string | null | undefined): AppEventScope {
  const id = editingProjectId === null || editingProjectId === undefined || editingProjectId === '' ? undefined : String(editingProjectId)
  return id ? { kind: 'editing', id } : { kind: 'editing' }
}

export function resetAppEventDedupeForTests(): void {
  recentEventIds.clear()
  recentEventIdOrder.length = 0
  recentAppEvents.length = 0
}

export function recentAppEventSnapshots(): AppEvent[] {
  return [...recentAppEvents]
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
  while (recentAppEvents.length > RECENT_APP_EVENT_LIMIT) {
    recentAppEvents.shift()
  }
}

configureSurfaceAppEvents({
  publish: publishAppEvent as <TPayload>(event: import('@movscript/shared/app-events').AppEventDraft<TPayload>) => boolean,
  subscribe: subscribeAppEvents as (
    handler: (event: import('@movscript/shared/app-events').AppEvent) => void,
    filter?: (event: import('@movscript/shared/app-events').AppEvent) => boolean,
  ) => () => void,
})
