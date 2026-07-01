import type { Viewport } from '@xyflow/react'

import { currentSurfaceWorkspaceProjectDir, readSurfaceHostApi } from '@movscript/shared'
import { listenToWindowEvent, publishWindowEvent, readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@movscript/shared/browser'
import type { ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { CONTENT_CANVAS_DEFAULT_NODE_SIZE, type ContentCanvasLayoutSource, type ContentCanvasNodeLayout } from './contentCanvasLayout'

export const CONTENT_CANVAS_DOCUMENTS_SCHEMA = 'movscript.content_canvas_documents.v1'
export const CONTENT_CANVAS_DOCUMENTS_DESKTOP_PREFIX = 'movscript-content-canvas-documents-v1'
export const CONTENT_CANVAS_PROJECT_DOCUMENT_SCHEMA = 'movscript.content_canvas.v1'
export const CONTENT_CANVAS_PROJECT_DOCUMENTS_SCHEMA = 'movscript.content_canvases.v1'
export const CONTENT_CANVAS_TITLE_MAX_LENGTH = 80

const CONTENT_CANVAS_DOCUMENTS_STORAGE_PREFIX = 'movscript.contentCanvas.documents.v1'
const CONTENT_CANVAS_DOCUMENTS_CHANGED_EVENT = 'movscript:content-canvas-documents-changed'
const CONTENT_CANVAS_TITLE_INVALID_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/

export interface ContentCanvasDocumentNodeRef {
  nodeId: string
  kind?: ContentCanvasNodeKind
  addedAt: string
}

export interface ContentCanvasDocumentGroup {
  id: string
  title: string
  memberNodeIds: string[]
  createdAt: string
  updatedAt?: string
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
  groups?: Record<string, ContentCanvasDocumentGroup>
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

export interface ContentCanvasProjectDocumentGroup {
  id: string
  title?: string
  member_node_ids: string[]
  created_at?: string
  updated_at?: string
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
  name: string
  scope: ContentCanvasProjectDocumentScope
  nodes: ContentCanvasProjectDocumentNodeRef[]
  groups?: ContentCanvasProjectDocumentGroup[]
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

export type ContentCanvasDocumentGroupInput = {
  title?: string
  memberNodeIds: string[]
  position: { x: number; y: number }
  size: { width: number; height: number }
}

const contentCanvasDocumentsCache = new Map<number, ContentCanvasDocumentsState | undefined>()
const contentCanvasDocumentsHydrations = new Set<number>()
const contentCanvasDocumentsProjectHydrations = new Set<number>()
const contentCanvasDocumentsVersions = new Map<number, number>()
const contentCanvasDocumentsProjectDirtyCanvasIds = new Map<number, Set<string>>()
let contentCanvasDocumentsWindow: Window | undefined

type ContentCanvasDocumentsWriteOptions = {
  dirtyCanvasIds?: Iterable<string>
}

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
  if (contentCanvasDocumentsProjectHydrations.has(projectId)) return current
  const now = new Date().toISOString()
  const next = createDefaultContentCanvasDocumentsState(projectId, now)
  saveContentCanvasDocumentsState(projectId, next, { dirtyCanvasIds: [next.activeCanvasId] })
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

export function contentCanvasDocumentsHaveUnsavedProjectChanges(projectId: number | undefined): boolean {
  return Boolean(projectId && contentCanvasDirtyDocumentIds(projectId).length > 0)
}

export async function saveContentCanvasDocumentsToProject(
  projectId: number | undefined,
): Promise<{ savedCount: number }> {
  if (!projectId) throw new Error('内容画布未连接项目')
  const current = ensureContentCanvasDocumentsState(projectId)
  if (!current) throw new Error('没有可保存的内容画布')
  const api = readSurfaceHostApi()
  if (!api?.writeMovScriptEngineContentCanvas) throw new Error('当前运行环境不支持保存内容画布')
  const dirtyCanvasIds = contentCanvasDirtyDocumentIds(projectId).filter((canvasId) => current.documents[canvasId])
  if (dirtyCanvasIds.length === 0) {
    clearContentCanvasDirtyDocumentIds(projectId)
    dispatchContentCanvasDocumentsChanged(projectId)
    return { savedCount: 0 }
  }
  await persistProjectContentCanvasDocumentsState(projectId, current, api, dirtyCanvasIds)
  clearContentCanvasDirtyDocumentIds(projectId, dirtyCanvasIds)
  dispatchContentCanvasDocumentsChanged(projectId)
  return { savedCount: dirtyCanvasIds.length }
}

export function createContentCanvasDocument(
  projectId: number | undefined,
  input: { title?: string; scope?: ContentCanvasDocumentScope } = {},
): ContentCanvasDocumentsState | undefined {
  if (!projectId) return undefined
  const current = ensureContentCanvasDocumentsState(projectId)
  if (!current) return undefined
  const now = new Date().toISOString()
  const existingDocuments = Object.values(current.documents)
  const title = input.title !== undefined
    ? normalizeContentCanvasDocumentTitle(input.title)
    : nextContentCanvasDocumentTitle(existingDocuments)
  const validationMessage = contentCanvasDocumentTitleValidationMessage(title, existingDocuments)
  if (validationMessage) throw new Error(validationMessage)
  const document = createBlankContentCanvasDocument({
    title,
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
  }, { dirtyCanvasIds: [document.id] })
}

export function renameContentCanvasDocument(
  projectId: number | undefined,
  canvasId: string | undefined,
  title: string,
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId) return readContentCanvasDocumentsState(projectId)
  const current = ensureContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const nextTitle = normalizeContentCanvasDocumentTitle(title)
  const validationMessage = contentCanvasDocumentTitleValidationMessage(
    nextTitle,
    Object.values(current.documents),
    canvasId,
  )
  if (validationMessage) throw new Error(validationMessage)
  if (document.title === nextTitle) return current
  const now = new Date().toISOString()
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        title: nextTitle,
        updatedAt: now,
      },
    },
    updatedAt: now,
  }, { dirtyCanvasIds: [canvasId] })
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
  }, { dirtyCanvasIds: [canvasId] })
}

