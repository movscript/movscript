import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type { MovScriptProductionWorkPlan } from '@movscript/interpreter'

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
  PreviewShot,
  SelectionState,
  ShotChildOption,
  ShotImpact,
  ShotWorkspaceDetails,
  StoryboardTimeline,
} from './sourceWorkspaceTypes'

export interface ContentSourceWorkspaceData {
  source: 'fixture' | 'workspace'
  hierarchyTree: HierarchyNode[]
  previewMoments: PreviewMoment[]
  expressionUnitsByMoment: Record<string, ExpressionUnit[]>
  audioCuesByMoment: Record<string, AudioCue[]>
  shotWorkspaceDetails: Record<string, ShotWorkspaceDetails>
  assetReferenceUnits: Record<string, PreviewAssetReferenceUnit>
  productionWorkPlan?: ProductionWorkPlanView
}

export interface CreatedContentSourceCandidate {
  id: string
  title: string
  model: string
  inputHash: string
  note: string
  resourceId: string
}

export interface WorkspacePreviewTimelineArtifact {
  schema: 'movscript.preview_timeline.v1'
  productionId: string | number
  productionPath: string
  items: WorkspacePreviewTimelineItem[]
}

export interface WorkspacePreviewTimelineItem {
  id: string
  itemType: 'segment' | 'scene_moment' | 'shot' | 'storyboard' | 'keyframe' | 'audio_cue' | 'expression_unit' | 'content_unit'
  entity: {
    entityKind: string
    id?: string | number
    path?: string
  }
  order: number
  parentId?: string
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
  producer?: Record<string, unknown>
  outputs?: unknown[]
  prompt_snapshot?: Record<string, unknown>
  created_at?: string
}

export interface ContentSelectionRecord {
  candidate_id?: string | number
  resource_id?: string | number
  stale_policy?: string
  reason?: string
  selected_at?: string
  target?: Record<string, unknown>
}

export interface ContentSourceWorkspaceSnapshot {
  indexDocuments: WorkspaceDocument[]
  settings: MovScriptWorkspaceIndexedEntity[]
  settingStates: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  productions: MovScriptWorkspaceIndexedEntity[]
  segments: MovScriptWorkspaceIndexedEntity[]
  sceneMoments: MovScriptWorkspaceIndexedEntity[]
  shots: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  audioCues: MovScriptWorkspaceIndexedEntity[]
  contentUnits: MovScriptWorkspaceIndexedEntity[]
  previewTimelines: WorkspacePreviewTimelineArtifact[]
  productionWorkPlan?: MovScriptProductionWorkPlan | ProductionWorkPlanView
}

export interface ContentSourceWorkspaceCandidateCreatePlan {
  contentUnitId: string
  candidateId: string
  source: 'ai_generate' | 'resource_library'
  status: 'queued' | 'imported'
  producer: Record<string, unknown>
  outputs: ContentSourceWorkspaceCandidateOutput[]
  promptSnapshot: Record<string, unknown>
  createdAt: string
}

export interface ContentSourceWorkspaceCandidateOutput {
  kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
  resource_id: string | number
  mime_type?: string
  width?: number
  height?: number
  duration_sec?: number
  metadata?: Record<string, unknown>
}

export interface ContentSourceWorkspaceEditPromptPatch {
  targetPath: string
  editPrompt: { text: string }
}

