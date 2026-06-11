import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'

import {
  createElectronMovScriptWorkspaceFileRepository,
  createElectronMovScriptWorkspaceService,
  interpretElectronMovScriptWorkspace,
} from '@/shared/infrastructure/workspaceDomainRepository'

import {
  audioCuesByMoment as fixtureAudioCuesByMoment,
  assetReferenceUnits as fixtureAssetReferenceUnits,
  expressionUnitsByMoment as fixtureExpressionUnitsByMoment,
  hierarchyTree as fixtureHierarchyTree,
  previewMoments as fixturePreviewMoments,
  shotWorkspaceDetails as fixtureShotWorkspaceDetails,
} from './sourceWorkspaceFixtures'
import type {
  AudioCue,
  EditableRef,
  ExpressionUnit,
  HierarchyTransition,
  HierarchyNode,
  HierarchyNodeType,
  PreviewAssetCandidate,
  PreviewAssetReferenceUnit,
  PreviewCandidate,
  PreviewContentUnit,
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
}

export interface CreatedContentSourceCandidate {
  id: string
  title: string
  model: string
  inputHash: string
  note: string
  resourceId: string
}

interface WorkspacePreviewTimelineArtifact {
  schema: 'movscript.preview_timeline.v1'
  productionId: string | number
  productionPath: string
  items: WorkspacePreviewTimelineItem[]
}

interface WorkspacePreviewTimelineItem {
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

interface WorkspaceDocument {
  path: string
  data: unknown
}

interface ContentCandidateRecord {
  id?: string | number
  content_unit_ref?: string
  source?: string
  status?: string
  producer?: Record<string, unknown>
  outputs?: unknown[]
  prompt_snapshot?: Record<string, unknown>
  created_at?: string
}

interface ContentSelectionRecord {
  candidate_id?: string | number
  resource_id?: string | number
  stale_policy?: string
  reason?: string
  selected_at?: string
  target?: Record<string, unknown>
}

export const fixtureContentSourceWorkspaceData: ContentSourceWorkspaceData = {
  source: 'fixture',
  hierarchyTree: fixtureHierarchyTree,
  previewMoments: fixturePreviewMoments,
  expressionUnitsByMoment: fixtureExpressionUnitsByMoment,
  audioCuesByMoment: fixtureAudioCuesByMoment,
  shotWorkspaceDetails: fixtureShotWorkspaceDetails,
  assetReferenceUnits: fixtureAssetReferenceUnits,
}

export async function loadContentSourceWorkspaceData(projectId: number): Promise<ContentSourceWorkspaceData> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const [
    index,
    settings,
    settingStates,
    assetsResult,
    context,
  ] = await Promise.all([
    service.loadIndex(),
    service.querySettings({ limit: 500 }),
    service.queryEntities({ entityKind: 'setting_state', limit: 500 }),
    service.queryAssets({ limit: 500 }),
    service.queryProductionContext({
      include: ['productions', 'segments', 'scene_moments', 'shots', 'storyboards', 'audio_cues', 'expression_units', 'content_units', 'keyframes'],
      limit: 1000,
    }),
  ])

  const productions = context.productions ?? []
  const segments = context.segments ?? []
  const sceneMoments = context.scene_moments ?? []
  const shots = context.shots ?? []
  const storyboards = context.storyboards ?? []
  const expressionUnits = context.expression_units ?? []
  const audioCues = context.audio_cues ?? []
  const contentUnits = context.content_units ?? []
  const keyframes = context.keyframes ?? []
  const assets = assetsResult.assets
  const previewTimelines = (await Promise.all(
    productions
      .map((production) => idText(production))
      .map((productionId) => service.readPreviewTimeline(productionId) as Promise<WorkspacePreviewTimelineArtifact | undefined>),
  )).filter(isDefined)

  if (productions.length === 0 && sceneMoments.length === 0 && settings.length === 0) {
    throw new Error('content_source_workspace_empty')
  }

  const contentUnitsByPrimaryRef = groupContentUnitsByPrimaryRef(contentUnits)
  const candidateRecordsByContentUnitId = groupContentCandidateRecordsByContentUnitId(index.documents)
  const selectionRecordsByContentUnitId = groupSelectionRecordsByContentUnitId(index.documents)
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
  if (previewMoments.length === 0 || previewMoments.every((moment) => moment.shots.length === 0)) {
    throw new Error('content_source_workspace_no_shots')
  }
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
  }
}

