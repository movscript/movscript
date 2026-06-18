import {
  appEventIsExternalToSurface,
  appEventMatchesScope,
  subscribeAppEvents,
  type AppEvent,
  type AppEventScope,
  type AppEventTopic,
} from './appEvents'

export interface AppEventSurfacePolicy {
  surfaceId: string
  topics: readonly AppEventTopic[]
  scopes?: readonly AppEventScope[]
  origins?: readonly string[]
  sources?: readonly string[]
  ignoreSources?: readonly string[]
  ignoreCausationIds?: () => ReadonlySet<string>
}

export function appEventMatchesSurfacePolicy(event: AppEvent, policy: AppEventSurfacePolicy): boolean {
  if (!appEventIsExternalToSurface(event, policy.surfaceId)) return false
  if (!policy.topics.includes(event.topic)) return false
  if (policy.scopes?.length && !policy.scopes.some((scope) => appEventMatchesScope(event, scope))) return false
  const origin = eventOrigin(event)
  if (policy.origins?.length && !originMatches(origin, policy.origins)) return false
  if (policy.sources?.length && !policy.sources.includes(event.source)) return false
  if (policy.ignoreSources?.includes(event.source)) return false
  if (event.causationId && policy.ignoreCausationIds?.().has(event.causationId)) return false
  return true
}

export function subscribeAppEventSurfacePolicy(
  policy: AppEventSurfacePolicy,
  handler: (event: AppEvent) => void,
): () => void {
  return subscribeAppEvents(handler, (event) => appEventMatchesSurfacePolicy(event, policy))
}

function eventOrigin(event: AppEvent): string | undefined {
  const payload = event.payload
  return payload && typeof payload === 'object' && typeof (payload as { origin?: unknown }).origin === 'string'
    ? (payload as { origin: string }).origin
    : undefined
}

function originMatches(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin !== undefined && allowed.includes(origin)
}
