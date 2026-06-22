import type {
  ContentCanvasEdge,
  ContentCanvasWorkspaceSnapshot,
  ContentCanvasNode,
  ContentCanvasNodeKind,
} from '../domain/contentCanvasTypes'
import {
  buildCreativeCanvasDependencyEdges,
  isCreativeCanvasDependencySourceEdge,
  type CreativeCanvasDependencyEdge,
} from './contentCreativeCanvasDependencies'

export type CreativeCanvasNodeRole =
  | 'structure'
  | 'creative'
  | 'generation'
  | 'candidate'
  | 'resource'
  | 'issue'

export type CreativeCanvasNodeWeight = 'primary' | 'normal' | 'compact'

export interface CreativeCanvasNode {
  id: string
  source: ContentCanvasNode
  kind: ContentCanvasNodeKind
  role: CreativeCanvasNodeRole
  weight: CreativeCanvasNodeWeight
  canGenerate: boolean
  canExpand: boolean
  selected: boolean
  position: { x: number; y: number }
}

export interface CreativeCanvasEdge {
  id: string
  source: string
  target: string
  sourceEdge: ContentCanvasEdge
  rank: number
}

export interface CreativeCanvasGraph {
  nodes: CreativeCanvasNode[]
  edges: CreativeCanvasEdge[]
}

const CREATIVE_CANVAS_HIDDEN_KINDS = new Set<ContentCanvasNodeKind>([
  'project',
  'production',
  'segment',
  'setting',
  'state',
  'content_unit',
  'candidate',
  'resource',
  'selection',
  'actor',
  'work_item',
  'group',
])

const GENERATABLE_KINDS = new Set<ContentCanvasNodeKind>([
  'scene_moment',
  'expression_unit',
  'asset',
  'keyframe',
  'storyboard',
  'content_unit',
])

export function buildCreativeCanvasGraph(graph: ContentCanvasWorkspaceSnapshot): CreativeCanvasGraph {
  const visibleNodeIds = new Set(
    graph.nodes
      .filter(isCreativeCanvasVisibleNode)
      .map((node) => node.id),
  )
  for (const edge of graph.edges) {
    if (!isCreativeCanvasDependencySourceEdge(edge)) continue
    const source = graph.nodes.find((node) => node.id === edge.source)
    const target = graph.nodes.find((node) => node.id === edge.target)
    if (source?.kind === 'resource') visibleNodeIds.add(source.id)
    if (target?.kind === 'resource') visibleNodeIds.add(target.id)
  }
  const nodes = graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map(creativeNodeFromContentNode)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const nodeKindById = new Map(nodes.map((node) => [node.id, node.kind]))
  const contentUnitOwnerNodeIdByNodeId = new Map(
    nodes
      .map((node) => [node.source.generationTask?.nodeId, node.id] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0])),
  )
  const dependencyEdges = buildCreativeCanvasDependencyEdges({
    edges: graph.edges,
    nodeKindById,
    contentUnitOwnerNodeIdByNodeId,
  })
  const edges = dependencyEdges
    .filter((edge) => nodeIds.has(edge.upstream) && nodeIds.has(edge.downstream))
    .map(creativeEdgeFromDependencyEdge)
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
  return { nodes, edges }
}

export function isCreativeCanvasVisibleNode(node: ContentCanvasNode): boolean {
  return !CREATIVE_CANVAS_HIDDEN_KINDS.has(node.kind)
}

export function isCreativeCanvasDependencyEdge(edge: ContentCanvasEdge): boolean {
  return isCreativeCanvasDependencySourceEdge(edge)
}

export function creativeNodeFromContentNode(node: ContentCanvasNode): CreativeCanvasNode {
  return {
    id: node.id,
    source: node,
    kind: node.kind,
    role: creativeCanvasNodeRole(node),
    weight: creativeCanvasNodeWeight(node),
    canGenerate: canGenerateCreativeCanvasNode(node),
    canExpand: canExpandCreativeCanvasNode(node),
    selected: node.kind === 'candidate' && node.record.selected === true,
    position: node.position,
  }
}

export function creativeCanvasNodeRole(node: ContentCanvasNode): CreativeCanvasNodeRole {
  if (node.kind === 'project' || node.kind === 'production' || node.kind === 'segment') return 'structure'
  if (node.kind === 'content_unit') return 'generation'
  if (node.kind === 'candidate') return 'candidate'
  if (node.kind === 'resource') return 'resource'
  if (node.kind === 'work_item') return 'issue'
  return 'creative'
}

export function creativeCanvasNodeWeight(node: ContentCanvasNode): CreativeCanvasNodeWeight {
  if (node.kind === 'scene_moment' || node.kind === 'expression_unit' || node.kind === 'content_unit') return 'primary'
  if (node.kind === 'candidate' || node.kind === 'resource') return 'compact'
  return 'normal'
}

export function canGenerateCreativeCanvasNode(node: ContentCanvasNode): boolean {
  return GENERATABLE_KINDS.has(node.kind)
}

export function canExpandCreativeCanvasNode(node: ContentCanvasNode): boolean {
  return node.kind === 'content_unit'
    || node.kind === 'candidate'
    || node.kind === 'scene_moment'
    || node.kind === 'expression_unit'
}

function creativeEdgeFromDependencyEdge(edge: CreativeCanvasDependencyEdge): CreativeCanvasEdge {
  return {
    id: edge.id,
    source: edge.upstream,
    target: edge.downstream,
    sourceEdge: dependencySourceEdge(edge),
    rank: creativeEdgeRank(edge),
  }
}

function dependencySourceEdge(edge: CreativeCanvasDependencyEdge): ContentCanvasEdge {
  if (edge.kind === 'namespace') {
    return {
      ...edge.sourceEdge,
      source: edge.upstream,
      target: edge.downstream,
      label: edge.label,
      kind: 'reference',
      type: 'depends_on',
    }
  }
  return {
    ...edge.sourceEdge,
    source: edge.upstream,
    target: edge.downstream,
    label: edge.label,
  }
}

function creativeEdgeRank(edge: CreativeCanvasDependencyEdge): number {
  if (edge.kind === 'namespace') return 1
  if (edge.kind === 'reference') return 2
  return 9
}
