import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type { ContentSourceWorkspaceData } from '@movscript/core/content'
import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'
import { currentWorkspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { loadContentSourceWorkspaceData } from '@/features/content/integrations/contentSourceWorkspaceElectron'
import type { ContentCanvasCandidate, ContentCanvasProjectData } from '../domain/contentCanvasTypes'

export async function loadContentCanvasProject(projectId: number): Promise<ContentCanvasProjectData> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const ownerContext = currentWorkspaceOwnerContext()
  const [
    projects,
    productions,
    segments,
    sceneMoments,
    shots,
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
    service.queryEntities({ entityKind: 'shot' }),
    service.queryEntities({ entityKind: 'storyboard' }),
    service.queryEntities({ entityKind: 'expression_unit' }),
    service.queryEntities({ entityKind: 'content_unit' }),
    service.queryEntities({ entityKind: 'keyframe' }),
    service.querySettings({ limit: 80 }),
    service.queryEntities({ entityKind: 'setting_state' }),
    service.queryEntities({ entityKind: 'audio_cue' }),
    service.queryAssets({ includeCandidates: true, limit: 120 }),
    loadContentSourceWorkspaceData(projectId, ownerContext).catch((error) => {
      console.warn('[content-canvas] load content workspace data failed', {
        projectId,
        error,
      })
      return undefined
    }),
  ])

  const contentUnitCandidates = contentWorkspaceData ? contentUnitCandidatesFromWorkspace(contentWorkspaceData) : {}
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
  })

  return {
    projectId,
    project: projects[0] ?? null,
    productions: sortEntities(productions),
    segments: sortEntities(segments),
    sceneMoments: sortEntities(sceneMoments),
    shots: sortEntities(shots),
    storyboards: sortEntities(storyboards),
    expressionUnits: sortEntities(expressionUnits),
    contentUnits: sortEntities(contentUnits),
    keyframes: sortEntities(keyframes),
    settings: sortEntities(settings),
    settingStates: sortEntities(settingStates),
    audioCues: sortEntities(audioCues),
    assets: sortEntities(assetResult.assets),
    contentUnitCandidates: contentUnitCandidates,
    assetReferenceUnits: contentWorkspaceData?.assetReferenceUnits,
    productionWorkPlan: contentWorkspaceData?.productionWorkPlan,
  }
}

function contentUnitCandidatesFromWorkspace(data: ContentSourceWorkspaceData): Record<string, ContentCanvasCandidate[]> {
  const output: Record<string, ContentCanvasCandidate[]> = {}
  const previewRows: Array<{ contentUnitId: string; candidateCount: number; candidateIds: string[] }> = []
  for (const moment of data.previewMoments) {
    for (const shot of moment.shots) {
      previewRows.push({
        contentUnitId: shot.contentUnit.id,
        candidateCount: shot.contentUnit.candidates.length,
        candidateIds: shot.contentUnit.candidates.map((candidate) => candidate.id),
      })
      appendCandidates(output, shot.contentUnit.id, shot.contentUnit.candidates.map((candidate): ContentCanvasCandidate => ({
        id: candidate.id,
        title: candidate.title,
        resourceId: candidate.resourceId,
        resourceKind: candidate.resourceKind,
        artifactRef: candidate.artifactRef,
        source: candidate.model,
        selected: Boolean(candidate.selected),
        notes: candidate.note || candidate.inputHash,
      })))
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
    appendCandidates(output, assetUnit.contentUnitId, assetUnit.candidates.map((candidate): ContentCanvasCandidate => ({
      id: candidate.id,
      title: candidate.title,
      resourceId: candidate.resourceId,
      resourceKind: candidate.resourceKind,
      artifactRef: candidate.artifactRef,
      source: candidate.model,
      selected: Boolean(candidate.selected),
      notes: candidate.note || candidate.inputHash,
    })))
  }
  console.log('[content-canvas] map content workspace candidates', {
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

function appendCandidates(
  output: Record<string, ContentCanvasCandidate[]>,
  contentUnitId: string,
  candidates: ContentCanvasCandidate[],
) {
  const byId = new Map((output[contentUnitId] ?? []).map((candidate) => [candidate.id, candidate]))
  for (const candidate of candidates) byId.set(candidate.id, candidate)
  output[contentUnitId] = [...byId.values()]
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

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}
