import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type { ProductionWorkItemView } from '@movscript/core/content'
import type {
  ContentCanvasEdge,
  ContentCanvasGraph,
  ContentCanvasGraphIndexes,
  ContentCanvasGraphSummary,
  ContentCanvasCandidate,
  ContentCanvasNode,
  ContentCanvasNodeKind,
  ContentCanvasProjectData,
} from './contentCanvasTypes'

const NODE_WIDTH = 260
const NODE_HEIGHT = 118
const COLUMN_GAP = 360
const ROW_GAP = 168
const FLOW_LANE_GAP = 260

const KIND_LABELS: Record<ContentCanvasNodeKind, string> = {
  project: '项目',
  production: '制作',
  segment: '段落',
  scene_moment: '情节',
  shot: '镜头',
  storyboard: '分镜图',
  expression_unit: '表达单元',
  content_unit: '制作项',
  candidate: '候选',
  selection: '选择',
  resource: '资源',
  keyframe: '关键帧',
  asset: '素材',
  setting: '设定',
  state: '状态',
  audio_cue: '声音',
  work_item: '工作项',
  actor: '处理者',
  group: '分组',
}

const FLOW_SLOTS: Record<ContentCanvasNodeKind, { column: number; lane: number }> = {
  setting: { column: 0, lane: -1 },
  state: { column: 1, lane: -1 },
  asset: { column: 2, lane: -1 },
  expression_unit: { column: 3, lane: -1 },
  audio_cue: { column: 4, lane: -1 },
  project: { column: 0, lane: 0 },
  production: { column: 1, lane: 0 },
  segment: { column: 2, lane: 0 },
  scene_moment: { column: 3, lane: 0 },
  shot: { column: 4, lane: 0 },
  content_unit: { column: 5, lane: 0 },
  keyframe: { column: 4, lane: 1 },
  storyboard: { column: 4, lane: 1 },
  candidate: { column: 6, lane: 1 },
  selection: { column: 6, lane: 1 },
  resource: { column: 7, lane: 1 },
  actor: { column: 6, lane: 2 },
  work_item: { column: 7, lane: 2 },
  group: { column: 0, lane: 2 },
}

const FLOW_KIND_ORDER: Record<ContentCanvasNodeKind, number> = {
  setting: 0,
  state: 0,
  asset: 0,
  expression_unit: 0,
  audio_cue: 0,
  project: 0,
  production: 0,
  segment: 0,
  scene_moment: 0,
  shot: 0,
  content_unit: 0,
  keyframe: 0,
  storyboard: 1,
  candidate: 0,
  selection: 1,
  resource: 0,
  actor: 0,
  work_item: 0,
  group: 0,
}

