import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type { MovScriptDomainNode, MovScriptDomainRef } from '@movscript/domain'
import type {
  ContentCanvasEdge,
  ContentCanvasWorkspaceSnapshot,
  ContentCanvasCandidate,
  ContentCanvasGenerationTask,
  ContentCanvasNode,
  ContentCanvasNodeKind,
  ContentCanvasProjectData,
} from './contentCanvasTypes'
import {
  compactStrings,
  contentCanvasKind,
  createContentCanvasEntityNode,
  entityKey,
  idValue,
  nodeIdForEntity,
  pathSegmentAfter,
  stringValue,
  summaryForEntity,
  titleForEntity,
} from './contentCanvasGraphNodes'
import {
  appendSequenceEdges,
  assignDeterministicPositions,
} from './contentCanvasGraphLayout'
import {
  appendAssetDownstreamEdges,
} from './contentCanvasGraphAssets'
import {
  candidateNodeIdFor,
  createCandidateNodes,
  createRawResourceReferenceNodes,
  createResourceNodes,
  createSelectionNodes,
  resourceNodeIdFor,
  selectionNodeIdFor,
} from './contentCanvasGraphCandidates'
import {
  withGraphIndexesAndSummary,
  withStructureSummaryMetrics,
} from './contentCanvasWorkspaceSnapshotSummary'
import {
  appendContentCanvasReferenceEdges,
  contentUnitRawResourceRefsForRecord,
} from './contentCanvasGraphReferences'
import {
  actorNodeIdFor,
  createActorNodes,
  createWorkItemNodes,
  targetNodeForWorkItem,
  workItemNodeIdFor,
} from './contentCanvasGraphWorkItems'

export function buildContentCanvasWorkspaceSnapshot(data: ContentCanvasProjectData): ContentCanvasWorkspaceSnapshot {
  const sourceEntities = [
    ...(data.project ? [data.project] : []),
    ...data.productions,
    ...data.segments,
    ...data.sceneMoments,
    ...data.storyboards,
    ...data.expressionUnits,
    ...data.contentUnits,
    ...data.keyframes,
    ...data.assets,
    ...data.settings,
    ...(data.settingStates ?? []),
    ...(data.audioCues ?? []),
  ]
  const generationTaskByTargetNodeId = buildGenerationTaskIndex(data)
  const domainNodeByPath = new Map<string, MovScriptDomainNode>()
  for (const node of data.domainGraph?.nodes ?? []) {
    if (typeof node.path === 'string' && node.path.trim()) domainNodeByPath.set(node.path, node)
  }
  const entityNodes = sourceEntities.map((entity) =>
    createContentCanvasEntityNode(entity, data.projectId, data.contentUnitCandidates, generationTaskByTargetNodeId, domainNodeByPath.get(entity.path)),
  )
  const candidateOwnerNodes = entityNodes.filter((node) => node.kind === 'content_unit')
  const candidateNodes = candidateOwnerNodes.flatMap(createCandidateNodes)
  const selectionNodes = candidateOwnerNodes.flatMap(createSelectionNodes)
  const resourceNodes = dedupeNodes(candidateNodes.flatMap(createResourceNodes))
  const rawResourceNodes = createRawResourceReferenceNodes(contentUnitRawResourceRefs(data.contentUnits))
  const baseNodes = dedupeNodes([...entityNodes, ...candidateNodes, ...selectionNodes, ...resourceNodes, ...rawResourceNodes])
  const nodeByEntityKindAndKey = contentCanvasNodeLookup(baseNodes)
  const nodeByPath = new Map(baseNodes.filter((node) => node.sourcePath).map((node) => [node.sourcePath, node]))
  const domainParentByNodeId = buildDomainParentByNodeId(data.domainGraph, nodeByEntityKindAndKey, nodeByPath)
  attachDomainParentContext(baseNodes, domainParentByNodeId)
  const workItemNodes = createWorkItemNodes(data.productionWorkPlan?.items ?? [])
  const actorNodes = createActorNodes(data.productionWorkPlan?.items ?? [])
  const nodes = dedupeNodes([...baseNodes, ...actorNodes, ...workItemNodes])
  const projectNode = nodes.find((node) => node.kind === 'project')
  const edges: ContentCanvasEdge[] = []

  for (const node of entityNodes) {
    const entity = sourceEntities.find((item) => node.id === nodeIdForEntity(item, data.projectId))
    if (!entity) continue
    const parent = domainParentByNodeId.get(node.id) ?? parentNodeForEntity(entity, nodeByEntityKindAndKey, projectNode)
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

  appendContentCanvasReferenceEdges({ data, edges, entityNodes, nodeByEntityKindAndKey, nodeByPath })

  appendAssetDownstreamEdges(edges, data.assetReferenceUnits, nodeByEntityKindAndKey, nodeByPath)

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
    || edge.relation === 'expression_unit_storyboard'
    || edge.relation === 'expression_unit_content_unit'
    || edge.relation === 'audio_cue_storyboard'
    || edge.relation === 'audio_cue_asset') return 'constrains'
  if (edge.relation === 'content_unit_scene'
    || edge.relation === 'content_unit_asset'
    || edge.relation === 'content_unit_keyframe'
    || edge.relation === 'content_unit_storyboard'
    || edge.relation === 'content_unit_audio_cue') return 'depends_on'
  return 'affects'
}

