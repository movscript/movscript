import type {
  ContentCanvasEdge,
  ContentCanvasNode,
  ContentCanvasProjectData,
} from './contentCanvasTypes'

type AssetReferenceUnit = NonNullable<ContentCanvasProjectData['assetReferenceUnits']>[string]
type AssetDownstreamUnit = AssetReferenceUnit['downstream'][number]

export function appendAssetDownstreamEdges(
  edges: ContentCanvasEdge[],
  assetReferenceUnits: ContentCanvasProjectData['assetReferenceUnits'] | undefined,
  nodes: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
) {
  for (const assetUnit of Object.values(assetReferenceUnits ?? {})) {
    const source = assetNodeForReferenceUnit(assetUnit, nodes, nodeByPath)
    if (!source) continue
    for (const downstream of assetUnit.downstream) {
      const target = targetNodeForAssetDownstream(downstream, nodes, nodeByPath)
      if (!target) continue
      edges.push({
        id: `${source.id}->${target.id}:asset-downstream:${downstream.id}`,
        source: source.id,
        target: target.id,
        label: assetDownstreamLabel(downstream.state),
        state: edgeStateForAssetDownstream(downstream.state),
        evidence: [
          downstream.dependencyHash,
          downstream.preview,
        ].filter(Boolean).join(' · '),
        action: downstream.action,
        kind: 'reference',
        relation: 'asset_downstream',
      })
    }
  }
}

function assetNodeForReferenceUnit(
  unit: AssetReferenceUnit,
  nodes: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
): ContentCanvasNode | undefined {
  return nodes.get(`asset:${unit.assetId}`)
    ?? nodes.get(`asset:${pathSegmentAfter(unit.assetId, 'asset')}`)
    ?? nodes.get(`asset:${pathSegmentAfter(unit.assetId, 'assets')}`)
    ?? nodeByPath.get(unit.assetId)
    ?? nodeByPath.get(unit.path)
}

function targetNodeForAssetDownstream(
  downstream: AssetDownstreamUnit,
  nodes: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
): ContentCanvasNode | undefined {
  const kind = downstream.kind === 'content_unit' ? 'content_unit' : downstream.kind
  return nodes.get(`${kind}:${downstream.ownerNodeId}`)
    ?? nodes.get(`${kind}:${pathSegmentAfter(downstream.ownerNodeId, `${kind}s`)}`)
    ?? nodeByPath.get(downstream.ownerNodeId)
    ?? nodeByPath.get(`${kind}s/${downstream.ownerNodeId}.json`)
    ?? (kind === 'content_unit' ? contentUnitNodeForOwner(downstream.ownerNodeId, nodes) : undefined)
}

function contentUnitNodeForOwner(
  ownerNodeId: string,
  nodes: Map<string, ContentCanvasNode>,
): ContentCanvasNode | undefined {
  for (const node of nodes.values()) {
    if (node.kind !== 'content_unit') continue
    if (node.entityKey === ownerNodeId) return node
  }
  return undefined
}

function edgeStateForAssetDownstream(state: string): ContentCanvasEdge['state'] {
  if (state === 'stale') return 'stale'
  if (state === 'needs_candidate') return 'needs_candidate'
  if (state === 'selected') return 'selected'
  if (state === 'ready') return 'ready'
  return undefined
}

function assetDownstreamLabel(state: string): string {
  if (state === 'stale') return '下游需复核'
  if (state === 'needs_candidate') return '下游缺候选'
  if (state === 'selected') return '下游已同步'
  return '下游影响'
}

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}
