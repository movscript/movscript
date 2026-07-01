import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import { normalizeWorkspacePath } from '@movscript/workspace/layout'
import type { MovScriptProductionWorkPlan } from '@movscript/interpreter'
import type { MediaEditingProject } from '@movscript/editing'
import {
  classifyMovScriptEntityKind,
  nearestParentPath,
  normalizeContentUnitTargetEdges,
  expressionUnitSlotKindFromRecord,
  normalizeNamespaceVocabulary,
  normalizePathParentEdge,
  isContentUnitPromptRefKind,
  primaryRefIdsForContentUnitRecord as domainPrimaryRefIdsForContentUnitRecord,
  primaryRefKindForContentUnitType as domainPrimaryRefKindForContentUnitType,
  projectMovScriptDomainNodeKind,
  type MovScriptDomainEdge,
  type MovScriptDomainNode,
  type MovScriptDomainRef,
  type MovScriptNormalizedNamespaceVocabulary,
  type MovScriptContentUnitPromptRefKind,
} from '@movscript/domain'

import type {
  AudioCue,
  EditableRef,
  ExpressionUnit,
  HierarchyTransition,
  HierarchyNode,
  HierarchyNodeType,
  PreviewAssetCandidate,
  PreviewAssetDownstream,
  PreviewAssetReferenceUnit,
  PreviewCandidate,
  PreviewContentUnit,
  ProductionWorkItemKind,
  ProductionWorkItemSeverity,
  ProductionWorkItemStatus,
  ProductionWorkItemView,
  ProductionWorkPlanView,
  PreviewMoment,
  PreviewExpressionUnit,
  SelectionState,
  ExpressionUnitChildOption,
  ExpressionUnitImpact,
  ExpressionUnitWorkspaceDetails,
  StoryboardTimeline,
} from './sourceWorkspaceTypes'

export interface ContentSourceWorkspaceData {
  source: 'fixture' | 'workspace'
  hierarchyTree: HierarchyNode[]
  domainGraph?: ContentSourceWorkspaceDomainGraph
  previewMoments: PreviewMoment[]
  contentUnitCandidates: Record<string, PreviewCandidate[]>
  expressionUnitsByMoment: Record<string, ExpressionUnit[]>
  audioCuesByMoment: Record<string, AudioCue[]>
  expressionUnitWorkspaceDetails: Record<string, ExpressionUnitWorkspaceDetails>
  assetReferenceUnits: Record<string, PreviewAssetReferenceUnit>
  editingTimelines: ContentSourceWorkspaceEditingTimeline[]
  productionWorkPlan?: ProductionWorkPlanView
}

export interface ContentSourceWorkspaceDomainGraph {
  namespaceVocabulary: MovScriptNormalizedNamespaceVocabulary
  nodes: MovScriptDomainNode[]
  edges: MovScriptDomainEdge[]
  timelineNamespaceNodes: MovScriptDomainNode[]
  settingNamespaceNodes: MovScriptDomainNode[]
  systemPrimitiveNodes: MovScriptDomainNode[]
  contentUnitNodes: MovScriptDomainNode[]
}

interface ContentSourceWorkspaceEntityAncestryIndex {
  entityByPath: Map<string, MovScriptWorkspaceIndexedEntity>
  parentPathByPath: Map<string, string>
  childrenByParentPath: Map<string, MovScriptWorkspaceIndexedEntity[]>
}

export interface CreatedContentSourceCandidate {
  id: string
  title: string
  model: string
  inputHash: string
  note: string
  resourceId?: number
}

export interface WorkspacePreviewTimelineArtifact {
  schema: 'movscript.preview_timeline.v1'
  productionId?: string | number
  productionPath?: string
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string | number
  scopePath?: string
  scopeTitle?: string
  items: WorkspacePreviewTimelineItem[]
}

export interface WorkspacePreviewTimelineItem {
  id: string
  itemType: 'timeline_namespace' | 'segment' | 'scene_moment' | 'storyboard' | 'keyframe' | 'audio_cue' | 'expression_unit' | 'content_unit'
  entity: {
    entityKind: string
    id?: string | number
    path?: string
  }
  order: number
  parentId?: string
}

export interface ContentSourceWorkspaceEditingTimeline {
  targetKind: 'scene_moment' | 'production'
  targetId: string | number
  targetRef?: string
  targetPath?: string
  scopeKind?: string
  scopeRef?: string | number
  scopePath?: string
  legacyTargetKind?: string
  legacyTargetRef?: string | number
  status?: string
  blockers?: unknown[]
  mediaEditingProject: MediaEditingProject
}

export interface WorkspaceDocument {
  path: string
  data: unknown
}

export interface ContentCandidateRecord {
  id?: string | number
  content_unit_ref?: string
  source?: string
  status?: string
  decision_status?: string
  decision_reason?: string
  producer?: Record<string, unknown>
  outputs?: unknown[]
  prompt_snapshot?: Record<string, unknown>
  created_at?: string
}

export interface ContentSelectionRecord {
  candidate_id?: string | number
  resource_id?: number
  stream_id?: string | number
  artifact_ref?: string
  stale_policy?: string
  reason?: string
  selected_at?: string
  target?: Record<string, unknown>
}

export interface ContentSourceWorkspaceSnapshot {
  indexDocuments: WorkspaceDocument[]
  namespaceVocabulary?: MovScriptNormalizedNamespaceVocabulary
  domainNodes?: MovScriptDomainNode[]
  domainEdges?: MovScriptDomainEdge[]
  settings: MovScriptWorkspaceIndexedEntity[]
  settingStates: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  productions: MovScriptWorkspaceIndexedEntity[]
  segments: MovScriptWorkspaceIndexedEntity[]
  sceneMoments: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  audioCues: MovScriptWorkspaceIndexedEntity[]
  contentUnits: MovScriptWorkspaceIndexedEntity[]
  previewTimelines: WorkspacePreviewTimelineArtifact[]
  editingTimelines?: ContentSourceWorkspaceEditingTimeline[]
  productionWorkPlan?: MovScriptProductionWorkPlan | ProductionWorkPlanView
}

export interface ContentSourceWorkspaceCandidateCreatePlan {
  contentUnitId: string
  candidateId: string
  source: 'ai_generate' | 'resource_library'
  status: 'queued' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'cancelled' | 'imported'
  producer: Record<string, unknown>
  outputs: ContentSourceWorkspaceCandidateOutput[]
  promptSnapshot: Record<string, unknown>
  createdAt: string
}

export interface ContentSourceWorkspaceCandidateOutput {
  kind: 'image' | 'video' | 'audio' | 'text' | 'metadata' | 'hls_stream'
  resource_id?: number
  stream_id?: string | number
  artifact_ref?: string
  mime_type?: string
  width?: number
  height?: number
  duration_sec?: number
  metadata?: Record<string, unknown>
}

export interface ContentSourceWorkspaceEditPromptPatch {
  targetPath: string
  editPrompt: ContentSourceWorkspaceEditPrompt
  generationReferences?: ContentSourceWorkspaceGenerationReference[]
  generation_references?: ContentSourceWorkspaceGenerationReference[]
  referenceAssets?: ContentSourceWorkspaceReferenceAsset[]
  reference_assets?: ContentSourceWorkspaceReferenceAsset[]
  modelIntent?: Record<string, unknown>
  model_intent?: Record<string, unknown>
}

export interface ContentSourceWorkspaceEditPrompt {
  text?: string
  negative_text?: string
  notes?: string
  structured?: Record<string, unknown>
}

export interface ContentSourceWorkspaceGenerationReference {
  id?: string
  kind?: string
  ref?: string | number
  raw?: string
  resource_id?: number
  media_type?: string
  role?: string
  source_ref?: string
  label?: string
  source?: string
}

export interface ContentSourceWorkspaceReferenceAsset {
  role?: string
  media_type?: string
  resource_id?: number
  source_ref?: string
}

export interface ContentSourceWorkspaceExpressionUnitPatch {
  targetPath: string
  patch: {
    title: string
    slotKind?: string
    expressionKind: string
    text: string
    intent: string
    speaker?: string
    note?: string
  }
}

export interface ContentSourceWorkspaceAudioCuePatch {
  targetPath: string
  patch: {
	    title: string
	    cueKind: string
	    promptHint: string
	    expressionUnitRef?: string
	    storyboardRef?: string
    timing: Record<string, unknown>
    assetRefs: string[]
  }
}

export interface ContentSourceWorkspaceTransitionPatch {
  targetPath: string
  transition: {
    in?: string
    out?: string
    notes?: string
  }
}

export interface ContentSourceWorkspaceStoryboardTimelinePatch {
  targetPath: string
  timeline: {
    caption?: string
    gap_after_sec?: number
    duration_sec?: number
  }
}

export function buildContentSourceWorkspaceData(input: ContentSourceWorkspaceSnapshot): ContentSourceWorkspaceData {
  const productions = input.productions
  const segments = input.segments
  const sceneMoments = input.sceneMoments
  const storyboards = input.storyboards
  const expressionUnits = input.expressionUnits
  const audioCues = input.audioCues
  const contentUnits = input.contentUnits
  const keyframes = input.keyframes
  const assets = input.assets
  const settings = input.settings
  const settingStates = input.settingStates
  const previewTimelines = input.previewTimelines
  const productionWorkPlan = normalizeProductionWorkPlanView(input.productionWorkPlan)
  const domainGraph = buildContentSourceWorkspaceDomainGraph(input)
  const ancestryIndex = buildContentSourceWorkspaceEntityAncestryIndex(input, domainGraph)

  const contentUnitsByPrimaryRef = groupContentUnitsByPrimaryRef(contentUnits)
  const candidateRecordsByContentUnitId = groupContentCandidateRecordsByContentUnitId(input.indexDocuments)
  const selectionRecordsByContentUnitId = groupSelectionRecordsByContentUnitId(input.indexDocuments)
  const selectionByContentUnitId = buildSelectionStateByContentUnitId(contentUnits, selectionRecordsByContentUnitId)
  const contentUnitCandidates = buildContentUnitCandidates({
    contentUnits,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
  })
  const previewMoments = buildPreviewMoments({
    productions,
    segments,
    sceneMoments,
    expressionUnits,
    storyboards,
    keyframes,
    assets,
    previewTimelines,
    ancestryIndex,
    contentUnitsByPrimaryRef,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
    selectionByContentUnitId,
  })
  const expressionUnitsByMoment = buildExpressionUnitsByMoment(expressionUnits, ancestryIndex)
  const audioCuesByMoment = buildAudioCuesByMoment(audioCues, {
    ancestryIndex,
    contentUnitsByPrimaryRef,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
    selectionByContentUnitId,
  })
  const expressionUnitWorkspaceDetails = buildExpressionUnitWorkspaceDetails({
    expressionUnits,
    storyboards,
    keyframes,
    assets,
    settings,
    contentUnitsByPrimaryRef,
    ancestryIndex,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
    selectionByContentUnitId,
  })
  const assetReferenceUnits = buildAssetReferenceUnits({
    assets,
    settings,
    settingStates,
    expressionUnits,
    storyboards,
    keyframes,
    contentUnits,
    contentUnitsByPrimaryRef,
    ancestryIndex,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
    selectionByContentUnitId,
  })

  return {
    source: 'workspace',
    domainGraph,
    hierarchyTree: buildHierarchyTree({
      settings,
      settingStates,
      assets,
      productions,
      segments,
      sceneMoments,
      storyboards,
      keyframes,
      expressionUnits,
      audioCues,
      assetReferenceUnits,
      ancestryIndex,
    }),
    previewMoments,
    contentUnitCandidates,
    expressionUnitsByMoment,
    audioCuesByMoment,
    expressionUnitWorkspaceDetails,
    assetReferenceUnits,
    editingTimelines: input.editingTimelines ?? [],
    productionWorkPlan,
  }
}

