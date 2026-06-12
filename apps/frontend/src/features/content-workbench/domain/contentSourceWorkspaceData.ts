import {
  buildContentSourceWorkspaceAudioCuePatch,
  buildContentSourceWorkspaceCandidateCreatePlan,
  buildContentSourceWorkspaceData,
  buildContentSourceWorkspaceEditPromptPatch,
  buildContentSourceWorkspaceExpressionUnitPatch,
  buildContentSourceWorkspaceHierarchyNodeRecord,
  buildContentSourceWorkspaceSelectionPatch,
  buildContentSourceWorkspaceStoryboardTimelinePatch,
  buildContentSourceWorkspaceTransitionPatch,
  createdContentSourceCandidateFromRecord,
  type ContentCandidateRecord,
  type ContentSourceWorkspaceData,
  type CreatedContentSourceCandidate,
  type HierarchyNode,
  type HierarchyNodeType,
  type HierarchyTransition,
  type StoryboardTimeline,
  type WorkspacePreviewTimelineArtifact,
} from '@movscript/core/content'

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

export type {
  ContentSourceWorkspaceData,
  CreatedContentSourceCandidate,
} from '@movscript/core/content'

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
  const previewTimelines = (await Promise.all(
    productions
      .map((production) => String(production.id ?? production.record.id ?? production.record.ID ?? production.path))
      .map((productionId) => service.readPreviewTimeline(productionId) as Promise<WorkspacePreviewTimelineArtifact | undefined>),
  )).filter(isDefined)

  return buildContentSourceWorkspaceData({
    indexDocuments: index.documents,
    settings,
    settingStates,
    assets: assetsResult.assets,
    productions,
    segments: context.segments ?? [],
    sceneMoments: context.scene_moments ?? [],
    shots: context.shots ?? [],
    storyboards: context.storyboards ?? [],
    keyframes: context.keyframes ?? [],
    expressionUnits: context.expression_units ?? [],
    audioCues: context.audio_cues ?? [],
    contentUnits: context.content_units ?? [],
    previewTimelines,
  })
}

export async function selectContentSourceWorkspaceCandidate(input: {
  projectId: number
  contentUnitId: string
  candidateId: string
  resourceId?: string
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.selectContentUnitCandidate(buildContentSourceWorkspaceSelectionPatch(input))
}

export async function createContentSourceWorkspaceCandidate(input: {
  projectId: number
  contentUnitId: string
  outputKind: 'image' | 'video' | 'audio' | 'text' | 'storyboard'
  promptText?: string
}): Promise<CreatedContentSourceCandidate> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  const plan = buildContentSourceWorkspaceCandidateCreatePlan(input)
  const result = await service.createContentCandidate(plan)
  return createdContentSourceCandidateFromRecord(result.record as ContentCandidateRecord, {
    candidateId: plan.candidateId,
    contentUnitId: plan.contentUnitId,
  })
}

export async function updateContentSourceWorkspaceEditPrompt(input: {
  projectId: number
  targetPath: string
  text: string
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateContentUnitEditPrompt(buildContentSourceWorkspaceEditPromptPatch(input))
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
  await service.updateExpressionUnitSource(buildContentSourceWorkspaceExpressionUnitPatch(input))
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
  await service.updateAudioCueSource(buildContentSourceWorkspaceAudioCuePatch(input))
}

export async function updateContentSourceWorkspaceTransition(input: {
  projectId: number
  targetPath: string
  transition: HierarchyTransition
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateEntityTransition(buildContentSourceWorkspaceTransitionPatch(input))
}

export async function updateContentSourceWorkspaceStoryboardTimeline(input: {
  projectId: number
  targetPath: string
  timeline: StoryboardTimeline
}): Promise<void> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.updateStoryboardTimeline(buildContentSourceWorkspaceStoryboardTimelinePatch(input))
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
  const record = buildContentSourceWorkspaceHierarchyNodeRecord(input)
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

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
