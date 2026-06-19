import type { Viewport } from '@xyflow/react'

import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { CONTENT_CANVAS_DEFAULT_NODE_SIZE, type ContentCanvasNodeLayout } from './contentCanvasLayout'

export interface ContentCanvasNodePosition {
  x: number
  y: number
}

export interface ContentCanvasViewState {
  schema?: typeof CONTENT_CANVAS_VIEW_STATE_SCHEMA
  projectId: number
  graphScope?: ContentCanvasViewStateScope
  nodePositions: Record<string, ContentCanvasNodePosition>
  nodeLayouts?: Record<string, ContentCanvasNodeLayout>
  presentationNodes?: Record<string, ContentCanvasPresentationNode>
  preferences?: ContentCanvasViewPreferences
  viewport?: Viewport
  focusedNodeId?: string
  updatedAt: string
}

export interface ContentCanvasViewStateScope {
  productionId?: string
  mode?: string
}

export interface ContentCanvasPresentationNode {
  id: string
  kind: Extract<ContentCanvasNodeKind, 'group'>
  title: string
  summary: string
  position: ContentCanvasNodePosition
  createdAt: string
}

export type ContentCanvasEdgeFilter = ContentCanvasEdge['kind'] | NonNullable<ContentCanvasEdge['relation']>

export interface ContentCanvasViewPreferences {
  hiddenKinds?: ContentCanvasNodeKind[]
  edgeFilters?: ContentCanvasEdgeFilter[]
}

export const CONTENT_CANVAS_VIEW_STATE_SCHEMA = 'movscript.content_canvas_layout.v1'
export const CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX = 'movscript-content-canvas-view-state-v1'
const STORAGE_PREFIX = 'movscript.contentCanvas.viewState.v1'
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
  if (typeof window.addEventListener !== 'function' || typeof window.removeEventListener !== 'function') {
    return () => undefined
  }
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
  window.addEventListener(CONTENT_CANVAS_VIEW_STATE_CHANGED_EVENT, handleContentCanvasViewStateChanged)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(CONTENT_CANVAS_VIEW_STATE_CHANGED_EVENT, handleContentCanvasViewStateChanged)
    window.removeEventListener('storage', handleStorage)
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
  const key = storageKey(projectId, scope)
  contentCanvasViewStateCache.set(key, next)
  bumpContentCanvasViewStateVersion(key)
  persistContentCanvasViewState(projectId, next, scope)
  dispatchContentCanvasViewStateChanged(projectId, scope)
  return next
}

export function toggleContentCanvasHiddenKindPreference(
  projectId: number | undefined,
  kind: ContentCanvasNodeKind,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  const hiddenKinds = new Set(current?.preferences?.hiddenKinds ?? [])
  if (hiddenKinds.has(kind)) hiddenKinds.delete(kind)
  else hiddenKinds.add(kind)
  return writeContentCanvasViewState(projectId, {
    preferences: {
      ...current?.preferences,
      hiddenKinds: [...hiddenKinds],
    },
  }, scope)
}

export function toggleContentCanvasEdgeFilterPreference(
  projectId: number | undefined,
  filter: ContentCanvasEdgeFilter,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  const edgeFilters = new Set(current?.preferences?.edgeFilters ?? [])
  if (edgeFilters.has(filter)) edgeFilters.delete(filter)
  else edgeFilters.add(filter)
  return writeContentCanvasViewState(projectId, {
    preferences: {
      ...current?.preferences,
      edgeFilters: [...edgeFilters],
    },
  }, scope)
}

export function setContentCanvasEdgeFilterPreferences(
  projectId: number | undefined,
  filters: ContentCanvasEdgeFilter[],
  hidden: boolean,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  const edgeFilters = new Set(current?.preferences?.edgeFilters ?? [])
  for (const filter of filters) {
    if (hidden) edgeFilters.add(filter)
    else edgeFilters.delete(filter)
  }
  return writeContentCanvasViewState(projectId, {
    preferences: {
      ...current?.preferences,
      edgeFilters: [...edgeFilters],
    },
  }, scope)
}