export function buildContentSourceWorkspaceDomainGraph(input: ContentSourceWorkspaceSnapshot): ContentSourceWorkspaceDomainGraph {
  const nodes = input.domainNodes?.length
    ? input.domainNodes
    : deriveContentSourceWorkspaceDomainNodes(input)
  const edges = input.domainEdges?.length
    ? input.domainEdges
    : deriveContentSourceWorkspaceDomainEdges(input, nodes)
  return {
    namespaceVocabulary: input.namespaceVocabulary ?? deriveContentSourceWorkspaceNamespaceVocabulary(input),
    nodes,
    edges,
    timelineNamespaceNodes: nodes.filter((node) => node.category === 'timeline_namespace'),
    settingNamespaceNodes: nodes.filter((node) => node.category === 'setting_namespace'),
    systemPrimitiveNodes: nodes.filter((node) => node.category === 'system_primitive'),
    contentUnitNodes: nodes.filter((node) => node.category === 'content_unit'),
  }
}

function deriveContentSourceWorkspaceNamespaceVocabulary(input: ContentSourceWorkspaceSnapshot): MovScriptNormalizedNamespaceVocabulary {
  const projectDocument = input.indexDocuments.find((document) =>
    normalizeWorkspacePath(document.path) === 'project.json'
      && isRecord(document.data),
  )
  return normalizeNamespaceVocabulary(projectDocument?.data)
}

function deriveContentSourceWorkspaceDomainNodes(input: ContentSourceWorkspaceSnapshot): MovScriptDomainNode[] {
  return sourceWorkspaceDomainEntities(input).flatMap((entity) => {
    const category = classifyMovScriptEntityKind(entity.entityKind)
    if (!category) return []
    return [pruneUndefinedRecord({
      category,
      kind: projectMovScriptDomainNodeKind(entity.entityKind, entity.record),
      ...(entity.id !== undefined ? { id: entity.id } : {}),
      path: entity.path,
      title: stringField(entity.record.title) ?? stringField(entity.record.label),
      order: optionalNumberField(entity.record.order),
      metadata: { entityKind: entity.entityKind },
    }) as MovScriptDomainNode]
  })
}

function deriveContentSourceWorkspaceDomainPathParentEdges(nodes: MovScriptDomainNode[]): MovScriptDomainEdge[] {
  const nodeByDir = new Map<string, MovScriptDomainNode>()
  for (const node of nodes) {
    if (node.path) nodeByDir.set(entityDir(node.path), node)
  }
  const edges: MovScriptDomainEdge[] = []
  for (const node of nodes) {
    if (!node.path) continue
    const parentPath = nearestParentPath(entityDir(node.path), nodeByDir.keys())
    if (!parentPath) continue
    const parent = nodeByDir.get(parentPath)
    const normalized = normalizePathParentEdge(domainRefFromNode(node), parent ? domainRefFromNode(parent) : undefined)
    if (normalized.edge) edges.push(normalized.edge)
  }
  return dedupeDomainEdges(edges)
}

function deriveContentSourceWorkspaceDomainEdges(
  input: ContentSourceWorkspaceSnapshot,
  nodes: MovScriptDomainNode[],
): MovScriptDomainEdge[] {
  return dedupeDomainEdges([
    ...deriveContentSourceWorkspaceDomainPathParentEdges(nodes),
    ...deriveContentSourceWorkspaceContentUnitTargetEdges(input.contentUnits, nodes),
  ])
}

function deriveContentSourceWorkspaceContentUnitTargetEdges(
  contentUnits: MovScriptWorkspaceIndexedEntity[],
  nodes: MovScriptDomainNode[],
): MovScriptDomainEdge[] {
  const nodeByPath = new Map(nodes.flatMap((node) => node.path ? [[node.path, node] as const] : []))
  const timelineNamespaceNodes = nodes.filter((node) => node.category === 'timeline_namespace')
  const edges: MovScriptDomainEdge[] = []
  for (const contentUnit of contentUnits) {
    const sourceNode = nodeByPath.get(contentUnit.path)
    if (!sourceNode) continue
    edges.push(...normalizeContentUnitTargetEdges({
      source: domainRefFromNode(sourceNode),
      record: contentUnit.record,
      scopeTarget(scope) {
        return domainRefFromTimelineScope(scope.kind, scope.ref, timelineNamespaceNodes)
      },
    }))
  }
  return edges
}

function sourceWorkspaceDomainEntities(input: ContentSourceWorkspaceSnapshot): MovScriptWorkspaceIndexedEntity[] {
  return [
    ...input.settings,
    ...input.settingStates,
    ...input.assets,
    ...input.productions,
    ...input.segments,
    ...input.sceneMoments,
    ...input.storyboards,
    ...input.keyframes,
    ...input.expressionUnits,
    ...input.audioCues,
    ...input.contentUnits,
  ]
}

function buildContentSourceWorkspaceEntityAncestryIndex(
  input: ContentSourceWorkspaceSnapshot,
  domainGraph: ContentSourceWorkspaceDomainGraph,
): ContentSourceWorkspaceEntityAncestryIndex {
  const entities = sourceWorkspaceDomainEntities(input)
  const entityByPath = new Map(entities.map((entity) => [entity.path, entity] as const))
  const entityByDir = new Map(entities.map((entity) => [entityDir(entity.path), entity] as const))
  const parentPathByPath = new Map<string, string>()

  for (const edge of domainGraph.edges) {
    if (edge.relation !== 'parent' || edge.origin !== 'path') continue
    if (!edge.source.path || !edge.target.path) continue
    parentPathByPath.set(edge.source.path, edge.target.path)
  }

  for (const entity of entities) {
    if (parentPathByPath.has(entity.path)) continue
    const parentDir = nearestParentPath(entityDir(entity.path), entityByDir.keys())
    const parent = parentDir ? entityByDir.get(parentDir) : undefined
    if (parent) parentPathByPath.set(entity.path, parent.path)
  }

  const childrenByParentPath = new Map<string, MovScriptWorkspaceIndexedEntity[]>()
  for (const [childPath, parentPath] of parentPathByPath) {
    const child = entityByPath.get(childPath)
    if (!child) continue
    childrenByParentPath.set(parentPath, [...(childrenByParentPath.get(parentPath) ?? []), child])
  }

  return { entityByPath, parentPathByPath, childrenByParentPath }
}

function domainRefFromTimelineScope(
  scopeKind: string,
  scopeRef: string,
  timelineNamespaceNodes: MovScriptDomainNode[],
): MovScriptDomainRef {
  const node = timelineNamespaceNodes.find((candidate) =>
    String(candidate.id ?? '') === scopeRef
    && (candidate.kind === scopeKind || candidate.metadata?.entityKind === scopeKind),
  )
  return node
    ? domainRefFromNode(node)
    : { category: 'timeline_namespace', kind: scopeKind, id: scopeRef }
}

function domainRefFromNode(node: MovScriptDomainNode): MovScriptDomainRef {
  return {
    category: node.category,
    kind: node.kind,
    ...(node.id !== undefined ? { id: node.id } : {}),
    ...(node.path ? { path: node.path } : {}),
  }
}

function dedupeDomainEdges(edges: MovScriptDomainEdge[]): MovScriptDomainEdge[] {
  const seen = new Set<string>()
  const out: MovScriptDomainEdge[] = []
  for (const edge of edges) {
    const key = JSON.stringify(edge)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(edge)
  }
  return out
}

export function normalizeProductionWorkPlanView(
  plan: MovScriptProductionWorkPlan | ProductionWorkPlanView | undefined,
): ProductionWorkPlanView | undefined {
  if (!plan) return undefined
  if (isProductionWorkPlanView(plan)) {
    return {
      summary: {
        open: optionalNumberField(plan.summary.open) ?? 0,
        blocking: optionalNumberField(plan.summary.blocking) ?? 0,
        humanRecommended: optionalNumberField(plan.summary.humanRecommended) ?? 0,
        agentRecommended: optionalNumberField(plan.summary.agentRecommended) ?? 0,
        readyToGenerate: optionalNumberField(plan.summary.readyToGenerate) ?? 0,
        staleSelections: optionalNumberField(plan.summary.staleSelections) ?? 0,
      },
      items: plan.items.map(normalizeProductionWorkItemView).filter(isDefined),
    }
  }
  const rawPlan = plan as MovScriptProductionWorkPlan
  return {
    summary: {
      open: optionalNumberField(rawPlan.summary.open) ?? 0,
      blocking: optionalNumberField(rawPlan.summary.blocking) ?? 0,
      humanRecommended: optionalNumberField(rawPlan.summary.human_recommended) ?? 0,
      agentRecommended: optionalNumberField(rawPlan.summary.agent_recommended) ?? 0,
      readyToGenerate: optionalNumberField(rawPlan.summary.ready_to_generate) ?? 0,
      staleSelections: optionalNumberField(rawPlan.summary.stale_selections) ?? 0,
    },
    items: rawPlan.items.map((item): ProductionWorkItemView => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      severity: item.severity,
      priority: item.priority,
      reason: item.reason,
      targetKind: item.target.entityKind,
      targetId: item.target.id !== undefined ? String(item.target.id) : undefined,
      targetPath: item.target.path,
      recommendedActor: item.recommended_actor,
      actionLabels: item.actions.map((action) => productionWorkActionLabel(action.type)),
    })),
  }
}

function isProductionWorkPlanView(
  plan: MovScriptProductionWorkPlan | ProductionWorkPlanView,
): plan is ProductionWorkPlanView {
  return 'humanRecommended' in plan.summary
}

export function productionWorkItemsForTarget(
  plan: ProductionWorkPlanView | undefined,
  target: { id?: string | number; path?: string; contentUnitId?: string | number },
): ProductionWorkItemView[] {
  if (!plan) return []
  const ids = new Set(
    [target.id, target.contentUnitId]
      .filter((value) => value !== undefined)
      .map((value) => String(value)),
  )
  const path = target.path ? normalizePath(target.path) : undefined
  return plan.items.filter((item) => {
    if (item.targetId && ids.has(item.targetId)) return true
    if (path && item.targetPath && (normalizePath(item.targetPath) === path || normalizePath(item.targetPath).startsWith(`${path}/`))) return true
    return false
  })
}

function normalizeProductionWorkItemView(item: ProductionWorkItemView): ProductionWorkItemView | undefined {
  if (!item.id || !item.kind || !item.status || !item.severity || !item.reason || !item.targetKind) return undefined
  return {
    id: item.id,
    kind: normalizeProductionWorkItemKind(item.kind),
    status: normalizeProductionWorkItemStatus(item.status),
    severity: normalizeProductionWorkItemSeverity(item.severity),
    priority: optionalNumberField(item.priority) ?? 100,
    reason: item.reason,
    targetKind: item.targetKind,
    targetId: item.targetId,
    targetPath: item.targetPath,
    recommendedActor: item.recommendedActor === 'agent' || item.recommendedActor === 'workflow' ? item.recommendedActor : 'human',
    actionLabels: Array.isArray(item.actionLabels) ? item.actionLabels.filter((label) => typeof label === 'string' && label.trim()) : [],
  }
}

function normalizeProductionWorkItemKind(kind: string): ProductionWorkItemKind {
  switch (kind) {
    case 'fix_source':
    case 'edit_structure':
    case 'create_content_unit':
    case 'generate_candidates':
    case 'select_candidate':
    case 'review_stale_selection':
    case 'review_affected_output':
      return kind
    default:
      return 'edit_structure'
  }
}

function normalizeProductionWorkItemStatus(status: string): ProductionWorkItemStatus {
  if (status === 'open' || status === 'blocked' || status === 'ready' || status === 'informational') return status
  return 'open'
}

function normalizeProductionWorkItemSeverity(severity: string): ProductionWorkItemSeverity {
  if (severity === 'blocking' || severity === 'warning' || severity === 'suggestion') return severity
  return 'warning'
}

function productionWorkActionLabel(type: string): string {
  switch (type) {
    case 'open_editor':
      return '打开编辑器'
    case 'upsert_entity':
      return '补结构'
    case 'derive_content_unit_artifact':
      return '刷新创作片段'
    case 'generate_candidates':
      return '生成候选'
    case 'open_candidate_picker':
      return '打开候选选择'
    case 'agent_review_candidates':
      return '辅助审阅候选'
    case 'accept_stale':
      return '接受 stale'
    default:
      return type
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '')
}

