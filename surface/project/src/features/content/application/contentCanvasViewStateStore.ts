import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@movscript/shared/browser'
import { readSurfaceHostApi } from '@movscript/shared'
import { listenToWindowEvent, publishWindowEvent } from '@movscript/shared/browser'
import {
  CONTENT_CANVAS_VIEW_STATE_SCHEMA,
  contentCanvasViewStateDesktopKey,
  contentCanvasViewStateStorageKey as storageKey,
  parseContentCanvasViewState,
  type ContentCanvasViewState,
  type ContentCanvasViewStateScope,
} from './contentCanvasViewStateModel'

const CONTENT_CANVAS_VIEW_STATE_CHANGED_EVENT = 'movscript:content-canvas-view-state-changed'

const contentCanvasViewStateCache = new Map<string, ContentCanvasViewState | undefined>()
const contentCanvasViewStateHydrations = new Set<string>()
const contentCanvasViewStateVersions = new Map<string, number>()
let contentCanvasViewStateWindow: Window | undefined

export function readContentCanvasViewState(
  projectId: number | undefined,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  return readScopedContentCanvasViewState(projectId, scope)
    ?? (scope ? readScopedContentCanvasViewState(projectId) : undefined)
}

export function subscribeContentCanvasViewState(
  projectId: number | undefined,
  scope: ContentCanvasViewStateScope | undefined,
  listener: () => void,
): () => void {
  if (!projectId || typeof window === 'undefined') return () => undefined
  const keys = new Set([
    storageKey(projectId, scope),
    ...(scope ? [storageKey(projectId)] : []),
  ])
  const handleContentCanvasViewStateChanged = (event: Event) => {
    const changedKey = (event as CustomEvent<{ key?: string }>).detail?.key
    if (!changedKey || keys.has(changedKey)) listener()
  }
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || !keys.has(event.key)) return
    contentCanvasViewStateCache.set(event.key, parseContentCanvasViewState(event.newValue, projectId))
    listener()
  }
  const unsubscribeViewStateChanged = listenToWindowEvent(CONTENT_CANVAS_VIEW_STATE_CHANGED_EVENT, handleContentCanvasViewStateChanged)
  const unsubscribeStorage = listenToWindowEvent('storage', handleStorage)
  return () => {
    unsubscribeViewStateChanged()
    unsubscribeStorage()
  }
}

export function writeContentCanvasViewState(
  projectId: number | undefined,
  patch: Partial<Omit<ContentCanvasViewState, 'projectId' | 'updatedAt'>>,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  const next: ContentCanvasViewState = {
    schema: CONTENT_CANVAS_VIEW_STATE_SCHEMA,
    projectId,
    graphScope: scope ?? patch.graphScope ?? current?.graphScope,
    nodePositions: patch.nodePositions ?? current?.nodePositions ?? {},
    nodeLayouts: patch.nodeLayouts ?? current?.nodeLayouts,
    presentationNodes: patch.presentationNodes ?? current?.presentationNodes,
    preferences: patch.preferences ?? current?.preferences,
    viewport: patch.viewport ?? current?.viewport,
    focusedNodeId: patch.focusedNodeId ?? current?.focusedNodeId,
    updatedAt: new Date().toISOString(),
  }
  saveContentCanvasViewState(projectId, next, scope)
  return next
}

export function clearContentCanvasViewState(projectId: number | undefined, scope?: ContentCanvasViewStateScope): void {
  if (!projectId) return
  syncContentCanvasViewStateCacheWindow()
  const key = storageKey(projectId, scope)
  contentCanvasViewStateCache.set(key, undefined)
  bumpContentCanvasViewStateVersion(key)
  removePersistedContentCanvasViewState(projectId, scope)
  dispatchContentCanvasViewStateChanged(projectId, scope)
}

export function clearContentCanvasViewport(projectId: number | undefined, scope?: ContentCanvasViewStateScope): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  if (!current) return undefined
  const next: ContentCanvasViewState = {
    ...current,
    schema: CONTENT_CANVAS_VIEW_STATE_SCHEMA,
    graphScope: scope ?? current.graphScope,
    viewport: undefined,
    updatedAt: new Date().toISOString(),
  }
  saveContentCanvasViewState(projectId, next, scope)
  return next
}

function saveContentCanvasViewState(projectId: number, state: ContentCanvasViewState, scope?: ContentCanvasViewStateScope): void {
  const key = storageKey(projectId, scope)
  contentCanvasViewStateCache.set(key, state)
  bumpContentCanvasViewStateVersion(key)
  persistContentCanvasViewState(projectId, state, scope)
  dispatchContentCanvasViewStateChanged(projectId, scope)
}