export function createContentCanvasPresentationGroupNode(
  projectId: number | undefined,
  input: { position: ContentCanvasNodePosition; title?: string; summary?: string },
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  const createdAt = new Date().toISOString()
  const id = `group:${Date.now().toString(36)}`
  return writeContentCanvasViewState(projectId, {
    presentationNodes: {
      ...current?.presentationNodes,
      [id]: {
        id,
        kind: 'group',
        title: input.title?.trim() || '画布分组',
        summary: input.summary?.trim() || '本地画布分组，不写入项目业务数据。',
        position: input.position,
        createdAt,
      },
    },
    nodePositions: {
      ...current?.nodePositions,
      [id]: input.position,
    },
    nodeLayouts: {
      ...current?.nodeLayouts,
      [id]: {
        ...(current?.nodeLayouts?.[id] ?? {
          width: CONTENT_CANVAS_DEFAULT_NODE_SIZE.width,
          height: CONTENT_CANVAS_DEFAULT_NODE_SIZE.height,
        }),
        x: input.position.x,
        y: input.position.y,
        manual: true,
        source: 'manual',
        updatedAt: createdAt,
      },
    },
  }, scope)
}

export function applyContentCanvasPresentationNodes(
  graph: ContentCanvasGraph,
  presentationNodes: Record<string, ContentCanvasPresentationNode> | undefined,
): ContentCanvasGraph {
  if (!presentationNodes || Object.keys(presentationNodes).length === 0) return graph
  const existingIds = new Set(graph.nodes.map((node) => node.id))
  const nodes = Object.values(presentationNodes)
    .filter((node) => !existingIds.has(node.id))
    .map(contentCanvasNodeFromPresentationNode)
  if (!nodes.length) return graph
  return {
    nodes: [...graph.nodes, ...nodes],
    edges: graph.edges,
  }
}

export function updateContentCanvasPresentationNode(
  projectId: number | undefined,
  nodeId: string,
  patch: Partial<Pick<ContentCanvasPresentationNode, 'title' | 'summary'>>,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  const node = current?.presentationNodes?.[nodeId]
  if (!node) return current
  return writeContentCanvasViewState(projectId, {
    presentationNodes: {
      ...current?.presentationNodes,
      [nodeId]: {
        ...node,
        title: patch.title?.trim() || node.title,
        summary: patch.summary?.trim() || node.summary,
      },
    },
  }, scope)
}

export function mergeContentCanvasNodePositions(
  projectId: number | undefined,
  nodePositions: Record<string, ContentCanvasNodePosition>,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  const updatedAt = new Date().toISOString()
  return writeContentCanvasViewState(projectId, {
    nodePositions: {
      ...current?.nodePositions,
      ...nodePositions,
    },
    nodeLayouts: {
      ...current?.nodeLayouts,
      ...Object.fromEntries(
        Object.entries(nodePositions).map(([nodeId, position]) => [
          nodeId,
          {
            ...(current?.nodeLayouts?.[nodeId] ?? {
              width: CONTENT_CANVAS_DEFAULT_NODE_SIZE.width,
              height: CONTENT_CANVAS_DEFAULT_NODE_SIZE.height,
            }),
            x: position.x,
            y: position.y,
            manual: true,
            source: 'manual' as const,
            updatedAt,
          },
        ]),
      ),
    },
  }, scope)
}

export function mergeContentCanvasNodeLayouts(
  projectId: number | undefined,
  nodeLayouts: Record<string, ContentCanvasNodeLayout>,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasViewState(projectId, scope)
  return writeContentCanvasViewState(projectId, {
    nodePositions: {
      ...current?.nodePositions,
      ...Object.fromEntries(Object.entries(nodeLayouts).map(([nodeId, layout]) => [nodeId, { x: layout.x, y: layout.y }])),
    },
    nodeLayouts: {
      ...current?.nodeLayouts,
      ...nodeLayouts,
    },
  }, scope)
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
  const api = readElectronApi()
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
  const api = readElectronApi()
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
  const api = readElectronApi()
  if (api?.removeDesktopState) {
    void api.removeDesktopState({ key: contentCanvasViewStateDesktopKey(projectId, scope) })
      .catch(() => undefined)
  }
  contentCanvasViewStateHydrations.add(legacyKey)
  removeBrowserStorageItem('local', storageKey(projectId, scope))
}

