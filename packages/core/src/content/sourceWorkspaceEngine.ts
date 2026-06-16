import type { NodeMovScriptEngine } from '@movscript/engine/node'
import {
  createOpenCutTimelineFromMovScriptEditPlan,
  defaultOpenCutTransform,
  type MovScriptEditPlanArtifact,
  type OpenCutTimelineDocument,
  type OpenCutVideoElement,
  type OpenCutVideoTrack,
} from '@movscript/editing'
import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type {
  ContentCandidateRecord,
  ContentSourceWorkspaceEditingTimeline,
  ContentSourceWorkspaceSnapshot,
  WorkspaceDocument,
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
  const sceneMoments = context.scene_moments ?? []
  const previewTimelines = (await Promise.all(
    productions
      .map((production) => String(production.id ?? production.record.id ?? production.record.ID ?? production.path))
      .map((productionId) => service.readPreviewTimeline(productionId) as Promise<WorkspacePreviewTimelineArtifact | undefined>),
  )).filter(isDefined)
  const editingTimelines = (await Promise.all(
    sceneMoments.map(async (sceneMoment): Promise<ContentSourceWorkspaceEditingTimeline | undefined> => {
      const sceneMomentId = idField(sceneMoment.id ?? sceneMoment.record.id ?? sceneMoment.record.ID)
      if (sceneMomentId === undefined) return undefined
      const editPlan = await service.readSceneMomentEditPlan(sceneMomentId).catch(() => undefined)
      if (!isRecord(editPlan)) return undefined
      const timelineDocument = createOpenCutTimelineFromMovScriptEditPlan(editPlan as unknown as MovScriptEditPlanArtifact, {
        projectName: String(editPlan.productionId ?? 'MovScript'),
        sceneName: String(sceneMoment.record.title ?? editPlan.sceneMomentId ?? sceneMomentId),
      })
      return {
        targetKind: 'scene_moment',
        targetId: sceneMomentId,
        targetPath: sceneMoment.path,
        status: typeof editPlan.status === 'string' ? editPlan.status : undefined,
        blockers: Array.isArray(editPlan.blockers) ? editPlan.blockers : undefined,
        timelineDocument,
      }
    }),
  )).filter(isDefined)
  const productionEditingTimelines = previewTimelines.map((timeline) =>
    productionTimelineFromPreview({
      previewTimeline: timeline,
      contentUnits: context.content_units ?? [],
      documents: index.documents,
      productions,
    }),
  )

  return {
    indexDocuments: index.documents,
    settings,
    settingStates,
    assets: assetsResult.assets,
    productions,
    segments: context.segments ?? [],
    sceneMoments,
    shots: context.shots ?? [],
    storyboards: context.storyboards ?? [],
    keyframes: context.keyframes ?? [],
    expressionUnits: context.expression_units ?? [],
    audioCues: context.audio_cues ?? [],
    contentUnits: context.content_units ?? [],
    previewTimelines,
    editingTimelines: [...productionEditingTimelines, ...editingTimelines],
    productionWorkPlan: productionWorkPlanFromReview(review),
  }
}

