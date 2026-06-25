import { configureSurfaceAppEvents, type AppEventDraft } from '@movscript/shared/app-events'

export interface AppEvent {
  topic: string
  scope?: unknown
  source?: string
  payload?: unknown
  raw?: unknown
}

export function publishAppEvent(event: AppEvent): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('movscript:app-event', { detail: event }))
}

export function projectAppEventScope(projectId: number | undefined | null): { kind: 'project'; projectId?: number } {
  return projectId ? { kind: 'project', projectId } : { kind: 'project' }
}

configureSurfaceAppEvents({
  publish: (event: AppEventDraft) => {
    publishAppEvent(event)
    return true
  },
})