export interface ContentSourceWorkspaceExpressionUnitPatch {
  targetPath: string
  patch: {
    title: string
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
    shotRef?: string
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
  const shots = input.shots
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

  const contentUnitsByPrimaryRef = groupContentUnitsByPrimaryRef(contentUnits)
  const candidateRecordsByContentUnitId = groupContentCandidateRecordsByContentUnitId(input.indexDocuments)
  const selectionRecordsByContentUnitId = groupSelectionRecordsByContentUnitId(input.indexDocuments)
  const selectionByContentUnitId = buildSelectionStateByContentUnitId(contentUnits, selectionRecordsByContentUnitId)
  const previewMoments = buildPreviewMoments({
    productions,
    segments,
    sceneMoments,
    shots,
    storyboards,
    keyframes,
    assets,
    previewTimelines,
    contentUnitsByPrimaryRef,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
    selectionByContentUnitId,
  })
  const expressionUnitsByMoment = buildExpressionUnitsByMoment(expressionUnits)
  const audioCuesByMoment = buildAudioCuesByMoment(audioCues)
  const shotWorkspaceDetails = buildShotWorkspaceDetails({
    shots,
    storyboards,
    keyframes,
    assets,
    settings,
    contentUnitsByPrimaryRef,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
    selectionByContentUnitId,
  })
  const assetReferenceUnits = buildAssetReferenceUnits({
    assets,
    settings,
    settingStates,
    shots,
    storyboards,
    keyframes,
    contentUnits,
    contentUnitsByPrimaryRef,
    candidateRecordsByContentUnitId,
    selectionRecordsByContentUnitId,
    selectionByContentUnitId,
  })

  return {
    source: 'workspace',
    hierarchyTree: buildHierarchyTree({
      settings,
      settingStates,
      assets,
      productions,
      segments,
      sceneMoments,
      shots,
      storyboards,
      keyframes,
      expressionUnits,
      audioCues,
      assetReferenceUnits,
    }),
    previewMoments,
    expressionUnitsByMoment,
    audioCuesByMoment,
    shotWorkspaceDetails,
    assetReferenceUnits,
    productionWorkPlan,
  }
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
      return '刷新内容单元'
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
  resourceId?: string
}): {
  contentUnitId: string
  candidateId: string
  resourceId?: string
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
  resourceId?: string | number
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
    resourceId: idValue(firstCandidateOutput(record)?.resource_id) ?? '',
  }
}

export function buildContentSourceWorkspaceEditPromptPatch(input: {
  targetPath: string
  text: string
}): ContentSourceWorkspaceEditPromptPatch {
  return {
    targetPath: input.targetPath,
    editPrompt: { text: input.text },
  }
}