function buildGenerationTaskIndex(data: ContentCanvasProjectData): Map<string, ContentCanvasGenerationTask> {
  const targetNodeIdToTask = new Map<string, ContentCanvasGenerationTask>()
  const targetEntitiesByKind = new Map<ContentCanvasNodeKind, MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of [
    ...data.assets,
    ...data.keyframes,
    ...data.storyboards,
    ...data.sceneMoments,
    ...data.expressionUnits,
    ...(data.audioCues ?? []),
  ]) {
    const kind = contentCanvasKind(entity)
    targetEntitiesByKind.set(kind, [...(targetEntitiesByKind.get(kind) ?? []), entity])
  }

  for (const contentUnit of data.contentUnits) {
    const contentUnitType = stringValue(contentUnit.record.content_unit_type) ?? stringValue(contentUnit.record.kind) ?? 'content_unit'
    for (const target of contentUnitTargets(contentUnit)) {
      const targetEntity = findReferencedEntity(targetEntitiesByKind.get(target.kind) ?? [], target.refs)
      if (!targetEntity) continue
      const contentUnitKey = entityKey(contentUnit, data.projectId)
      const candidates = data.contentUnitCandidates[contentUnitKey] ?? []
      const selectedCandidate = candidates.find((candidate) => candidate.selected)
      const nodeId = nodeIdForEntity(contentUnit, data.projectId)
      const task: ContentCanvasGenerationTask = {
        id: contentUnitKey,
        nodeId,
        contentUnitType,
        outputKind: stringValue(contentUnit.record.output_kind) ?? defaultOutputKindForContentUnitType(contentUnitType),
        title: titleForEntity(contentUnit, data.projectId),
        prompt: summaryForEntity(contentUnit),
        status: generationTaskStatus(contentUnit, candidates),
        sourcePath: contentUnit.path,
        record: contentUnit.record,
        candidates,
        ...(selectedCandidate ? { selectedCandidate } : {}),
      }
      targetNodeIdToTask.set(nodeIdForEntity(targetEntity, data.projectId), task)
    }
  }
  return targetNodeIdToTask
}

function contentUnitTargets(contentUnit: MovScriptWorkspaceIndexedEntity): Array<{ kind: ContentCanvasNodeKind; refs: string[] }> {
  const record = contentUnit.record
  const targets: Array<{ kind: ContentCanvasNodeKind; refs: string[] }> = [
    { kind: 'asset', refs: compactStrings(record.asset_ref, record.asset_refs) },
    { kind: 'keyframe', refs: compactStrings(record.keyframe_ref, record.keyframe_refs) },
    { kind: 'storyboard', refs: compactStrings(record.storyboard_ref, record.storyboard_refs) },
    { kind: 'audio_cue', refs: compactStrings(record.audio_cue_ref, record.audio_cue_refs) },
    { kind: 'scene_moment', refs: compactStrings(record.scene_moment_ref, record.scene_moment_refs) },
    { kind: 'expression_unit', refs: compactStrings(record.expression_unit_ref, record.expression_unit_refs, record.expression_ref, record.expression_refs) },
  ]
  return targets.filter((target) => target.refs.length > 0)
}

function findReferencedEntity(entities: MovScriptWorkspaceIndexedEntity[], refs: string[]): MovScriptWorkspaceIndexedEntity | undefined {
  for (const ref of refs) {
    const match = entities.find((entity) => entity.path === ref
      || entityKey(entity, 0) === ref
      || pathSegmentAfter(ref, collectionSegmentForKind(contentCanvasKind(entity))) === entityKey(entity, 0))
    if (match) return match
  }
  return undefined
}

function collectionSegmentForKind(kind: ContentCanvasNodeKind): string {
  if (kind === 'scene_moment') return 'scene_moments'
  if (kind === 'keyframe') return 'keyframes'
  if (kind === 'storyboard') return 'storyboards'
  if (kind === 'asset') return 'assets'
  return `${kind}s`
}

function generationTaskStatus(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  candidates: ContentCanvasCandidate[],
): ContentCanvasGenerationTask['status'] {
  const status = stringValue(contentUnit.record.status ?? contentUnit.record.selection_state ?? contentUnit.record.review_status)
  if (status === 'stale') return 'stale'
  if (status === 'selected' || candidates.some((candidate) => candidate.selected)) return 'selected'
  if (status === 'ready') return 'ready'
  return candidates.length > 0 ? 'ready' : 'needs_candidate'
}