function productionTimelineFromPreview(input: {
  previewTimeline: WorkspacePreviewTimelineArtifact
  contentUnits: MovScriptWorkspaceIndexedEntity[]
  documents: WorkspaceDocument[]
  productions: MovScriptWorkspaceIndexedEntity[]
}): ContentSourceWorkspaceEditingTimeline {
  const candidateRecords = contentCandidateRecordsByContentUnitId(input.documents)
  const selections = selectionRecordsByContentUnitId(input.documents)
  const contentUnitsById = new Map(input.contentUnits.map((unit) => [String(unit.id ?? pathSegmentAfter(unit.path, 'content_units') ?? unit.path), unit]))
  const blockers: unknown[] = []
  const clips = input.previewTimeline.items
    .filter((item) => item.itemType === 'scene_moment')
    .sort((left, right) => left.order - right.order)
    .flatMap((item, index) => {
      const contentUnitIds = productionSceneMomentContentUnitIds(input.contentUnits, item)
      if (contentUnitIds.length === 0) {
        blockers.push({
          code: 'scene_moment_content_unit_missing',
          scene_moment_id: item.entity.id,
          scene_moment_path: item.entity.path,
        })
        return []
      }
      for (const contentUnitId of contentUnitIds) {
        const selection = selections.get(String(contentUnitId))
        const candidate = selection?.candidate_id !== undefined
          ? candidateRecords.get(String(contentUnitId))?.find((entry) => sameId(entry.id, selection.candidate_id))
          : undefined
        const output = firstCandidateOutput(candidate)
        const resourceId = numberField(output?.resource_id)
        if (resourceId !== undefined && (stringField(output?.kind) ?? 'video') === 'video') {
          return [{
            id: `production_clip_${safeId(String(item.entity.id ?? index))}_${safeId(String(contentUnitId))}`,
            title: previewTimelineItemTitle(item) ?? stringField(item.entity.id) ?? `Scene ${index + 1}`,
            sceneMomentId: item.entity.id,
            sceneMomentPath: item.entity.path,
            contentUnitId,
            candidateId: selection?.candidate_id,
            resourceId,
            durationSec: numberField(output?.duration_sec) ?? 4,
          }]
        }
        blockers.push({
          code: selection?.candidate_id === undefined ? 'scene_moment_selection_missing' : 'scene_moment_resource_missing',
          scene_moment_id: item.entity.id,
          scene_moment_path: item.entity.path,
          content_unit_id: contentUnitId,
          candidate_id: selection?.candidate_id,
          output_kind: stringField(contentUnitsById.get(String(contentUnitId))?.record.output_kind),
        })
      }
      return []
    })
  const production = input.productions.find((item) => sameId(item.id, input.previewTimeline.productionId) || item.path.startsWith(input.previewTimeline.productionPath))
  return {
    targetKind: 'production',
    targetId: input.previewTimeline.productionId,
    targetPath: production?.path ?? input.previewTimeline.productionPath,
    status: blockers.length > 0 ? 'blocked' : 'ready_to_compose',
    blockers,
    timelineDocument: openCutProductionTimelineDocument({
      productionId: input.previewTimeline.productionId,
      productionTitle: stringField(production?.record.title) ?? String(input.previewTimeline.productionId),
      clips,
    }),
  }
}

function openCutProductionTimelineDocument(input: {
  productionId: string | number
  productionTitle: string
  clips: Array<{
    id: string
    title: string
    sceneMomentId?: string | number
    sceneMomentPath?: string
    contentUnitId: string | number
    candidateId?: string | number
    resourceId: number
    durationSec: number
  }>
}): OpenCutTimelineDocument {
  const now = new Date().toISOString()
  let cursor = 0
  const elements = input.clips.map((clip): OpenCutVideoElement => {
    const duration = Math.max(0.1, clip.durationSec)
    const element: OpenCutVideoElement = {
      id: clip.id,
      name: clip.title,
      type: 'video',
      mediaId: `movscript_resource_${clip.resourceId}`,
      duration,
      startTime: cursor,
      trimStart: 0,
      trimEnd: 0,
      sourceDuration: duration,
      muted: false,
      hidden: false,
      transform: defaultOpenCutTransform(),
      opacity: 1,
      effects: [],
      metadata: {
        movscript: {
          sceneMomentId: clip.sceneMomentId,
          sceneMomentPath: clip.sceneMomentPath,
          contentUnitId: clip.contentUnitId,
          candidateId: clip.candidateId,
          resourceId: clip.resourceId,
          outputKind: 'video',
          trackType: 'video',
          targetKind: 'production',
          targetRef: String(input.productionId),
          selected: true,
          stale: false,
        },
      },
    }
    cursor += duration
    return element
  })
  const track: OpenCutVideoTrack = {
    id: 'track_production_video_0',
    name: 'production video',
    type: 'video',
    elements,
    isMain: true,
    muted: false,
    hidden: false,
  }
  return {
    schema: 'opencut.timeline.v1',
    protocol: { upstream: 'opencut', compatibility: 'timeline', version: 1 },
    project: {
      metadata: {
        id: `movscript_production_${String(input.productionId)}`,
        name: input.productionTitle,
        duration: cursor,
        createdAt: now,
        updatedAt: now,
      },
      scenes: [{
        id: `production_${String(input.productionId)}`,
        name: input.productionTitle,
        isMain: true,
        tracks: [track],
        bookmarks: [],
        createdAt: now,
        updatedAt: now,
      }],
      currentSceneId: `production_${String(input.productionId)}`,
      settings: {
        fps: 30,
        canvasSize: { width: 1920, height: 1080 },
        originalCanvasSize: null,
        background: { type: 'color', color: '#000000' },
      },
      version: 1,
      timelineViewState: { zoomLevel: 1, scrollLeft: 0, playheadTime: 0 },
    },
  }
}

