import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type { ContentSourceWorkspaceData } from '@movscript/core/content'
import type { ContentCanvasCandidate, ContentCanvasProjectData, MediaEditingProjectLike } from '../domain/contentCanvasTypes'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'

export async function loadContentCanvasProject(
  projectId: number,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasProjectData> {
  if (gateway.readContentCanvasReadModel) {
    const readModel = contentCanvasReadModelPayload(await gateway.readContentCanvasReadModel(projectId))
    return contentCanvasProjectDataFromReadModel(projectId, readModel)
  }

  const { service } = gateway
  const [
    projects,
    productions,
    segments,
    sceneMoments,
    storyboards,
    expressionUnits,
    contentUnits,
    keyframes,
    settings,
    settingStates,
    audioCues,
    assetResult,
    contentWorkspaceData,
  ] = await Promise.all([
    service.queryEntities({ entityKind: 'project', limit: 1 }),
    service.queryEntities({ entityKind: 'production' }),
    service.queryEntities({ entityKind: 'segment' }),
    service.queryEntities({ entityKind: 'scene_moment' }),
    service.queryEntities({ entityKind: 'storyboard' }),
    service.queryEntities({ entityKind: 'expression_unit' }),
    service.queryEntities({ entityKind: 'content_unit' }),
    service.queryEntities({ entityKind: 'keyframe' }),
    service.querySettings({ limit: 80 }),
    service.queryEntities({ entityKind: 'setting_state' }),
    service.queryEntities({ entityKind: 'audio_cue' }),
    service.queryAssets({ includeCandidates: true, limit: 120 }),
    gateway.loadContentSourceWorkspaceData(projectId).catch((error) => {
      console.warn('[content-canvas] load content workspace data failed', {
        projectId,
        error,
      })
      return undefined
    }),
  ])

  const contentUnitCandidates = contentWorkspaceData ? contentUnitCandidatesFromWorkspace(contentWorkspaceData) : {}
  const editingProjectsByNodeId = contentWorkspaceData
    ? editingProjectsByNodeIdFromWorkspace(contentWorkspaceData, sceneMoments, productions, segments, projectId)
    : {}
  console.log('[content-canvas] load project content candidates', {
    projectId,
    hasContentWorkspaceData: Boolean(contentWorkspaceData),
    previewMoments: contentWorkspaceData?.previewMoments.length ?? 0,
    assetReferenceUnits: contentWorkspaceData ? Object.keys(contentWorkspaceData.assetReferenceUnits).length : 0,
    contentUnitCandidateKeys: Object.keys(contentUnitCandidates),
    contentUnitCandidateRows: Object.entries(contentUnitCandidates).map(([contentUnitId, candidates]) => ({
      contentUnitId,
      candidateCount: candidates.length,
      candidateIds: candidates.map((candidate) => candidate.id),
    })),
    editingProjectKeys: Object.keys(editingProjectsByNodeId),
  })

  return {
    projectId,
    project: projects[0] ?? null,
    productions: sortEntities(productions),
    segments: sortEntities(segments),
    sceneMoments: sortEntities(sceneMoments),
    storyboards: sortEntities(storyboards),
    expressionUnits: sortEntities(expressionUnits),
    contentUnits: sortEntities(contentUnits),
    keyframes: sortEntities(keyframes),
    settings: sortEntities(settings),
    settingStates: sortEntities(settingStates),
    audioCues: sortEntities(audioCues),
    assets: sortEntities(assetResult.assets),
    contentUnitCandidates: contentUnitCandidates,
    domainGraph: contentWorkspaceData?.domainGraph,
    editingProjectsByNodeId,
    assetReferenceUnits: contentWorkspaceData?.assetReferenceUnits,
    productionWorkPlan: contentWorkspaceData?.productionWorkPlan,
  }
}

function contentCanvasReadModelPayload(value: unknown): Record<string, unknown> {
  const record = recordValue(value) ?? {}
  return recordValue(record.projectContentCanvasReadModel) ?? record
}

function contentCanvasProjectDataFromReadModel(
  fallbackProjectId: number,
  model: Record<string, unknown>,
): ContentCanvasProjectData {
  return {
    projectId: numberValue(model.projectId) ?? fallbackProjectId,
    project: recordValue(model.project) as MovScriptWorkspaceIndexedEntity | undefined ?? null,
    productions: sortEntities(indexedEntities(model.productions)),
    segments: sortEntities(indexedEntities(model.segments)),
    sceneMoments: sortEntities(indexedEntities(model.sceneMoments)),
    storyboards: sortEntities(indexedEntities(model.storyboards)),
    expressionUnits: sortEntities(indexedEntities(model.expressionUnits)),
    contentUnits: sortEntities(indexedEntities(model.contentUnits)),
    keyframes: sortEntities(indexedEntities(model.keyframes)),
    settings: sortEntities(indexedEntities(model.settings)),
    settingStates: sortEntities(indexedEntities(model.settingStates)),
    audioCues: sortEntities(indexedEntities(model.audioCues)),
    assets: sortEntities(indexedEntities(model.assets)),
    contentUnitCandidates: recordValue(model.contentUnitCandidates) as Record<string, ContentCanvasCandidate[]> | undefined ?? {},
    domainGraph: model.domainGraph as ContentCanvasProjectData['domainGraph'],
    editingProjectsByNodeId: recordValue(model.editingProjectsByNodeId) as Record<string, MediaEditingProjectLike> | undefined ?? {},
    assetReferenceUnits: model.assetReferenceUnits as ContentCanvasProjectData['assetReferenceUnits'],
    productionWorkPlan: model.productionWorkPlan as ContentCanvasProjectData['productionWorkPlan'],
  }
}

function indexedEntities(value: unknown): MovScriptWorkspaceIndexedEntity[] {
  return arrayValue(value)
    .map(indexedEntityValue)
    .filter((item): item is MovScriptWorkspaceIndexedEntity => item !== undefined)
}

function indexedEntityValue(value: unknown): MovScriptWorkspaceIndexedEntity | undefined {
  const record = recordValue(value)
  return record ? record as unknown as MovScriptWorkspaceIndexedEntity : undefined
}

function editingProjectsByNodeIdFromWorkspace(
  data: ContentSourceWorkspaceData,
  sceneMoments: MovScriptWorkspaceIndexedEntity[],
  productions: MovScriptWorkspaceIndexedEntity[],
  segments: MovScriptWorkspaceIndexedEntity[],
  projectId: number,
): Record<string, MediaEditingProjectLike> {
  const output: Record<string, MediaEditingProjectLike> = {}
  const timelineNamespaceTargets = [...productions, ...segments]
  for (const timeline of data.editingTimelines ?? []) {
    const editingProject = timeline.mediaEditingProject as MediaEditingProjectLike
    const targetId = String(timeline.targetId)
    output[targetId] = editingProject
    output[`${timeline.targetKind}:${targetId}`] = editingProject
    if (timeline.targetRef !== undefined) {
      output[String(timeline.targetRef)] = editingProject
      output[`${timeline.targetKind}:${String(timeline.targetRef)}`] = editingProject
    }
    if (timeline.scopeKind !== undefined && timeline.scopeRef !== undefined) {
      output[`${timeline.scopeKind}:${String(timeline.scopeRef)}`] = editingProject
      output[`timeline_assembly:${timeline.scopeKind}:${String(timeline.scopeRef)}`] = editingProject
    }
    const targets = timeline.targetKind === 'scene_moment'
      ? sceneMoments
      : timeline.targetKind === 'timeline_assembly'
        ? timelineNamespaceTargets
        : productions
    const target = targets.find((item) =>
      String(item.id ?? item.record.ID ?? item.record.id ?? '') === targetId
      || (timeline.targetPath !== undefined && item.path === timeline.targetPath)
      || (timeline.scopePath !== undefined && item.path === timeline.scopePath),
    )
    if (target) output[contentCanvasNodeIdForEntity(target, projectId)] = editingProject
  }
  return output
}

function contentUnitCandidatesFromWorkspace(data: ContentSourceWorkspaceData): Record<string, ContentCanvasCandidate[]> {
  const output: Record<string, ContentCanvasCandidate[]> = {}
  const directRows: Array<{ contentUnitId: string; candidateCount: number; candidateIds: string[] }> = []
  for (const [contentUnitId, candidates] of Object.entries(data.contentUnitCandidates ?? {})) {
    directRows.push({
      contentUnitId,
      candidateCount: candidates.length,
      candidateIds: candidates.map((candidate) => candidate.id),
    })
    appendCandidates(output, contentUnitId, candidates.map(contentCanvasCandidateFromPreview))
  }
  const previewRows: Array<{ contentUnitId: string; candidateCount: number; candidateIds: string[] }> = []
  for (const moment of data.previewMoments) {
    for (const expressionUnit of moment.expressionUnits) {
      previewRows.push({
        contentUnitId: expressionUnit.contentUnit.id,
        candidateCount: expressionUnit.contentUnit.candidates.length,
        candidateIds: expressionUnit.contentUnit.candidates.map((candidate) => candidate.id),
      })
      appendCandidates(output, expressionUnit.contentUnit.id, expressionUnit.contentUnit.candidates.map(contentCanvasCandidateFromPreview))
    }
  }
  const assetRows: Array<{ contentUnitId: string; assetId: string; candidateCount: number; candidateIds: string[] }> = []
  for (const assetUnit of Object.values(data.assetReferenceUnits)) {
    assetRows.push({
      contentUnitId: assetUnit.contentUnitId,
      assetId: assetUnit.assetId,
      candidateCount: assetUnit.candidates.length,
      candidateIds: assetUnit.candidates.map((candidate) => candidate.id),
    })
    appendCandidates(output, assetUnit.contentUnitId, assetUnit.candidates.map(contentCanvasCandidateFromPreview))
  }
  console.log('[content-canvas] map content workspace candidates', {
    directRows: directRows.filter((row) => row.candidateCount > 0),
    previewRows: previewRows.filter((row) => row.candidateCount > 0),
    assetRows: assetRows.filter((row) => row.candidateCount > 0),
    outputRows: Object.entries(output).map(([contentUnitId, candidates]) => ({
      contentUnitId,
      candidateCount: candidates.length,
      candidateIds: candidates.map((candidate) => candidate.id),
    })),
  })
  return output
}

function contentCanvasCandidateFromPreview(
  candidate: ContentSourceWorkspaceData['previewMoments'][number]['expressionUnits'][number]['contentUnit']['candidates'][number],
): ContentCanvasCandidate {
  return {
    id: candidate.id,
    title: candidate.title,
    resourceId: candidate.resourceId,
    resourceKind: candidate.resourceKind,
    artifactRef: candidate.artifactRef,
    inputHash: candidate.inputHash,
    source: candidate.source || candidate.model,
    status: candidate.status,
    decisionStatus: candidate.decisionStatus,
    decisionReason: candidate.decisionReason,
    producer: candidate.producer,
    outputs: candidate.outputs,
    promptSnapshot: candidate.promptSnapshot,
    createdAt: candidate.createdAt,
    selected: Boolean(candidate.selected),
    notes: candidate.note || candidate.inputHash,
  }
}

function appendCandidates(
  output: Record<string, ContentCanvasCandidate[]>,
  contentUnitId: string,
  candidates: ContentCanvasCandidate[],
) {
  const byId = new Map((output[contentUnitId] ?? []).map((candidate) => [candidateMergeKey(candidate), candidate]))
  for (const candidate of candidates) byId.set(candidateMergeKey(candidate), candidate)
  output[contentUnitId] = [...byId.values()]
}

function candidateMergeKey(candidate: ContentCanvasCandidate): string {
  return [
    candidate.id,
    candidate.resourceId ?? '',
    candidate.artifactRef ?? '',
    candidate.inputHash ?? '',
    candidate.source ?? '',
  ].join(':')
}

function sortEntities(items: MovScriptWorkspaceIndexedEntity[]) {
  return [...items].sort((left, right) => {
    const leftOrder = numberValue(left.record.order)
    const rightOrder = numberValue(right.record.order)
    if (leftOrder !== undefined || rightOrder !== undefined) return (leftOrder ?? 0) - (rightOrder ?? 0)
    return titleOf(left).localeCompare(titleOf(right), 'zh-CN')
  })
}

function titleOf(entity: MovScriptWorkspaceIndexedEntity) {
  return String(entity.record.title ?? entity.record.name ?? entity.record.label ?? entity.id ?? entity.path)
}

function contentCanvasNodeIdForEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number): string {
  return `${contentCanvasKind(entity)}:${entityKey(entity, projectId)}`
}

function contentCanvasKind(entity: MovScriptWorkspaceIndexedEntity): string {
  if (entity.entityKind === 'asset') return 'asset'
  if (entity.entityKind === 'setting_state') return 'state'
  return entity.entityKind
}

function entityKey(entity: MovScriptWorkspaceIndexedEntity, projectId: number): string {
  if (entity.entityKind === 'project') return String(entity.id ?? entity.record.project_id ?? projectId)
  return idValue(entity.id ?? entity.record.ID ?? entity.record.id) ?? `${entity.entityKind}:${entity.path}`
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