export function clearContentCanvasNodePositions(projectId: number | undefined, scope?: ContentCanvasViewStateScope): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  return writeContentCanvasViewState(projectId, { nodePositions: {}, nodeLayouts: {} }, scope)
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
  const key = storageKey(projectId, scope)
  contentCanvasViewStateCache.set(key, next)
  bumpContentCanvasViewStateVersion(key)
  persistContentCanvasViewState(projectId, next, scope)
  dispatchContentCanvasViewStateChanged(projectId, scope)
  return next
}

function parseContentCanvasViewState(raw: string | null | undefined, projectId: number): ContentCanvasViewState | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isViewState(parsed, projectId)) return undefined
    return parsed
  } catch {
    return undefined
  }
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
  if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return
  window.dispatchEvent(new CustomEvent(CONTENT_CANVAS_VIEW_STATE_CHANGED_EVENT, {
    detail: { key: storageKey(projectId, scope) },
  }))
}

function contentCanvasViewStateDesktopKey(projectId: number, scope?: ContentCanvasViewStateScope): string {
  const scopeKey = contentCanvasViewStateScopeKey(scope).replace(/:/g, '.')
  const candidate = [CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX, String(projectId), scopeKey].filter(Boolean).join('.')
  if (candidate.length <= 96) return candidate
  return [CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX, String(projectId), stableHash(scopeKey)].join('.')
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function contentCanvasNodeFromPresentationNode(node: ContentCanvasPresentationNode): ContentCanvasNode {
  return {
    id: node.id,
    entityKey: node.id,
    kind: node.kind,
    title: node.title,
    subtitle: '本地画布',
    summary: node.summary,
    status: 'neutral',
    metrics: ['presentation-only'],
    sourcePath: '',
    record: {
      presentationOnly: true,
      createdAt: node.createdAt,
    },
    candidates: [],
    position: node.position,
  }
}

function storageKey(projectId: number, scope?: ContentCanvasViewStateScope): string {
  const scopeKey = contentCanvasViewStateScopeKey(scope)
  return scopeKey ? `${STORAGE_PREFIX}:${projectId}:${scopeKey}` : `${STORAGE_PREFIX}:${projectId}`
}

function contentCanvasViewStateScopeKey(scope: ContentCanvasViewStateScope | undefined): string {
  if (!scope) return ''
  return [
    scope.productionId ? `production-${safeScopeSegment(scope.productionId)}` : undefined,
    scope.mode ? `mode-${safeScopeSegment(scope.mode)}` : undefined,
  ].filter(Boolean).join(':')
}

function safeScopeSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'default'
}

function isViewState(value: unknown, projectId: number): value is ContentCanvasViewState {
  if (!isRecord(value)) return false
  if (value.schema !== undefined && value.schema !== CONTENT_CANVAS_VIEW_STATE_SCHEMA) return false
  if (value.projectId !== projectId) return false
  if (!isRecord(value.nodePositions)) return false
  if (value.nodeLayouts !== undefined && !isNodeLayouts(value.nodeLayouts)) return false
  if (value.presentationNodes !== undefined && !isPresentationNodes(value.presentationNodes)) return false
  if (value.preferences !== undefined && !isPreferences(value.preferences)) return false
  if (value.viewport !== undefined && !isViewport(value.viewport)) return false
  return true
}

function isViewport(value: unknown): value is Viewport {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number'
    && typeof value.zoom === 'number'
}

function isNodeLayouts(value: unknown): value is Record<string, ContentCanvasNodeLayout> {
  if (!isRecord(value)) return false
  return Object.values(value).every((layout) => (
    isRecord(layout)
    && typeof layout.x === 'number'
    && typeof layout.y === 'number'
    && typeof layout.width === 'number'
    && typeof layout.height === 'number'
  ))
}

function isPresentationNodes(value: unknown): value is Record<string, ContentCanvasPresentationNode> {
  if (!isRecord(value)) return false
  return Object.values(value).every((node) => (
    isRecord(node)
    && typeof node.id === 'string'
    && node.kind === 'group'
    && typeof node.title === 'string'
    && typeof node.summary === 'string'
    && isPosition(node.position)
    && typeof node.createdAt === 'string'
  ))
}

function isPreferences(value: unknown): value is ContentCanvasViewPreferences {
  if (!isRecord(value)) return false
  if (value.hiddenKinds !== undefined && !isStringArray(value.hiddenKinds)) return false
  if (value.edgeFilters !== undefined && !isStringArray(value.edgeFilters)) return false
  return true
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPosition(value: unknown): value is ContentCanvasNodePosition {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