function readScopedContentCanvasViewState(
  projectId: number,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  syncContentCanvasViewStateCacheWindow()
  const key = storageKey(projectId, scope)
  hydrateContentCanvasViewState(projectId, scope)
  if (contentCanvasViewStateCache.has(key)) return contentCanvasViewStateCache.get(key)
  const parsed = readBrowserContentCanvasViewState(projectId, scope)
  contentCanvasViewStateCache.set(key, parsed)
  return parsed
}

function hydrateContentCanvasViewState(projectId: number, scope?: ContentCanvasViewStateScope): void {
  const key = storageKey(projectId, scope)
  if (contentCanvasViewStateHydrations.has(key)) return
  contentCanvasViewStateHydrations.add(key)
  const legacy = readBrowserStorageItem('local', key)
  contentCanvasViewStateCache.set(key, parseContentCanvasViewState(legacy, projectId))
  const hydrationVersion = contentCanvasViewStateVersions.get(key) ?? 0
  const api = readSurfaceHostApi()
  if (!api?.getDesktopState) return
  const desktopKey = contentCanvasViewStateDesktopKey(projectId, scope)
  void api.getDesktopState({ key: desktopKey }).then((result) => {
    if ((contentCanvasViewStateVersions.get(key) ?? 0) !== hydrationVersion) return
    if (typeof result.value === 'string') {
      contentCanvasViewStateCache.set(key, parseContentCanvasViewState(result.value, projectId))
      removeBrowserStorageItem('local', key)
      dispatchContentCanvasViewStateChanged(projectId, scope)
      return
    }
    if (legacy !== null && api.setDesktopState) {
      void api.setDesktopState({ key: desktopKey, value: legacy })
        .then(() => removeBrowserStorageItem('local', key))
        .catch(() => undefined)
    }
  }).catch(() => undefined)
}

function readBrowserContentCanvasViewState(projectId: number, scope?: ContentCanvasViewStateScope): ContentCanvasViewState | undefined {
  return parseContentCanvasViewState(readBrowserStorageItem('local', storageKey(projectId, scope)), projectId)
}

function persistContentCanvasViewState(
  projectId: number,
  state: ContentCanvasViewState,
  scope?: ContentCanvasViewStateScope,
): void {
  const serialized = JSON.stringify(state)
  const legacyKey = storageKey(projectId, scope)
  const api = readSurfaceHostApi()
  if (api?.setDesktopState) {
    void api.setDesktopState({ key: contentCanvasViewStateDesktopKey(projectId, scope), value: serialized })
      .then(() => removeBrowserStorageItem('local', legacyKey))
      .catch(() => writeBrowserStorageItem('local', legacyKey, serialized))
    return
  }
  writeBrowserStorageItem('local', legacyKey, serialized)
}

function removePersistedContentCanvasViewState(projectId: number, scope?: ContentCanvasViewStateScope): void {
  const legacyKey = storageKey(projectId, scope)
  const api = readSurfaceHostApi()
  if (api?.removeDesktopState) {
    void api.removeDesktopState({ key: contentCanvasViewStateDesktopKey(projectId, scope) })
      .catch(() => undefined)
  }
  contentCanvasViewStateHydrations.add(legacyKey)
  removeBrowserStorageItem('local', storageKey(projectId, scope))
}

function syncContentCanvasViewStateCacheWindow(): void {
  if (typeof window === 'undefined') {
    if (contentCanvasViewStateWindow !== undefined) {
      contentCanvasViewStateCache.clear()
      contentCanvasViewStateHydrations.clear()
      contentCanvasViewStateVersions.clear()
      contentCanvasViewStateWindow = undefined
    }
    return
  }
  if (contentCanvasViewStateWindow === window) return
  contentCanvasViewStateCache.clear()
  contentCanvasViewStateHydrations.clear()
  contentCanvasViewStateVersions.clear()
  contentCanvasViewStateWindow = window
}

function bumpContentCanvasViewStateVersion(key: string): void {
  contentCanvasViewStateVersions.set(key, (contentCanvasViewStateVersions.get(key) ?? 0) + 1)
}

function dispatchContentCanvasViewStateChanged(projectId: number, scope?: ContentCanvasViewStateScope): void {
  if (typeof window === 'undefined') return
  if (typeof CustomEvent === 'undefined') return
  publishWindowEvent(new CustomEvent(CONTENT_CANVAS_VIEW_STATE_CHANGED_EVENT, {
    detail: { key: storageKey(projectId, scope) },
  }))
}
