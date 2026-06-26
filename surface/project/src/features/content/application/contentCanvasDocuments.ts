import type { Viewport } from '@xyflow/react'

import { readSurfaceHostApi } from '@movscript/shared'
import { listenToWindowEvent, publishWindowEvent, readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@movscript/shared/browser'
import type { ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { CONTENT_CANVAS_DEFAULT_NODE_SIZE, type ContentCanvasNodeLayout } from './contentCanvasLayout'

export const CONTENT_CANVAS_DOCUMENTS_SCHEMA = 'movscript.content_canvas_documents.v1'
export const CONTENT_CANVAS_DOCUMENTS_DESKTOP_PREFIX = 'movscript-content-canvas-documents-v1'

const CONTENT_CANVAS_DOCUMENTS_STORAGE_PREFIX = 'movscript.contentCanvas.documents.v1'
const CONTENT_CANVAS_DOCUMENTS_CHANGED_EVENT = 'movscript:content-canvas-documents-changed'

export interface ContentCanvasDocumentNodeRef {
  nodeId: string
  kind?: ContentCanvasNodeKind
  addedAt: string
}

export interface ContentCanvasDocument {
  id: string
  title: string
  nodes: Record<string, ContentCanvasDocumentNodeRef>
  nodeLayouts?: Record<string, ContentCanvasNodeLayout>
  viewport?: Viewport
  updatedAt: string
}

export interface ContentCanvasDocumentsState {
  schema: typeof CONTENT_CANVAS_DOCUMENTS_SCHEMA
  projectId: number
  activeCanvasId: string
  documents: Record<string, ContentCanvasDocument>
  updatedAt: string
}

export type ContentCanvasDocumentNodeInput = {
  nodeId: string
  kind?: ContentCanvasNodeKind
  position?: { x: number; y: number }
}

const contentCanvasDocumentsCache = new Map<number, ContentCanvasDocumentsState | undefined>()
const contentCanvasDocumentsHydrations = new Set<number>()
const contentCanvasDocumentsVersions = new Map<number, number>()
let contentCanvasDocumentsWindow: Window | undefined

export function readContentCanvasDocumentsState(projectId: number | undefined): ContentCanvasDocumentsState | undefined {
  if (!projectId) return undefined
  syncContentCanvasDocumentsCacheWindow()
  hydrateContentCanvasDocumentsState(projectId)
  if (contentCanvasDocumentsCache.has(projectId)) return contentCanvasDocumentsCache.get(projectId)
  const parsed = readBrowserContentCanvasDocumentsState(projectId)
  contentCanvasDocumentsCache.set(projectId, parsed)
  return parsed
}

export function ensureContentCanvasDocumentsState(projectId: number | undefined): ContentCanvasDocumentsState | undefined {
  if (!projectId) return undefined
  const current = readContentCanvasDocumentsState(projectId)
  if (current && current.documents[current.activeCanvasId]) return current
  const now = new Date().toISOString()
  const document = createBlankContentCanvasDocument({ title: '自由画布', now })
  const next: ContentCanvasDocumentsState = {
    schema: CONTENT_CANVAS_DOCUMENTS_SCHEMA,
    projectId,
    activeCanvasId: document.id,
    documents: { [document.id]: document },
    updatedAt: now,
  }
  saveContentCanvasDocumentsState(projectId, next)
  return next
}

export function subscribeContentCanvasDocumentsState(
  projectId: number | undefined,
  listener: () => void,
): () => void {
  if (!projectId || typeof window === 'undefined') return () => undefined
  const key = contentCanvasDocumentsStorageKey(projectId)
  const handleContentCanvasDocumentsChanged = (event: Event) => {
    const changedProjectId = (event as CustomEvent<{ projectId?: number }>).detail?.projectId
    if (!changedProjectId || changedProjectId === projectId) listener()
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== key) return
    contentCanvasDocumentsCache.set(projectId, parseContentCanvasDocumentsState(event.newValue, projectId))
    listener()
  }
  const unsubscribeDocumentsChanged = listenToWindowEvent(CONTENT_CANVAS_DOCUMENTS_CHANGED_EVENT, handleContentCanvasDocumentsChanged)
  const unsubscribeStorage = listenToWindowEvent('storage', handleStorage)
  return () => {
    unsubscribeDocumentsChanged()
    unsubscribeStorage()
  }
}

export function createContentCanvasDocument(
  projectId: number | undefined,
  input: { title?: string } = {},
): ContentCanvasDocumentsState | undefined {
  if (!projectId) return undefined
  const current = ensureContentCanvasDocumentsState(projectId)
  if (!current) return undefined
  const now = new Date().toISOString()
  const document = createBlankContentCanvasDocument({
    title: input.title?.trim() || `自由画布 ${Object.keys(current.documents).length + 1}`,
    now,
  })
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    activeCanvasId: document.id,
    documents: {
      ...current.documents,
      [document.id]: document,
    },
    updatedAt: now,
  })
}