export function buildContentSourceWorkspaceExpressionUnitPatch(input: {
  targetPath: string
  title: string
  kind: string
  text: string
  summary: string
  speaker?: string
  note?: string
}): ContentSourceWorkspaceExpressionUnitPatch {
  return {
    targetPath: input.targetPath,
    patch: {
      title: input.title,
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
  shotRef?: string
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
      shotRef: input.shotRef,
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
      shots: moment.shots.map((shot) => (
        shot.contentUnit.id === contentUnitId
          ? {
            ...shot,
            contentUnit: {
              ...shot.contentUnit,
              editPrompt: text,
            },
          }
          : shot
      )),
    })),
    shotWorkspaceDetails: Object.fromEntries(
      Object.entries(data.shotWorkspaceDetails).map(([shotId, workspace]) => [
        shotId,
        {
          ...workspace,
          keyframes: updateShotChildContentUnitPrompt(workspace.keyframes, contentUnitId, text),
          storyboards: updateShotChildContentUnitPrompt(workspace.storyboards, contentUnitId, text),
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
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      shots: moment.shots.map((shot) => (
        shot.contentUnit.id === contentUnitId
          ? {
            ...shot,
            contentUnit: selectPreviewContentUnitCandidate(shot.contentUnit, candidateId),
          }
          : shot
      )),
    })),
    shotWorkspaceDetails: Object.fromEntries(
      Object.entries(data.shotWorkspaceDetails).map(([shotId, workspace]) => [
        shotId,
        {
          ...workspace,
          keyframes: updateShotChildContentUnitSelection(workspace.keyframes, contentUnitId, candidateId),
          storyboards: updateShotChildContentUnitSelection(workspace.storyboards, contentUnitId, candidateId),
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
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      shots: moment.shots.map((shot) => (
        shot.contentUnit.id === contentUnitId
          ? {
            ...shot,
            contentUnit: appendPreviewCandidate(shot.contentUnit, candidate),
          }
          : shot
      )),
    })),
    shotWorkspaceDetails: Object.fromEntries(
      Object.entries(data.shotWorkspaceDetails).map(([shotId, workspace]) => [
        shotId,
        {
          ...workspace,
          keyframes: updateShotChildContentUnitCandidate(workspace.keyframes, contentUnitId, candidate),
          storyboards: updateShotChildContentUnitCandidate(workspace.storyboards, contentUnitId, candidate),
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

function updateShotChildContentUnitPrompt(
  items: ShotChildOption[],
  contentUnitId: string,
  text: string,
): ShotChildOption[] {
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

function updateShotChildContentUnitSelection(
  items: ShotChildOption[],
  contentUnitId: string,
  candidateId: string,
): ShotChildOption[] {
  return items.map((item) => item.contentUnit?.id === contentUnitId
    ? {
      ...item,
      contentUnit: selectPreviewContentUnitCandidate(item.contentUnit, candidateId),
    }
    : item)
}

function updateShotChildContentUnitCandidate(
  items: ShotChildOption[],
  contentUnitId: string,
  candidate: CreatedContentSourceCandidate,
): ShotChildOption[] {
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
  shots: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  expressionUnits: MovScriptWorkspaceIndexedEntity[]
  audioCues: MovScriptWorkspaceIndexedEntity[]
  assetReferenceUnits: Record<string, PreviewAssetReferenceUnit>
}): HierarchyNode[] {
  return [
    {
      id: 'settings_root',
      type: 'group',
      title: 'Settings',
      path: 'settings/',
      children: sortEntities(input.settings).map((setting) => {
        const settingDir = entityDir(setting.path)
        const states = childEntities(input.settingStates, settingDir, 'states')
        return entityNode(setting, 'setting', {
          children: sortEntities(states).map((state) => {
            const stateDir = entityDir(state.path)
            const stateAssets = childEntities(input.assets, stateDir, 'assets')
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
        const productionDir = entityDir(production.path)
        const segments = childEntities(input.segments, productionDir, 'segments')
        return entityNode(production, 'production', {
          children: sortEntities(segments).map((segment) => {
            const segmentDir = entityDir(segment.path)
            const sceneMoments = childEntities(input.sceneMoments, segmentDir, 'scene_moments')
            return entityNode(segment, 'segment', {
              children: sortEntities(sceneMoments).map((sceneMoment) => {
                const momentDir = entityDir(sceneMoment.path)
                const shots = childEntities(input.shots, momentDir, 'shots')
                const expressions = childEntities(input.expressionUnits, momentDir, 'expression_units')
                const audioCues = childEntities(input.audioCues, momentDir, 'audio_cues')
                const momentId = idText(sceneMoment)
                const shotGroup: HierarchyNode = {
                  id: `${nodeId(sceneMoment, 'scene_moment')}_shots_group`,
                  type: 'group',
                  title: 'Shots',
                  path: `${momentDir}/shots`,
                  momentId,
                  children: sortEntities(shots).map((shot) => {
                    const shotDir = entityDir(shot.path)
                    const shotId = idText(shot)
                    const storyboards = childEntities(input.storyboards, shotDir, 'storyboards')
                    const keyframes = childEntities(input.keyframes, shotDir, 'keyframes')
                    return entityNode(shot, 'shot', {
                      momentId,
                      shotId,
                      children: [
                        {
                          id: `${nodeId(shot, 'shot')}_storyboards_group`,
                          type: 'group',
                          title: 'Storyboards',
                          path: `${shotDir}/storyboards`,
                          momentId,
                          shotId,
                          children: sortEntities(storyboards).map((storyboard) => entityNode(storyboard, 'storyboard', { momentId, shotId })),
                        },
                        {
                          id: `${nodeId(shot, 'shot')}_keyframes_group`,
                          type: 'group',
                          title: 'Keyframes',
                          path: `${shotDir}/keyframes`,
                          momentId,
                          shotId,
                          children: sortEntities(keyframes).map((keyframe) => entityNode(keyframe, 'keyframe', { momentId, shotId })),
                        },
                      ],
                    })
                  }),
                }
                const expressionGroup: HierarchyNode = {
                  id: `${nodeId(sceneMoment, 'scene_moment')}_expression_group`,
                  type: 'group',
                  title: 'Expression Units',
                  path: `${momentDir}/expression_units`,
                  momentId,
                  children: sortEntities(expressions).map((expression) => entityNode(expression, 'expression_unit', { momentId })),
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
                  children: [shotGroup, expressionGroup, audioCueGroup],
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
  shots: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  previewTimelines: WorkspacePreviewTimelineArtifact[]
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
  candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
  selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
  selectionByContentUnitId: Map<string, SelectionState>
}): PreviewMoment[] {
  return orderedSceneMoments(input.sceneMoments, input.previewTimelines).map((moment, momentIndex) => {
    const momentDir = entityDir(moment.path)
    const segment = parentByDir(input.segments, moment.path)
    const production = segment ? parentByDir(input.productions, segment.path) : undefined
    const shots = orderedChildEntitiesForTimelineParent(input.shots, input.previewTimelines, timelineItemIdForEntity(moment), 'shot')
    const momentShots = (shots.length > 0 ? shots : sortEntities(childEntities(input.shots, momentDir, 'shots'))).map((shot, shotIndex) =>
      previewShot(shot, shotIndex, moment, input),
    )
    return {
      id: idText(moment),
      title: titleOf(moment, `Scene Moment ${momentIndex + 1}`),
      path: entityDir(moment.path),
      selectionState: momentSelectionState(momentShots),
      priority: momentIndex < 1 ? '高优先级' : momentIndex < 3 ? '中优先级' : '低优先级',
      production: production ? titleOf(production, idText(production)) : '',
      segment: segment ? titleOf(segment, idText(segment)) : '',
      settings: settingRefsForMoment(moment, momentShots, input.assets),
      shots: momentShots,
    }
  })
}

function previewShot(
  shot: MovScriptWorkspaceIndexedEntity,
  shotIndex: number,
  moment: MovScriptWorkspaceIndexedEntity,
  input: {
    storyboards: MovScriptWorkspaceIndexedEntity[]
    keyframes: MovScriptWorkspaceIndexedEntity[]
    assets: MovScriptWorkspaceIndexedEntity[]
    contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): PreviewShot {
  const shotDir = entityDir(shot.path)
  const storyboards = sortEntities(childEntities(input.storyboards, shotDir, 'storyboards'))
  const keyframes = sortEntities(childEntities(input.keyframes, shotDir, 'keyframes'))
  const primaryStoryboard = storyboards[0]
  const primaryKeyframe = keyframes[0]
  const contentUnit =
    contentUnitForEntity(input.contentUnitsByPrimaryRef, 'shot', shot)
    ?? (primaryStoryboard ? contentUnitForEntity(input.contentUnitsByPrimaryRef, 'storyboard', primaryStoryboard) : undefined)
    ?? (primaryKeyframe ? contentUnitForEntity(input.contentUnitsByPrimaryRef, 'keyframe', primaryKeyframe) : undefined)
  return {
    id: idText(shot),
    title: titleOf(shot, `Shot ${shotIndex + 1}`),
    camera: shotCameraText(shot),
    duration: durationText(recordField(shot.record.timing)?.duration_sec ?? recordField(shot.record.timing)?.duration ?? recordField(contentUnit?.record.model_intent)?.duration_sec),
    expression: shotExpressionText(shot),
    stillPosition: stillPositionForIndex(shotIndex),
    path: entityDir(shot.path),
    keyframes: keyframes.map((keyframe) => idText(keyframe)),
    assets: shotAssets(shot, keyframes, input.assets),
    storyboard: primaryStoryboard ? nodeId(primaryStoryboard, 'storyboard') : '',
    contentUnit: previewContentUnit(contentUnit, shot, moment, primaryStoryboard, keyframes, input),
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
  shot: MovScriptWorkspaceIndexedEntity,
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
  const id = contentUnit ? idText(contentUnit) : `cu_${idText(shot)}`
  const selection = input.selectionRecordsByContentUnitId.get(id)
  return {
    id,
    type,
    outputKind: outputKindForContentUnit(contentUnit),
    path: contentUnit?.path ?? `content_units/${id}/content_unit.json`,
    editPrompt: editPromptText(contentUnit) ?? '',
    sceneMomentRef: `scene_moment/${idText(moment)}`,
    shotId: idText(shot),
    storyboardRef: storyboard ? nodeId(storyboard, 'storyboard') : '',
    keyframeRefs: keyframes.map((keyframe) => idText(keyframe)),
    selectionState: input.selectionByContentUnitId.get(id) ?? selectionStateFromSourceSelection(selection, contentUnit),
    candidates: previewCandidatesForContentUnit(id, input.candidateRecordsByContentUnitId.get(id) ?? [], selection),
  }
}

function buildExpressionUnitsByMoment(expressionUnits: MovScriptWorkspaceIndexedEntity[]): Record<string, ExpressionUnit[]> {
  const output: Record<string, ExpressionUnit[]> = {}
  for (const expression of sortEntities(expressionUnits)) {
    const momentId = pathSegmentAfter(expression.path, 'scene_moments') ?? ''
    const item = {
      id: idText(expression),
      title: titleOf(expression, stringField(expression.record.text) ?? idText(expression)),
      path: expression.path,
      kind: stringField(expression.record.expression_kind ?? expression.record.kind) ?? 'expression',
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

function buildAudioCuesByMoment(audioCues: MovScriptWorkspaceIndexedEntity[]): Record<string, AudioCue[]> {
  const output: Record<string, AudioCue[]> = {}
  for (const audioCue of sortEntities(audioCues)) {
    const momentId = pathSegmentAfter(audioCue.path, 'scene_moments') ?? ''
    const item = {
      id: idText(audioCue),
      title: titleOf(audioCue, idText(audioCue)),
      path: audioCue.path,
      cueKind: stringField(audioCue.record.cue_kind ?? audioCue.record.kind) ?? 'sound_effect',
      promptHint: stringField(audioCue.record.prompt_hint) ?? '',
      shotRef: stringField(audioCue.record.shot_ref),
      storyboardRef: stringField(audioCue.record.storyboard_ref),
      timing: recordField(audioCue.record.timing) ?? {},
      assetRefs: arrayField(audioCue.record.asset_refs).map(String),
      sceneMomentId: momentId,
    }
    output[momentId] = [...(output[momentId] ?? []), item]
  }
  return output
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

function buildShotWorkspaceDetails(input: {
  shots: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
  settings: MovScriptWorkspaceIndexedEntity[]
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
  candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
  selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
  selectionByContentUnitId: Map<string, SelectionState>
}): Record<string, ShotWorkspaceDetails> {
  return Object.fromEntries(input.shots.map((shot) => {
    const shotDir = entityDir(shot.path)
    const keyframes = sortEntities(childEntities(input.keyframes, shotDir, 'keyframes'))
    const storyboards = sortEntities(childEntities(input.storyboards, shotDir, 'storyboards'))
    const refs = shotAssets(shot, keyframes, input.assets)
    const assets = refs.map((ref): EditableRef => ({
      id: ref.title,
      title: ref.title.replace(/^asset\//, ''),
      owner: ref.title,
      status: ref.status === 'missing' ? 'missing' : ref.status === 'locked' ? 'locked' : 'current',
      summary: ref.status === 'missing' ? '该素材引用尚未在 setting/state asset 中解析。' : '来自 workspace source 的素材引用。',
      downstream: [idText(shot)],
    }))
    const settings = input.settings.slice(0, 4).map((setting): EditableRef => ({
      id: nodeId(setting, 'setting'),
      title: titleOf(setting, idText(setting)),
      owner: setting.path,
      status: 'current',
      summary: stringField(setting.record.summary ?? setting.record.description ?? setting.record.prompt_hint) ?? 'Workspace setting context.',
      downstream: [idText(shot)],
    }))
    return [idText(shot), {
      settings,
      assets,
      keyframes: keyframes.map((keyframe) => shotChildOption(keyframe, 'keyframe', shot, input)),
      storyboards: storyboards.map((storyboard) => shotChildOption(storyboard, 'storyboard', shot, input)),
      impacts: [] as ShotImpact[],
    }]
  }))
}

function buildAssetReferenceUnits(input: {
  assets: MovScriptWorkspaceIndexedEntity[]
  settings: MovScriptWorkspaceIndexedEntity[]
  settingStates: MovScriptWorkspaceIndexedEntity[]
  shots: MovScriptWorkspaceIndexedEntity[]
  storyboards: MovScriptWorkspaceIndexedEntity[]
  keyframes: MovScriptWorkspaceIndexedEntity[]
  contentUnits: MovScriptWorkspaceIndexedEntity[]
  contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
  candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
  selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
  selectionByContentUnitId: Map<string, SelectionState>
}): Record<string, PreviewAssetReferenceUnit> {
  return Object.fromEntries(input.assets.map((asset) => {
    const contentUnit = contentUnitForEntity(input.contentUnitsByPrimaryRef, 'asset', asset)
    const contentUnitId = contentUnit ? idText(contentUnit) : `cu_${idText(asset)}`
    const ownerState = parentByDir(input.settingStates, asset.path)
    const ownerSetting = ownerState ? parentByDir(input.settings, ownerState.path) : undefined
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
      editPrompt: editPromptText(contentUnit) ?? stringField(asset.record.prompt_hint) ?? '',
      usage: `${titleOf(asset, idText(asset))} 作为 setting/state 下的素材参考输入。`,
      lockPolicy: '选择变化后，下游引用该 asset_ref 的内容单元需要重新检查。',
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
    shots: MovScriptWorkspaceIndexedEntity[]
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
        shotId: owner?.shotId ?? '',
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
    shots: MovScriptWorkspaceIndexedEntity[]
    storyboards: MovScriptWorkspaceIndexedEntity[]
    keyframes: MovScriptWorkspaceIndexedEntity[]
  },
): { nodeId: string; momentId: string; shotId: string } | undefined {
  const shotRef = primaryRefIdsForContentUnitRecord(contentUnit.record, 'shot')[0]
  if (shotRef) {
    const shot = input.shots.find((item) => entityMatchesRef(item, shotRef, 'shot'))
    return {
      nodeId: shot ? idText(shot) : shotRef,
      momentId: shot ? pathSegmentAfter(shot.path, 'scene_moments') ?? '' : '',
      shotId: shot ? idText(shot) : shotRef,
    }
  }
  const storyboardRef = primaryRefIdsForContentUnitRecord(contentUnit.record, 'storyboard')[0]
  if (storyboardRef) {
    const storyboard = input.storyboards.find((item) => entityMatchesRef(item, storyboardRef, 'storyboard'))
    return {
      nodeId: storyboard ? nodeId(storyboard, 'storyboard') : `storyboard/${storyboardRef}`,
      momentId: storyboard ? pathSegmentAfter(storyboard.path, 'scene_moments') ?? '' : '',
      shotId: storyboard ? pathSegmentAfter(storyboard.path, 'shots') ?? '' : '',
    }
  }
  const keyframeRef = primaryRefIdsForContentUnitRecord(contentUnit.record, 'keyframe')[0]
  if (keyframeRef) {
    const keyframe = input.keyframes.find((item) => entityMatchesRef(item, keyframeRef, 'keyframe'))
    return {
      nodeId: keyframe ? idText(keyframe) : keyframeRef,
      momentId: keyframe ? pathSegmentAfter(keyframe.path, 'scene_moments') ?? '' : '',
      shotId: keyframe ? pathSegmentAfter(keyframe.path, 'shots') ?? '' : '',
    }
  }
  return undefined
}

function shotChildOption(
  entity: MovScriptWorkspaceIndexedEntity,
  primaryKind: 'keyframe' | 'storyboard',
  shot: MovScriptWorkspaceIndexedEntity,
  input: {
    contentUnitsByPrimaryRef: Map<string, MovScriptWorkspaceIndexedEntity[]>
    candidateRecordsByContentUnitId: Map<string, ContentCandidateRecord[]>
    selectionRecordsByContentUnitId: Map<string, ContentSelectionRecord>
    selectionByContentUnitId: Map<string, SelectionState>
  },
): ShotChildOption {
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
        sceneMomentRef: `scene_moment/${pathSegmentAfter(shot.path, 'scene_moments') ?? ''}`,
        shotId: idText(shot),
        storyboardRef: primaryKind === 'storyboard' ? nodeId(entity, 'storyboard') : '',
        keyframeRefs: primaryKind === 'keyframe' ? [idText(entity)] : [],
        selectionState: input.selectionByContentUnitId.get(contentUnitId) ?? selectionStateFromSourceSelection(selection, contentUnit),
        candidates: previewCandidatesForContentUnit(contentUnitId, input.candidateRecordsByContentUnitId.get(contentUnitId) ?? [], selection),
      } satisfies PreviewContentUnit,
    } : {}),
  }
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
    if (!document.path.endsWith('/content_candidate.json') || !isContentCandidateRecord(document.data)) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, document.data.content_unit_ref)
    if (!contentUnitId) continue
    output.set(contentUnitId, [...(output.get(contentUnitId) ?? []), document.data])
  }
  for (const [contentUnitId, candidates] of output.entries()) {
    output.set(contentUnitId, candidates.sort((left, right) => (stringField(right.created_at) ?? '').localeCompare(stringField(left.created_at) ?? '')))
  }
  return output
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
    return {
      id,
      title: candidateTitle(candidate, id),
      model: candidateModel(candidate),
      inputHash: candidateInputHash(candidate, contentUnitId),
      selected: selectionCandidateMatches(selection, id),
      note: candidateNote(candidate),
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
    return {
      id,
      title: candidateTitle(candidate, id),
      model: candidateModel(candidate),
      inputHash: candidateInputHash(candidate, contentUnitId),
      selected: selectionCandidateMatches(selection, id),
      note: candidateNote(candidate),
      resourceId: idValue(firstCandidateOutput(candidate)?.resource_id) ?? '',
      confirmation: assetCandidateConfirmation(candidate, selection, id),
    }
  })
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

function primaryKindForContentUnitType(type: string | undefined): 'asset' | 'keyframe' | 'storyboard' | 'scene_moment' | 'shot' | undefined {
  if (type === 'asset_ref') return 'asset'
  if (type === 'keyframe_ref') return 'keyframe'
  if (type === 'storyboard_ref') return 'storyboard'
  if (type === 'scence_moment_ref' || type === 'scene_moment_ref') return 'scene_moment'
  if (type === 'shot_ref') return 'shot'
  return undefined
}

function primaryRefIdsForContentUnitRecord(record: Record<string, unknown>, kind: string): string[] {
  switch (kind) {
    case 'asset':
      return compactStrings(record.asset_ref)
    case 'keyframe':
      return compactStrings(record.keyframe_ref)
    case 'storyboard':
      return compactStrings(record.storyboard_ref)
    case 'scene_moment':
      return compactStrings(record.scene_moment_ref, record.scence_moment_ref)
    case 'shot':
      return compactStrings(record.shot_ref)
    default:
      return []
  }
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return [String(value)]
    if (typeof value === 'string' && value.trim()) return [value.trim()]
    return []
  })
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
  return type === 'production' || type === 'segment' || type === 'scene_moment' || type === 'shot' || type === 'storyboard'
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
  if (type === 'keyframe_ref' || type === 'storyboard_ref' || type === 'scence_moment_ref' || type === 'scene_moment_ref') return type
  return 'shot_video'
}

function outputKindForContentUnit(contentUnit: MovScriptWorkspaceIndexedEntity | undefined): PreviewContentUnit['outputKind'] {
  const outputKind = stringField(contentUnit?.record.output_kind)
  if (outputKind === 'image' || outputKind === 'video' || outputKind === 'storyboard') return outputKind
  return contentUnitType(contentUnit) === 'keyframe_ref' ? 'image' : 'video'
}

function momentSelectionState(shots: PreviewShot[]): SelectionState {
  if (shots.some((shot) => shot.contentUnit.selectionState === 'stale')) return 'stale'
  if (shots.some((shot) => shot.contentUnit.selectionState === 'needs_candidate')) return 'needs_candidate'
  if (shots.some((shot) => shot.contentUnit.selectionState === 'selected')) return 'selected'
  return 'ready'
}

function settingRefsForMoment(
  _moment: MovScriptWorkspaceIndexedEntity,
  shots: PreviewShot[],
  assets: MovScriptWorkspaceIndexedEntity[],
): string[] {
  const refs = new Set<string>()
  for (const shot of shots) {
    for (const asset of shot.assets) refs.add(asset.title)
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
  return stringField(candidate.prompt_snapshot?.title)
    ?? stringField(candidate.producer?.title)
    ?? stringField(candidate.producer?.name)
    ?? fallback
}

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
        description: '',
        timing: {},
        camera: {},
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
    shot_id: pathSegmentAfter(path, 'shots'),
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
    resource_id: value.resource_id as never,
    stale_policy: value.stale_policy as never,
    reason: value.reason as never,
    selected_at: value.selected_at as never,
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