export function createContentCanvasDocumentGroup(
  projectId: number | undefined,
  canvasId: string | undefined,
  input: ContentCanvasDocumentGroupInput,
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId) return readContentCanvasDocumentsState(projectId)
  const current = ensureContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const memberNodeIds = uniqueContentCanvasIds(input.memberNodeIds)
    .filter((nodeId) => Object.prototype.hasOwnProperty.call(document.nodes, nodeId))
  if (memberNodeIds.length < 2) return current
  const now = new Date().toISOString()
  const groupId = `group:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
  const title = input.title?.trim() || `分组 ${Object.keys(document.groups ?? {}).length + 1}`
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        groups: {
          ...(document.groups ?? {}),
          [groupId]: {
            id: groupId,
            title,
            memberNodeIds,
            createdAt: now,
            updatedAt: now,
          },
        },
        nodeLayouts: {
          ...(document.nodeLayouts ?? {}),
          [groupId]: {
            x: input.position.x,
            y: input.position.y,
            width: input.size.width,
            height: input.size.height,
            manual: true,
            source: 'manual',
            updatedAt: now,
          },
        },
        updatedAt: now,
      },
    },
    updatedAt: now,
  }, { dirtyCanvasIds: [canvasId] })
}

export function removeContentCanvasDocumentGroups(
  projectId: number | undefined,
  canvasId: string | undefined,
  groupIds: Iterable<string>,
): ContentCanvasDocumentsState | undefined {
  if (!projectId || !canvasId) return readContentCanvasDocumentsState(projectId)
  const current = readContentCanvasDocumentsState(projectId)
  const document = current?.documents[canvasId]
  if (!current || !document) return current
  const ids = new Set(groupIds)
  if (!ids.size) return current
  const groups = { ...(document.groups ?? {}) }
  const nodeLayouts = { ...(document.nodeLayouts ?? {}) }
  let changed = false
  for (const groupId of ids) {
    if (!Object.prototype.hasOwnProperty.call(groups, groupId)) continue
    delete groups[groupId]
    delete nodeLayouts[groupId]
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
        groups,
        nodeLayouts,
        updatedAt: now,
      },
    },
    updatedAt: now,
  }, { dirtyCanvasIds: [canvasId] })
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
  const groups = { ...(document.groups ?? {}) }
  const nodeLayouts = { ...(document.nodeLayouts ?? {}) }
  let changed = false
  for (const nodeId of ids) {
    if (Object.prototype.hasOwnProperty.call(nodes, nodeId)) {
      delete nodes[nodeId]
      delete nodeLayouts[nodeId]
      changed = true
    }
    if (Object.prototype.hasOwnProperty.call(groups, nodeId)) {
      delete groups[nodeId]
      delete nodeLayouts[nodeId]
      changed = true
    }
  }
  const prunedGroups = pruneContentCanvasDocumentGroups(groups, nodes)
  if (prunedGroups !== groups) changed = true
  if (!changed) return current
  const now = new Date().toISOString()
  return writeContentCanvasDocumentsState(projectId, {
    ...current,
    documents: {
      ...current.documents,
      [canvasId]: {
        ...document,
        nodes,
        groups: prunedGroups,
        nodeLayouts,
        updatedAt: now,
      },
    },
    updatedAt: now,
  }, { dirtyCanvasIds: [canvasId] })
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
    const groups = { ...(document.groups ?? {}) }
    const nodeLayouts = { ...(document.nodeLayouts ?? {}) }
    let documentChanged = false
    for (const nodeId of ids) {
      if (Object.prototype.hasOwnProperty.call(nodes, nodeId)) {
        delete nodes[nodeId]
        delete nodeLayouts[nodeId]
        changed = true
        documentChanged = true
      }
      if (Object.prototype.hasOwnProperty.call(groups, nodeId)) {
        delete groups[nodeId]
        delete nodeLayouts[nodeId]
        changed = true
        documentChanged = true
      }
    }
    const prunedGroups = pruneContentCanvasDocumentGroups(groups, nodes)
    if (prunedGroups !== groups) {
      changed = true
      documentChanged = true
    }
    documents[canvasId] = documentChanged
      ? {
        ...document,
        nodes,
        groups: prunedGroups,
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
  }, { dirtyCanvasIds: Object.keys(documents).filter((canvasId) => documents[canvasId] !== current.documents[canvasId]) })
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
  const groups = { ...(document.groups ?? {}) }
  const nodeLayouts = { ...(document.nodeLayouts ?? {}) }
  for (const [nodeId, position] of Object.entries(positions)) {
    const group = groups[nodeId]
    if (!group) {
      nodes[nodeId] = nodes[nodeId] ?? { nodeId, addedAt: now }
    } else {
      groups[nodeId] = {
        ...group,
        updatedAt: now,
      }
    }
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
        groups,
        nodeLayouts,
        updatedAt: now,
      },
    },
    updatedAt: now,
  }, { dirtyCanvasIds: [canvasId] })
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
  }, { dirtyCanvasIds: [canvasId] })
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

export function contentCanvasDocumentGroups(document: ContentCanvasDocument | undefined): ContentCanvasDocumentGroup[] {
  const nodeIds = new Set(Object.keys(document?.nodes ?? {}))
  return Object.values(document?.groups ?? {})
    .map((group) => ({
      ...group,
      memberNodeIds: uniqueContentCanvasIds(group.memberNodeIds).filter((nodeId) => nodeIds.has(nodeId)),
    }))
    .filter((group) => group.memberNodeIds.length >= 2)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
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
    name: document.title,
    scope: contentCanvasProjectScopeFromDocumentScope(contentCanvasDocumentScope(document)),
    nodes: Object.values(document.nodes)
      .map((node) => ({
        node_id: node.nodeId,
        ...(node.kind ? { kind: node.kind } : {}),
        added_at: node.addedAt,
      }))
      .sort((left, right) => left.node_id.localeCompare(right.node_id)),
    groups: contentCanvasProjectGroupsFromDocumentGroups(document.groups),
    layouts: contentCanvasProjectLayoutsFromDocumentLayouts(document.nodeLayouts),
    updated_at: document.updatedAt,
  }
}

export function contentCanvasDocumentFromProjectDocument(value: unknown): ContentCanvasDocument | undefined {
  if (!isRecord(value)) return undefined
  const id = contentCanvasDocumentIdFromProjectDocument(value)
  if (!id) return undefined
  const updatedAt = stringValue(value.updated_at ?? value.updatedAt) ?? new Date().toISOString()
  const title = stringValue(value.title ?? value.name ?? value.label) ?? contentCanvasDocumentFallbackTitle(value, id)
  const document: ContentCanvasDocument = {
    id,
    title,
    scope: contentCanvasDocumentScopeFromProjectScope(value.scope),
    nodes: contentCanvasDocumentNodesFromProjectNodes(value.nodes),
    groups: contentCanvasDocumentGroupsFromProjectGroups(value.groups ?? value.group_nodes ?? value.groupNodes),
    nodeLayouts: contentCanvasDocumentLayoutsFromProjectLayouts(value.layouts ?? value.node_layouts ?? value.nodeLayouts),
    ...(isViewport(value.viewport) ? { viewport: value.viewport } : {}),
    updatedAt,
  }
  return isContentCanvasDocument(document) ? document : undefined
}

function contentCanvasDocumentIdFromProjectDocument(value: Record<string, unknown>): string | undefined {
  return stringValue(value.id ?? value.canvasId ?? value.canvas_id)
    ?? legacyContentCanvasDocumentId(value)
}

function legacyContentCanvasDocumentId(value: Record<string, unknown>): string | undefined {
  const pathId = contentCanvasDocumentIdFromPath(stringValue(value.__legacy_path ?? value.path ?? value.filePath ?? value.file_path))
  if (pathId) return pathId
  const legacyIndex = typeof value.__legacy_index === 'number' ? `index:${value.__legacy_index}` : undefined
  const source = stringValue(value.__legacy_path ?? value.path ?? value.filePath ?? value.file_path ?? value.title ?? value.name ?? value.label)
    ?? legacyIndex
  if (!source) return undefined
  return `canvas:legacy:${stableContentCanvasToken(source)}`
}

function contentCanvasDocumentFallbackTitle(value: Record<string, unknown>, id: string): string {
  const path = stringValue(value.__legacy_path ?? value.path ?? value.filePath ?? value.file_path)
  const pathTitle = path ? contentCanvasTitleFromPath(path) : undefined
  if (pathTitle) return pathTitle
  if (id.startsWith('canvas:legacy:')) return '旧内容画布'
  if (/^\d+$/.test(id)) return '旧内容画布'
  return id
}

export function normalizeContentCanvasDocumentTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function contentCanvasDocumentTitleValidationMessage(
  value: string,
  _documents: ContentCanvasDocument[],
  _currentCanvasId?: string,
): string | undefined {
  const title = normalizeContentCanvasDocumentTitle(value)
  if (!title) return '请输入内容画布名称'
  if (title.length > CONTENT_CANVAS_TITLE_MAX_LENGTH) return `名称不能超过 ${CONTENT_CANVAS_TITLE_MAX_LENGTH} 个字符`
  if (CONTENT_CANVAS_TITLE_INVALID_PATTERN.test(title)) return '名称不能包含 < > : " / \\ | ? * 或控制字符'
  return undefined
}

function nextContentCanvasDocumentTitle(documents: ContentCanvasDocument[]): string {
  const base = '自由内容画布'
  if (!contentCanvasDocumentTitleExists(base, documents)) return base
  for (let index = 2; index < 1000; index += 1) {
    const title = `${base} ${index}`
    if (!contentCanvasDocumentTitleExists(title, documents)) return title
  }
  return `${base} ${Date.now().toString(36)}`
}

function contentCanvasDocumentTitleExists(
  value: string,
  documents: ContentCanvasDocument[],
  currentCanvasId?: string,
): boolean {
  const normalized = normalizeContentCanvasDocumentTitle(value).toLocaleLowerCase('zh-CN')
  return documents.some((document) => (
    document.id !== currentCanvasId
    && normalizeContentCanvasDocumentTitle(document.title).toLocaleLowerCase('zh-CN') === normalized
  ))
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
  options: ContentCanvasDocumentsWriteOptions = {},
): ContentCanvasDocumentsState {
  saveContentCanvasDocumentsState(projectId, state, options)
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

function createDefaultContentCanvasDocumentsState(projectId: number, now = new Date().toISOString()): ContentCanvasDocumentsState {
  const document = createBlankContentCanvasDocument({ title: '自由内容画布', now })
  return {
    schema: CONTENT_CANVAS_DOCUMENTS_SCHEMA,
    projectId,
    activeCanvasId: document.id,
    documents: { [document.id]: document },
    updatedAt: now,
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

function contentCanvasProjectGroupsFromDocumentGroups(
  groups: Record<string, ContentCanvasDocumentGroup> | undefined,
): ContentCanvasProjectDocumentGroup[] {
  return Object.values(groups ?? {})
    .map((group) => ({
      id: group.id,
      title: group.title,
      member_node_ids: uniqueContentCanvasIds(group.memberNodeIds),
      created_at: group.createdAt,
      ...(group.updatedAt ? { updated_at: group.updatedAt } : {}),
    }))
    .filter((group) => group.member_node_ids.length >= 2)
    .sort((left, right) => left.id.localeCompare(right.id))
}

function contentCanvasDocumentLayoutsFromProjectLayouts(value: unknown): Record<string, ContentCanvasNodeLayout> {
  const layouts = isRecord(value) ? value : {}
  return Object.fromEntries(
    Object.entries(layouts)
      .map(([nodeId, layout]) => [nodeId, contentCanvasDocumentLayoutFromProjectLayout(layout)])
      .filter((entry): entry is [string, ContentCanvasNodeLayout] => Boolean(entry[1])),
  )
}

function contentCanvasDocumentGroupsFromProjectGroups(value: unknown): Record<string, ContentCanvasDocumentGroup> {
  const groups = Array.isArray(value) ? value : Object.values(isRecord(value) ? value : {})
  return Object.fromEntries(
    groups
      .map(contentCanvasDocumentGroupFromProjectGroup)
      .filter((group): group is ContentCanvasDocumentGroup => Boolean(group))
      .map((group) => [group.id, group]),
  )
}

function contentCanvasDocumentGroupFromProjectGroup(value: unknown): ContentCanvasDocumentGroup | undefined {
  if (!isRecord(value)) return undefined
  const id = stringValue(value.id ?? value.groupId ?? value.group_id)
  if (!id) return undefined
  const memberNodeIds = uniqueContentCanvasIds(
    arrayStringValues(value.member_node_ids ?? value.memberNodeIds ?? value.nodes ?? value.node_ids ?? value.nodeIds),
  )
  if (memberNodeIds.length < 2) return undefined
  const createdAt = stringValue(value.created_at ?? value.createdAt) ?? new Date().toISOString()
  const updatedAt = stringValue(value.updated_at ?? value.updatedAt)
  return {
    id,
    title: stringValue(value.title ?? value.name ?? value.label) ?? '画布分组',
    memberNodeIds,
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
  }
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
  return canvases.map((item, index) => {
    if (!isRecord(item)) return item
    const record = recordValue(item.record ?? item.canvas ?? item.document) ?? item
    return {
      ...record,
      __legacy_path: stringValue(item.path ?? record.path ?? record.__legacy_path),
      __legacy_index: index,
    }
  })
}

function saveContentCanvasDocumentsState(
  projectId: number,
  state: ContentCanvasDocumentsState,
  options: ContentCanvasDocumentsWriteOptions = {},
): void {
  contentCanvasDocumentsCache.set(projectId, state)
  markContentCanvasDirtyDocumentIds(projectId, options.dirtyCanvasIds)
  bumpContentCanvasDocumentsVersion(projectId)
  persistContentCanvasDocumentsState(projectId, state)
  dispatchContentCanvasDocumentsChanged(projectId)
}

function hydrateContentCanvasDocumentsState(projectId: number): void {
  if (contentCanvasDocumentsHydrations.has(projectId)) return
  contentCanvasDocumentsHydrations.add(projectId)
  const cachedState = contentCanvasDocumentsCache.get(projectId)
  const legacy = readBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId))
  const legacyState = parseContentCanvasDocumentsState(legacy, projectId)
  contentCanvasDocumentsCache.set(projectId, cachedState ?? legacyState)
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
  contentCanvasDocumentsProjectHydrations.add(projectId)
  try {
    const desktopState = await readDesktopContentCanvasDocumentsState(projectId, api)
    const localState = desktopState ?? legacyState
    const projectResult = await api.listMovScriptEngineContentCanvases?.(contentCanvasProjectEnvelope(projectId)).catch((error: unknown) => {
      warnContentCanvasProjectPersistence('list', error)
      return undefined
    })
    if ((contentCanvasDocumentsVersions.get(projectId) ?? 0) !== hydrationVersion) return
    const projectState = contentCanvasDocumentsStateFromProjectCanvases(projectId, projectResult, localState)
    if (projectState) {
      const nextState = newerContentCanvasDocumentsState(localState, projectState)
      contentCanvasDocumentsCache.set(projectId, nextState)
      if (nextState === localState) {
        const dirtyCanvasIds = changedContentCanvasDocumentIds(localState, projectState)
        if (dirtyCanvasIds.length > 0) {
          markContentCanvasDirtyDocumentIds(projectId, dirtyCanvasIds)
        } else {
          clearContentCanvasDirtyDocumentIds(projectId)
        }
      } else {
        clearContentCanvasDirtyDocumentIds(projectId)
        removeBrowserStorageItem('local', contentCanvasDocumentsStorageKey(projectId))
      }
      dispatchContentCanvasDocumentsChanged(projectId)
      return
    }
    if (localState) {
      contentCanvasDocumentsCache.set(projectId, localState)
      markContentCanvasDirtyDocumentIds(projectId, Object.keys(localState.documents))
      void legacyRaw
      dispatchContentCanvasDocumentsChanged(projectId)
      return
    }
    const next = createDefaultContentCanvasDocumentsState(projectId)
    saveContentCanvasDocumentsState(projectId, next, { dirtyCanvasIds: [next.activeCanvasId] })
  } finally {
    contentCanvasDocumentsProjectHydrations.delete(projectId)
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
  if (api?.setDesktopState && api?.getDesktopState) {
    void api.setDesktopState({ key: contentCanvasDocumentsDesktopKey(projectId), value: serialized })
      .then(() => removeBrowserStorageItem('local', legacyKey))
      .catch(() => writeBrowserStorageItem('local', legacyKey, serialized))
    return
  }
  if (api?.setDesktopState) {
    void api.setDesktopState({ key: contentCanvasDocumentsDesktopKey(projectId), value: serialized })
      .catch(() => undefined)
  }
  writeBrowserStorageItem('local', legacyKey, serialized)
}

async function persistProjectContentCanvasDocumentsState(
  projectId: number,
  state: ContentCanvasDocumentsState,
  api: NonNullable<ReturnType<typeof readSurfaceHostApi>>,
  canvasIds: readonly string[],
): Promise<void> {
  await Promise.all(canvasIds.map((canvasId) => state.documents[canvasId]).filter((document): document is ContentCanvasDocument => Boolean(document)).map((document) => (
    api.writeMovScriptEngineContentCanvas?.({
      ...contentCanvasProjectEnvelope(projectId),
      canvas: contentCanvasProjectDocumentFromDocument(document),
    })
  )))
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

function contentCanvasDirtyDocumentIds(projectId: number): string[] {
  return [...(contentCanvasDocumentsProjectDirtyCanvasIds.get(projectId) ?? [])]
}

function markContentCanvasDirtyDocumentIds(projectId: number, canvasIds: Iterable<string> | undefined): void {
  if (!canvasIds) return
  const ids = [...canvasIds].filter((canvasId) => canvasId.trim())
  if (!ids.length) return
  const current = contentCanvasDocumentsProjectDirtyCanvasIds.get(projectId) ?? new Set<string>()
  for (const canvasId of ids) current.add(canvasId)
  contentCanvasDocumentsProjectDirtyCanvasIds.set(projectId, current)
}

function clearContentCanvasDirtyDocumentIds(projectId: number, canvasIds?: Iterable<string>): void {
  if (!canvasIds) {
    contentCanvasDocumentsProjectDirtyCanvasIds.delete(projectId)
    return
  }
  const current = contentCanvasDocumentsProjectDirtyCanvasIds.get(projectId)
  if (!current) return
  for (const canvasId of canvasIds) current.delete(canvasId)
  if (current.size === 0) {
    contentCanvasDocumentsProjectDirtyCanvasIds.delete(projectId)
  }
}

function changedContentCanvasDocumentIds(
  localState: ContentCanvasDocumentsState | undefined,
  projectState: ContentCanvasDocumentsState,
): string[] {
  if (!localState) return []
  return Object.values(localState.documents)
    .filter((document) => {
      const projectDocument = projectState.documents[document.id]
      return contentCanvasProjectDocumentSignature(document) !== (
        projectDocument ? contentCanvasProjectDocumentSignature(projectDocument) : undefined
      )
    })
    .map((document) => document.id)
}

function contentCanvasProjectDocumentSignature(document: ContentCanvasDocument): string {
  const projectDocument: Partial<ContentCanvasProjectDocument> = { ...contentCanvasProjectDocumentFromDocument(document) }
  delete projectDocument.updated_at
  return JSON.stringify(projectDocument)
}

function newerContentCanvasDocumentsState(
  localState: ContentCanvasDocumentsState | undefined,
  projectState: ContentCanvasDocumentsState,
): ContentCanvasDocumentsState {
  if (!localState) return projectState
  const localTime = Date.parse(localState.updatedAt)
  const projectTime = Date.parse(projectState.updatedAt)
  if (!Number.isFinite(localTime) || !Number.isFinite(projectTime)) return projectState
  return localTime > projectTime ? localState : projectState
}

function parseContentCanvasDocumentsState(raw: string | null | undefined, projectId: number): ContentCanvasDocumentsState | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    return normalizeContentCanvasDocumentsState(parsed, projectId)
  } catch {
    return undefined
  }
}

function normalizeContentCanvasDocumentsState(value: unknown, projectId: number): ContentCanvasDocumentsState | undefined {
  if (!isRecord(value)) return undefined
  const rawDocuments = isRecord(value.documents)
    ? Object.entries(value.documents)
    : Array.isArray(value.documents)
      ? value.documents.map((document, index) => [String(index), document] as const)
      : []
  const documents = Object.fromEntries(
    rawDocuments
      .map(([fallbackId, document]) => contentCanvasDocumentFromLegacyState(document, fallbackId))
      .filter((document): document is ContentCanvasDocument => Boolean(document))
      .map((document) => [document.id, document]),
  )
  const canvasIds = Object.keys(documents)
  if (!canvasIds.length) return undefined
  const activeCanvasId = stringValue(value.activeCanvasId ?? value.active_canvas_id)
  const resolvedActiveCanvasId = activeCanvasId && documents[activeCanvasId] ? activeCanvasId : canvasIds[0]
  if (!resolvedActiveCanvasId) return undefined
  return {
    schema: CONTENT_CANVAS_DOCUMENTS_SCHEMA,
    projectId,
    activeCanvasId: resolvedActiveCanvasId,
    documents,
    updatedAt: stringValue(value.updatedAt ?? value.updated_at) ?? new Date().toISOString(),
  }
}

function contentCanvasDocumentFromLegacyState(value: unknown, fallbackId: string): ContentCanvasDocument | undefined {
  const record = recordValue(value)
  if (!record) return undefined
  const id = stringValue(record.id ?? record.canvasId ?? record.canvas_id)
    ?? (/^\d+$/.test(fallbackId) ? undefined : stringValue(fallbackId))
    ?? legacyContentCanvasDocumentId({ ...record, __legacy_index: Number(fallbackId) })
  const withFallbacks = {
    ...record,
    id,
    title: stringValue(record.title ?? record.name ?? record.label) ?? contentCanvasDocumentFallbackTitle(record, id ?? fallbackId),
  }
  return contentCanvasDocumentFromProjectDocument(withFallbacks)
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
      contentCanvasDocumentsProjectHydrations.clear()
      contentCanvasDocumentsVersions.clear()
      contentCanvasDocumentsProjectDirtyCanvasIds.clear()
      contentCanvasDocumentsWindow = undefined
    }
    return
  }
  if (contentCanvasDocumentsWindow === window) return
  contentCanvasDocumentsCache.clear()
  contentCanvasDocumentsHydrations.clear()
  contentCanvasDocumentsProjectHydrations.clear()
  contentCanvasDocumentsVersions.clear()
  contentCanvasDocumentsProjectDirtyCanvasIds.clear()
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

function isContentCanvasDocument(value: unknown): value is ContentCanvasDocument {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id.trim()) return false
  if (typeof value.title !== 'string') return false
  if (value.scope !== undefined && !isContentCanvasDocumentScope(value.scope)) return false
  if (!isRecord(value.nodes)) return false
  if (value.groups !== undefined && !isDocumentGroups(value.groups)) return false
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

function isDocumentGroups(value: unknown): value is Record<string, ContentCanvasDocumentGroup> {
  if (!isRecord(value)) return false
  return Object.values(value).every((group) => (
    isRecord(group)
    && typeof group.id === 'string'
    && typeof group.title === 'string'
    && Array.isArray(group.memberNodeIds)
    && group.memberNodeIds.every((nodeId) => typeof nodeId === 'string')
    && typeof group.createdAt === 'string'
    && (group.updatedAt === undefined || typeof group.updatedAt === 'string')
  ))
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

function contentCanvasTitleFromPath(path: string): string | undefined {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  const candidate = parts.at(-1) === 'canvas.json' ? parts.at(-2) : parts.at(-1)
  if (!candidate) return undefined
  return candidate
    .replace(/^canvas[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    || undefined
}

function contentCanvasDocumentIdFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  const parts = path.split(/[\\/]+/).filter(Boolean)
  const candidate = parts.at(-1) === 'canvas.json' ? parts.at(-2) : parts.at(-1)
  return stringValue(candidate)
}

function stableContentCanvasToken(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function pruneContentCanvasDocumentGroups(
  groups: Record<string, ContentCanvasDocumentGroup>,
  nodes: Record<string, ContentCanvasDocumentNodeRef>,
): Record<string, ContentCanvasDocumentGroup> {
  const nodeIds = new Set(Object.keys(nodes))
  let changed = false
  const next = Object.fromEntries(
    Object.entries(groups)
      .map(([groupId, group]) => {
        const memberNodeIds = uniqueContentCanvasIds(group.memberNodeIds).filter((nodeId) => nodeIds.has(nodeId))
        if (memberNodeIds.length !== group.memberNodeIds.length || memberNodeIds.some((nodeId, index) => nodeId !== group.memberNodeIds[index])) {
          changed = true
        }
        return [groupId, { ...group, memberNodeIds }] as const
      })
      .filter(([, group]) => {
        const keep = group.memberNodeIds.length >= 2
        if (!keep) changed = true
        return keep
      }),
  )
  return changed ? next : groups
}

function uniqueContentCanvasIds(values: Iterable<string>): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function arrayStringValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