export function buildContentSourceWorkspaceSelectionPatch(input: {
  contentUnitId: string
  candidateId: string
  resourceId?: number
}): {
  contentUnitId: string
  candidateId: string
  resourceId?: number
  reason: 'content_source_workspace_selection'
} {
  return {
    contentUnitId: input.contentUnitId,
    candidateId: input.candidateId,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    reason: 'content_source_workspace_selection',
  }
}

export function buildContentSourceWorkspaceCandidateCreatePlan(input: {
  contentUnitId: string
  outputKind: 'image' | 'video' | 'audio' | 'text' | 'storyboard'
  promptText?: string
  createdAt?: string
  candidateId?: string
  resourceId?: number
  resourceName?: string
  resourceType?: 'image' | 'video' | 'audio' | 'text' | 'file'
  resourceMimeType?: string
}): ContentSourceWorkspaceCandidateCreatePlan {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const candidateId = input.candidateId ?? (input.resourceId !== undefined ? `resource_${input.resourceId}_${Date.now()}` : `queued_${Date.now()}`)
  if (input.resourceId !== undefined) {
    const resourceTitle = input.resourceName?.trim() || `Resource #${String(input.resourceId)}`
    const outputKind = contentCandidateOutputKindFromResource(input.resourceType, input.outputKind)
    return {
      contentUnitId: input.contentUnitId,
      candidateId,
      source: 'resource_library',
      status: 'imported',
      producer: {
        kind: 'content_workbench',
        model_id: 'resource_library',
        title: resourceTitle,
      },
      outputs: [{
        kind: outputKind,
        resource_id: input.resourceId,
        ...(input.resourceMimeType ? { mime_type: input.resourceMimeType } : {}),
      }],
      promptSnapshot: {
        title: resourceTitle,
        note: 'Selected from resource library.',
        input_hash: `resource:${String(input.resourceId)}`,
        content_unit_id: input.contentUnitId,
        output_kind: input.outputKind,
        prompt_text: input.promptText,
      },
      createdAt,
    }
  }
  return {
    contentUnitId: input.contentUnitId,
    candidateId,
    source: 'ai_generate',
    status: 'queued',
    producer: {
      kind: 'content_workbench',
      model_id: 'pending_generation',
      title: 'Queued generation',
    },
    outputs: [],
    promptSnapshot: {
      title: 'Queued generation',
      note: `Queued from content-workbench for ${input.outputKind}.`,
      input_hash: `queued:${input.contentUnitId}:${createdAt}`,
      content_unit_id: input.contentUnitId,
      output_kind: input.outputKind,
      prompt_text: input.promptText,
    },
    createdAt,
  }
}

function contentCandidateOutputKindFromResource(
  resourceType: 'image' | 'video' | 'audio' | 'text' | 'file' | undefined,
  outputKind: 'image' | 'video' | 'audio' | 'text' | 'storyboard',
): ContentSourceWorkspaceCandidateOutput['kind'] {
  if (resourceType === 'image' || resourceType === 'video' || resourceType === 'audio' || resourceType === 'text') return resourceType
  if (outputKind === 'image' || outputKind === 'video' || outputKind === 'audio' || outputKind === 'text') return outputKind
  return 'metadata'
}

export function createdContentSourceCandidateFromRecord(
  record: ContentCandidateRecord,
  fallback: { candidateId: string; contentUnitId: string },
): CreatedContentSourceCandidate {
  const id = idValue(record.id) ?? fallback.candidateId
  return {
    id,
    title: candidateTitle(record, id),
    model: candidateModel(record),
    inputHash: candidateInputHash(record, fallback.contentUnitId),
    note: candidateNote(record),
    resourceId: resourceIdValue(firstCandidateOutput(record)?.resource_id),
  }
}

export function buildContentSourceWorkspaceEditPromptPatch(input: {
  targetPath: string
  text?: string
  editPrompt?: ContentSourceWorkspaceEditPrompt
  generationReferences?: ContentSourceWorkspaceGenerationReference[]
  generation_references?: ContentSourceWorkspaceGenerationReference[]
  referenceAssets?: ContentSourceWorkspaceReferenceAsset[]
  reference_assets?: ContentSourceWorkspaceReferenceAsset[]
  modelIntent?: Record<string, unknown>
  model_intent?: Record<string, unknown>
}): ContentSourceWorkspaceEditPromptPatch {
  const editPrompt = input.editPrompt ?? { text: input.text ?? '' }
  return {
    targetPath: input.targetPath,
    editPrompt: pruneUndefinedRecord({
      text: editPrompt.text,
      negative_text: editPrompt.negative_text,
      notes: editPrompt.notes,
      structured: editPrompt.structured,
    }),
    ...(input.generationReferences !== undefined || input.generation_references !== undefined
      ? { generationReferences: input.generationReferences ?? input.generation_references }
      : {}),
    ...(input.referenceAssets !== undefined || input.reference_assets !== undefined
      ? { referenceAssets: input.referenceAssets ?? input.reference_assets }
      : {}),
    ...(input.modelIntent !== undefined || input.model_intent !== undefined
      ? { modelIntent: input.modelIntent ?? input.model_intent }
      : {}),
  }
}

export function buildContentSourceWorkspaceExpressionUnitPatch(input: {
  targetPath: string
  title: string
  kind: string
  slotKind?: string
  text: string
  summary: string
  speaker?: string
  note?: string
}): ContentSourceWorkspaceExpressionUnitPatch {
  return {
    targetPath: input.targetPath,
    patch: {
      title: input.title,
      slotKind: input.slotKind,
      expressionKind: input.kind,
      text: input.text,
      intent: input.summary,
      speaker: input.speaker,
      note: input.note,
    },
  }
}

export function buildContentSourceWorkspaceAudioCuePatch(input: {
  targetPath: string
  title: string
  cueKind: string
  promptHint: string
  expressionUnitRef?: string
  storyboardRef?: string
  timing: Record<string, unknown>
  assetRefs: string[]
}): ContentSourceWorkspaceAudioCuePatch {
  return {
    targetPath: input.targetPath,
    patch: {
      title: input.title,
      cueKind: input.cueKind,
      promptHint: input.promptHint,
      expressionUnitRef: input.expressionUnitRef,
      storyboardRef: input.storyboardRef,
      timing: input.timing,
      assetRefs: input.assetRefs,
    },
  }
}

export function buildContentSourceWorkspaceTransitionPatch(input: {
  targetPath: string
  transition: HierarchyTransition
}): ContentSourceWorkspaceTransitionPatch {
  return {
    targetPath: input.targetPath,
    transition: {
      in: input.transition.in,
      out: input.transition.out,
      notes: input.transition.notes,
    },
  }
}

export function buildContentSourceWorkspaceStoryboardTimelinePatch(input: {
  targetPath: string
  timeline: StoryboardTimeline
}): ContentSourceWorkspaceStoryboardTimelinePatch {
  return {
    targetPath: input.targetPath,
    timeline: {
      caption: input.timeline.caption,
      gap_after_sec: input.timeline.gapAfterSec,
      duration_sec: input.timeline.durationSec,
    },
  }
}

export function buildContentSourceWorkspaceHierarchyNodeRecord(input: {
  projectId: number
  type: HierarchyNodeType
  id: string
  title: string
  targetPath: string
  parentNode: HierarchyNode
}): Record<string, unknown> {
  return hierarchyNodeSourceRecord(input)
}

export function updateContentSourceWorkspaceContentUnitPrompt(
  data: ContentSourceWorkspaceData,
  contentUnitId: string,
  text: string,
): ContentSourceWorkspaceData {
  return {
    ...data,
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      expressionUnits: moment.expressionUnits.map((expressionUnit) => (
        expressionUnit.contentUnit.id === contentUnitId
          ? {
            ...expressionUnit,
            contentUnit: {
              ...expressionUnit.contentUnit,
              editPrompt: text,
            },
          }
          : expressionUnit
      )),
    })),
    expressionUnitWorkspaceDetails: Object.fromEntries(
      Object.entries(data.expressionUnitWorkspaceDetails).map(([expressionUnitId, workspace]) => [
        expressionUnitId,
        {
          ...workspace,
          keyframes: updateExpressionUnitChildContentUnitPrompt(workspace.keyframes, contentUnitId, text),
          storyboards: updateExpressionUnitChildContentUnitPrompt(workspace.storyboards, contentUnitId, text),
        },
      ]),
    ),
  }
}

export function updateContentSourceWorkspaceContentUnitSelection(
  data: ContentSourceWorkspaceData,
  contentUnitId: string,
  candidateId: string,
): ContentSourceWorkspaceData {
  return {
    ...data,
    contentUnitCandidates: updateContentUnitCandidateSelection(data.contentUnitCandidates, contentUnitId, candidateId),
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      expressionUnits: moment.expressionUnits.map((expressionUnit) => (
        expressionUnit.contentUnit.id === contentUnitId
          ? {
            ...expressionUnit,
            contentUnit: selectPreviewContentUnitCandidate(expressionUnit.contentUnit, candidateId),
          }
          : expressionUnit
      )),
    })),
    expressionUnitWorkspaceDetails: Object.fromEntries(
      Object.entries(data.expressionUnitWorkspaceDetails).map(([expressionUnitId, workspace]) => [
        expressionUnitId,
        {
          ...workspace,
          keyframes: updateExpressionUnitChildContentUnitSelection(workspace.keyframes, contentUnitId, candidateId),
          storyboards: updateExpressionUnitChildContentUnitSelection(workspace.storyboards, contentUnitId, candidateId),
        },
      ]),
    ),
  }
}

export function appendContentSourceWorkspaceContentUnitCandidate(
  data: ContentSourceWorkspaceData,
  contentUnitId: string,
  candidate: CreatedContentSourceCandidate,
): ContentSourceWorkspaceData {
  return {
    ...data,
    contentUnitCandidates: appendContentUnitCandidate(data.contentUnitCandidates, contentUnitId, candidate),
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      expressionUnits: moment.expressionUnits.map((expressionUnit) => (
        expressionUnit.contentUnit.id === contentUnitId
          ? {
            ...expressionUnit,
            contentUnit: appendPreviewCandidate(expressionUnit.contentUnit, candidate),
          }
          : expressionUnit
      )),
    })),
    expressionUnitWorkspaceDetails: Object.fromEntries(
      Object.entries(data.expressionUnitWorkspaceDetails).map(([expressionUnitId, workspace]) => [
        expressionUnitId,
        {
          ...workspace,
          keyframes: updateExpressionUnitChildContentUnitCandidate(workspace.keyframes, contentUnitId, candidate),
          storyboards: updateExpressionUnitChildContentUnitCandidate(workspace.storyboards, contentUnitId, candidate),
        },
      ]),
    ),
  }
}

export function appendContentSourceWorkspaceAssetCandidate(
  data: ContentSourceWorkspaceData,
  assetId: string,
  candidate: CreatedContentSourceCandidate,
): ContentSourceWorkspaceData {
  const unit = data.assetReferenceUnits[assetId]
  if (!unit) return data
  return {
    ...data,
    assetReferenceUnits: {
      ...data.assetReferenceUnits,
      [assetId]: {
        ...unit,
        candidates: [
          ...unit.candidates,
          {
            ...candidate,
            resourceId: candidate.resourceId,
            confirmation: 'review',
          },
        ],
      },
    },
  }
}

export function updateContentSourceWorkspaceAssetPrompt(
  data: ContentSourceWorkspaceData,
  assetId: string,
  text: string,
): ContentSourceWorkspaceData {
  const unit = data.assetReferenceUnits[assetId]
  if (!unit) return data
  return {
    ...data,
    assetReferenceUnits: {
      ...data.assetReferenceUnits,
      [assetId]: {
        ...unit,
        editPrompt: text,
      },
    },
  }
}

