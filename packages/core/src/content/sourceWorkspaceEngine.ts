import type { NodeMovScriptEngine } from '@movscript/engine/node'
import type {
  ContentSourceWorkspaceSnapshot,
  WorkspacePreviewTimelineArtifact,
} from './sourceWorkspaceData.js'

export async function loadContentSourceWorkspaceSnapshotFromEngine(
  engine: NodeMovScriptEngine,
): Promise<ContentSourceWorkspaceSnapshot> {
  const service = engine.workspaceService
  const [
    index,
    settings,
    settingStates,
    assetsResult,
    context,
    review,
  ] = await Promise.all([
    service.loadIndex(),
    service.querySettings({ limit: 500 }),
    service.queryEntities({ entityKind: 'setting_state', limit: 500 }),
    service.queryAssets({ limit: 500 }),
    service.queryProductionContext({
      include: ['productions', 'segments', 'scene_moments', 'shots', 'storyboards', 'audio_cues', 'expression_units', 'content_units', 'keyframes'],
      limit: 1000,
    }),
    engine.review(),
  ])

  const productions = context.productions ?? []
  const previewTimelines = (await Promise.all(
    productions
      .map((production) => String(production.id ?? production.record.id ?? production.record.ID ?? production.path))
      .map((productionId) => service.readPreviewTimeline(productionId) as Promise<WorkspacePreviewTimelineArtifact | undefined>),
  )).filter(isDefined)

  return {
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
    productionWorkPlan: productionWorkPlanFromReview(review),
  }
}

function productionWorkPlanFromReview(value: unknown): ContentSourceWorkspaceSnapshot['productionWorkPlan'] {
  if (!isRecord(value)) return undefined
  return value.productionWorkPlan as ContentSourceWorkspaceSnapshot['productionWorkPlan']
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
