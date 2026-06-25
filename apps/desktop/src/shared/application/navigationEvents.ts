import { createEventBus } from '@/shared/application/eventBus'
import {
  WORKSPACE_CHANGE_HANDOFF_EVENT,
  workspaceChangeHandoffPathFromEventDetail,
} from '@/shared/contracts/workspaceChangeHandoff'

export const API_REDIRECT_EVENT = 'api:redirect'

type NavigationEventMap = {
  [API_REDIRECT_EVENT]: string
  [WORKSPACE_CHANGE_HANDOFF_EVENT]: string
}

const navigationEventBus = createEventBus<NavigationEventMap>()

export function publishApiRedirect(path: string) {
  const normalizedPath = path.trim()
  if (!normalizedPath) return
  navigationEventBus.publish(API_REDIRECT_EVENT, normalizedPath)
}

export function subscribeApiRedirect(handler: (path: string) => void) {
  return navigationEventBus.subscribe(API_REDIRECT_EVENT, handler)
}

export function publishWorkspaceChangeHandoff(detail: unknown) {
  const path = workspaceChangeHandoffPathFromEventDetail(detail)
  if (!path) return
  navigationEventBus.publish(WORKSPACE_CHANGE_HANDOFF_EVENT, path)
}

export function subscribeWorkspaceChangeHandoff(handler: (path: string) => void) {
  return navigationEventBus.subscribe(WORKSPACE_CHANGE_HANDOFF_EVENT, handler)
}

export function attachWorkspaceChangeHandoffDomBridge(target?: Pick<Window, 'addEventListener' | 'removeEventListener'>) {
  const eventTarget = target ?? (typeof window !== 'undefined' ? window : undefined)
  if (!eventTarget) return () => undefined

  function handleWorkspaceChangeHandoff(event: Event) {
    publishWorkspaceChangeHandoff((event as CustomEvent<unknown>).detail)
  }

  eventTarget.addEventListener(WORKSPACE_CHANGE_HANDOFF_EVENT, handleWorkspaceChangeHandoff)
  return () => {
    eventTarget.removeEventListener(WORKSPACE_CHANGE_HANDOFF_EVENT, handleWorkspaceChangeHandoff)
  }
}
