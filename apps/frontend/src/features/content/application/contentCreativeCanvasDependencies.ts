import type {
  ContentCanvasEdge,
  ContentCanvasNodeKind,
} from '../domain/contentCanvasTypes'

export type CreativeCanvasDependencyKind = 'namespace' | 'reference'

export interface CreativeCanvasDependencyEdge {
  id: string
  upstream: string
  downstream: string
  kind: CreativeCanvasDependencyKind
  label: string
  sourceEdge: ContentCanvasEdge
}

export interface CreativeCanvasDependencyInput {
  edges: ContentCanvasEdge[]
  nodeKindById: Map<string, ContentCanvasNodeKind>
  contentUnitOwnerNodeIdByNodeId: Map<string, string>
}

const NAMESPACE_DEPENDENCY_RULES: Array<{
  parent: ContentCanvasNodeKind
  child: ContentCanvasNodeKind
}> = [
  { parent: 'scene_moment', child: 'expression_unit' },
  { parent: 'expression_unit', child: 'keyframe' },
  { parent: 'expression_unit', child: 'storyboard' },
]

const REFERENCE_DEPENDENCY_RULES: Partial<Record<NonNullable<ContentCanvasEdge['relation']>, {
  upstreamEndpoint: 'source' | 'target'
  downstreamEndpoint: 'source' | 'target'
}>> = {
  content_unit_asset: { upstreamEndpoint: 'target', downstreamEndpoint: 'source' },
  content_unit_keyframe: { upstreamEndpoint: 'target', downstreamEndpoint: 'source' },
  content_unit_resource: { upstreamEndpoint: 'source', downstreamEndpoint: 'target' },
  content_unit_storyboard: { upstreamEndpoint: 'target', downstreamEndpoint: 'source' },
  expression_unit_content_unit: { upstreamEndpoint: 'source', downstreamEndpoint: 'target' },
}

export function buildCreativeCanvasDependencyEdges(input: CreativeCanvasDependencyInput): CreativeCanvasDependencyEdge[] {
  const dependencies = input.edges.flatMap((edge) => {
    const namespace = namespaceDependencyEdge(edge, input.nodeKindById)
    if (namespace) return [namespace]
    const reference = referenceDependencyEdge(edge, input.contentUnitOwnerNodeIdByNodeId)
    return reference ? [reference] : []
  })
  return dedupeCreativeCanvasDependencyEdges(dependencies)
}

export function isCreativeCanvasDependencySourceEdge(edge: ContentCanvasEdge): boolean {
  return Boolean(namespaceDependencyRelation(edge) || referenceDependencyRelation(edge))
}

function namespaceDependencyEdge(
  edge: ContentCanvasEdge,
  nodeKindById: Map<string, ContentCanvasNodeKind>,
): CreativeCanvasDependencyEdge | undefined {
  const relation = namespaceDependencyRelation(edge, nodeKindById)
  if (!relation) return undefined
  return {
    id: `${edge.target}->${edge.source}:${relation}`,
    upstream: edge.target,
    downstream: edge.source,
    kind: 'namespace',
    label: '命名空间依赖',
    sourceEdge: edge,
  }
}

function namespaceDependencyRelation(
  edge: ContentCanvasEdge,
  nodeKindById?: Map<string, ContentCanvasNodeKind>,
): string | undefined {
  if (edge.kind !== 'hierarchy') return undefined
  const sourceKind = nodeKindById?.get(edge.source)
  const targetKind = nodeKindById?.get(edge.target)
  if (!sourceKind || !targetKind) return undefined
  const rule = NAMESPACE_DEPENDENCY_RULES.find((item) => item.parent === sourceKind && item.child === targetKind)
  if (!rule) return undefined
  return `${rule.child}-${rule.parent}-dependency`
}

function referenceDependencyEdge(
  edge: ContentCanvasEdge,
  contentUnitOwnerNodeIdByNodeId: Map<string, string>,
): CreativeCanvasDependencyEdge | undefined {
  const relation = referenceDependencyRelation(edge)
  if (!relation) return undefined
  const upstream = resolveDependencyEndpoint(edge, relation.upstreamEndpoint, contentUnitOwnerNodeIdByNodeId)
  const downstream = resolveDependencyEndpoint(edge, relation.downstreamEndpoint, contentUnitOwnerNodeIdByNodeId)
  if (upstream === downstream) return undefined
  return {
    id: `${upstream}->${downstream}:${edge.relation ?? edge.kind}:creative-dependency`,
    upstream,
    downstream,
    kind: 'reference',
    label: '引用依赖',
    sourceEdge: edge,
  }
}

function referenceDependencyRelation(edge: ContentCanvasEdge) {
  return edge.relation ? REFERENCE_DEPENDENCY_RULES[edge.relation] : undefined
}

function resolveDependencyEndpoint(
  edge: ContentCanvasEdge,
  endpoint: 'source' | 'target',
  contentUnitOwnerNodeIdByNodeId: Map<string, string>,
): string {
  const nodeId = endpoint === 'source' ? edge.source : edge.target
  return contentUnitOwnerNodeIdByNodeId.get(nodeId) ?? nodeId
}

function dedupeCreativeCanvasDependencyEdges(edges: CreativeCanvasDependencyEdge[]): CreativeCanvasDependencyEdge[] {
  const byPair = new Map<string, CreativeCanvasDependencyEdge>()
  const namespacePairs = new Set(
    edges
      .filter((edge) => edge.kind === 'namespace')
      .map((edge) => dependencyPairKey(edge.upstream, edge.downstream)),
  )
  for (const edge of edges) {
    if (edge.kind === 'reference' && namespacePairs.has(dependencyPairKey(edge.downstream, edge.upstream))) {
      continue
    }
    const key = dependencyPairKey(edge.upstream, edge.downstream)
    const current = byPair.get(key)
    if (!current || dependencyKindPriority(edge.kind) < dependencyKindPriority(current.kind)) {
      byPair.set(key, edge)
    }
  }
  return [...byPair.values()]
}

function dependencyPairKey(upstream: string, downstream: string): string {
  return `${upstream}->${downstream}`
}

function dependencyKindPriority(kind: CreativeCanvasDependencyKind): number {
  if (kind === 'namespace') return 1
  return 2
}