export function updateContentSourceWorkspaceExpressionUnitState(
  data: ContentSourceWorkspaceData,
  unit: ExpressionUnit,
): ContentSourceWorkspaceData {
  return {
    ...data,
    expressionUnitsByMoment: Object.fromEntries(
      Object.entries(data.expressionUnitsByMoment).map(([momentId, units]) => [
        momentId,
        units.map((item) => item.id === unit.id ? unit : item),
      ]),
    ),
    hierarchyTree: updateHierarchyNodeTitle(data.hierarchyTree, unit.id, unit.title),
  }
}

export function updateContentSourceWorkspaceAudioCueState(
  data: ContentSourceWorkspaceData,
  cue: AudioCue,
): ContentSourceWorkspaceData {
  return {
    ...data,
    audioCuesByMoment: Object.fromEntries(
      Object.entries(data.audioCuesByMoment).map(([momentId, cues]) => [
        momentId,
        cues.map((item) => item.id === cue.id ? cue : item),
      ]),
    ),
    hierarchyTree: updateHierarchyNodeTitle(data.hierarchyTree, cue.id, cue.title),
  }
}

export function updateContentSourceWorkspaceHierarchyPlanning(
  data: ContentSourceWorkspaceData,
  nodeId: string,
  patch: Pick<Partial<HierarchyNode>, 'transition' | 'storyboardTimeline'>,
): ContentSourceWorkspaceData {
  return {
    ...data,
    hierarchyTree: updateHierarchyNodePlanning(data.hierarchyTree, nodeId, patch),
  }
}

function updateExpressionUnitChildContentUnitPrompt(
  items: ExpressionUnitChildOption[],
  contentUnitId: string,
  text: string,
): ExpressionUnitChildOption[] {
  return items.map((item) => item.contentUnit?.id === contentUnitId
    ? {
      ...item,
      contentUnit: {
        ...item.contentUnit,
        editPrompt: text,
      },
    }
    : item)
}

function updateExpressionUnitChildContentUnitSelection(
  items: ExpressionUnitChildOption[],
  contentUnitId: string,
  candidateId: string,
): ExpressionUnitChildOption[] {
  return items.map((item) => item.contentUnit?.id === contentUnitId
    ? {
      ...item,
      contentUnit: selectPreviewContentUnitCandidate(item.contentUnit, candidateId),
    }
    : item)
}

function updateExpressionUnitChildContentUnitCandidate(
  items: ExpressionUnitChildOption[],
  contentUnitId: string,
  candidate: CreatedContentSourceCandidate,
): ExpressionUnitChildOption[] {
  return items.map((item) => item.contentUnit?.id === contentUnitId
    ? {
      ...item,
      contentUnit: appendPreviewCandidate(item.contentUnit, candidate),
    }
    : item)
}

function selectPreviewContentUnitCandidate(contentUnit: PreviewContentUnit, candidateId: string): PreviewContentUnit {
  return {
    ...contentUnit,
    selectionState: 'selected',
    candidates: contentUnit.candidates.map((candidate) => ({
      ...candidate,
      selected: candidate.id === candidateId,
    })),
  }
}

function appendPreviewCandidate(contentUnit: PreviewContentUnit, candidate: CreatedContentSourceCandidate): PreviewContentUnit {
  return {
    ...contentUnit,
    selectionState: contentUnit.selectionState === 'selected' ? 'selected' : 'needs_candidate',
    candidates: [
      ...contentUnit.candidates,
      {
        id: candidate.id,
        title: candidate.title,
        model: candidate.model,
        inputHash: candidate.inputHash,
        note: candidate.note,
      },
    ],
  }
}

function updateHierarchyNodePlanning(
  nodes: HierarchyNode[],
  nodeId: string,
  patch: Pick<Partial<HierarchyNode>, 'transition' | 'storyboardTimeline'>,
): HierarchyNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.id === nodeId ? patch : {}),
    children: node.children ? updateHierarchyNodePlanning(node.children, nodeId, patch) : node.children,
  }))
}

function updateHierarchyNodeTitle(nodes: HierarchyNode[], nodeId: string, title: string): HierarchyNode[] {
  return nodes.map((node) => ({
    ...node,
    title: node.id === nodeId ? title : node.title,
    children: node.children ? updateHierarchyNodeTitle(node.children, nodeId, title) : node.children,
  }))
}

function buildHierarchyTree(input: {
  settings: MovScriptWorkspaceIndexedEntity[]
  settingStates: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  productions: MovScriptWorkspaceIndexedEntity[]
  segments: MovScriptWorkspaceIndexedEntity[]
  sceneMoments: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  audioCues: MovScriptWorkspaceIndexedEntity[]
  assetReferenceUnits: Record<string, PreviewAssetReferenceUnit>
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
}): HierarchyNode[] {
  return [
    {
      id: 'settings_root',
      type: 'group',
      title: 'Settings',
      path: 'settings/',
      children: sortEntities(input.settings).map((setting) => {
        const states = childEntitiesForParent(input.ancestryIndex, input.settingStates, setting)
        return entityNode(setting, 'setting', {
          children: sortEntities(states).map((state) => {
            const stateAssets = childEntitiesForParent(input.ancestryIndex, input.assets, state)
            return entityNode(state, 'state', {
              children: sortEntities(stateAssets).map((asset) => {
                const unit = input.assetReferenceUnits[nodeId(asset, 'asset')]
                return entityNode(asset, 'asset', { state: unit?.selectionState === 'needs_candidate' ? 'missing' : undefined })
              }),
            })
          }),
        })
      }),
    },
    {
      id: 'productions_group',
      type: 'group',
      title: 'Productions',
      path: 'productions',
      children: sortEntities(input.productions).map((production) => {
        const segments = childEntitiesForParent(input.ancestryIndex, input.segments, production)
        return entityNode(production, 'production', {
          children: sortEntities(segments).map((segment) => {
            const sceneMoments = childEntitiesForParent(input.ancestryIndex, input.sceneMoments, segment)
            return entityNode(segment, 'segment', {
	              children: sortEntities(sceneMoments).map((sceneMoment) => {
	                const momentDir = entityDir(sceneMoment.path)
	                const expressions = childEntitiesForParent(input.ancestryIndex, input.expressionUnits, sceneMoment)
	                const momentStoryboards = childEntitiesForParent(input.ancestryIndex, input.storyboards, sceneMoment)
	                const momentKeyframes = childEntitiesForParent(input.ancestryIndex, input.keyframes, sceneMoment)
	                const audioCues = childEntitiesForParent(input.ancestryIndex, input.audioCues, sceneMoment)
	                const momentId = idText(sceneMoment)
	                const expressionGroup: HierarchyNode = {
	                  id: `${nodeId(sceneMoment, 'scene_moment')}_expression_group`,
	                  type: 'group',
	                  title: 'Expression Units',
	                  path: `${momentDir}/expression_units`,
	                  momentId,
	                  children: sortEntities(expressions).map((expression) => {
	                    const expressionDir = entityDir(expression.path)
	                    const expressionUnitId = idText(expression)
	                    const storyboards = childEntitiesForParent(input.ancestryIndex, input.storyboards, expression)
	                    const keyframes = childEntitiesForParent(input.ancestryIndex, input.keyframes, expression)
	                    return entityNode(expression, 'expression_unit', {
	                      momentId,
	                      expressionUnitId,
	                      children: [
	                        {
	                          id: `${nodeId(expression, 'expression_unit')}_storyboards_group`,
	                          type: 'group',
	                          title: 'Storyboards',
	                          path: `${expressionDir}/storyboards`,
	                          momentId,
	                          expressionUnitId,
	                          children: sortEntities(storyboards).map((storyboard) => entityNode(storyboard, 'storyboard', { momentId, expressionUnitId })),
	                        },
	                        {
	                          id: `${nodeId(expression, 'expression_unit')}_keyframes_group`,
	                          type: 'group',
	                          title: 'Keyframes',
	                          path: `${expressionDir}/keyframes`,
	                          momentId,
	                          expressionUnitId,
	                          children: sortEntities(keyframes).map((keyframe) => entityNode(keyframe, 'keyframe', { momentId, expressionUnitId })),
	                        },
	                      ],
	                    })
	                  }),
	                }
	                const storyboardGroup: HierarchyNode = {
	                  id: `${nodeId(sceneMoment, 'scene_moment')}_storyboards_group`,
	                  type: 'group',
	                  title: 'Storyboards',
	                  path: `${momentDir}/storyboards`,
	                  momentId,
	                  children: sortEntities(momentStoryboards).map((storyboard) => entityNode(storyboard, 'storyboard', { momentId })),
	                }
	                const keyframeGroup: HierarchyNode = {
	                  id: `${nodeId(sceneMoment, 'scene_moment')}_keyframes_group`,
	                  type: 'group',
	                  title: 'Keyframes',
	                  path: `${momentDir}/keyframes`,
	                  momentId,
	                  children: sortEntities(momentKeyframes).map((keyframe) => entityNode(keyframe, 'keyframe', { momentId })),
	                }
                const audioCueGroup: HierarchyNode = {
                  id: `${nodeId(sceneMoment, 'scene_moment')}_audio_group`,
                  type: 'group',
                  title: 'Audio Cues',
                  path: `${momentDir}/audio_cues`,
                  momentId,
                  children: sortEntities(audioCues).map((audioCue) => entityNode(audioCue, 'audio_cue', { momentId })),
                }
	                return entityNode(sceneMoment, 'scene_moment', {
	                  momentId,
	                  children: [expressionGroup, storyboardGroup, keyframeGroup, audioCueGroup],
	                })
              }),
            })
          }),
        })
      }),
    },
  ]
}

function buildPreviewMoments(input: {
  productions: MovScriptWorkspaceIndexedEntity[]
  segments: MovScriptWorkspaceIndexedEntity[]
  sceneMoments: MovScriptWorkspaceIndexedEntity[]
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  previewTimelines: WorkspacePreviewTimelineArtifact[]
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
  candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
  selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
  selectionByContentUnitId: Map<string, SelectionState>
}): PreviewMoment[] {
	  return orderedSceneMoments(input.sceneMoments, input.previewTimelines).map((moment, momentIndex) => {
	    const segment = ancestorEntity(input.ancestryIndex, moment, 'segment') ?? parentByDir(input.segments, moment.path)
	    const production = segment
        ? ancestorEntity(input.ancestryIndex, segment, 'production') ?? parentByDir(input.productions, segment.path)
        : ancestorEntity(input.ancestryIndex, moment, 'production')
	    const expressionUnits = orderedChildEntitiesForTimelineParent(input.expressionUnits, input.previewTimelines, timelineItemIdForEntity(moment), 'expression_unit')
	    const momentExpressionUnits = (expressionUnits.length > 0 ? expressionUnits : sortEntities(childEntitiesForParent(input.ancestryIndex, input.expressionUnits, moment))).map((expressionUnit, expressionUnitIndex) =>
	      previewExpressionUnit(expressionUnit, expressionUnitIndex, moment, input),
	    )
	    return {
	      id: idText(moment),
	      title: titleOf(moment, `Scene Moment ${momentIndex + 1}`),
	      path: entityDir(moment.path),
	      selectionState: momentSelectionState(momentExpressionUnits),
	      priority: momentIndex < 1 ? '高优先级' : momentIndex < 3 ? '中优先级' : '低优先级',
	      production: production ? titleOf(production, idText(production)) : '',
	      segment: segment ? titleOf(segment, idText(segment)) : '',
	      settings: settingRefsForMoment(moment, momentExpressionUnits, input.assets),
	      expressionUnits: momentExpressionUnits,
	    }
	  })
	}