function productionSceneMomentContentUnitIds(
  contentUnits: MovScriptWorkspaceIndexedEntity[],
  item: WorkspacePreviewTimelineArtifact['items'][number],
): Array<string | number> {
  const explicit = Array.isArray((item as { contentUnitIds?: unknown }).contentUnitIds)
    ? ((item as { contentUnitIds?: unknown[] }).contentUnitIds ?? []).filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
    : []
  const scanned = contentUnits
    .filter((unit) => isSceneMomentVideoContentUnit(unit.record) && sceneMomentRefMatches(unit.record, item))
    .map((unit) => unit.id ?? pathSegmentAfter(unit.path, 'content_units'))
    .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
  return [...new Map([...explicit, ...scanned].map((id) => [String(id), id])).values()]
}

function previewTimelineItemTitle(item: WorkspacePreviewTimelineArtifact['items'][number]): string | undefined {
  return stringField((item as WorkspacePreviewTimelineArtifact['items'][number] & { title?: unknown }).title)
}

function isSceneMomentVideoContentUnit(record: Record<string, unknown>): boolean {
  const type = stringField(record.content_unit_type)
  if (type !== 'scene_moment_ref' && type !== 'scence_moment_ref') return false
  const outputKind = stringField(record.output_kind)
  return outputKind === undefined || outputKind === 'video'
}

function sceneMomentRefMatches(record: Record<string, unknown>, item: WorkspacePreviewTimelineArtifact['items'][number]): boolean {
  const refs = [record.scene_moment_ref, record.scence_moment_ref].flatMap((value) => {
    const id = idField(value)
    return id === undefined ? [] : [String(id)]
  })
  return refs.some((ref) =>
    sameId(ref, item.entity.id)
    || ref === item.entity.path
    || lastPathSegment(ref) === lastPathSegment(item.entity.path),
  )
}

function contentCandidateRecordsByContentUnitId(documents: WorkspaceDocument[]): Map<string, ContentCandidateRecord[]> {
  const output = new Map<string, ContentCandidateRecord[]>()
  for (const document of documents) {
    if (!document.path.endsWith('/content_candidate.json') || !isRecord(document.data)) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringField(document.data.content_unit_ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, [...(output.get(contentUnitId) ?? []), document.data as ContentCandidateRecord])
  }
  return output
}

function selectionRecordsByContentUnitId(documents: WorkspaceDocument[]): Map<string, { candidate_id?: string | number }> {
  const output = new Map<string, { candidate_id?: string | number }>()
  for (const document of documents) {
    if (!isRecord(document.data)) continue
    const selection = isRecord(document.data.selection) ? document.data.selection : undefined
    if (!selection) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringField(document.data.target_ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, {
      ...(idField(selection.candidate_id) !== undefined ? { candidate_id: idField(selection.candidate_id) } : {}),
    })
  }
  return output
}

function contentUnitIdForRuntimeDocument(path: string, ref?: string): string | undefined {
  if (ref) return lastPathSegment(ref) ?? ref
  return pathSegmentAfter(path, 'content_units')
}

function firstCandidateOutput(candidate: ContentCandidateRecord | undefined): Record<string, unknown> | undefined {
  return Array.isArray(candidate?.outputs) ? candidate.outputs.find(isRecord) : undefined
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

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringField(value: unknown): string | undefined {
  const id = idField(value)
  return id === undefined ? undefined : String(id)
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/').filter(Boolean)
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function lastPathSegment(path: string | undefined): string | undefined {
  return path?.split('/').filter(Boolean).at(-1)
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'item'
}

function sameId(left: unknown, right: unknown): boolean {
  return left !== undefined && right !== undefined && String(left) === String(right)
}
