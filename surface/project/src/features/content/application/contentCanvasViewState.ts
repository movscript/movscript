import type { Viewport } from '@xyflow/react'

import type { ContentCanvasWorkspaceSnapshot, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { CONTENT_CANVAS_DEFAULT_NODE_SIZE, type ContentCanvasNodeLayout } from './contentCanvasLayout'
import {
  contentCanvasNodeFromPresentationNode,
  type ContentCanvasEdgeFilter,
  type ContentCanvasNodePosition,
  type ContentCanvasPresentationNode,
  type ContentCanvasViewState,
  type ContentCanvasViewStateScope,
} from './contentCanvasViewStateModel'
import {
  readContentCanvasViewState,
  writeContentCanvasViewState,
} from './contentCanvasViewStateStore'

export {
  CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX,
  CONTENT_CANVAS_VIEW_STATE_SCHEMA,
} from './contentCanvasViewStateModel'
export {
  clearContentCanvasViewport,
  clearContentCanvasViewState,
  readContentCanvasViewState,
  subscribeContentCanvasViewState,
  writeContentCanvasViewState,
} from './contentCanvasViewStateStore'
export type {
  ContentCanvasEdgeFilter,
  ContentCanvasNodePosition,
  ContentCanvasPresentationNode,
  ContentCanvasViewPreferences,
  ContentCanvasViewState,
  ContentCanvasViewStateScope,
} from './contentCanvasViewStateModel'

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
  graph: ContentCanvasWorkspaceSnapshot,
  presentationNodes: Record<string, ContentCanvasPresentationNode> | undefined,
): ContentCanvasWorkspaceSnapshot {
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

export function updateContentCanvasViewport(
  projectId: number | undefined,
  viewport: Viewport,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  return writeContentCanvasViewState(projectId, { viewport }, scope)
}

export function clearContentCanvasNodePositions(projectId: number | undefined, scope?: ContentCanvasViewStateScope): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  return writeContentCanvasViewState(projectId, { nodePositions: {}, nodeLayouts: {} }, scope)
}

export function clearContentCanvasNodePositionsForIds(
  projectId: number | undefined,
  nodeIds: Iterable<string>,
  scope?: ContentCanvasViewStateScope,
): ContentCanvasViewState | undefined {
  if (!projectId) return undefined
  const ids = new Set(nodeIds)
  if (!ids.size) return readContentCanvasViewState(projectId, scope)
  const current = readContentCanvasViewState(projectId, scope)
  const nodePositions = { ...(current?.nodePositions ?? {}) }
  const nodeLayouts = { ...(current?.nodeLayouts ?? {}) }
  for (const nodeId of ids) {
    delete nodePositions[nodeId]
    delete nodeLayouts[nodeId]
  }
  return writeContentCanvasViewState(projectId, { nodePositions, nodeLayouts }, scope)
}