export function selectContentCanvasDocument(
  projectId: number | undefined,
  canvasId: string,
): ContentCanvasDocumentsState | undefined {
  if (!projectId) return undefined
  const current = ensureContentCanvasDocumentsState(projectId)
  if (!current?.documents[canvasId]) return current
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    activeCanvasId: canvasId,
    updatedAt: new Date().toISOString(),
  })
}

export function addContentCanvasDocumentNodes(
  projectId: number | undefined,
  canvasId: string | undefined,
  nodes: ContentCanvasDocumentNodeInput[],
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId || nodes.length === 0) return readContentCanvasDocumentsState(projectId)
  const current = ensureContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const now = new Date().toISOString()
  let changed = false
  const nextNodes = { ...document.nodes }
  const nextLayouts = { ...(document.nodeLayouts ?? {}) }
  for (const node of nodes) {
    if (!node.nodeId.trim()) continue
    const existing = nextNodes[node.nodeId]
    nextNodes[node.nodeId] = {
      nodeId: node.nodeId,
      kind: node.kind ?? existing?.kind,
      addedAt: existing?.addedAt ?? now,
    }
    if (node.position) {
      nextLayouts[node.nodeId] = {
        ...(nextLayouts[node.nodeId] ?? {
          width: CONTENT_CANVAS_DEFAULT_NODE_SIZE.width,
          height: CONTENT_CANVAS_DEFAULT_NODE_SIZE.height,
        }),
        x: node.position.x,
        y: node.position.y,
        manual: true,
        source: 'manual',
        updatedAt: now,
      }
    }
    changed = true
  }
  if (!changed) return current
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        nodes: nextNodes,
        nodeLayouts: nextLayouts,
        updatedAt: now,
      },
    },
    updatedAt: now,
  })
}

export function removeContentCanvasDocumentNodes(
  projectId: number | undefined,
  canvasId: string | undefined,
  nodeIds: Iterable<string>,
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId) return readContentCanvasDocumentsState(projectId)
  const current = readContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const ids = new Set(nodeIds)
  if (!ids.size) return current
  const nodes = { ...document.nodes }
  const nodeLayouts = { ...(document.nodeLayouts ?? {}) }
  let changed = false
  for (const nodeId of ids) {
    if (!Object.prototype.hasOwnProperty.call(nodes, nodeId)) continue
    delete nodes[nodeId]
    delete nodeLayouts[nodeId]
    changed = true
  }
  if (!changed) return current
  const now = new Date().toISOString()
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        nodes,
        nodeLayouts,
        updatedAt: now,
      },
    },
    updatedAt: now,
  })
}

export function removeContentCanvasDocumentNodesEverywhere(
  projectId: number | undefined,
  nodeIds: Iterable<string>,
): ContentCanvasDocumentsState | undefined {
  if (!projectId) return readContentCanvasDocumentsState(projectId)
  const current = readContentCanvasDocumentsState(projectId)
  if (!current) return current
  const ids = new Set(nodeIds)
  if (!ids.size) return current
  const now = new Date().toISOString()
  let changed = false
  const documents: Record<string, ContentCanvasDocument> = {}
  for (const [canvasId, document] of Object.entries(current.documents)) {
    const nodes = { ...document.nodes }
    const nodeLayouts = { ...(document.nodeLayouts ?? {}) }
    let documentChanged = false
    for (const nodeId of ids) {
      if (!Object.prototype.hasOwnProperty.call(nodes, nodeId)) continue
      delete nodes[nodeId]
      delete nodeLayouts[nodeId]
      changed = true
      documentChanged = true
    }
    documents[canvasId] = documentChanged
      ? {
        ...document,
        nodes,
        nodeLayouts,
        updatedAt: now,
      }
      : document
  }
  if (!changed) return current
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents,
    updatedAt: now,
  })
}