export function buildContentCanvasGraph(data: ContentCanvasProjectData): ContentCanvasGraph {
  const sourceEntities = [
    ...(data.project ? [data.project] : []),
    ...data.productions,
    ...data.segments,
    ...data.sceneMoments,
    ...data.shots,
    ...data.storyboards,
    ...data.expressionUnits,
    ...data.contentUnits,
    ...data.keyframes,
    ...data.assets,
    ...data.settings,
    ...(data.settingStates ?? []),
    ...(data.audioCues ?? []),
  ]
  const entityNodes = sourceEntities.map((entity) => createNode(entity, data.projectId, data.contentUnitCandidates))
  const candidateOwnerNodes = entityNodes.filter((node) => node.kind === 'content_unit')
  const candidateNodes = candidateOwnerNodes.flatMap(createCandidateNodes)
  const selectionNodes = candidateOwnerNodes.flatMap(createSelectionNodes)
  const resourceNodes = dedupeNodes(candidateNodes.flatMap(createResourceNodes))
  const baseNodes = [...entityNodes, ...candidateNodes, ...selectionNodes, ...resourceNodes]
  const nodeByEntityKindAndKey = new Map(baseNodes.map((node) => [`${node.kind}:${node.entityKey}`, node]))
  const nodeByPath = new Map(baseNodes.filter((node) => node.sourcePath).map((node) => [node.sourcePath, node]))
  const workItemNodes = createWorkItemNodes(data.productionWorkPlan?.items ?? [])
  const actorNodes = createActorNodes(data.productionWorkPlan?.items ?? [])
  const nodes = [...baseNodes, ...actorNodes, ...workItemNodes]
  const projectNode = nodes.find((node) => node.kind === 'project')
  const edges: ContentCanvasEdge[] = []

  for (const node of entityNodes) {
    const entity = sourceEntities.find((item) => node.id === nodeIdForEntity(item, data.projectId))
    if (!entity) continue
    const parent = parentNodeForEntity(entity, nodeByEntityKindAndKey, projectNode)
    if (parent && parent.id !== node.id) {
      edges.push({
        id: `${parent.id}->${node.id}`,
        source: parent.id,
        target: node.id,
        kind: 'hierarchy',
      })
    }
  }
  appendSequenceEdges(edges, entityNodes)

  for (const candidateOwnerNode of candidateOwnerNodes) {
    for (const candidate of candidateOwnerNode.candidates) {
      const candidateNodeId = candidateNodeIdFor(candidateOwnerNode, candidate)
      edges.push({
        id: `${candidateOwnerNode.id}->${candidateNodeId}:candidate`,
        source: candidateOwnerNode.id,
        target: candidateNodeId,
        label: candidate.selected ? '已选候选' : '候选',
        kind: 'reference',
        relation: 'content_unit_candidate',
      })
      const selectionNodeId = selectionNodeIdFor(candidateOwnerNode, candidate)
      if (candidate.selected) {
        edges.push({
          id: `${selectionNodeId}->${candidateNodeId}:selection`,
          source: selectionNodeId,
          target: candidateNodeId,
          label: '当前选择',
          kind: 'reference',
          relation: 'selection_candidate',
        })
      }
      const resourceNodeId = resourceNodeIdFor(candidate)
      if (resourceNodeId) {
        edges.push({
          id: `${candidateNodeId}->${resourceNodeId}:resource`,
          source: candidateNodeId,
          target: resourceNodeId,
          label: '资源',
          kind: 'reference',
          relation: 'candidate_resource',
        })
      }
    }
  }

  for (const contentUnit of data.contentUnits) {
    const source = nodeByEntityKindAndKey.get(`content_unit:${entityKey(contentUnit, data.projectId)}`)
    if (!source) continue
    for (const sceneMomentRef of compactStrings(contentUnit.record.scene_moment_ref, contentUnit.record.scene_moment_refs)) {
      const target = nodeByPath.get(sceneMomentRef)
        ?? nodeByEntityKindAndKey.get(`scene_moment:${sceneMomentRef}`)
        ?? nodeByEntityKindAndKey.get(`scene_moment:${pathSegmentAfter(sceneMomentRef, 'scene_moments')}`)
      if (target) {
        edges.push({
          id: `${target.id}->${source.id}:scene-moment-ref`,
          source: target.id,
          target: source.id,
          label: '情节',
          kind: 'reference',
          relation: 'content_unit_scene',
        })
      }
    }
    for (const assetRef of compactStrings(contentUnit.record.asset_ref, contentUnit.record.asset_refs)) {
      const target = nodeByPath.get(assetRef)
        ?? nodeByEntityKindAndKey.get(`asset:${assetRef}`)
        ?? nodeByEntityKindAndKey.get(`asset:${pathSegmentAfter(assetRef, 'assets')}`)
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:asset-ref`,
          source: source.id,
          target: target.id,
          label: '素材',
          kind: 'reference',
          relation: 'content_unit_asset',
        })
      }
    }
    for (const keyframeRef of compactStrings(contentUnit.record.keyframe_ref, contentUnit.record.keyframe_refs)) {
      const target = nodeByPath.get(keyframeRef)
        ?? nodeByEntityKindAndKey.get(`keyframe:${keyframeRef}`)
        ?? nodeByEntityKindAndKey.get(`keyframe:${pathSegmentAfter(keyframeRef, 'keyframes')}`)
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:keyframe-ref`,
          source: source.id,
          target: target.id,
          label: '关键帧',
          kind: 'reference',
          relation: 'content_unit_keyframe',
        })
      }
    }
    for (const shotRef of compactStrings(contentUnit.record.shot_ref, contentUnit.record.shot_refs)) {
      const target = nodeByPath.get(shotRef)
        ?? nodeByEntityKindAndKey.get(`shot:${shotRef}`)
        ?? nodeByEntityKindAndKey.get(`shot:${pathSegmentAfter(shotRef, 'shots')}`)
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:shot-ref`,
          source: source.id,
          target: target.id,
          label: '镜头',
          kind: 'reference',
          relation: 'content_unit_shot',
        })
      }
    }
    for (const storyboardRef of compactStrings(contentUnit.record.storyboard_ref, contentUnit.record.storyboard_refs)) {
      const target = nodeByPath.get(storyboardRef)
        ?? nodeByEntityKindAndKey.get(`storyboard:${storyboardRef}`)
        ?? nodeByEntityKindAndKey.get(`storyboard:${pathSegmentAfter(storyboardRef, 'storyboards')}`)
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:storyboard-ref`,
          source: source.id,
          target: target.id,
          label: '分镜',
          kind: 'reference',
          relation: 'content_unit_storyboard',
        })
      }
    }
    for (const expressionRef of compactStrings(contentUnit.record.expression_unit_ref, contentUnit.record.expression_unit_refs, contentUnit.record.expression_ref, contentUnit.record.expression_refs)) {
      const target = referencedNodeFor('expression_unit', expressionRef, nodeByEntityKindAndKey, nodeByPath, 'expression_units')
      if (target) {
        edges.push({
          id: `${target.id}->${source.id}:expression-content-unit-ref:${expressionRef}`,
          source: target.id,
          target: source.id,
          label: '表达约束',
          kind: 'reference',
          relation: 'expression_unit_content_unit',
        })
      }
    }
  }

  for (const expressionUnit of data.expressionUnits) {
    const source = nodeByEntityKindAndKey.get(`expression_unit:${entityKey(expressionUnit, data.projectId)}`)
    if (!source) continue
    for (const shotRef of compactStrings(expressionUnit.record.shot_ref, expressionUnit.record.shot_refs)) {
      const target = referencedNodeFor('shot', shotRef, nodeByEntityKindAndKey, nodeByPath, 'shots')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:expression-shot-ref:${shotRef}`,
          source: source.id,
          target: target.id,
          label: '表达约束',
          kind: 'reference',
          relation: 'expression_unit_shot',
        })
      }
    }
    for (const storyboardRef of expressionStoryboardRefs(expressionUnit.record)) {
      const target = referencedNodeFor('storyboard', storyboardRef, nodeByEntityKindAndKey, nodeByPath, 'storyboards')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:expression-storyboard-ref:${storyboardRef}`,
          source: source.id,
          target: target.id,
          label: '表达分镜',
          kind: 'reference',
          relation: 'expression_unit_storyboard',
        })
      }
    }
  }

  for (const audioCue of data.audioCues ?? []) {
    const source = nodeByEntityKindAndKey.get(`audio_cue:${entityKey(audioCue, data.projectId)}`)
    if (!source) continue
    for (const shotRef of compactStrings(audioCue.record.shot_ref, audioCue.record.shot_refs)) {
      const target = referencedNodeFor('shot', shotRef, nodeByEntityKindAndKey, nodeByPath, 'shots')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:audio-shot-ref`,
          source: source.id,
          target: target.id,
          label: '声音约束',
          kind: 'reference',
          relation: 'audio_cue_shot',
        })
      }
    }
    for (const storyboardRef of compactStrings(audioCue.record.storyboard_ref, audioCue.record.storyboard_refs)) {
      const target = referencedNodeFor('storyboard', storyboardRef, nodeByEntityKindAndKey, nodeByPath, 'storyboards')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:audio-storyboard-ref`,
          source: source.id,
          target: target.id,
          label: '声音分镜',
          kind: 'reference',
          relation: 'audio_cue_storyboard',
        })
      }
    }
    for (const assetRef of compactStrings(audioCue.record.asset_ref, audioCue.record.asset_refs)) {
      const target = referencedNodeFor('asset', assetRef, nodeByEntityKindAndKey, nodeByPath, 'assets')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:audio-asset-ref`,
          source: source.id,
          target: target.id,
          label: '声音素材',
          kind: 'reference',
          relation: 'audio_cue_asset',
        })
      }
    }
  }

  for (const node of entityNodes) {
    for (const stateRef of settingStateRefsForRecord(node.record)) {
      const target = referencedNodeFor('state', stateRef, nodeByEntityKindAndKey, nodeByPath, 'states')
      if (!target || target.id === node.id) continue
      edges.push({
        id: `${node.id}->${target.id}:setting-state-ref:${stateRef}`,
        source: node.id,
        target: target.id,
        label: '设定状态',
        kind: 'reference',
        relation: 'setting_state_reference',
      })
    }
  }

  for (const assetUnit of Object.values(data.assetReferenceUnits ?? {})) {
    const source = assetNodeForReferenceUnit(assetUnit, nodeByEntityKindAndKey, nodeByPath)
    if (!source) continue
    for (const downstream of assetUnit.downstream) {
      const target = targetNodeForAssetDownstream(downstream, nodeByEntityKindAndKey, nodeByPath)
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

  for (const item of data.productionWorkPlan?.items ?? []) {
    const actor = nodes.find((node) => node.id === actorNodeIdFor(item.recommendedActor))
    const source = nodes.find((node) => node.id === workItemNodeIdFor(item))
    const target = targetNodeForWorkItem(item, nodeByEntityKindAndKey, nodeByPath)
    if (actor && source) {
      edges.push({
        id: `${actor.id}->${source.id}:actor-work-item`,
        source: actor.id,
        target: source.id,
        label: '推荐处理',
        kind: 'reference',
        relation: 'actor_work_item',
      })
    }
    if (!source || !target) continue
    edges.push({
      id: `${source.id}->${target.id}:work-item-target`,
      source: source.id,
      target: target.id,
      label: '处理目标',
      kind: 'reference',
      relation: 'work_item_target',
    })
  }

  const graphEdges = dedupeEdges(edges)
    .map(withContentCanvasEdgeType)
  return withGraphIndexesAndSummary({
    nodes: assignDeterministicPositions(withStructureSummaryMetrics(nodes, graphEdges)),
    edges: graphEdges,
  })
}

function withContentCanvasEdgeType(edge: ContentCanvasEdge): ContentCanvasEdge {
  const type = contentCanvasEdgeType(edge)
  return edge.type === type ? edge : { ...edge, type }
}

function contentCanvasEdgeType(edge: ContentCanvasEdge): NonNullable<ContentCanvasEdge['type']> {
  if (edge.kind === 'hierarchy') return 'contains'
  if (edge.kind === 'sequence') return 'sequence'
  if (edge.relation === 'work_item_target' || edge.relation === 'actor_work_item') return 'work_item_targets'
  if (edge.relation === 'selection_candidate') return 'selected_from'
  if (edge.relation === 'content_unit_candidate' || edge.relation === 'candidate_resource') return 'generates'
  if (edge.relation === 'asset_downstream') {
    return edge.state === 'stale' || edge.state === 'needs_candidate' || edge.state === 'missing'
      ? 'invalidates'
      : 'affects'
  }
  if (edge.relation === 'setting_state_reference'
    || edge.relation === 'expression_unit_shot'
    || edge.relation === 'expression_unit_storyboard'
    || edge.relation === 'expression_unit_content_unit'
    || edge.relation === 'audio_cue_shot'
    || edge.relation === 'audio_cue_storyboard'
    || edge.relation === 'audio_cue_asset') return 'constrains'
  if (edge.relation === 'content_unit_scene'
    || edge.relation === 'content_unit_asset'
    || edge.relation === 'content_unit_keyframe'
    || edge.relation === 'content_unit_shot'
    || edge.relation === 'content_unit_storyboard') return 'depends_on'
  return 'affects'
}

function withGraphIndexesAndSummary(graph: Pick<ContentCanvasGraph, 'nodes' | 'edges'>): ContentCanvasGraph {
  const indexes = buildContentCanvasGraphIndexes(graph.nodes, graph.edges)
  return {
    ...graph,
    indexes,
    summary: buildContentCanvasGraphSummary(graph.nodes, graph.edges, indexes),
  }
}

function buildContentCanvasGraphIndexes(
  nodes: ContentCanvasNode[],
  edges: ContentCanvasEdge[],
): ContentCanvasGraphIndexes {
  const nodeById: ContentCanvasGraphIndexes['nodeById'] = {}
  const edgeById: ContentCanvasGraphIndexes['edgeById'] = {}
  const upstreamEdgeIdsByNodeId: ContentCanvasGraphIndexes['upstreamEdgeIdsByNodeId'] = {}
  const downstreamEdgeIdsByNodeId: ContentCanvasGraphIndexes['downstreamEdgeIdsByNodeId'] = {}
  const workItemIdsByTargetId: ContentCanvasGraphIndexes['workItemIdsByTargetId'] = {}
  for (const node of nodes) nodeById[node.id] = node
  for (const edge of edges) {
    edgeById[edge.id] = edge
    downstreamEdgeIdsByNodeId[edge.source] = [...(downstreamEdgeIdsByNodeId[edge.source] ?? []), edge.id]
    upstreamEdgeIdsByNodeId[edge.target] = [...(upstreamEdgeIdsByNodeId[edge.target] ?? []), edge.id]
    if (edge.relation === 'work_item_target') {
      workItemIdsByTargetId[edge.target] = [...(workItemIdsByTargetId[edge.target] ?? []), edge.source]
    }
  }
  return {
    nodeById,
    edgeById,
    upstreamEdgeIdsByNodeId,
    downstreamEdgeIdsByNodeId,
    workItemIdsByTargetId,
  }
}

function buildContentCanvasGraphSummary(
  nodes: ContentCanvasNode[],
  edges: ContentCanvasEdge[],
  indexes: ContentCanvasGraphIndexes,
): ContentCanvasGraphSummary {
  const nodeCountByKind = nodes.reduce<ContentCanvasGraphSummary['nodeCountByKind']>((counts, node) => {
    counts[node.kind] = (counts[node.kind] ?? 0) + 1
    return counts
  }, {})
  const actorWorkItemCount: ContentCanvasGraphSummary['actorWorkItemCount'] = {
    human: 0,
    agent: 0,
    workflow: 0,
  }
  for (const node of nodes) {
    if (node.kind !== 'work_item') continue
    const actor = stringValue(node.record.recommendedActor)
    if (actor === 'agent' || actor === 'workflow' || actor === 'human') {
      actorWorkItemCount[actor] += 1
    }
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeCountByKind,
    productionCount: nodeCountByKind.production ?? 0,
    shotCount: nodeCountByKind.shot ?? 0,
    staleCount: issueCountForGraph(nodes, edges, 'stale'),
    needsCandidateCount: issueCountForGraph(nodes, edges, 'needs_candidate'),
    missingCount: issueCountForGraph(nodes, edges, 'missing'),
    openWorkItemCount: Object.values(indexes.workItemIdsByTargetId).reduce((total, itemIds) => total + itemIds.length, 0),
    actorWorkItemCount,
  }
}

function issueCountForGraph(
  nodes: ContentCanvasNode[],
  edges: ContentCanvasEdge[],
  state: NonNullable<ContentCanvasEdge['state']>,
): number {
  const issueIds = new Set<string>()
  for (const edge of edges) {
    if (edge.state === state) issueIds.add(edge.id)
    if (edge.relation !== 'work_item_target') continue
    const workItem = nodes.find((node) => node.id === edge.source)
    if (!workItem) continue
    if (state === 'needs_candidate' && stringValue(workItem.record.kind) === 'missing_candidate') issueIds.add(workItem.id)
    if (state === 'stale' && stringValue(workItem.record.kind) === 'stale_selection') issueIds.add(workItem.id)
    if (state === 'missing' && (workItem.status === 'missing' || stringValue(workItem.record.severity) === 'blocking')) issueIds.add(workItem.id)
  }
  return issueIds.size
}

function assetNodeForReferenceUnit(
  unit: NonNullable<ContentCanvasProjectData['assetReferenceUnits']>[string],
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
  downstream: NonNullable<ContentCanvasProjectData['assetReferenceUnits']>[string]['downstream'][number],
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

function withStructureSummaryMetrics(nodes: ContentCanvasNode[], edges: ContentCanvasEdge[]): ContentCanvasNode[] {
  const structureKinds = new Set<ContentCanvasNodeKind>(['project', 'production', 'segment', 'scene_moment', 'shot'])
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const childrenByNodeId = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.kind !== 'hierarchy') continue
    childrenByNodeId.set(edge.source, [...(childrenByNodeId.get(edge.source) ?? []), edge.target])
  }
  return nodes.map((node) => {
    if (!structureKinds.has(node.kind)) return node
    const scopeIds = contentCanvasHierarchyScope(node.id, childrenByNodeId)
    const scopedNodes = [...scopeIds].map((nodeId) => nodeById.get(nodeId)).filter((item): item is ContentCanvasNode => Boolean(item))
    const descendantNodes = scopedNodes.filter((item) => item.id !== node.id)
    const metrics = dedupeMetrics([
      ...node.metrics,
      structureCountMetric('镜头', descendantNodes, 'shot'),
      structureCountMetric('制作项', descendantNodes, 'content_unit'),
      structureCountMetric('关键帧', descendantNodes, 'keyframe'),
      structureCountMetric('分镜', descendantNodes, 'storyboard'),
      structureCountMetric('声音', descendantNodes, 'audio_cue'),
      structureCountMetric('表达', descendantNodes, 'expression_unit'),
      workItemMetric(scopeIds, edges),
      issueMetric('需候选', contentCanvasScopeNeedsCandidateCount(scopeIds, edges, nodeById)),
      issueMetric('需复核', contentCanvasScopeStaleCount(scopeIds, edges, nodeById)),
      issueMetric('缺失', contentCanvasScopeMissingCount(scopeIds, edges, scopedNodes, nodeById)),
    ])
    return metrics.length === node.metrics.length ? node : { ...node, metrics }
  })
}

function contentCanvasHierarchyScope(
  nodeId: string,
  childrenByNodeId: Map<string, string[]>,
): Set<string> {
  const ids = new Set<string>([nodeId])
  const queue = [...(childrenByNodeId.get(nodeId) ?? [])]
  while (queue.length) {
    const current = queue.shift()
    if (!current || ids.has(current)) continue
    ids.add(current)
    queue.push(...(childrenByNodeId.get(current) ?? []))
  }
  return ids
}

function structureCountMetric(
  label: string,
  nodes: ContentCanvasNode[],
  kind: ContentCanvasNodeKind,
): string | undefined {
  const count = nodes.filter((node) => node.kind === kind).length
  return count > 0 ? `${label} ${count}` : undefined
}

function workItemMetric(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
): string | undefined {
  const workItemIds = new Set<string>()
  for (const edge of edges) {
    if (edge.relation === 'work_item_target' && scopeIds.has(edge.target)) workItemIds.add(edge.source)
  }
  return workItemIds.size > 0 ? `工作项 ${workItemIds.size}` : undefined
}

function contentCanvasScopeNeedsCandidateCount(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
  nodeById: Map<string, ContentCanvasNode>,
): number {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.state === 'needs_candidate' && (scopeIds.has(edge.source) || scopeIds.has(edge.target))) ids.add(edge.id)
    if (edge.relation !== 'work_item_target' || !scopeIds.has(edge.target)) continue
    const workItem = nodeById.get(edge.source)
    if (stringValue(workItem?.record.kind) === 'missing_candidate') ids.add(edge.source)
  }
  return ids.size
}

function contentCanvasScopeStaleCount(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
  nodeById: Map<string, ContentCanvasNode>,
): number {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.state === 'stale' && (scopeIds.has(edge.source) || scopeIds.has(edge.target))) ids.add(edge.id)
    if (edge.relation !== 'work_item_target' || !scopeIds.has(edge.target)) continue
    const workItem = nodeById.get(edge.source)
    if (stringValue(workItem?.record.kind) === 'stale_selection') ids.add(edge.source)
  }
  return ids.size
}

function contentCanvasScopeMissingCount(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
  scopedNodes: ContentCanvasNode[],
  nodeById: Map<string, ContentCanvasNode>,
): number {
  const ids = new Set<string>()
  for (const node of scopedNodes) {
    if (node.status === 'missing') ids.add(node.id)
  }
  for (const edge of edges) {
    if (edge.state === 'missing' && (scopeIds.has(edge.source) || scopeIds.has(edge.target))) ids.add(edge.id)
    if (edge.relation !== 'work_item_target' || !scopeIds.has(edge.target)) continue
    const workItem = nodeById.get(edge.source)
    if (workItem?.status === 'missing' || stringValue(workItem?.record.severity) === 'blocking') ids.add(edge.source)
  }
  return ids.size
}

function issueMetric(label: string, count: number): string | undefined {
  return count > 0 ? `${label} ${count}` : undefined
}

function dedupeMetrics(metrics: Array<string | undefined>): string[] {
  return [...new Set(metrics.filter((metric): metric is string => Boolean(metric)))]
}

function appendSequenceEdges(edges: ContentCanvasEdge[], nodes: ContentCanvasNode[]) {
  const parentByNodeId = new Map(edges.filter((edge) => edge.kind === 'hierarchy').map((edge) => [edge.target, edge.source]))
  const sequenceKinds = new Set<ContentCanvasNodeKind>([
    'production',
    'segment',
    'scene_moment',
    'shot',
    'storyboard',
    'keyframe',
    'audio_cue',
    'expression_unit',
    'content_unit',
  ])
  const groups = new Map<string, ContentCanvasNode[]>()
  for (const node of nodes) {
    if (!sequenceKinds.has(node.kind)) continue
    const parentId = parentByNodeId.get(node.id)
    if (!parentId) continue
    const key = `${parentId}:${node.kind}`
    groups.set(key, [...(groups.get(key) ?? []), node])
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareSequenceNodes)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const next = sorted[index]
      edges.push({
        id: `${previous.id}->${next.id}:sequence`,
        source: previous.id,
        target: next.id,
        label: '顺序',
        kind: 'sequence',
      })
    }
  }
}

function compareSequenceNodes(left: ContentCanvasNode, right: ContentCanvasNode) {
  const leftOrder = numberValue(left.record.order)
  const rightOrder = numberValue(right.record.order)
  if (leftOrder !== undefined || rightOrder !== undefined) return (leftOrder ?? 0) - (rightOrder ?? 0)
  return left.title.localeCompare(right.title, 'zh-CN')
}

function contentUnitNodeForOwner(
  ownerNodeId: string,
  nodes: Map<string, ContentCanvasNode>,
): ContentCanvasNode | undefined {
  for (const node of nodes.values()) {
    if (node.kind !== 'content_unit') continue
    if (node.entityKey === ownerNodeId) return node
    if (stringValue(node.record.shot_id) === ownerNodeId) return node
    if (compactStrings(node.record.shot_ref, node.record.shot_refs).includes(ownerNodeId)) return node
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

function createNode(
  entity: MovScriptWorkspaceIndexedEntity,
  projectId: number,
  contentUnitCandidates: ContentCanvasProjectData['contentUnitCandidates'],
): ContentCanvasNode {
  const kind = contentCanvasKind(entity)
  const record = entity.record
  const title = titleForEntity(entity, projectId)
  const subtitle = subtitleForEntity(entity)
  const summary = summaryForEntity(entity)
  const key = entityKey(entity, projectId)
  const candidates = kind === 'content_unit'
    ? (contentUnitCandidates[key] ?? [])
    : []
  const metrics = metricsForEntity(entity, candidates)
  return {
    id: nodeIdForEntity(entity, projectId),
    entityKey: key,
    kind,
    title,
    subtitle,
    summary,
    status: statusForEntity(entity),
    metrics,
    sourcePath: entity.path,
    record: entity.record,
    candidates,
    position: { x: 0, y: 0 },
  }
}

function createCandidateNodes(ownerNode: ContentCanvasNode): ContentCanvasNode[] {
  return ownerNode.candidates.map((candidate) => ({
    id: candidateNodeIdFor(ownerNode, candidate),
    entityKey: candidate.id,
    kind: 'candidate',
    title: candidate.title,
    subtitle: candidate.selected ? '已选择候选' : '候选',
    summary: candidate.notes || candidate.artifactRef || candidate.source || '暂无候选说明',
    status: candidate.selected ? 'ready' : 'active',
    metrics: [
      candidate.resourceId ? `资源 ${candidate.resourceId}` : undefined,
      candidate.resourceKind ? `类型 ${candidate.resourceKind}` : undefined,
      candidate.inputHash ? `Input ${candidate.inputHash}` : undefined,
      candidate.source ? `模型 ${candidate.source}` : undefined,
      candidate.selected ? '已选' : undefined,
    ].filter((item): item is string => Boolean(item)),
    sourcePath: '',
    record: {
      ...candidate,
      ownerKind: ownerNode.kind,
      ownerContentUnitId: ownerNode.entityKey,
      ownerContentUnitNodeId: ownerNode.id,
    },
    candidates: [],
    position: { x: 0, y: 0 },
  }))
}

function createSelectionNodes(ownerNode: ContentCanvasNode): ContentCanvasNode[] {
  return ownerNode.candidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => ({
      id: selectionNodeIdFor(ownerNode, candidate),
      entityKey: `${ownerNode.entityKey}:${candidate.id}`,
      kind: 'selection',
      title: '当前选择',
      subtitle: ownerNode.title,
      summary: `${candidate.title} 是当前采纳候选。`,
      status: 'ready',
    metrics: [
      candidate.resourceId ? `资源 ${candidate.resourceId}` : undefined,
      candidate.resourceKind ? `类型 ${candidate.resourceKind}` : undefined,
      candidate.inputHash ? `Input ${candidate.inputHash}` : undefined,
      candidate.artifactRef ? 'Artifact' : undefined,
      ].filter((item): item is string => Boolean(item)),
      sourcePath: '',
      record: {
        candidateId: candidate.id,
        candidateTitle: candidate.title,
        ownerKind: ownerNode.kind,
        ownerContentUnitId: ownerNode.entityKey,
        ownerContentUnitNodeId: ownerNode.id,
      },
      candidates: [],
      position: { x: 0, y: 0 },
    }))
}

function createResourceNodes(candidateNode: ContentCanvasNode): ContentCanvasNode[] {
  const resourceKey = resourceKeyForCandidateRecord(candidateNode.record)
  if (!resourceKey) return []
  const title = typeof candidateNode.record.resourceId === 'number'
    ? `Resource ${candidateNode.record.resourceId}`
    : resourceKey
  return [{
    id: `resource:${resourceKey}`,
    entityKey: resourceKey,
    kind: 'resource',
    title,
    subtitle: '候选输出资源',
    summary: String(candidateNode.record.artifactRef ?? candidateNode.record.notes ?? '候选产出的可复用资源'),
    status: 'ready',
    metrics: [
      typeof candidateNode.record.source === 'string' ? `来源 ${candidateNode.record.source}` : undefined,
      typeof candidateNode.record.resourceId === 'number' ? `Resource ${candidateNode.record.resourceId}` : undefined,
      typeof candidateNode.record.inputHash === 'string' ? `Input ${candidateNode.record.inputHash}` : undefined,
      typeof candidateNode.record.artifactRef === 'string' ? 'Artifact Ref' : undefined,
    ].filter((item): item is string => Boolean(item)),
    sourcePath: '',
    record: {
      resourceId: candidateNode.record.resourceId,
      resourceKind: candidateNode.record.resourceKind,
      artifactRef: candidateNode.record.artifactRef,
      inputHash: candidateNode.record.inputHash,
      candidateNodeId: candidateNode.id,
      ownerContentUnitNodeId: candidateNode.record.ownerContentUnitNodeId,
    },
    candidates: [],
    position: { x: 0, y: 0 },
  }]
}

function createWorkItemNodes(items: ProductionWorkItemView[]): ContentCanvasNode[] {
  return items.map((item) => ({
    id: workItemNodeIdFor(item),
    entityKey: item.id,
    kind: 'work_item',
    title: item.actionLabels[0] ?? workItemKindLabel(item.kind),
    subtitle: `${workItemSeverityLabel(item.severity)} / ${workItemActorLabel(item.recommendedActor)}`,
    summary: item.reason,
    status: statusForWorkItem(item),
    metrics: [
      `优先级 ${item.priority}`,
      `状态 ${item.status}`,
      `目标 ${item.targetKind}`,
      `建议 ${workItemActorLabel(item.recommendedActor)}`,
    ],
    sourcePath: item.targetPath ?? '',
    record: { ...item },
    candidates: [],
    position: { x: 0, y: 0 },
  }))
}

function createActorNodes(items: ProductionWorkItemView[]): ContentCanvasNode[] {
  const itemsByActor = new Map<ProductionWorkItemView['recommendedActor'], ProductionWorkItemView[]>()
  for (const item of items) {
    itemsByActor.set(item.recommendedActor, [...(itemsByActor.get(item.recommendedActor) ?? []), item])
  }
  return [...itemsByActor.entries()].map(([actor, actorItems]) => {
    const blocking = actorItems.filter((item) => item.severity === 'blocking' || item.status === 'blocked').length
    const warning = actorItems.filter((item) => item.severity === 'warning').length
    return {
      id: actorNodeIdFor(actor),
      entityKey: actor,
      kind: 'actor',
      title: workItemActorLabel(actor),
      subtitle: '推荐处理者',
      summary: actorSummary(actor),
      status: blocking > 0 ? 'missing' : actorItems.some((item) => item.status === 'open') ? 'active' : 'neutral',
      metrics: [
        `工作项 ${actorItems.length}`,
        blocking > 0 ? `阻塞 ${blocking}` : undefined,
        warning > 0 ? `警示 ${warning}` : undefined,
      ].filter((item): item is string => Boolean(item)),
      sourcePath: '',
      record: {
        actor,
        workItemIds: actorItems.map((item) => item.id),
      },
      candidates: [],
      position: { x: 0, y: 0 },
    } satisfies ContentCanvasNode
  })
}

function parentNodeForEntity(
  entity: MovScriptWorkspaceIndexedEntity,
  nodes: Map<string, ContentCanvasNode>,
  projectNode: ContentCanvasNode | undefined,
) {
  const record = entity.record
  const kind = contentCanvasKind(entity)
  if (kind === 'project') return undefined
  if (kind === 'production') return projectNode
  if (kind === 'segment') {
    return findNode(nodes, 'production', record.production_id, pathSegmentAfter(entity.path, 'productions')) ?? projectNode
  }
  if (kind === 'scene_moment') {
    return findNode(nodes, 'segment', record.segment_id, pathSegmentAfter(entity.path, 'segments'))
      ?? findNode(nodes, 'production', record.production_id, pathSegmentAfter(entity.path, 'productions'))
      ?? projectNode
  }
  if (kind === 'content_unit') {
    const sceneMomentRef = stringValue(record.scene_moment_ref)
    return findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(sceneMomentRef, 'scene_moments'), pathSegmentAfter(entity.path, 'scene_moments'))
      ?? findNode(nodes, 'segment', record.segment_id, pathSegmentAfter(entity.path, 'segments'))
      ?? projectNode
  }
  if (kind === 'shot') {
    const sceneMomentRef = stringValue(record.scene_moment_ref)
    return findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(sceneMomentRef, 'scene_moments'), pathSegmentAfter(entity.path, 'scene_moments'))
      ?? projectNode
  }
  if (kind === 'expression_unit') {
    return findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(entity.path, 'scene_moments'))
      ?? projectNode
  }
  if (kind === 'audio_cue') {
    const scopeRef = stringValue(record.scope_ref)
    return findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(scopeRef, 'scene_moments'), pathSegmentAfter(entity.path, 'scene_moments'))
      ?? projectNode
  }
  if (kind === 'storyboard') {
    const shotRef = stringValue(record.shot_ref)
    return findNode(nodes, 'shot', record.shot_id, pathSegmentAfter(shotRef, 'shots'), pathSegmentAfter(entity.path, 'shots'))
      ?? findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(entity.path, 'scene_moments'))
      ?? projectNode
  }
  if (kind === 'keyframe') {
    const shotRef = stringValue(record.shot_ref)
    return findNode(nodes, 'shot', record.shot_id, pathSegmentAfter(shotRef, 'shots'), pathSegmentAfter(entity.path, 'shots'))
      ?? findNode(nodes, 'content_unit', record.content_unit_id, pathSegmentAfter(entity.path, 'content_units'))
      ?? findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(entity.path, 'scene_moments'))
      ?? projectNode
  }
  if (kind === 'asset') {
    const ownerType = stringValue(record.owner_type)
    if (ownerType === 'content_unit') return findNode(nodes, 'content_unit', record.owner_id)
    if (ownerType === 'scene_moment') return findNode(nodes, 'scene_moment', record.owner_id)
    if (ownerType === 'segment') return findNode(nodes, 'segment', record.owner_id)
    if (ownerType === 'setting') return findNode(nodes, 'setting', record.owner_id)
    if (ownerType === 'setting_state') return findNode(nodes, 'state', record.owner_id, record.setting_state_id, pathSegmentAfter(entity.path, 'states'))
    return findNode(nodes, 'setting', record.setting_id, pathSegmentAfter(entity.path, 'settings')) ?? projectNode
  }
  if (kind === 'state') {
    return findNode(nodes, 'setting', record.setting_id, pathSegmentAfter(entity.path, 'settings')) ?? projectNode
  }
  if (kind === 'setting') return projectNode
  return projectNode
}

function findNode(
  nodes: Map<string, ContentCanvasNode>,
  kind: ContentCanvasNodeKind,
  ...values: unknown[]
) {
  for (const value of values) {
    const key = idValue(value)
    if (!key) continue
    const node = nodes.get(`${kind}:${key}`)
    if (node) return node
  }
  return undefined
}

function assignDeterministicPositions(nodes: ContentCanvasNode[]): ContentCanvasNode[] {
  const rowsBySlot = new Map<string, number>()
  return [...nodes]
    .sort(compareCanvasNodes)
    .map((node) => {
      const slot = flowSlotForKind(node.kind)
      const slotKey = `${slot.lane}:${slot.column}`
      const row = rowsBySlot.get(slotKey) ?? 0
      rowsBySlot.set(slotKey, row + 1)
      return {
        ...node,
        position: {
          x: slot.column * COLUMN_GAP,
          y: slot.lane * FLOW_LANE_GAP + row * ROW_GAP,
        },
      }
    })
}

function compareCanvasNodes(left: ContentCanvasNode, right: ContentCanvasNode) {
  const leftSlot = flowSlotForKind(left.kind)
  const rightSlot = flowSlotForKind(right.kind)
  const laneDelta = leftSlot.lane - rightSlot.lane
  if (laneDelta !== 0) return laneDelta
  const columnDelta = leftSlot.column - rightSlot.column
  if (columnDelta !== 0) return columnDelta
  const orderDelta = FLOW_KIND_ORDER[left.kind] - FLOW_KIND_ORDER[right.kind]
  if (orderDelta !== 0) return orderDelta
  return left.title.localeCompare(right.title, 'zh-CN')
}

function flowSlotForKind(kind: ContentCanvasNodeKind): { column: number; lane: number } {
  return FLOW_SLOTS[kind] ?? { column: 0, lane: 0 }
}

function candidateNodeIdFor(ownerNode: ContentCanvasNode, candidate: ContentCanvasCandidate) {
  if (ownerNode.kind === 'asset') return `candidate:asset:${ownerNode.entityKey}:${candidate.id}`
  return `candidate:${ownerNode.entityKey}:${candidate.id}`
}

function selectionNodeIdFor(ownerNode: ContentCanvasNode, candidate: ContentCanvasCandidate) {
  if (ownerNode.kind === 'asset') return `selection:asset:${ownerNode.entityKey}:${candidate.id}`
  return `selection:${ownerNode.entityKey}:${candidate.id}`
}

function resourceNodeIdFor(candidate: ContentCanvasCandidate): string | undefined {
  const key = resourceKeyForCandidate(candidate)
  return key ? `resource:${key}` : undefined
}

function resourceKeyForCandidate(candidate: ContentCanvasCandidate): string | undefined {
  if (candidate.resourceId !== undefined) return String(candidate.resourceId)
  return candidate.artifactRef
}

function resourceKeyForCandidateRecord(record: Record<string, unknown>): string | undefined {
  if (typeof record.resourceId === 'number') return String(record.resourceId)
  if (typeof record.artifactRef === 'string' && record.artifactRef.trim()) return record.artifactRef.trim()
  return undefined
}

function workItemNodeIdFor(item: ProductionWorkItemView) {
  return `work_item:${item.id}`
}

function actorNodeIdFor(actor: ProductionWorkItemView['recommendedActor']) {
  return `actor:${actor}`
}

function targetNodeForWorkItem(
  item: ProductionWorkItemView,
  nodes: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
): ContentCanvasNode | undefined {
  if (item.targetPath) {
    const byPath = nodeByPath.get(item.targetPath)
    if (byPath) return byPath
  }
  const targetKind = contentCanvasKindFromTargetKind(item.targetKind)
  if (!targetKind || !item.targetId) return undefined
  return nodes.get(`${targetKind}:${item.targetId}`)
}

function referencedNodeFor(
  kind: ContentCanvasNodeKind,
  ref: string,
  nodes: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
  collectionSegment: string,
): ContentCanvasNode | undefined {
  return nodeByPath.get(ref)
    ?? nodes.get(`${kind}:${ref}`)
    ?? nodes.get(`${kind}:${pathSegmentAfter(ref, collectionSegment)}`)
}

function contentCanvasKindFromTargetKind(kind: string): ContentCanvasNodeKind | undefined {
  if (kind === 'asset_reference') return 'asset'
  if (kind === 'content_unit_candidate') return 'candidate'
  if (kind in KIND_LABELS) return kind as ContentCanvasNodeKind
  return undefined
}

function dedupeEdges(edges: ContentCanvasEdge[]): ContentCanvasEdge[] {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    if (seen.has(edge.id)) return false
    seen.add(edge.id)
    return true
  })
}

function dedupeNodes(nodes: ContentCanvasNode[]): ContentCanvasNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()]
}

function nodeIdForEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number) {
  return `${contentCanvasKind(entity)}:${entityKey(entity, projectId)}`
}

function entityKey(entity: MovScriptWorkspaceIndexedEntity, projectId: number) {
  if (entity.entityKind === 'project') return String(entity.id ?? entity.record.project_id ?? projectId)
  return idValue(entity.id ?? entity.record.ID ?? entity.record.id) ?? `${entity.entityKind}:${entity.path}`
}

function contentCanvasKind(entity: MovScriptWorkspaceIndexedEntity): ContentCanvasNodeKind {
  if (entity.entityKind === 'asset') return 'asset'
  if (entity.entityKind === 'setting_state') return 'state'
  return entity.entityKind as ContentCanvasNodeKind
}

function titleForEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number) {
  const record = entity.record
  return stringValue(record.title ?? record.name ?? record.label)
    ?? (entity.entityKind === 'project' ? `Project ${projectId}` : `${KIND_LABELS[contentCanvasKind(entity)]} ${entityKey(entity, projectId)}`)
}

function subtitleForEntity(entity: MovScriptWorkspaceIndexedEntity) {
  const kind = contentCanvasKind(entity)
  const record = entity.record
  if (kind === 'content_unit') return stringValue(record.output_kind ?? record.content_unit_type ?? record.kind) ?? KIND_LABELS[kind]
  if (kind === 'shot') return stringValue(record.shot_kind ?? record.kind ?? record.shot_size) ?? KIND_LABELS[kind]
  if (kind === 'storyboard') return stringValue(record.slot ?? record.asset_kind ?? record.kind) ?? KIND_LABELS[kind]
  if (kind === 'expression_unit') return stringValue(record.expression_kind ?? record.kind) ?? KIND_LABELS[kind]
  if (kind === 'asset') return stringValue(record.kind ?? record.asset_kind ?? record.slot_key) ?? KIND_LABELS[kind]
  if (kind === 'state') return stringValue(record.state_kind ?? record.kind) ?? KIND_LABELS[kind]
  if (kind === 'audio_cue') return stringValue(record.cue_kind ?? record.kind) ?? KIND_LABELS[kind]
  if (kind === 'segment') return stringValue(record.segment_kind ?? record.kind) ?? KIND_LABELS[kind]
  if (kind === 'setting') return stringValue(record.kind ?? record.setting_kind) ?? KIND_LABELS[kind]
  return KIND_LABELS[kind]
}

function summaryForEntity(entity: MovScriptWorkspaceIndexedEntity) {
  const record = entity.record
  const prompt = record.edit_prompt
  return stringValue(record.summary ?? record.description ?? record.action_text ?? record.action ?? record.text ?? record.visual_intent ?? record.prompt ?? (isRecord(prompt) ? prompt.text : undefined))
    ?? '暂无摘要'
}

function metricsForEntity(entity: MovScriptWorkspaceIndexedEntity, mergedCandidates: ContentCanvasCandidate[] = []) {
  const record = entity.record
  const candidates = mergedCandidates
  const selectedCandidate = candidates.find((candidate) => candidate.selected)
  return [
    numberMetric('顺序', record.order),
    numberMetric('时长', record.duration_sec ?? (isRecord(record.model_intent) ? record.model_intent.duration_sec : undefined), 's'),
    stringMetric('状态', record.status ?? record.review_status),
    entity.entityKind === 'asset' ? stringMetric('素材', record.asset_kind ?? record.kind ?? record.mime_type ?? record.media_type) : undefined,
    entity.entityKind === 'asset' ? valueMetric('资源', record.resource_id ?? record.resourceId ?? record.artifact_ref ?? record.artifactRef ?? record.uri ?? record.url) : undefined,
    candidates.length ? `候选 ${candidates.length}` : undefined,
    selectedCandidate ? '已选择候选' : undefined,
  ].filter((item): item is string => Boolean(item))
}

function statusForEntity(entity: MovScriptWorkspaceIndexedEntity): ContentCanvasNode['status'] {
  const record = entity.record
  const status = stringValue(record.status ?? record.review_status)
  if (status === 'ready' || status === 'selected' || status === 'approved') return 'ready'
  if (status === 'blocked' || status === 'missing') return 'missing'
  if (entity.entityKind === 'content_unit' && !summaryForEntity(entity)) return 'missing'
  if (entity.entityKind === 'content_unit' || entity.entityKind === 'keyframe') return 'active'
  return 'neutral'
}

function statusForWorkItem(item: ProductionWorkItemView): ContentCanvasNode['status'] {
  if (item.severity === 'blocking' || item.status === 'blocked') return 'missing'
  if (item.status === 'ready') return 'ready'
  if (item.status === 'open') return 'active'
  return 'neutral'
}

function workItemKindLabel(kind: string) {
  if (kind === 'missing_candidate') return '补齐候选'
  if (kind === 'stale_selection') return '复核选择'
  if (kind === 'missing_reference') return '补齐引用'
  if (kind === 'ready_to_generate') return '可生成'
  return '工作项'
}

function workItemSeverityLabel(severity: string) {
  if (severity === 'blocking') return '阻塞'
  if (severity === 'warning') return '警示'
  return '建议'
}

function workItemActorLabel(actor: ProductionWorkItemView['recommendedActor']) {
  if (actor === 'agent') return 'Agent'
  if (actor === 'workflow') return 'Workflow'
  return '人工'
}

function actorSummary(actor: ProductionWorkItemView['recommendedActor']) {
  if (actor === 'agent') return '适合由 Agent 接手的内容编排任务。'
  if (actor === 'workflow') return '适合由自动流程继续推进的内容编排任务。'
  return '需要人工判断或确认的内容编排任务。'
}

function numberMetric(label: string, value: unknown, suffix = '') {
  const number = numberValue(value)
  return number === undefined ? undefined : `${label} ${number}${suffix}`
}

function stringMetric(label: string, value: unknown) {
  const text = stringValue(value)
  return text ? `${label} ${text}` : undefined
}

function valueMetric(label: string, value: unknown) {
  const text = idValue(value)
  return text ? `${label} ${text}` : undefined
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    return typeof value === 'string' && value.trim() ? [value.trim()] : []
  })
}

function settingStateRefsForRecord(record: Record<string, unknown>): string[] {
  const refs = new Set<string>()
  for (const ref of compactStrings(record.setting_state_id, record.setting_state_ref, record.settingStateId, record.settingStateRef)) {
    refs.add(ref)
  }
  for (const item of arrayValue(record.setting_refs)) {
    if (!isRecord(item)) continue
    for (const ref of compactStrings(item.setting_state_id, item.settingStateId, item.setting_state_ref, item.settingStateRef)) {
      refs.add(ref)
    }
  }
  return [...refs]
}

function expressionStoryboardRefs(record: Record<string, unknown>): string[] {
  const span = isRecord(record.span) ? record.span : {}
  return compactStrings(
    record.storyboard_ref,
    record.storyboard_refs,
    span.storyboard_ref,
    span.storyboard_refs,
    span.from_storyboard_id,
    span.fromStoryboardId,
    span.to_storyboard_id,
    span.toStoryboardId,
  )
}

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
