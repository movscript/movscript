import type { Viewport } from '@xyflow/react'

import type { ContentCanvasEdge, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import type { ContentCanvasNodeLayout } from './contentCanvasLayout'

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

export function parseContentCanvasViewState(raw: string | null | undefined, projectId: number): ContentCanvasViewState | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isViewState(parsed, projectId)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function contentCanvasViewStateDesktopKey(projectId: number, scope?: ContentCanvasViewStateScope): string {
  const scopeKey = contentCanvasViewStateScopeKey(scope).replace(/:/g, '.')
  const candidate = [CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX, String(projectId), scopeKey].filter(Boolean).join('.')
  if (candidate.length <= 96) return candidate
  return [CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX, String(projectId), stableHash(scopeKey)].join('.')
}

export function contentCanvasViewStateStorageKey(projectId: number, scope?: ContentCanvasViewStateScope): string {
  const scopeKey = contentCanvasViewStateScopeKey(scope)
  return scopeKey ? `${STORAGE_PREFIX}:${projectId}:${scopeKey}` : `${STORAGE_PREFIX}:${projectId}`
}

export function contentCanvasNodeFromPresentationNode(node: ContentCanvasPresentationNode): ContentCanvasNode {
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

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
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