function defaultOutputKindForContentUnitType(contentUnitType: string): string {
  if (contentUnitType === 'asset_ref' || contentUnitType === 'keyframe_ref' || contentUnitType === 'storyboard_ref') return 'image'
  if (contentUnitType === 'audio_cue_ref') return 'audio'
  if (contentUnitType === 'scene_moment_ref' || contentUnitType === 'scence_moment_ref') return 'video'
  if (contentUnitType === 'expression_unit_ref') return 'text'
  return 'metadata'
}

function contentUnitRawResourceRefs(contentUnits: MovScriptWorkspaceIndexedEntity[]): string[] {
  const refs = new Set<string>()
  for (const contentUnit of contentUnits) {
    for (const ref of contentUnitRawResourceRefsForRecord(contentUnit.record)) refs.add(ref)
  }
  return [...refs]
}

type ContentCanvasDomainNode = MovScriptDomainNode
type ContentCanvasDomainRef = MovScriptDomainRef

const CONTENT_CANVAS_NODE_KINDS = new Set<string>([
  'project',
  'production',
  'segment',
  'scene_moment',
  'storyboard',
  'expression_unit',
  'content_unit',
  'candidate',
  'selection',
  'resource',
  'keyframe',
  'asset',
  'setting',
  'state',
  'audio_cue',
  'work_item',
  'actor',
  'group',
])

function buildDomainParentByNodeId(
  domainGraph: ContentCanvasProjectData['domainGraph'] | undefined,
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
): Map<string, ContentCanvasNode> {
  const out = new Map<string, ContentCanvasNode>()
  if (!domainGraph) return out
  const nodeByEntityDir = new Map([...nodeByPath].map(([path, node]) => [entityDir(path), node]))
  for (const edge of domainGraph.edges ?? []) {
    if (edge.relation !== 'parent') continue
    const child = contentCanvasNodeForDomainRef(edge.source, domainGraph.nodes ?? [], nodeByEntityKindAndKey, nodeByPath, nodeByEntityDir)
    const parent = contentCanvasNodeForDomainRef(edge.target, domainGraph.nodes ?? [], nodeByEntityKindAndKey, nodeByPath, nodeByEntityDir)
    if (!child || !parent || child.id === parent.id) continue
    out.set(child.id, parent)
  }
  return out
}

function attachDomainParentContext(
  nodes: ContentCanvasNode[],
  domainParentByNodeId: Map<string, ContentCanvasNode>,
): void {
  for (const node of nodes) {
    const parent = domainParentByNodeId.get(node.id)
    const ancestors = domainAncestorNodeIds(node.id, domainParentByNodeId)
    if (parent) node.domainParentNodeId = parent.id
    if (ancestors.length) node.domainAncestorNodeIds = ancestors
  }
}

function domainAncestorNodeIds(
  nodeId: string,
  domainParentByNodeId: Map<string, ContentCanvasNode>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>([nodeId])
  let parent = domainParentByNodeId.get(nodeId)
  while (parent && !seen.has(parent.id)) {
    out.push(parent.id)
    seen.add(parent.id)
    parent = domainParentByNodeId.get(parent.id)
  }
  return out
}

function contentCanvasNodeForDomainRef(
  ref: ContentCanvasDomainRef,
  domainNodes: ContentCanvasDomainNode[],
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
  nodeByEntityDir: Map<string, ContentCanvasNode>,
): ContentCanvasNode | undefined {
  const refPath = stringValue(ref.path)
  if (refPath) {
    const pathNode = nodeByPath.get(refPath) ?? nodeByEntityDir.get(refPath)
    if (pathNode) return pathNode
  }
  const domainNode = domainNodeForRef(ref, domainNodes)
  if (domainNode?.path) {
    const pathNode = nodeByPath.get(domainNode.path) ?? nodeByEntityDir.get(domainNode.path)
    if (pathNode) return pathNode
  }
  const key = idValue(ref.id ?? domainNode?.id)
  const kind = contentCanvasKindForDomainRef(ref, domainNode)
  return key && kind ? nodeByEntityKindAndKey.get(`${kind}:${key}`) : undefined
}

function domainNodeForRef(
  ref: ContentCanvasDomainRef,
  domainNodes: ContentCanvasDomainNode[],
): ContentCanvasDomainNode | undefined {
  const refPath = stringValue(ref.path)
  if (refPath) {
    const byPath = domainNodes.find((node) => node.path === refPath || entityDir(node.path) === refPath)
    if (byPath) return byPath
  }
  const refId = idValue(ref.id)
  const refKind = stringValue(ref.kind)
  const refCategory = stringValue(ref.category)
  return domainNodes.find((node) => {
    if (refId && idValue(node.id) !== refId) return false
    if (refCategory && node.category !== refCategory) return false
    if (!refKind) return true
    return node.kind === refKind || stringValue(node.metadata?.entityKind) === refKind
  })
}

