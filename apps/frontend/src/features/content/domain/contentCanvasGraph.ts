import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type {
  ContentCanvasEdge,
  ContentCanvasGraph,
  ContentCanvasCandidate,
  ContentCanvasGenerationTask,
  ContentCanvasNode,
  ContentCanvasNodeKind,
  ContentCanvasProjectData,
} from './contentCanvasTypes'
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
  createResourceNodes,
  createSelectionNodes,
  resourceNodeIdFor,
  selectionNodeIdFor,
} from './contentCanvasGraphCandidates'
import {
  withGraphIndexesAndSummary,
  withStructureSummaryMetrics,
} from './contentCanvasGraphSummary'
import {
  appendContentCanvasReferenceEdges,
} from './contentCanvasGraphReferences'
import {
  actorNodeIdFor,
  createActorNodes,
  createWorkItemNodes,
  targetNodeForWorkItem,
  workItemNodeIdFor,
} from './contentCanvasGraphWorkItems'

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
  const generationTaskByTargetNodeId = buildGenerationTaskIndex(data)
  const entityNodes = sourceEntities.map((entity) => createNode(entity, data.projectId, data.contentUnitCandidates, generationTaskByTargetNodeId))
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

function createNode(
  entity: MovScriptWorkspaceIndexedEntity,
  projectId: number,
  contentUnitCandidates: ContentCanvasProjectData['contentUnitCandidates'],
  generationTaskByTargetNodeId: Map<string, ContentCanvasGenerationTask>,
): ContentCanvasNode {
  const kind = contentCanvasKind(entity)
  const record = entity.record
  const title = titleForEntity(entity, projectId)
  const subtitle = subtitleForEntity(entity)
  const summary = summaryForEntity(entity)
  const key = entityKey(entity, projectId)
  const nodeId = nodeIdForEntity(entity, projectId)
  const candidates = kind === 'content_unit'
    ? (contentUnitCandidates[key] ?? [])
    : []
  const generationTask = generationTaskByTargetNodeId.get(nodeId)
  const metrics = metricsForEntity(entity, candidates, generationTask)
  return {
    id: nodeId,
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
    generationTask,
    position: { x: 0, y: 0 },
  }
}

function buildGenerationTaskIndex(data: ContentCanvasProjectData): Map<string, ContentCanvasGenerationTask> {
  const targetNodeIdToTask = new Map<string, ContentCanvasGenerationTask>()
  const targetEntitiesByKind = new Map<ContentCanvasNodeKind, MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of [
    ...data.assets,
    ...data.keyframes,
    ...data.storyboards,
    ...data.shots,
    ...data.sceneMoments,
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
    { kind: 'shot', refs: compactStrings(record.shot_ref, record.shot_refs) },
    { kind: 'scene_moment', refs: compactStrings(record.scene_moment_ref, record.scene_moment_refs) },
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
  if (kind === 'shot') return 'shots'
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
  if (contentUnitType === 'scene_moment_ref' || contentUnitType === 'scence_moment_ref' || contentUnitType === 'shot_ref') return 'video'
  return 'metadata'
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

function metricsForEntity(
  entity: MovScriptWorkspaceIndexedEntity,
  mergedCandidates: ContentCanvasCandidate[] = [],
  generationTask?: ContentCanvasGenerationTask,
) {
  const record = entity.record
  const candidates = generationTask?.candidates ?? mergedCandidates
  const selectedCandidate = candidates.find((candidate) => candidate.selected)
  return [
    numberMetric('顺序', record.order),
    numberMetric('时长', record.duration_sec ?? (isRecord(record.model_intent) ? record.model_intent.duration_sec : undefined), 's'),
    stringMetric('状态', record.status ?? record.review_status),
    entity.entityKind === 'asset' ? stringMetric('素材', record.asset_kind ?? record.kind ?? record.mime_type ?? record.media_type) : undefined,
    entity.entityKind === 'asset' ? valueMetric('资源', record.resource_id ?? record.resourceId ?? record.artifact_ref ?? record.artifactRef ?? record.uri ?? record.url) : undefined,
    generationTask ? `制作项 ${generationTask.outputKind}` : undefined,
    generationTask?.status === 'needs_candidate' ? '待生成候选' : undefined,
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

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    return typeof value === 'string' && value.trim() ? [value.trim()] : []
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
