import type { Viewport } from '@xyflow/react'

import { currentSurfaceWorkspaceProjectDir, readSurfaceHostApi } from '@movscript/shared'
import { listenToWindowEvent, publishWindowEvent, readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@movscript/shared/browser'
import type { ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { CONTENT_CANVAS_DEFAULT_NODE_SIZE, type ContentCanvasLayoutSource, type ContentCanvasNodeLayout } from './contentCanvasLayout'

export const CONTENT_CANVAS_DOCUMENTS_SCHEMA = 'movscript.content_canvas_documents.v1'
export const CONTENT_CANVAS_DOCUMENTS_DESKTOP_PREFIX = 'movscript-content-canvas-documents-v1'
export const CONTENT_CANVAS_PROJECT_DOCUMENT_SCHEMA = 'movscript.content_canvas.v1'
export const CONTENT_CANVAS_PROJECT_DOCUMENTS_SCHEMA = 'movscript.content_canvases.v1'

const CONTENT_CANVAS_DOCUMENTS_STORAGE_PREFIX = 'movscript.contentCanvas.documents.v1'
const CONTENT_CANVAS_DOCUMENTS_CHANGED_EVENT = 'movscript:content-canvas-documents-changed'

export interface ContentCanvasDocumentNodeRef {
  nodeId: string
  kind?: ContentCanvasNodeKind
  addedAt: string
}

export type ContentCanvasDocumentScope =
  | { kind: 'global' }
  | {
    kind: 'production'
    productionId: string
    productionTitle?: string
    productionNodeId?: string
    productionPath?: string
  }

export interface ContentCanvasDocument {
  id: string
  title: string
  scope?: ContentCanvasDocumentScope
  nodes: Record<string, ContentCanvasDocumentNodeRef>
  nodeLayouts?: Record<string, ContentCanvasNodeLayout>
  viewport?: Viewport
  updatedAt: string
}

export type ContentCanvasProjectDocumentScope =
  | { kind: 'global' }
  | {
    kind: 'production'
    production_id: string
    production_title?: string
    production_node_id?: string
    production_path?: string
  }

export interface ContentCanvasProjectDocumentNodeRef {
  node_id: string
  kind?: ContentCanvasNodeKind
  added_at?: string
}

export interface ContentCanvasProjectNodeLayout {
  x: number
  y: number
  width: number
  height: number
  manual?: boolean
  source?: string
  updated_at?: string
}

export interface ContentCanvasProjectDocument {
  schema: typeof CONTENT_CANVAS_PROJECT_DOCUMENT_SCHEMA
  kind: 'content_canvas'
  id: string
  title: string
  scope: ContentCanvasProjectDocumentScope
  nodes: ContentCanvasProjectDocumentNodeRef[]
  layouts: Record<string, ContentCanvasProjectNodeLayout>
  viewport?: Viewport
  updated_at: string
  created_at?: string
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
  const document = createBlankContentCanvasDocument({ title: '自由内容画布', now })
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
  input: { title?: string; scope?: ContentCanvasDocumentScope } = {},
): ContentCanvasDocumentsState | undefined {
  if (!projectId) return undefined
  const current = ensureContentCanvasDocumentsState(projectId)
  if (!current) return undefined
  const now = new Date().toISOString()
  const document = createBlankContentCanvasDocument({
    title: input.title?.trim() || `自由内容画布 ${Object.keys(current.documents).length + 1}`,
    now,
    scope: input.scope,
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

export function contentCanvasDocumentScope(document: ContentCanvasDocument | undefined): ContentCanvasDocumentScope {
  return document?.scope && isContentCanvasDocumentScope(document.scope)
    ? document.scope
    : { kind: 'global' }
}

export function contentCanvasProjectDocumentFromDocument(document: ContentCanvasDocument): ContentCanvasProjectDocument {
  return {
    schema: CONTENT_CANVAS_PROJECT_DOCUMENT_SCHEMA,
    kind: 'content_canvas',
    id: document.id,
    title: document.title,
    scope: contentCanvasProjectScopeFromDocumentScope(contentCanvasDocumentScope(document)),
    nodes: Object.values(document.nodes)
      .map((node) => ({
        node_id: node.nodeId,
        ...(node.kind ? { kind: node.kind } : {}),
        added_at: node.addedAt,
      }))
      .sort((left, right) => left.node_id.localeCompare(right.node_id)),
    layouts: contentCanvasProjectLayoutsFromDocumentLayouts(document.nodeLayouts),
    ...(document.viewport ? { viewport: document.viewport } : {}),
    updated_at: document.updatedAt,
  }
}

export function contentCanvasDocumentFromProjectDocument(value: unknown): ContentCanvasDocument | undefined {
  if (!isRecord(value)) return undefined
  const id = stringValue(value.id)
  if (!id) return undefined
  const updatedAt = stringValue(value.updated_at ?? value.updatedAt) ?? new Date().toISOString()
  const document: ContentCanvasDocument = {
    id,
    title: stringValue(value.title) ?? 'Untitled Canvas',
    scope: contentCanvasDocumentScopeFromProjectScope(value.scope),
    nodes: contentCanvasDocumentNodesFromProjectNodes(value.nodes),
    nodeLayouts: contentCanvasDocumentLayoutsFromProjectLayouts(value.layouts ?? value.node_layouts ?? value.nodeLayouts),
    ...(isViewport(value.viewport) ? { viewport: value.viewport } : {}),
    updatedAt,
  }
  return isContentCanvasDocument(document) ? document : undefined
}

export function contentCanvasDocumentsStateFromProjectCanvases(
  projectId: number,
  result: unknown,
  localState?: ContentCanvasDocumentsState,
): ContentCanvasDocumentsState | undefined {
  const records = contentCanvasProjectDocumentRecords(result)
  const documents = Object.fromEntries(
    records
      .map(contentCanvasDocumentFromProjectDocument)
      .filter((document): document is ContentCanvasDocument => Boolean(document))
      .map((document) => [document.id, document]),
  )
  const canvasIds = Object.keys(documents)
  if (canvasIds.length === 0) return undefined
  const fallbackActiveCanvasId = canvasIds[0]
  if (!fallbackActiveCanvasId) return undefined
  const activeCanvasId = localState?.activeCanvasId && documents[localState.activeCanvasId]
    ? localState.activeCanvasId
    : fallbackActiveCanvasId
  const updatedAt = canvasIds
    .map((canvasId) => documents[canvasId]?.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop() ?? new Date().toISOString()
  return {
    schema: CONTENT_CANVAS_DOCUMENTS_SCHEMA,
    projectId,
    activeCanvasId,
    documents,
    updatedAt,
  }
}

function writeContentCanvasDocumentsState(
  projectId: number,
  state: ContentCanvasDocumentsState,
): ContentCanvasDocumentsState {
  saveContentCanvasDocumentsState(projectId, state)
  return state
}

function createBlankContentCanvasDocument(input: {
  title: string
  now: string
  scope?: ContentCanvasDocumentScope
}): ContentCanvasDocument {
  return {
    id: `canvas:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    scope: input.scope ?? { kind: 'global' },
    nodes: {},
    nodeLayouts: {},
    updatedAt: input.now,
  }
}

function contentCanvasProjectScopeFromDocumentScope(scope: ContentCanvasDocumentScope): ContentCanvasProjectDocumentScope {
  if (scope.kind !== 'production') return { kind: 'global' }
  return {
    kind: 'production',
    production_id: scope.productionId,
    ...(scope.productionTitle ? { production_title: scope.productionTitle } : {}),
    ...(scope.productionNodeId ? { production_node_id: scope.productionNodeId } : {}),
    ...(scope.productionPath ? { production_path: scope.productionPath } : {}),
  }
}

function contentCanvasDocumentScopeFromProjectScope(value: unknown): ContentCanvasDocumentScope {
  const scope = isRecord(value) ? value : undefined
  if (!scope || scope.kind === 'global') return { kind: 'global' }
  if (scope.kind !== 'production') return { kind: 'global' }
  const productionId = stringValue(scope.production_id ?? scope.productionId)
  if (!productionId) return { kind: 'global' }
  const productionTitle = stringValue(scope.production_title ?? scope.productionTitle)
  const productionNodeId = stringValue(scope.production_node_id ?? scope.productionNodeId)
  const productionPath = stringValue(scope.production_path ?? scope.productionPath)
  return {
    kind: 'production',
    productionId,
    ...(productionTitle ? { productionTitle } : {}),
    ...(productionNodeId ? { productionNodeId } : {}),
    ...(productionPath ? { productionPath } : {}),
  }
}

function contentCanvasProjectLayoutsFromDocumentLayouts(
  layouts: Record<string, ContentCanvasNodeLayout> | undefined,
): Record<string, ContentCanvasProjectNodeLayout> {
  return Object.fromEntries(
    Object.entries(layouts ?? {}).map(([nodeId, layout]) => [nodeId, {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      ...(layout.manual !== undefined ? { manual: layout.manual } : {}),
      ...(layout.source ? { source: layout.source } : {}),
      ...(layout.updatedAt ? { updated_at: layout.updatedAt } : {}),
    }]),
  )
}

function contentCanvasDocumentLayoutsFromProjectLayouts(value: unknown): Record<string, ContentCanvasNodeLayout> {
  const layouts = isRecord(value) ? value : {}
  return Object.fromEntries(
    Object.entries(layouts)
      .map(([nodeId, layout]) => [nodeId, contentCanvasDocumentLayoutFromProjectLayout(layout)])
      .filter((entry): entry is [string, ContentCanvasNodeLayout] => Boolean(entry[1])),
  )
}

function contentCanvasDocumentLayoutFromProjectLayout(value: unknown): ContentCanvasNodeLayout | undefined {
  if (!isRecord(value)) return undefined
  if (
    typeof value.x !== 'number'
    || typeof value.y !== 'number'
    || typeof value.width !== 'number'
    || typeof value.height !== 'number'
  ) {
    return undefined
  }
  const updatedAt = stringValue(value.updated_at ?? value.updatedAt)
  const source = contentCanvasLayoutSource(value.source)
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    ...(typeof value.manual === 'boolean' ? { manual: value.manual } : {}),
    ...(source ? { source } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function contentCanvasLayoutSource(value: unknown): ContentCanvasLayoutSource | undefined {
  return value === 'initial' || value === 'manual' || value === 'suggested' || value === 'imported'
    ? value
    : undefined
}

function contentCanvasDocumentNodesFromProjectNodes(value: unknown): Record<string, ContentCanvasDocumentNodeRef> {
  const nodes = Array.isArray(value) ? value : Object.values(isRecord(value) ? value : {})
  return Object.fromEntries(
    nodes
      .map(contentCanvasDocumentNodeFromProjectNode)
      .filter((node): node is ContentCanvasDocumentNodeRef => Boolean(node))
      .map((node) => [node.nodeId, node]),
  )
}

function contentCanvasDocumentNodeFromProjectNode(value: unknown): ContentCanvasDocumentNodeRef | undefined {
  if (!isRecord(value)) return undefined
  const nodeId = stringValue(value.node_id ?? value.nodeId ?? value.id)
  if (!nodeId) return undefined
  const kind = stringValue(value.kind) as ContentCanvasNodeKind | undefined
  return {
    nodeId,
    ...(kind ? { kind } : {}),
    addedAt: stringValue(value.added_at ?? value.addedAt) ?? new Date().toISOString(),
  }
}

function contentCanvasProjectDocumentRecords(result: unknown): unknown[] {
  const record = isRecord(result) ? result : {}
  const canvases = Array.isArray(record.canvases)
    ? record.canvases
    : Array.isArray(record.documents)
      ? record.documents
      : Array.isArray(result)
        ? result
        : []
  return canvases.map((item) => isRecord(item) && item.record !== undefined ? item.record : item)
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
  const legacyState = parseContentCanvasDocumentsState(legacy, projectId)
  contentCanvasDocumentsCache.set(projectId, legacyState)
  const hydrationVersion = contentCanvasDocumentsVersions.get(projectId) ?? 0
  const api = readSurfaceHostApi()
  if (!api?.listMovScriptEngineContentCanvases && !api?.getDesktopState) {
    contentCanvasDocumentsHydrations.delete(projectId)
    return
  }
  if (api?.listMovScriptEngineContentCanvases) {
    void hydrateProjectContentCanvasDocumentsState(projectId, api, legacyState, legacy, hydrationVersion)
    return
  }
  hydrateDesktopContentCanvasDocumentsState(projectId, api, legacy, hydrationVersion)
}

async function hydrateProjectContentCanvasDocumentsState(
  projectId: number,
  api: NonNullable<ReturnType<typeof readSurfaceHostApi>>,
  legacyState: ContentCanvasDocumentsState | undefined,
  legacyRaw: string | null,
  hydrationVersion: number,
): Promise<void> {
  const desktopState = await readDesktopContentCanvasDocumentsState(projectId, api)
  const localState = desktopState ?? legacyState
  const projectResult = await api.listMovScriptEngineContentCanvases?.(contentCanvasProjectEnvelope(projectId)).catch((error: unknown) => {
    warnContentCanvasProjectPersistence('list', error)
    return undefined
  })
  if ((contentCanvasDocumentsVersions.get(projectId) ?? 0) !== hydrationVersion) return
  const projectState = contentCanvasDocumentsStateFromProjectCanvases(projectId, projectResult, localState)
  if (projectState) {
    contentCanvasDocumentsCache.set(projectId, projectState)
    removeBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId))
    dispatchContentCanvasDocumentsChanged(projectId)
    return
  }
  if (localState) {
    contentCanvasDocumentsCache.set(projectId, localState)
    persistProjectContentCanvasDocumentsState(projectId, localState, api)
    if (legacyRaw !== null) removeBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId))
    dispatchContentCanvasDocumentsChanged(projectId)
  }
}

function hydrateDesktopContentCanvasDocumentsState(
  projectId: number,
  api: NonNullable<ReturnType<typeof readSurfaceHostApi>>,
  legacy: string | null,
  hydrationVersion: number,
): void {
  const getDesktopState = api.getDesktopState
  if (!getDesktopState) return
  const desktopKey = contentCanvasDocumentsDesktopKey(projectId)
  void getDesktopState({ key: desktopKey }).then((result) => {
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

async function readDesktopContentCanvasDocumentsState(
  projectId: number,
  api: NonNullable<ReturnType<typeof readSurfaceHostApi>>,
): Promise<ContentCanvasDocumentsState | undefined> {
  if (!api.getDesktopState) return undefined
  const result = await api.getDesktopState({ key: contentCanvasDocumentsDesktopKey(projectId) }).catch(() => undefined)
  return typeof result?.value === 'string'
    ? parseContentCanvasDocumentsState(result.value, projectId)
    : undefined
}

function readBrowserContentCanvasDocumentsState(projectId: number): ContentCanvasDocumentsState | undefined {
  return parseContentCanvasDocumentsState(readBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId)), projectId)
}

function persistContentCanvasDocumentsState(projectId: number, state: ContentCanvasDocumentsState): void {
  const serialized = JSON.stringify(state)
  const api = readSurfaceHostApi()
  const legacyKey = contentCanvasDocumentsStorageKey(projectId)
  if (api?.writeMovScriptEngineContentCanvas) {
    persistProjectContentCanvasDocumentsState(projectId, state, api)
  }
  if (api?.setDesktopState) {
    void api.setDesktopState({ key: contentCanvasDocumentsDesktopKey(projectId), value: serialized })
      .then(() => removeBrowserStorageItem('local', legacyKey))
      .catch(() => writeBrowserStorageItem('local', legacyKey, serialized))
    return
  }
  writeBrowserStorageItem('local', legacyKey, serialized)
}

function persistProjectContentCanvasDocumentsState(
  projectId: number,
  state: ContentCanvasDocumentsState,
  api: NonNullable<ReturnType<typeof readSurfaceHostApi>>,
): void {
  for (const document of Object.values(state.documents)) {
    void api.writeMovScriptEngineContentCanvas?.({
      ...contentCanvasProjectEnvelope(projectId),
      canvas: contentCanvasProjectDocumentFromDocument(document),
    }).catch((error: unknown) => warnContentCanvasProjectPersistence('write', error))
  }
}

function contentCanvasProjectEnvelope(projectId: number): Record<string, unknown> {
  const projectDir = currentSurfaceWorkspaceProjectDir()
  return {
    projectId,
    ...(projectDir ? { projectDir } : {}),
  }
}

function warnContentCanvasProjectPersistence(operation: 'list' | 'write' | 'delete', error: unknown): void {
  if (typeof console === 'undefined') return
  console.warn(`[content-canvas] project ${operation} failed`, error)
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
  if (value.scope !== undefined && !isContentCanvasDocumentScope(value.scope)) return false
  if (!isRecord(value.nodes)) return false
  if (value.nodeLayouts !== undefined && !isNodeLayouts(value.nodeLayouts)) return false
  if (value.viewport !== undefined && !isViewport(value.viewport)) return false
  if (typeof value.updatedAt !== 'string') return false
  return Object.values(value.nodes).every(isDocumentNodeRef)
}

function isContentCanvasDocumentScope(value: unknown): value is ContentCanvasDocumentScope {
  if (!isRecord(value)) return false
  if (value.kind === 'global') return true
  return value.kind === 'production'
    && typeof value.productionId === 'string'
    && value.productionId.trim().length > 0
    && (value.productionTitle === undefined || typeof value.productionTitle === 'string')
    && (value.productionNodeId === undefined || typeof value.productionNodeId === 'string')
    && (value.productionPath === undefined || typeof value.productionPath === 'string')
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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