function contentCanvasKindForDomainRef(
  ref: ContentCanvasDomainRef,
  domainNode: ContentCanvasDomainNode | undefined,
): ContentCanvasNodeKind | undefined {
  return contentCanvasKindForEntityKind(stringValue(domainNode?.metadata?.entityKind))
    ?? contentCanvasKindForEntityKind(stringValue(ref.kind))
}

function contentCanvasKindForEntityKind(kind: string | undefined): ContentCanvasNodeKind | undefined {
  if (!kind) return undefined
  if (kind === 'setting_state') return 'state'
  return CONTENT_CANVAS_NODE_KINDS.has(kind) ? kind as ContentCanvasNodeKind : undefined
}

function entityDir(path: string | undefined): string {
  return path ? path.replace(/\/[^/]+$/, '') : ''
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
    return findNode(nodes, 'segment', scopedSegmentKeyForPath(entity.path), record.segment_id, pathSegmentAfter(entity.path, 'segments'))
      ?? findNode(nodes, 'production', record.production_id, pathSegmentAfter(entity.path, 'productions'))
      ?? projectNode
  }
  if (kind === 'content_unit') {
    const sceneMomentRef = stringValue(record.scene_moment_ref)
    return findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(sceneMomentRef, 'scene_moments'), pathSegmentAfter(entity.path, 'scene_moments'))
      ?? findNode(nodes, 'segment', scopedSegmentKeyForPath(entity.path), record.segment_id, pathSegmentAfter(entity.path, 'segments'))
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
    const expressionUnitRef = stringValue(record.expression_unit_ref ?? record.expressionUnitRef)
    return findNode(
      nodes,
      'expression_unit',
      record.expression_unit_id,
      record.expressionUnitId,
      pathSegmentAfter(expressionUnitRef, 'expression_units'),
      pathSegmentAfter(entity.path, 'expression_units'),
    )
      ?? findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(entity.path, 'scene_moments'))
      ?? projectNode
  }
  if (kind === 'keyframe') {
    const expressionUnitRef = stringValue(record.expression_unit_ref ?? record.expressionUnitRef)
    return findNode(
      nodes,
      'expression_unit',
      record.expression_unit_id,
      record.expressionUnitId,
      pathSegmentAfter(expressionUnitRef, 'expression_units'),
      pathSegmentAfter(entity.path, 'expression_units'),
    )
      ?? findNode(nodes, 'content_unit', record.content_unit_id, pathSegmentAfter(entity.path, 'content_units'))
      ?? findNode(nodes, 'scene_moment', record.scene_moment_id, pathSegmentAfter(entity.path, 'scene_moments'))
      ?? projectNode
  }
  if (kind === 'asset') {
    return findNode(
      nodes,
      'state',
      record.setting_state_id,
      record.settingStateId,
      record.setting_state_ref,
      record.settingStateRef,
      pathSegmentAfter(entity.path, 'states'),
    )
      ?? findNode(nodes, 'setting', record.setting_id, record.settingId, pathSegmentAfter(entity.path, 'settings'))
      ?? projectNode
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

function contentCanvasNodeLookup(nodes: ContentCanvasNode[]): Map<string, ContentCanvasNode> {
  const out = new Map<string, ContentCanvasNode>()
  for (const node of nodes) {
    out.set(node.id, node)
    const legacyKey = `${node.kind}:${node.entityKey}`
    if (!out.has(legacyKey)) out.set(legacyKey, node)
  }
  return out
}

function scopedSegmentKeyForPath(path: string | undefined): string | undefined {
  const productionId = scopedSegmentParentKey(path)
  const segmentId = pathSegmentAfter(path, 'segments')
    ?? fallbackEntityDirName(path, 'segment.json')
  return productionId && segmentId ? `${productionId}/${segmentId}` : undefined
}

function scopedSegmentParentKey(path: string | undefined): string | undefined {
  if (!path) return undefined
  const parts = path.split('/').filter(Boolean)
  const entityDir = parts.slice(0, -1)
  const segmentCollectionIndex = entityDir.lastIndexOf('segments')
  if (segmentCollectionIndex > 0 && entityDir[segmentCollectionIndex + 1]) return entityDir[segmentCollectionIndex - 1]
  const parent = entityDir.at(-2)
  return parent && parent !== 'segments' && parent !== 'productions' ? parent : undefined
}

function fallbackEntityDirName(path: string | undefined, filename: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/').filter(Boolean)
  return parts.at(-1) === filename ? parts.at(-2) : undefined
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
