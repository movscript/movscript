import type { ContentCanvasCandidate, ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import {
  createContentCanvasLayoutFromGraph,
  type ContentCanvasNodeLayout,
} from './contentCanvasLayout'

export interface ContentCanvasNodeRecord {
  id: string
  entityKey: string
  kind: ContentCanvasNodeKind
  title: string
  subtitle: string
  summary: string
  status: ContentCanvasNode['status']
  metrics: string[]
  sourcePath: string
  candidateCount: number
  candidates?: ContentCanvasCandidateRecord[]
  resourceId?: number
  resourceKind?: string
  artifactRef?: string
  summaryHash: string
}

export type ContentCanvasCandidateRecord = Pick<
  ContentCanvasCandidate,
  'id' | 'title' | 'resourceId' | 'resourceKind' | 'artifactRef' | 'inputHash' | 'source' | 'selected' | 'notes'
>

export interface ContentCanvasEdgeRecord extends ContentCanvasEdge {
  summaryHash: string
}

export interface ContentCanvasGraphState {
  graphVersion: number
  nodeIds: string[]
  edgeIds: string[]
  nodesById: Record<string, ContentCanvasNodeRecord>
  edgesById: Record<string, ContentCanvasEdgeRecord>
  outgoingEdgeIdsByNodeId: Record<string, string[]>
  incomingEdgeIdsByNodeId: Record<string, string[]>
  layoutByNodeId: Record<string, ContentCanvasNodeLayout>
}

export function createContentCanvasGraphState(
  graph: ContentCanvasGraph,
  previous?: ContentCanvasGraphState,
): ContentCanvasGraphState {
  const nextNodes = mergeNodeRecords(graph.nodes, previous?.nodesById)
  const nextEdges = mergeEdgeRecords(graph.edges, previous?.edgesById)
  return {
    graphVersion: (previous?.graphVersion ?? 0) + 1,
    nodeIds: preserveArrayReference(graph.nodes.map((node) => node.id), previous?.nodeIds),
    edgeIds: preserveArrayReference(graph.edges.map((edge) => edge.id), previous?.edgeIds),
    nodesById: nextNodes,
    edgesById: nextEdges,
    outgoingEdgeIdsByNodeId: buildOutgoingIndex(graph.edges, previous?.outgoingEdgeIdsByNodeId),
    incomingEdgeIdsByNodeId: buildIncomingIndex(graph.edges, previous?.incomingEdgeIdsByNodeId),
    layoutByNodeId: createContentCanvasLayoutFromGraph(graph, previous?.layoutByNodeId),
  }
}

export function contentCanvasNodeRecordFromNode(node: ContentCanvasNode): ContentCanvasNodeRecord {
  const record: Omit<ContentCanvasNodeRecord, 'summaryHash'> = {
    id: node.id,
    entityKey: node.entityKey,
    kind: node.kind,
    title: node.title,
    subtitle: node.subtitle,
    summary: node.summary,
    status: node.status,
    metrics: node.metrics,
    sourcePath: node.sourcePath,
    candidateCount: node.candidates.length,
    ...(node.kind === 'content_unit' && node.candidates.length ? { candidates: contentCanvasCandidateRecordsFromNode(node) } : {}),
    ...(typeof node.record.resourceId === 'number' ? { resourceId: node.record.resourceId } : {}),
    ...(typeof node.record.resourceKind === 'string' ? { resourceKind: node.record.resourceKind } : {}),
    ...(typeof node.record.artifactRef === 'string' ? { artifactRef: node.record.artifactRef } : {}),
  }
  return {
    ...record,
    summaryHash: stableContentCanvasHash(record),
  }
}

function contentCanvasCandidateRecordsFromNode(node: ContentCanvasNode): ContentCanvasCandidateRecord[] {
  return node.candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
    ...(candidate.resourceKind !== undefined ? { resourceKind: candidate.resourceKind } : {}),
    ...(candidate.artifactRef !== undefined ? { artifactRef: candidate.artifactRef } : {}),
    ...(candidate.inputHash !== undefined ? { inputHash: candidate.inputHash } : {}),
    source: candidate.source,
    selected: candidate.selected,
    notes: candidate.notes,
  }))
}

export function contentCanvasEdgeRecordFromEdge(edge: ContentCanvasEdge): ContentCanvasEdgeRecord {
  return {
    ...edge,
    summaryHash: stableContentCanvasHash(edge),
  }
}

function mergeNodeRecords(
  nodes: ContentCanvasNode[],
  previous: Record<string, ContentCanvasNodeRecord> = {},
): Record<string, ContentCanvasNodeRecord> {
  const next: Record<string, ContentCanvasNodeRecord> = {}
  for (const node of nodes) {
    const record = contentCanvasNodeRecordFromNode(node)
    const previousRecord = previous[node.id]
    next[node.id] = previousRecord?.summaryHash === record.summaryHash ? previousRecord : record
  }
  return next
}

function mergeEdgeRecords(
  edges: ContentCanvasEdge[],
  previous: Record<string, ContentCanvasEdgeRecord> = {},
): Record<string, ContentCanvasEdgeRecord> {
  const next: Record<string, ContentCanvasEdgeRecord> = {}
  for (const edge of edges) {
    const record = contentCanvasEdgeRecordFromEdge(edge)
    const previousRecord = previous[edge.id]
    next[edge.id] = previousRecord?.summaryHash === record.summaryHash ? previousRecord : record
  }
  return next
}

function buildOutgoingIndex(
  edges: ContentCanvasEdge[],
  previous: Record<string, string[]> = {},
): Record<string, string[]> {
  const index: Record<string, string[]> = {}
  for (const edge of edges) {
    index[edge.source] = [...(index[edge.source] ?? []), edge.id]
  }
  return preserveIndexArrays(index, previous)
}

function buildIncomingIndex(
  edges: ContentCanvasEdge[],
  previous: Record<string, string[]> = {},
): Record<string, string[]> {
  const index: Record<string, string[]> = {}
  for (const edge of edges) {
    index[edge.target] = [...(index[edge.target] ?? []), edge.id]
  }
  return preserveIndexArrays(index, previous)
}

function preserveIndexArrays(
  next: Record<string, string[]>,
  previous: Record<string, string[]>,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(next)) {
    merged[key] = preserveArrayReference(value, previous[key])
  }
  return merged
}

function preserveArrayReference<T>(next: T[], previous: T[] | undefined): T[] {
  if (!previous || previous.length !== next.length) return next
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) return next
  }
  return previous
}

function stableContentCanvasHash(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}