export function updateContentCanvasDocumentNodePositions(
  projectId: number | undefined,
  canvasId: string | undefined,
  positions: Record<string, { x: number; y: number }>,
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId || Object.keys(positions).length === 0) return readContentCanvasDocumentsState(projectId)
  const current = ensureContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const now = new Date().toISOString()
  const nodes = { ...document.nodes }
  const nodeLayouts = { ...(document.nodeLayouts ?? {}) }
  for (const [nodeId, position] of Object.entries(positions)) {
    nodes[nodeId] = nodes[nodeId] ?? { nodeId, addedAt: now }
    nodeLayouts[nodeId] = {
      ...(nodeLayouts[nodeId] ?? {
        width: CONTENT_CANVAS_DEFAULT_NODE_SIZE.width,
        height: CONTENT_CANVAS_DEFAULT_NODE_SIZE.height,
      }),
      x: position.x,
      y: position.y,
      manual: true,
      source: 'manual',
      updatedAt: now,
    }
  }
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        nodes,
        nodeLayouts,
        updatedAt: now,
      },
    },
    updatedAt: now,
  })
}

export function updateContentCanvasDocumentViewport(
  projectId: number | undefined,
  canvasId: string | undefined,
  viewport: Viewport,
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId) return readContentCanvasDocumentsState(projectId)
  const current = ensureContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const now = new Date().toISOString()
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        viewport,
        updatedAt: now,
      },
    },
    updatedAt: now,
  })
}

export function clearContentCanvasDocumentNodePositions(
  projectId: number | undefined,
  canvasId: string | undefined,
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId) return readContentCanvasDocumentsState(projectId)
  const current = readContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const now = new Date().toISOString()
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        nodeLayouts: {},
        updatedAt: now,
      },
    },
    updatedAt: now,
  })
}

export function activeContentCanvasDocument(state: ContentCanvasDocumentsState | undefined): ContentCanvasDocument | undefined {
  return state?.documents[state.activeCanvasId]
}

export function contentCanvasDocumentNodeIds(document: ContentCanvasDocument | undefined): string[] {
  return Object.keys(document?.nodes ?? {})
}

export function contentCanvasDocumentPositions(document: ContentCanvasDocument | undefined): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    Object.entries(document?.nodeLayouts ?? {}).map(([nodeId, layout]) => [nodeId, { x: layout.x, y: layout.y }]),
  )
}

function writeContentCanvasDocumentsState(
  projectId: number,
  state: ContentCanvasDocumentsState,
): ContentCanvasDocumentsState {
  saveContentCanvasDocumentsState(projectId, state)
  return state
}