export async function selectContentSourceWorkspaceCandidate(input: {
  projectId: number
  contentUnitId: string
  candidateId: string
  resourceId?: string
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.selectContentUnitCandidate({
    contentUnitId: input.contentUnitId,
    candidateId: input.candidateId,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    reason: 'content_source_workspace_selection',
  })
}

export async function createContentSourceWorkspaceCandidate(input: {
  projectId: number
  contentUnitId: string
  outputKind: 'image' | 'video' | 'audio' | 'text' | 'storyboard'
  promptText?: string
}): Promise<CreatedContentSourceCandidate> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  const createdAt = new Date().toISOString()
  const candidateId = `queued_${Date.now()}`
  const result = await service.createContentCandidate({
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
  })
  const record = result.record as ContentCandidateRecord
  const id = idValue(record.id) ?? candidateId
  return {
    id,
    title: candidateTitle(record, id),
    model: candidateModel(record),
    inputHash: candidateInputHash(record, input.contentUnitId),
    note: candidateNote(record),
    resourceId: idValue(firstCandidateOutput(record)?.resource_id) ?? '',
  }
}

export async function updateContentSourceWorkspaceEditPrompt(input: {
  projectId: number
  targetPath: string
  text: string
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateContentUnitEditPrompt({
    targetPath: input.targetPath,
    editPrompt: { text: input.text },
  })
}

export async function updateContentSourceWorkspaceExpressionUnit(input: {
  projectId: number
  targetPath: string
  title: string
  kind: string
  text: string
  summary: string
  speaker?: string
  note?: string
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateExpressionUnitSource({
    targetPath: input.targetPath,
    patch: {
      title: input.title,
      expressionKind: input.kind,
      text: input.text,
      intent: input.summary,
      speaker: input.speaker,
      note: input.note,
    },
  })
}

export async function updateContentSourceWorkspaceAudioCue(input: {
  projectId: number
  targetPath: string
  title: string
  cueKind: string
  promptHint: string
  shotRef?: string
  storyboardRef?: string
  timing: Record<string, unknown>
  assetRefs: string[]
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateAudioCueSource({
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
  })
}

export async function updateContentSourceWorkspaceTransition(input: {
  projectId: number
  targetPath: string
  transition: HierarchyTransition
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateEntityTransition({
    targetPath: input.targetPath,
    transition: {
      in: input.transition.in,
      out: input.transition.out,
      notes: input.transition.notes,
    },
  })
}

export async function updateContentSourceWorkspaceStoryboardTimeline(input: {
  projectId: number
  targetPath: string
  timeline: StoryboardTimeline
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateStoryboardTimeline({
    targetPath: input.targetPath,
    timeline: {
      caption: input.timeline.caption,
      gap_after_sec: input.timeline.gapAfterSec,
      duration_sec: input.timeline.durationSec,
    },
  })
}

export async function createContentSourceWorkspaceHierarchyNode(input: {
  projectId: number
  type: HierarchyNodeType
  id: string
  title: string
  targetPath: string
  parentNode: HierarchyNode
}): Promise<void> {
  const repository = createElectronMovScriptWorkspaceFileRepository({ projectId: input.projectId })
  const record = hierarchyNodeSourceRecord(input)
  await repository.write({
    path: input.targetPath,
    content: `${JSON.stringify(record, null, 2)}\n`,
  })
}

export async function syncContentSourceWorkspace(input: {
  projectId: number
}): Promise<void> {
  await interpretElectronMovScriptWorkspace({ projectId: input.projectId })
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
      downstream: [],
    }]
  }))
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
    for (const ref of editPromptRefs(contentUnit).filter((item) => item.kind === primaryKind)) {
      const key = primaryRefKey(ref.kind, ref.id)
      output.set(key, [...(output.get(key) ?? []), contentUnit])
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
    if (!document.path.endsWith('/selection.json') || !isContentSelectionRecord(document.data)) continue
    const target = recordField(document.data.target)
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringField(target?.ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, document.data)
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

function primaryKindForContentUnitType(type: string | undefined): 'asset' | 'keyframe' | 'storyboard' | 'shot' | undefined {
  if (type === 'asset_ref') return 'asset'
  if (type === 'keyframe_ref') return 'keyframe'
  if (type === 'storyboard_ref') return 'storyboard'
  if (type === 'shot_ref') return 'shot'
  return undefined
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
  if (type === 'keyframe_ref' || type === 'storyboard_ref') return type
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

function isContentSelectionRecord(value: unknown): value is ContentSelectionRecord {
  return isRecord(value) && value.schema === 'movscript.selection.v1'
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