function previewExpressionUnit(
  expressionUnit: MovScriptWorkspaceIndexedEntity,
  expressionUnitIndex: number,
  moment: MovScriptWorkspaceIndexedEntity,
  input: {
    storyboards: MovScriptWorkspaceIndexedEntity[]
    keyframes: MovScriptWorkspaceIndexedEntity[]
    assets: MovScriptWorkspaceIndexedEntity[]
    contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
    ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): PreviewExpressionUnit {
  const storyboards = sortEntities(childEntitiesForParent(input.ancestryIndex, input.storyboards, expressionUnit))
  const keyframes = sortEntities(childEntitiesForParent(input.ancestryIndex, input.keyframes, expressionUnit))
  const primaryStoryboard = storyboards[0]
  const primaryKeyframe = keyframes[0]
  const contentUnit =
    contentUnitForEntity(input.contentUnitsByPrimaryRef, 'expression_unit', expressionUnit)
    ?? (primaryStoryboard ? contentUnitForEntity(input.contentUnitsByPrimaryRef, 'storyboard', primaryStoryboard) : undefined)
    ?? (primaryKeyframe ? contentUnitForEntity(input.contentUnitsByPrimaryRef, 'keyframe', primaryKeyframe) : undefined)
  return {
    id: idText(expressionUnit),
    title: titleOf(expressionUnit, `Expression Unit ${expressionUnitIndex + 1}`),
    kind: stringField(expressionUnit.record.kind) ?? 'expression_unit',
    camera: shotCameraText(expressionUnit),
    duration: durationText(recordField(expressionUnit.record.timing_intent)?.duration_sec ?? recordField(expressionUnit.record.timing)?.duration_sec ?? recordField(contentUnit?.record.model_intent)?.duration_sec),
    expression: shotExpressionText(expressionUnit),
    stillPosition: stillPositionForIndex(expressionUnitIndex),
    path: entityDir(expressionUnit.path),
    keyframes: keyframes.map((keyframe) => idText(keyframe)),
    assets: shotAssets(expressionUnit, keyframes, input.assets),
    storyboard: primaryStoryboard ? nodeId(primaryStoryboard, 'storyboard') : '',
    contentUnit: previewContentUnit(contentUnit, expressionUnit, moment, primaryStoryboard, keyframes, input),
  }
}

function orderedSceneMoments(
  sceneMoments: MovScriptWorkspaceIndexedEntity[],
  previewTimelines: WorkspacePreviewTimelineArtifact[],
): MovScriptWorkspaceIndexedEntity[] {
  const timelineMoments = previewTimelines.flatMap((timeline) =>
    timeline.items
      .filter((item) => item.itemType === 'scene_moment')
      .sort((left, right) => left.order - right.order)
      .map((item) => entityForTimelineItem(sceneMoments, item))
      .filter(isDefined),
  )
  if (timelineMoments.length === 0) return sortEntities(sceneMoments)
  return uniqueEntities([...timelineMoments, ...sortEntities(sceneMoments)])
}

function orderedChildEntitiesForTimelineParent(
  entities: MovScriptWorkspaceIndexedEntity[],
  previewTimelines: WorkspacePreviewTimelineArtifact[],
  parentItemId: string,
  itemType: WorkspacePreviewTimelineItem['itemType'],
): MovScriptWorkspaceIndexedEntity[] {
  return previewTimelines.flatMap((timeline) =>
    timeline.items
      .filter((item) => item.itemType === itemType && item.parentId === parentItemId)
      .sort((left, right) => left.order - right.order)
      .map((item) => entityForTimelineItem(entities, item))
      .filter(isDefined),
  )
}

function entityForTimelineItem(
  entities: MovScriptWorkspaceIndexedEntity[],
  item: WorkspacePreviewTimelineItem,
): MovScriptWorkspaceIndexedEntity | undefined {
  return entities.find((entity) =>
    (item.entity.id !== undefined && String(entity.id ?? '') === String(item.entity.id))
    || entity.path === item.entity.path,
  )
}

function uniqueEntities(entities: MovScriptWorkspaceIndexedEntity[]): MovScriptWorkspaceIndexedEntity[] {
  return Array.from(new Map(entities.map((entity) => [entity.path, entity])).values())
}

function timelineItemIdForEntity(entity: MovScriptWorkspaceIndexedEntity): string {
  return `${entity.entityKind}:${String(entity.id ?? entity.path)}`
}

function previewContentUnit(
  contentUnit: MovScriptWorkspaceIndexedEntity | undefined,
  expressionUnit: MovScriptWorkspaceIndexedEntity,
  moment: MovScriptWorkspaceIndexedEntity,
  storyboard: MovScriptWorkspaceIndexedEntity | undefined,
  keyframes: MovScriptWorkspaceIndexedEntity[],
  input: {
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): PreviewContentUnit {
  const type = contentUnitType(contentUnit)
  const id = contentUnit ? idText(contentUnit) : `cu_${idText(expressionUnit)}`
  const selection = input.selectionRecordsByContentUnitId.get(id)
  return {
    id,
    type,
    outputKind: outputKindForContentUnit(contentUnit),
    path: contentUnit?.path ?? `content_units/${id}/content_unit.json`,
    editPrompt: editPromptText(contentUnit) ?? '',
    sceneMomentRef: `scene_moment/${idText(moment)}`,
    expressionUnitRef: idText(expressionUnit),
    storyboardRef: storyboard ? nodeId(storyboard, 'storyboard') : '',
    keyframeRefs: keyframes.map((keyframe) => idText(keyframe)),
    selectionState: input.selectionByContentUnitId.get(id) ?? selectionStateFromSourceSelection(selection, contentUnit),
    candidates: previewCandidatesForContentUnit(id, input.candidateRecordsByContentUnitId.get(id) ?? [], selection),
  }
}

function buildExpressionUnitsByMoment(
  expressionUnits: MovScriptWorkspaceIndexedEntity[],
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex,
): Record<string, ExpressionUnit[]> {
  const output: Record<string, ExpressionUnit[]> = {}
  for (const expression of sortEntities(expressionUnits)) {
    const momentId = ancestorId(ancestryIndex, expression, 'scene_moment') ?? pathSegmentAfter(expression.path, 'scene_moments') ?? ''
    const item = {
      id: idText(expression),
      title: titleOf(expression, stringField(expression.record.text) ?? idText(expression)),
      path: expression.path,
      kind: stringField(expression.record.slot_kind ?? expression.record.expression_kind ?? expression.record.kind) ?? 'visual',
      slotKind: expressionUnitSlotKindFromRecord(expression.record),
      text: stringField(expression.record.text) ?? '',
      summary: stringField(expression.record.intent ?? expression.record.note ?? expression.record.text) ?? '',
      speaker: stringField(expression.record.speaker),
      note: stringField(expression.record.note),
      sceneMomentId: momentId,
    }
    output[momentId] = [...(output[momentId] ?? []), item]
  }
  return output
}

function buildAudioCuesByMoment(
  audioCues: MovScriptWorkspaceIndexedEntity[],
  input: {
    ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
    contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): Record<string, AudioCue[]> {
  const output: Record<string, AudioCue[]> = {}
  for (const audioCue of sortEntities(audioCues)) {
    const momentId = ancestorId(input.ancestryIndex, audioCue, 'scene_moment') ?? pathSegmentAfter(audioCue.path, 'scene_moments') ?? ''
    const contentUnit = contentUnitForEntity(input.contentUnitsByPrimaryRef, 'audio_cue', audioCue)
    const item = {
      id: idText(audioCue),
      title: titleOf(audioCue, idText(audioCue)),
      path: audioCue.path,
      cueKind: stringField(audioCue.record.cue_kind ?? audioCue.record.kind) ?? 'sound_effect',
      promptHint: stringField(audioCue.record.prompt_hint) ?? '',
      expressionUnitRef: stringField(audioCue.record.expression_unit_ref),
      storyboardRef: stringField(audioCue.record.storyboard_ref),
      timing: recordField(audioCue.record.timing) ?? {},
      assetRefs: arrayField(audioCue.record.asset_refs).map(String),
      sceneMomentId: momentId,
      ...(contentUnit ? { contentUnit: previewAudioCueContentUnit(contentUnit, audioCue, input) } : {}),
    }
    output[momentId] = [...(output[momentId] ?? []), item]
  }
  return output
}

function previewAudioCueContentUnit(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  audioCue: MovScriptWorkspaceIndexedEntity,
  input: {
    ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): PreviewContentUnit {
  const id = idText(contentUnit)
  const selection = input.selectionRecordsByContentUnitId.get(id)
  return {
    id,
    type: contentUnitType(contentUnit),
    outputKind: outputKindForContentUnit(contentUnit),
    path: contentUnit.path,
    editPrompt: editPromptText(contentUnit) ?? '',
    sceneMomentRef: ancestorId(input.ancestryIndex, audioCue, 'scene_moment') ?? pathSegmentAfter(audioCue.path, 'scene_moments') ?? '',
    expressionUnitRef: stringField(audioCue.record.expression_unit_ref) ?? '',
    storyboardRef: stringField(audioCue.record.storyboard_ref) ?? '',
    keyframeRefs: [],
    selectionState: input.selectionByContentUnitId.get(id) ?? selectionStateFromSourceSelection(selection, contentUnit),
    candidates: previewCandidatesForContentUnit(id, input.candidateRecordsByContentUnitId.get(id) ?? [], selection),
  }
}

function transitionFromEntity(entity: MovScriptWorkspaceIndexedEntity): HierarchyTransition | undefined {
  const transition = recordField(entity.record.transition)
  if (!transition) return undefined
  const value = {
    in: stringField(transition.in),
    out: stringField(transition.out),
    notes: stringField(transition.notes),
  }
  return Object.values(value).some(Boolean) ? value : undefined
}

function storyboardTimelineFromEntity(entity: MovScriptWorkspaceIndexedEntity): StoryboardTimeline | undefined {
  const timeline = recordField(entity.record.timeline)
  if (!timeline) return undefined
  const value = {
    caption: stringField(timeline.caption),
    gapAfterSec: optionalNumberField(timeline.gap_after_sec),
    durationSec: optionalNumberField(timeline.duration_sec),
  }
  return Object.values(value).some((item) => item !== undefined) ? value : undefined
}

function buildExpressionUnitWorkspaceDetails(input: {
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  settings: MovScriptWorkspaceIndexedEntity[]
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
  candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
  selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
  selectionByContentUnitId: Map<string, SelectionState>
}): Record<string, ExpressionUnitWorkspaceDetails> {
  return Object.fromEntries(input.expressionUnits.map((expressionUnit) => {
    const keyframes = sortEntities(childEntitiesForParent(input.ancestryIndex, input.keyframes, expressionUnit))
    const storyboards = sortEntities(childEntitiesForParent(input.ancestryIndex, input.storyboards, expressionUnit))
    const refs = shotAssets(expressionUnit, keyframes, input.assets)
    const assets = refs.map((ref): EditableRef => ({
      id: ref.title,
      title: ref.title.replace(/^asset\//, ''),
      owner: ref.title,
      status: ref.status === 'missing' ? 'missing' : ref.status === 'locked' ? 'locked' : 'current',
      summary: ref.status === 'missing' ? '该素材引用尚未在 setting/state asset 中解析。' : '来自 workspace source 的素材引用。',
      downstream: [idText(expressionUnit)],
    }))
    const settings = input.settings.slice(0, 4).map((setting): EditableRef => ({
      id: nodeId(setting, 'setting'),
      title: titleOf(setting, idText(setting)),
      owner: setting.path,
      status: 'current',
      summary: stringField(setting.record.summary ?? setting.record.description ?? setting.record.prompt_hint) ?? 'Workspace setting context.',
      downstream: [idText(expressionUnit)],
    }))
    return [idText(expressionUnit), {
      settings,
      assets,
      keyframes: keyframes.map((keyframe) => expressionUnitChildOption(keyframe, 'keyframe', expressionUnit, input)),
      storyboards: storyboards.map((storyboard) => expressionUnitChildOption(storyboard, 'storyboard', expressionUnit, input)),
      impacts: [] as ExpressionUnitImpact[],
    }]
  }))
}

function buildAssetReferenceUnits(input: {
  assets: MovScriptWorkspaceIndexedEntity[]
  settings: MovScriptWorkspaceIndexedEntity[]
  settingStates: MovScriptWorkspaceIndexedEntity[]
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  contentUnits: MovScriptWorkspaceIndexedEntity[]
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
  candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
  selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
  selectionByContentUnitId: Map<string, SelectionState>
}): Record<string, PreviewAssetReferenceUnit> {
  return Object.fromEntries(input.assets.map((asset) => {
    const contentUnit = contentUnitForEntity(input.contentUnitsByPrimaryRef, 'asset', asset)
    const contentUnitId = contentUnit ? idText(contentUnit) : `cu_${idText(asset)}`
    const ownerState = ancestorEntity(input.ancestryIndex, asset, 'setting_state') ?? parentByDir(input.settingStates, asset.path)
    const ownerSetting = ownerState
      ? ancestorEntity(input.ancestryIndex, ownerState, 'setting') ?? parentByDir(input.settings, ownerState.path)
      : ancestorEntity(input.ancestryIndex, asset, 'setting')
    const assetId = nodeId(asset, 'asset')
    const selection = input.selectionRecordsByContentUnitId.get(contentUnitId)
    const selectionState = contentUnit ? input.selectionByContentUnitId.get(contentUnitId) ?? 'needs_candidate' : 'ready'
    return [assetId, {
      assetId,
      title: titleOf(asset, idText(asset)),
      path: contentUnit?.path ?? `content_units/${contentUnitId}/content_unit.json`,
      contentUnitId,
      contentUnitType: 'asset_ref',
      outputKind: 'image',
      editPrompt: editPromptText(contentUnit) ?? '',
      usage: `${titleOf(asset, idText(asset))} 作为 setting/state 下的素材参考输入。`,
      lockPolicy: '选择变化后，下游引用该 asset_ref 的创作片段需要重新检查。',
      selectionState,
      upstream: [
        ...(ownerSetting ? [{ id: `setting:${idText(ownerSetting)}`, title: titleOf(ownerSetting, idText(ownerSetting)), kind: 'setting' as const, ownerNodeId: nodeId(ownerSetting, 'setting'), state: 'current' as const, summary: ownerSetting.path }] : []),
        ...(ownerState ? [{ id: `state:${idText(ownerState)}`, title: titleOf(ownerState, idText(ownerState)), kind: 'state' as const, ownerNodeId: nodeId(ownerState, 'state'), state: 'current' as const, summary: ownerState.path }] : []),
      ],
      candidates: previewAssetCandidatesForContentUnit(contentUnitId, input.candidateRecordsByContentUnitId.get(contentUnitId) ?? [], selection),
      downstream: buildAssetDownstreamUnits(asset, input),
    }]
  }))
}

function buildAssetDownstreamUnits(
  asset: MovScriptWorkspaceIndexedEntity,
  input: {
    ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
    expressionUnits: MovScriptWorkspaceIndexedEntity[]
    storyboards: MovScriptWorkspaceIndexedEntity[]
    keyframes: MovScriptWorkspaceIndexedEntity[]
    contentUnits: MovScriptWorkspaceIndexedEntity[]
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): PreviewAssetDownstream[] {
  const assetId = idText(asset)
  const refs = new Set([assetId, nodeId(asset, 'asset')])
  return input.contentUnits
    .filter((contentUnit) => {
      const promptRefs = editPromptRefs(contentUnit)
      const referencesAsset = promptRefs.some((ref) => ref.kind === 'asset' && refs.has(ref.id))
      const isOwnAssetRef = stringField(contentUnit.record.content_unit_type) === 'asset_ref'
        && primaryRefIdsForContentUnitRecord(contentUnit.record, 'asset').some((ref) => refs.has(ref))
      return referencesAsset && !isOwnAssetRef
    })
    .map((contentUnit): PreviewAssetDownstream => {
      const contentUnitId = idText(contentUnit)
      const owner = primaryOwnerForContentUnit(contentUnit, input)
      const selection = input.selectionRecordsByContentUnitId.get(contentUnitId)
      const selectedCandidateId = idValue(selection?.candidate_id)
      const selectedCandidate = selectedCandidateId
        ? input.candidateRecordsByContentUnitId.get(contentUnitId)?.find((candidate) => selectionCandidateMatches(selection, idValue(candidate.id) ?? ''))
        : undefined
      const state = input.selectionByContentUnitId.get(contentUnitId) ?? selectionStateFromSourceSelection(selection, contentUnit)
      return {
        id: `asset:${assetId}:content_unit:${contentUnitId}`,
        title: titleOf(contentUnit, contentUnitId),
        kind: 'content_unit',
        ownerNodeId: owner?.nodeId ?? contentUnitId,
        momentId: owner?.momentId ?? '',
        expressionUnitId: owner?.expressionUnitId ?? '',
        dependencyHash: selectedCandidate ? candidateInputHash(selectedCandidate, contentUnitId) : contentUnitId,
        state,
        action: state === 'selected' ? '已选择候选引用该 asset' : '需要候选或选择确认',
        preview: `${contentUnitId} 在 edit_prompt 中引用 ${nodeId(asset, 'asset')}。`,
      }
    })
}

function primaryOwnerForContentUnit(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  input: {
    ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
    expressionUnits: MovScriptWorkspaceIndexedEntity[]
    storyboards: MovScriptWorkspaceIndexedEntity[]
    keyframes: MovScriptWorkspaceIndexedEntity[]
  },
): { nodeId: string; momentId: string; expressionUnitId: string } | undefined {
  const expressionUnitRef = primaryRefIdsForContentUnitRecord(contentUnit.record, 'expression_unit')[0]
  if (expressionUnitRef) {
    const expressionUnit = input.expressionUnits.find((item) => entityMatchesRef(item, expressionUnitRef, 'expression_unit'))
    return {
      nodeId: expressionUnit ? idText(expressionUnit) : expressionUnitRef,
      momentId: expressionUnit ? ancestorId(input.ancestryIndex, expressionUnit, 'scene_moment') ?? pathSegmentAfter(expressionUnit.path, 'scene_moments') ?? '' : '',
      expressionUnitId: expressionUnit ? idText(expressionUnit) : expressionUnitRef,
    }
  }
  const storyboardRef = primaryRefIdsForContentUnitRecord(contentUnit.record, 'storyboard')[0]
  if (storyboardRef) {
    const storyboard = input.storyboards.find((item) => entityMatchesRef(item, storyboardRef, 'storyboard'))
    return {
      nodeId: storyboard ? nodeId(storyboard, 'storyboard') : `storyboard/${storyboardRef}`,
      momentId: storyboard ? ancestorId(input.ancestryIndex, storyboard, 'scene_moment') ?? pathSegmentAfter(storyboard.path, 'scene_moments') ?? '' : '',
      expressionUnitId: storyboard ? ancestorId(input.ancestryIndex, storyboard, 'expression_unit') ?? pathSegmentAfter(storyboard.path, 'expression_units') ?? '' : '',
    }
  }
  const keyframeRef = primaryRefIdsForContentUnitRecord(contentUnit.record, 'keyframe')[0]
  if (keyframeRef) {
    const keyframe = input.keyframes.find((item) => entityMatchesRef(item, keyframeRef, 'keyframe'))
    return {
      nodeId: keyframe ? idText(keyframe) : keyframeRef,
      momentId: keyframe ? ancestorId(input.ancestryIndex, keyframe, 'scene_moment') ?? pathSegmentAfter(keyframe.path, 'scene_moments') ?? '' : '',
      expressionUnitId: keyframe ? ancestorId(input.ancestryIndex, keyframe, 'expression_unit') ?? pathSegmentAfter(keyframe.path, 'expression_units') ?? '' : '',
    }
  }
  return undefined
}

function expressionUnitChildOption(
  entity: MovScriptWorkspaceIndexedEntity,
  primaryKind: 'keyframe' | 'storyboard',
  expressionUnit: MovScriptWorkspaceIndexedEntity,
  input: {
    ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex
    contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): ExpressionUnitChildOption {
  const contentUnit = contentUnitForEntity(input.contentUnitsByPrimaryRef, primaryKind, entity)
  const contentUnitId = contentUnit ? idText(contentUnit) : ''
  const selection = contentUnitId ? input.selectionRecordsByContentUnitId.get(contentUnitId) : undefined
  return {
    id: idText(entity),
    title: titleOf(entity, idText(entity)),
    status: contentUnit ? 'candidate' : 'draft',
    inputHash: contentUnitId || 'source',
    summary: stringField(entity.record.visual_intent ?? entity.record.summary ?? entity.record.description ?? entity.record.slot) ?? entity.path,
    ...(contentUnit ? {
      contentUnit: {
        id: contentUnitId,
        type: primaryKind === 'keyframe' ? 'keyframe_ref' : 'storyboard_ref',
        outputKind: outputKindForContentUnit(contentUnit),
        path: contentUnit.path,
        editPrompt: editPromptText(contentUnit) ?? '',
        sceneMomentRef: `scene_moment/${ancestorId(input.ancestryIndex, expressionUnit, 'scene_moment') ?? pathSegmentAfter(expressionUnit.path, 'scene_moments') ?? ''}`,
        expressionUnitRef: idText(expressionUnit),
        storyboardRef: primaryKind === 'storyboard' ? nodeId(entity, 'storyboard') : '',
        keyframeRefs: primaryKind === 'keyframe' ? [idText(entity)] : [],
        selectionState: input.selectionByContentUnitId.get(contentUnitId) ?? selectionStateFromSourceSelection(selection, contentUnit),
        candidates: previewCandidatesForContentUnit(contentUnitId, input.candidateRecordsByContentUnitId.get(contentUnitId) ?? [], selection),
      } satisfies PreviewContentUnit,
    } : {}),
  }
}

function buildContentUnitCandidates(input: {
  contentUnits: MovScriptWorkspaceIndexedEntity[]
  candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
  selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
}): Record<string, PreviewCandidate[]> {
  const ids = new Set<string>([
    ...input.contentUnits.map(idText),
    ...input.candidateRecordsByContentUnitId.keys(),
    ...input.selectionRecordsByContentUnitId.keys(),
  ])
  const output: Record<string, PreviewCandidate[]> = {}
  for (const contentUnitId of ids) {
    output[contentUnitId] = previewCandidatesForContentUnit(
      contentUnitId,
      input.candidateRecordsByContentUnitId.get(contentUnitId) ?? [],
      input.selectionRecordsByContentUnitId.get(contentUnitId),
    )
  }
  return output
}

function groupContentUnitsByPrimaryRef(contentUnits: MovScriptWorkspaceIndexedEntity[]): Map<string, MovScriptWorkspaceIndexedEntity[]> {
  const output = new Map<string, MovScriptWorkspaceIndexedEntity[]>()
  for (const contentUnit of contentUnits) {
    const type = stringField(contentUnit.record.content_unit_type)
    const primaryKind = primaryKindForContentUnitType(type)
    if (!primaryKind) continue
    for (const ref of primaryRefIdsForContentUnitRecord(contentUnit.record, primaryKind)) {
      for (const key of primaryRefKeys(primaryKind, ref)) {
        output.set(key, [...(output.get(key) ?? []), contentUnit])
      }
    }
  }
  return output
}

function groupContentCandidateRecordsByContentUnitId(documents: WorkspaceDocument[]): Map<string, ContentCandidateRecord[]> {
  const output = new Map<string, ContentCandidateRecord[]>()
  for (const document of documents) {
    if (document.path.endsWith('/content_candidate.json') && isContentCandidateRecord(document.data)) {
      const contentUnitId = contentUnitIdForRuntimeDocument(document.path, document.data.content_unit_ref)
      if (!contentUnitId) continue
      appendContentCandidateRecord(output, contentUnitId, document.data)
      continue
    }
    if (!isDecisionContextRecord(document.data)) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringField(document.data.target_ref))
    if (!contentUnitId) continue
    for (const candidate of arrayField(document.data.candidates)) {
      const record = normalizeDecisionContentCandidateRecord(candidate, contentUnitId)
      if (record) appendContentCandidateRecord(output, contentUnitId, record)
    }
  }
  for (const [contentUnitId, candidates] of output.entries()) {
    output.set(contentUnitId, candidates.sort((left, right) => (stringField(right.created_at) ?? '').localeCompare(stringField(left.created_at) ?? '')))
  }
  return output
}

function appendContentCandidateRecord(
  output: Map<string, ContentCandidateRecord[]>,
  contentUnitId: string,
  candidate: ContentCandidateRecord,
): void {
  const candidates = output.get(contentUnitId) ?? []
  const candidateId = idValue(candidate.id)
  if (!candidateId) {
    output.set(contentUnitId, [...candidates, candidate])
    return
  }
  const existingIndex = candidates.findIndex((existing) => idValue(existing.id) === candidateId)
  if (existingIndex < 0) {
    output.set(contentUnitId, [...candidates, candidate])
    return
  }
  output.set(contentUnitId, [
    ...candidates.slice(0, existingIndex),
    mergeContentCandidateRecords(candidates[existingIndex], candidate),
    ...candidates.slice(existingIndex + 1),
  ])
}

function normalizeDecisionContentCandidateRecord(
  value: unknown,
  contentUnitId: string,
): ContentCandidateRecord | undefined {
  if (!isRecord(value) || !idValue(value.id)) return undefined
  return {
    ...value,
    content_unit_ref: stringField(value.content_unit_ref) ?? `content_units/${contentUnitId}`,
  } as ContentCandidateRecord
}

function mergeContentCandidateRecords(
  existing: ContentCandidateRecord,
  incoming: ContentCandidateRecord,
): ContentCandidateRecord {
  const merged: ContentCandidateRecord = { ...existing, ...incoming }
  if (arrayField(incoming.outputs).length === 0 && arrayField(existing.outputs).length > 0) merged.outputs = existing.outputs
  if (!recordField(incoming.producer) && recordField(existing.producer)) merged.producer = existing.producer
  if (!recordField(incoming.prompt_snapshot) && recordField(existing.prompt_snapshot)) merged.prompt_snapshot = existing.prompt_snapshot
  if (!stringField(incoming.status) && stringField(existing.status)) merged.status = existing.status
  if (!stringField(incoming.source) && stringField(existing.source)) merged.source = existing.source
  if (!stringField(incoming.created_at) && stringField(existing.created_at)) merged.created_at = existing.created_at
  if (!stringField(incoming.content_unit_ref) && stringField(existing.content_unit_ref)) merged.content_unit_ref = existing.content_unit_ref
  return merged
}

function groupSelectionRecordsByContentUnitId(documents: WorkspaceDocument[]): Map<string, ContentSelectionRecord> {
  const output = new Map<string, ContentSelectionRecord>()
  for (const document of documents) {
    if (!isDecisionContextRecord(document.data)) continue
    const selection = recordField(document.data.selection)
    if (!selection) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringField(document.data.target_ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, normalizeContentSelectionRecord(selection))
  }
  return output
}

function previewCandidatesForContentUnit(
  contentUnitId: string,
  candidates: ContentCandidateRecord[],
  selection: ContentSelectionRecord | undefined,
): PreviewCandidate[] {
  return candidates.map((candidate, index) => {
    const id = idValue(candidate.id) ?? `candidate_${index + 1}`
    const output = firstCandidateOutput(candidate)
    return {
      id,
      title: candidateTitle(candidate, candidateOrdinalTitle(index)),
      model: candidateModel(candidate),
      inputHash: candidateInputHash(candidate, contentUnitId),
      selected: selectionCandidateMatches(selection, id),
      note: candidateNote(candidate),
      resourceId: resourceIdValue(output?.resource_id),
      streamId: streamIdValue(output?.stream_id),
      resourceKind: stringField(output?.kind),
      artifactRef: stringField(output?.artifact_ref),
      status: stringField(candidate.status),
      decisionStatus: candidateDecisionStatus(candidate),
      decisionReason: candidateDecisionReason(candidate),
      source: stringField(candidate.source),
      producer: candidate.producer,
      outputs: candidate.outputs,
      promptSnapshot: candidate.prompt_snapshot,
      createdAt: stringField(candidate.created_at),
    }
  })
}

function previewAssetCandidatesForContentUnit(
  contentUnitId: string,
  candidates: ContentCandidateRecord[],
  selection: ContentSelectionRecord | undefined,
): PreviewAssetCandidate[] {
  return candidates.map((candidate, index) => {
    const id = idValue(candidate.id) ?? `candidate_${index + 1}`
    const output = firstCandidateOutput(candidate)
    return {
      id,
      title: candidateTitle(candidate, candidateOrdinalTitle(index)),
      model: candidateModel(candidate),
      inputHash: candidateInputHash(candidate, contentUnitId),
      selected: selectionCandidateMatches(selection, id),
      note: candidateNote(candidate),
      resourceId: resourceIdValue(output?.resource_id),
      streamId: streamIdValue(output?.stream_id),
      resourceKind: stringField(output?.kind),
      artifactRef: stringField(output?.artifact_ref),
      status: stringField(candidate.status),
      decisionStatus: candidateDecisionStatus(candidate),
      decisionReason: candidateDecisionReason(candidate),
      source: stringField(candidate.source),
      producer: candidate.producer,
      outputs: candidate.outputs,
      promptSnapshot: candidate.prompt_snapshot,
      createdAt: stringField(candidate.created_at),
      confirmation: assetCandidateConfirmation(candidate, selection, id),
    }
  })
}

function updateContentUnitCandidateSelection(
  candidatesByContentUnitId: Record<string, PreviewCandidate[]>,
  contentUnitId: string,
  candidateId: string,
): Record<string, PreviewCandidate[]> {
  const candidates = candidatesByContentUnitId[contentUnitId]
  if (!candidates) return candidatesByContentUnitId
  return {
    ...candidatesByContentUnitId,
    [contentUnitId]: candidates.map((candidate) => ({
      ...candidate,
      selected: candidate.id === candidateId,
    })),
  }
}

function appendContentUnitCandidate(
  candidatesByContentUnitId: Record<string, PreviewCandidate[]>,
  contentUnitId: string,
  candidate: CreatedContentSourceCandidate,
): Record<string, PreviewCandidate[]> {
  const candidates = candidatesByContentUnitId[contentUnitId] ?? []
  return {
    ...candidatesByContentUnitId,
    [contentUnitId]: [
      ...candidates,
      previewCandidateFromCreated(candidate),
    ],
  }
}

function previewCandidateFromCreated(candidate: CreatedContentSourceCandidate): PreviewCandidate {
  return {
    id: candidate.id,
    title: candidate.title,
    model: candidate.model,
    inputHash: candidate.inputHash,
    note: candidate.note,
    ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
  }
}

function selectionStateFromSourceSelection(
  selection: ContentSelectionRecord | undefined,
  contentUnit: MovScriptWorkspaceIndexedEntity | undefined,
): SelectionState {
  if (selection?.candidate_id !== undefined) return 'selected'
  return contentUnit ? 'needs_candidate' : 'ready'
}

function buildSelectionStateByContentUnitId(
  contentUnits: MovScriptWorkspaceIndexedEntity[],
  selections: Map<string, ContentSelectionRecord>,
): Map<string, SelectionState> {
  const entries = contentUnits.map((contentUnit) => {
    const id = idText(contentUnit)
    const selection = selections.get(id)
    if (selection?.candidate_id !== undefined) return [id, 'selected'] as const
    return [id, 'needs_candidate'] as const
  })
  return new Map(entries)
}

function contentUnitForEntity(
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>,
  entityKind: string,
  entity: MovScriptWorkspaceIndexedEntity,
): MovScriptWorkspaceIndexedEntity | undefined {
  if (entity.id === undefined) return undefined
  return contentUnitsByPrimaryRef.get(primaryRefKey(entityKind, entity.id))?.[0]
}

function primaryKindForContentUnitType(type: string | undefined): MovScriptContentUnitPromptRefKind | undefined {
  return type ? domainPrimaryRefKindForContentUnitType(type) : undefined
}

function primaryRefIdsForContentUnitRecord(record: Record<string, unknown>, kind: string): string[] {
  return isContentUnitPromptRefKind(kind) ? domainPrimaryRefIdsForContentUnitRecord(record, kind) : []
}

function editPromptRefs(contentUnit: MovScriptWorkspaceIndexedEntity): Array<{ kind: string; id: string }> {
  const text = editPromptText(contentUnit) ?? ''
  const refs: Array<{ kind: string; id: string }> = []
  const pattern = /\{\{\s*([a-z_]+)\s*:\s*([^}\s]+)\s*\}\}/g
  let match = pattern.exec(text)
  while (match) {
    refs.push({ kind: match[1] ?? '', id: match[2] ?? '' })
    match = pattern.exec(text)
  }
  return refs
}

function editPromptText(contentUnit: MovScriptWorkspaceIndexedEntity | undefined): string | undefined {
  const prompt = contentUnit?.record.edit_prompt
  if (typeof prompt === 'string') return prompt
  if (isRecord(prompt)) return stringField(prompt.text)
  return undefined
}

function entityNode(
  entity: MovScriptWorkspaceIndexedEntity,
  type: HierarchyNode['type'],
  extras: Partial<HierarchyNode> = {},
): HierarchyNode {
  return {
    id: nodeId(entity, type),
    type,
    title: titleOf(entity, idText(entity)),
    path: entity.path,
    transition: supportsTransition(type) ? transitionFromEntity(entity) : undefined,
    storyboardTimeline: type === 'storyboard' ? storyboardTimelineFromEntity(entity) : undefined,
    ...extras,
  }
}

function supportsTransition(type: HierarchyNode['type']): boolean {
  return type === 'production' || type === 'segment' || type === 'scene_moment' || type === 'storyboard'
}

function nodeId(entity: MovScriptWorkspaceIndexedEntity, type: HierarchyNode['type']): string {
  if (type === 'setting') return `setting/${idText(entity)}`
  if (type === 'state') return `state/${pathSegmentAfter(entity.path, 'settings') ?? ''}/${idText(entity)}`
  if (type === 'asset') return `asset/${idText(entity)}`
  if (type === 'storyboard') return `storyboard/${idText(entity)}`
  return idText(entity)
}

function titleOf(entity: MovScriptWorkspaceIndexedEntity, fallback: string): string {
  return stringField(entity.record.title ?? entity.record.name ?? entity.record.label ?? entity.record.text) ?? fallback
}

function idText(entity: MovScriptWorkspaceIndexedEntity): string {
  return String(entity.id ?? entity.record.id ?? entity.record.ID ?? entity.path)
}

function entityMatchesRef(entity: MovScriptWorkspaceIndexedEntity, ref: string, kind: string): boolean {
  const normalized = ref.replace(/\/+$/, '')
  const dir = entity.path.replace(/\/[^/]+$/, '')
  return String(entity.id ?? '') === ref
    || dir === normalized
    || entity.path === `${normalized}/${kind}.json`
}

function sortEntities<T extends MovScriptWorkspaceIndexedEntity>(entities: T[]): T[] {
  return [...entities].sort((left, right) => numberField(left.record.order) - numberField(right.record.order) || left.path.localeCompare(right.path))
}

function childEntities(entities: MovScriptWorkspaceIndexedEntity[], parentDir: string, collectionName: string): MovScriptWorkspaceIndexedEntity[] {
  return entities.filter((entity) => entity.path.startsWith(`${parentDir}/${collectionName}/`)
    && entityDir(entity.path).replace(`${parentDir}/${collectionName}/`, '').split('/').length === 1)
}

function childEntitiesForParent<T extends MovScriptWorkspaceIndexedEntity>(
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex,
  entities: T[],
  parent: MovScriptWorkspaceIndexedEntity,
): T[] {
  const directChildren = new Set((ancestryIndex.childrenByParentPath.get(parent.path) ?? []).map((entity) => entity.path))
  return entities.filter((entity) => directChildren.has(entity.path))
}

function ancestorEntity(
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex,
  entity: MovScriptWorkspaceIndexedEntity,
  entityKind: string,
): MovScriptWorkspaceIndexedEntity | undefined {
  const seen = new Set<string>([entity.path])
  let currentPath = entity.path
  while (true) {
    const parentPath = ancestryIndex.parentPathByPath.get(currentPath)
    if (!parentPath || seen.has(parentPath)) return undefined
    seen.add(parentPath)
    const parent = ancestryIndex.entityByPath.get(parentPath)
    if (!parent) return undefined
    if (parent.entityKind === entityKind) return parent
    currentPath = parent.path
  }
}

function ancestorId(
  ancestryIndex: ContentSourceWorkspaceEntityAncestryIndex,
  entity: MovScriptWorkspaceIndexedEntity,
  entityKind: string,
): string | undefined {
  const ancestor = ancestorEntity(ancestryIndex, entity, entityKind)
  return ancestor ? idText(ancestor) : undefined
}

function parentByDir(entities: MovScriptWorkspaceIndexedEntity[], childPath: string): MovScriptWorkspaceIndexedEntity | undefined {
  const childDir = entityDir(childPath)
  return entities.find((entity) => childDir.startsWith(`${entityDir(entity.path)}/`))
}

function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function primaryRefKey(kind: string, id: unknown): string {
  return `${kind}:${String(id ?? '')}`
}

function primaryRefKeys(kind: string, ref: string | number): string[] {
  const value = String(ref)
  const keys = [primaryRefKey(kind, value)]
  const lastSegment = value.split('/').filter(Boolean).at(-1)
  if (lastSegment && lastSegment !== value) keys.push(primaryRefKey(kind, lastSegment))
  return keys
}

function shotCameraText(shot: MovScriptWorkspaceIndexedEntity): string {
  return [
    stringField(shot.record.shot_size),
    stringField(recordField(shot.record.camera)?.movement),
    stringField(recordField(shot.record.camera)?.angle),
  ].filter(Boolean).join(' · ') || stringField(shot.record.shot_kind) || 'shot'
}

function shotExpressionText(shot: MovScriptWorkspaceIndexedEntity): string {
  return stringField(shot.record.description ?? shot.record.summary ?? recordField(shot.record.expression)?.text ?? recordField(shot.record.expression)?.intent)
    ?? titleOf(shot, idText(shot))
}

function durationText(value: unknown): string {
  const duration = Number(value)
  return Number.isFinite(duration) && duration > 0 ? `${duration}s` : '待定'
}

function stillPositionForIndex(index: number): string {
  return ['0% 0%', '100% 0%', '0% 100%', '100% 100%'][index % 4] ?? '0% 0%'
}

function contentUnitType(contentUnit: MovScriptWorkspaceIndexedEntity | undefined): PreviewContentUnit['type'] {
  const type = stringField(contentUnit?.record.content_unit_type)
  if (type === 'keyframe_ref' || type === 'storyboard_ref' || type === 'audio_cue_ref' || type === 'scence_moment_ref' || type === 'scene_moment_ref' || type === 'expression_unit_ref') return type
  return 'expression_unit_ref'
}

function outputKindForContentUnit(contentUnit: MovScriptWorkspaceIndexedEntity | undefined): PreviewContentUnit['outputKind'] {
  const outputKind = stringField(contentUnit?.record.output_kind)
  if (outputKind === 'image' || outputKind === 'video' || outputKind === 'audio' || outputKind === 'text' || outputKind === 'metadata' || outputKind === 'storyboard') return outputKind
  const type = contentUnitType(contentUnit)
  if (type === 'keyframe_ref' || type === 'storyboard_ref') return 'image'
  if (type === 'audio_cue_ref') return 'audio'
  return 'video'
}

function momentSelectionState(expressionUnits: PreviewExpressionUnit[]): SelectionState {
  if (expressionUnits.some((expressionUnit) => expressionUnit.contentUnit.selectionState === 'stale')) return 'stale'
  if (expressionUnits.some((expressionUnit) => expressionUnit.contentUnit.selectionState === 'needs_candidate')) return 'needs_candidate'
  if (expressionUnits.some((expressionUnit) => expressionUnit.contentUnit.selectionState === 'selected')) return 'selected'
  return 'ready'
}

function settingRefsForMoment(
  _moment: MovScriptWorkspaceIndexedEntity,
  expressionUnits: PreviewExpressionUnit[],
  assets: MovScriptWorkspaceIndexedEntity[],
): string[] {
  const refs = new Set<string>()
  for (const expressionUnit of expressionUnits) {
    for (const asset of expressionUnit.assets) refs.add(asset.title)
  }
  if (refs.size === 0) {
    for (const asset of assets.slice(0, 3)) refs.add(nodeId(asset, 'asset'))
  }
  return [...refs]
}

function shotAssets(
  shot: MovScriptWorkspaceIndexedEntity,
  keyframes: MovScriptWorkspaceIndexedEntity[],
  assets: MovScriptWorkspaceIndexedEntity[],
): Array<{ title: string; status: 'ready' | 'missing' | 'locked' }> {
  const refs = [
    ...arrayField(shot.record.reference_asset_refs),
    ...keyframes.flatMap((keyframe) => arrayField(keyframe.record.reference_asset_refs)),
  ].map(String)
  const uniqueRefs = [...new Set(refs)]
  return uniqueRefs.map((ref) => ({
    title: ref.startsWith('asset/') ? ref : `asset/${ref}`,
    status: assets.some((asset) => String(asset.id ?? '') === ref || entityDir(asset.path) === ref || asset.path.startsWith(`${ref}/`)) ? 'ready' : 'missing',
  }))
}

function contentUnitIdForRuntimeDocument(path: string, explicitRef: string | undefined): string | undefined {
  const ref = explicitRef ?? entityDir(path)
  const id = pathSegmentAfter(ref, 'content_units')
  return id
}

function candidateTitle(candidate: ContentCandidateRecord, fallback: string): string {
  const explicitTitle = stringField(candidate.prompt_snapshot?.title)
    ?? stringField(candidate.producer?.title)
    ?? stringField(candidate.producer?.name)
  if (explicitTitle && !candidateTitleIsGeneric(explicitTitle)) return explicitTitle
  return readableCandidateTitleFallback(fallback)
}

function candidateOrdinalTitle(index: number): string {
  return `候选 ${index + 1}`
}

function candidateTitleIsGeneric(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === 'queued generation'
    || normalized === 'pending generation'
    || normalized === 'content unit image generation'
    || normalized === 'content unit video generation'
    || technicalCandidateIdPattern.test(normalized)
}

function readableCandidateTitleFallback(value: string): string {
  return technicalCandidateIdPattern.test(value.trim().toLowerCase()) ? '候选' : value
}

const technicalCandidateIdPattern = /^(canvas|resource|content)_candidate_[\w-]+$|^resource_\d+_[\w-]+$|^gen_(image|video)_\d+_\d+$/

function candidateModel(candidate: ContentCandidateRecord): string {
  return stringField(candidate.producer?.model_id)
    ?? stringField(candidate.producer?.model)
    ?? stringField(candidate.producer?.kind)
    ?? stringField(candidate.source)
    ?? 'runtime'
}

function candidateInputHash(candidate: ContentCandidateRecord, contentUnitId: string): string {
  return stringField(candidate.prompt_snapshot?.input_hash)
    ?? stringField(candidate.prompt_snapshot?.content_hash)
    ?? stringField(candidate.prompt_snapshot?.hash)
    ?? stringField(candidate.created_at)
    ?? contentUnitId
}

function candidateNote(candidate: ContentCandidateRecord): string {
  const output = firstCandidateOutput(candidate)
  return stringField(candidate.prompt_snapshot?.note)
    ?? stringField(candidate.prompt_snapshot?.summary)
    ?? stringField(output?.mime_type)
    ?? stringField(candidate.status)
    ?? 'Workspace runtime candidate.'
}

function candidateDecisionStatus(candidate: ContentCandidateRecord): string | undefined {
  const record = candidate as Record<string, unknown>
  return stringField(record.decision_status) ?? stringField(record.decisionStatus)
}

function candidateDecisionReason(candidate: ContentCandidateRecord): string | undefined {
  const record = candidate as Record<string, unknown>
  return stringField(record.decision_reason) ?? stringField(record.decisionReason)
}

function firstCandidateOutput(candidate: ContentCandidateRecord): Record<string, unknown> | undefined {
  return arrayField(candidate.outputs).filter(isRecord)[0]
}

function assetCandidateConfirmation(
  candidate: ContentCandidateRecord,
  selection: ContentSelectionRecord | undefined,
  candidateId: string,
): PreviewAssetCandidate['confirmation'] {
  if (selectionCandidateMatches(selection, candidateId)) return 'confirmed'
  if (candidate.status === 'failed' || candidate.status === 'canceled') return 'stale'
  return 'review'
}

function selectionCandidateMatches(selection: ContentSelectionRecord | undefined, candidateId: string): boolean {
  return selection?.candidate_id !== undefined && String(selection.candidate_id) === candidateId
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : Number.MAX_SAFE_INTEGER
}

function optionalNumberField(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function hierarchyNodeSourceRecord(input: {
  projectId: number
  type: HierarchyNodeType
  id: string
  title: string
  targetPath: string
  parentNode: HierarchyNode
}): Record<string, unknown> {
  const entityKind = sourceEntityKindForNodeType(input.type)
  const parentRefs = sourceParentRefs(input.targetPath, input.projectId)
  const base = pruneUndefinedRecord({
    schema: `movscript.${entityKind}.v1`,
    kind: entityKind,
    id: input.id,
    title: input.title,
    order: Date.now(),
    ...parentRefs,
  })
  switch (input.type) {
    case 'production':
      return {
        ...base,
        name: input.title,
        description: '',
      }
    case 'segment':
      return {
        ...base,
        segment_kind: 'emotional_function',
        summary: '',
      }
    case 'scene_moment':
      return {
        ...base,
        description: '',
        time_text: '',
        location_text: '',
        action_text: '',
        mood: '',
      }
    case 'shot':
      return {
        ...base,
        shot_kind: 'shot',
        description: '',
        timing: {},
        reference_asset_refs: [],
      }
    case 'storyboard':
      return {
        ...base,
        timeline: {},
        transition: {},
        setting_refs: [],
      }
    case 'keyframe':
      return {
        ...base,
        prompt_hint: '',
        asset_refs: [],
      }
    case 'expression_unit':
      return {
        ...base,
        slot_kind: 'visual',
        expression_kind: 'action',
        text: '',
        intent: '',
      }
    case 'audio_cue':
      return {
        ...base,
        cue_kind: 'sound_effect',
        timing: {},
        prompt_hint: '',
        asset_refs: [],
      }
    case 'setting':
      return {
        ...base,
        name: input.title,
        description: '',
      }
    case 'state':
      return {
        ...base,
        description: '',
        state_kind: 'default',
      }
    case 'asset':
      return {
        ...base,
        asset_kind: 'reference',
        prompt_hint: '',
      }
    case 'group':
      return base
  }
}

function sourceEntityKindForNodeType(type: HierarchyNodeType): string {
  return type === 'state' ? 'setting_state' : type
}

function sourceParentRefs(path: string, projectId: number): Record<string, unknown> {
  return pruneUndefinedRecord({
    project_id: projectId,
    production_id: pathSegmentAfter(path, 'productions'),
    segment_id: pathSegmentAfter(path, 'segments'),
    scene_moment_id: pathSegmentAfter(path, 'scene_moments'),
    expression_unit_id: pathSegmentAfter(path, 'expression_units'),
    setting_id: pathSegmentAfter(path, 'settings'),
    setting_state_id: pathSegmentAfter(path, 'states'),
  })
}

function pruneUndefinedRecord<T extends Record<string, unknown>>(record: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isContentCandidateRecord(value: unknown): value is ContentCandidateRecord {
  return isRecord(value) && value.schema === 'movscript.content_candidate.v1'
}

function isDecisionContextRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && value.schema === 'movscript.decision_context.v1'
    && value.target_kind === 'content_unit'
}

function normalizeContentSelectionRecord(value: Record<string, unknown>): ContentSelectionRecord {
  return {
    candidate_id: value.candidate_id as never,
    resource_id: resourceIdValue(value.resource_id),
    stream_id: streamIdValue(value.stream_id),
    artifact_ref: stringField(value.artifact_ref),
    stale_policy: value.stale_policy as never,
    reason: value.reason as never,
    selected_at: value.selected_at as never,
  }
}

function streamIdValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function resourceIdValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