function createBlankContentCanvasDocument(input: { title: string; now: string }): ContentCanvasDocument {
  return {
    id: `canvas:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    nodes: {},
    nodeLayouts: {},
    updatedAt: input.now,
  }
}

function saveContentCanvasDocumentsState(projectId: number, state: ContentCanvasDocumentsState): void {
  contentCanvasDocumentsCache.set(projectId, state)
  bumpContentCanvasDocumentsVersion(projectId)
  persistContentCanvasDocumentsState(projectId, state)
  dispatchContentCanvasDocumentsChanged(projectId)
}

function hydrateContentCanvasDocumentsState(projectId: number): void {
  if (contentCanvasDocumentsHydrations.has(projectId)) return
  contentCanvasDocumentsHydrations.add(projectId)
  const legacy = readBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId))
  contentCanvasDocumentsCache.set(projectId, parseContentCanvasDocumentsState(legacy, projectId))
  const hydrationVersion = contentCanvasDocumentsVersions.get(projectId) ?? 0
  const api = readSurfaceHostApi()
  if (!api?.getDesktopState) return
  const desktopKey = contentCanvasDocumentsDesktopKey(projectId)
  void api.getDesktopState({ key: desktopKey }).then((result) => {
    if ((contentCanvasDocumentsVersions.get(projectId) ?? 0) !== hydrationVersion) return
    if (typeof result.value === 'string') {
      contentCanvasDocumentsCache.set(projectId, parseContentCanvasDocumentsState(result.value, projectId))
      removeBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId))
      dispatchContentCanvasDocumentsChanged(projectId)
      return
    }
    if (legacy !== null && api.setDesktopState) {
      void api.setDesktopState({ key: desktopKey, value: legacy })
        .then(() => removeBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId)))
        .catch(() => undefined)
    }
  }).catch(() => undefined)
}

function readBrowserContentCanvasDocumentsState(projectId: number): ContentCanvasDocumentsState | undefined {
  return parseContentCanvasDocumentsState(readBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId)), projectId)
}

function persistContentCanvasDocumentsState(projectId: number, state: ContentCanvasDocumentsState): void {
  const serialized = JSON.stringify(state)
  const api = readSurfaceHostApi()
  const legacyKey = contentCanvasDocumentsStorageKey(projectId)
  if (api?.setDesktopState) {
    void api.setDesktopState({ key: contentCanvasDocumentsDesktopKey(projectId), value: serialized })
      .then(() => removeBrowserStorageItem('local', legacyKey))
      .catch(() => writeBrowserStorageItem('local', legacyKey, serialized))
    return
  }
  writeBrowserStorageItem('local', legacyKey, serialized)
}

function parseContentCanvasDocumentsState(raw: string | null | undefined, projectId: number): ContentCanvasDocumentsState | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isDocumentsState(parsed, projectId)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function contentCanvasDocumentsStorageKey(projectId: number): string {
  return `${CONTENT_CANVAS_DOCUMENTS_STORAGE_PREFIX}:${projectId}`
}

export function contentCanvasDocumentsDesktopKey(projectId: number): string {
  return `${CONTENT_CANVAS_DOCUMENTS_DESKTOP_PREFIX}.${projectId}`
}

function syncContentCanvasDocumentsCacheWindow(): void {
  if (typeof window === 'undefined') {
    if (contentCanvasDocumentsWindow !== undefined) {
      contentCanvasDocumentsCache.clear()
      contentCanvasDocumentsHydrations.clear()
      contentCanvasDocumentsVersions.clear()
      contentCanvasDocumentsWindow = undefined
    }
    return
  }
  if (contentCanvasDocumentsWindow === window) return
  contentCanvasDocumentsCache.clear()
  contentCanvasDocumentsHydrations.clear()
  contentCanvasDocumentsVersions.clear()
  contentCanvasDocumentsWindow = window
}

function bumpContentCanvasDocumentsVersion(projectId: number): void {
  contentCanvasDocumentsVersions.set(projectId, (contentCanvasDocumentsVersions.get(projectId) ?? 0) + 1)
}

function dispatchContentCanvasDocumentsChanged(projectId: number): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return
  publishWindowEvent(new CustomEvent(CONTENT_CANVAS_DOCUMENTS_CHANGED_EVENT, {
    detail: { projectId },
  }))
}

function isDocumentsState(value: unknown, projectId: number): value is ContentCanvasDocumentsState {
  if (!isRecord(value)) return false
  if (value.schema !== CONTENT_CANVAS_DOCUMENTS_SCHEMA) return false
  if (value.projectId !== projectId) return false
  if (typeof value.activeCanvasId !== 'string') return false
  if (!isRecord(value.documents)) return false
  if (typeof value.updatedAt !== 'string') return false
  return Object.values(value.documents).every(isContentCanvasDocument)
    && Object.prototype.hasOwnProperty.call(value.documents, value.activeCanvasId)
}

function isContentCanvasDocument(value: unknown): value is ContentCanvasDocument {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id.trim()) return false
  if (typeof value.title !== 'string') return false
  if (!isRecord(value.nodes)) return false
  if (value.nodeLayouts !== undefined && !isNodeLayouts(value.nodeLayouts)) return false
  if (value.viewport !== undefined && !isViewport(value.viewport)) return false
  if (typeof value.updatedAt !== 'string') return false
  return Object.values(value.nodes).every(isDocumentNodeRef)
}

function isDocumentNodeRef(value: unknown): value is ContentCanvasDocumentNodeRef {
  return isRecord(value)
    && typeof value.nodeId === 'string'
    && typeof value.addedAt === 'string'
    && (value.kind === undefined || typeof value.kind === 'string')
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

function isViewport(value: unknown): value is Viewport {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number'
    && typeof value.zoom === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
