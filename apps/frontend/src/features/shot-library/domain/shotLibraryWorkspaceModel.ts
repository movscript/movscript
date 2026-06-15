import type { RawResource } from '@/types'
import {
  analyzeShotReference,
  type ShotLibraryEntry,
  type ShotLibraryFacetFilters,
  type ShotLibrarySemanticCategory,
  type ShotLibraryVideoMetadata,
  type ShotReferenceManualUpdate,
} from '@/features/shot-library/domain/shotReferenceLibrary'

export type ShotImportPhase = 'idle' | 'preparing' | 'cutting' | 'review' | 'saving'
export type ShotImportSourceKind = 'file' | 'resource'
export type ShotManualWorkspace = ReturnType<typeof detailWorkspaceFromEntry>
export type ShotCutRange = { startSec: number; endSec: number }

export interface ShotImportWorkspace extends ShotManualWorkspace {
  id: string
  order: number
  status: 'cutting' | 'ready'
  selected: boolean
  thumbnailUrl?: string
}

export interface ShotImportSession {
  sourceKey: string
  sourceKind: ShotImportSourceKind
  sourceName: string
  sourceResource: RawResource
  file?: File
  objectUrl?: string
  metadata: ShotLibraryVideoMetadata
  phase: ShotImportPhase
  workspaces: ShotImportWorkspace[]
  activeWorkspaceId?: string
  error?: string
  progressPercent?: number
  targetGroupId?: number
  targetGroupTitle?: string
}

export interface ShotLibraryGroupOption {
  id: number
  sourceId: string
  title: string
}

export type ShotTagSuggestions = Record<ShotLibrarySemanticCategory, string[]>
export type ShotFacetCategory = keyof Required<ShotLibraryFacetFilters>
export type ShotFacetOptions = Record<ShotFacetCategory, string[]>

export function detailWorkspaceFromEntry(entry: ShotLibraryEntry) {
  return {
    title: entry.title,
    summary: entry.summary,
    intent: entry.intent.join(', '),
    pattern: entry.pattern.join(', '),
    shotFunction: entry.shotFunction.join(', '),
    visualPreference: entry.visualPreference.join(', '),
    emotionalEffect: entry.emotionalEffect.join(', '),
    startSec: entry.startSec === undefined ? '' : String(entry.startSec),
    endSec: entry.endSec === undefined ? '' : String(entry.endSec),
    resolution: entry.executionDetails.resolution ?? '',
    aspectRatio: entry.executionDetails.aspectRatio ?? '',
    shotSize: entry.visualAnalysis.shot_size ?? '',
    framing: (entry.visualAnalysis.framing ?? []).join(', '),
    composition: (entry.visualAnalysis.composition ?? []).join(', '),
    cameraAngle: entry.visualAnalysis.camera_angle ?? '',
    cameraHeight: entry.visualAnalysis.camera_height ?? '',
    lensFocalLength: entry.visualAnalysis.lens?.focal_length_class ?? '',
    lensDepthOfField: entry.visualAnalysis.lens?.depth_of_field ?? '',
    opticalEffects: (entry.visualAnalysis.lens?.optical_effects ?? []).join(', '),
    focusBehavior: entry.visualAnalysis.focus?.behavior ?? '',
    cameraMovementType: entry.visualAnalysis.camera_movement?.type ?? '',
    cameraMovementSpeed: entry.visualAnalysis.camera_movement?.speed ?? '',
    cameraMovementStability: entry.visualAnalysis.camera_movement?.stability ?? '',
    cameraMovementMotivation: entry.visualAnalysis.camera_movement?.motivation ?? '',
    lightingStyle: entry.visualAnalysis.lighting?.style ?? '',
    lightingContrast: entry.visualAnalysis.lighting?.contrast ?? '',
    colorPalette: entry.visualAnalysis.color?.palette ?? '',
    colorSaturation: entry.visualAnalysis.color?.saturation ?? '',
    environmentLocationType: entry.visualAnalysis.environment?.location_type ?? '',
    spatialFeeling: (entry.visualAnalysis.environment?.spatial_feeling ?? []).join(', '),
    genre: (entry.sceneSemantics.genre ?? []).join(', '),
    sceneType: entry.sceneSemantics.scene_type ?? '',
    sceneLocationType: entry.sceneSemantics.location_type ?? '',
    conflictLevel: entry.sceneSemantics.conflict_level ?? '',
    narrativePrimary: entry.narrativeFunction.primary ?? '',
    narrativeSecondary: (entry.narrativeFunction.secondary ?? []).join(', '),
    informationState: entry.narrativeFunction.information_state ?? '',
    emotionNames: (entry.emotionalProfile.names ?? []).join(', '),
    emotionValence: entry.emotionalProfile.valence ?? '',
    emotionArousal: entry.emotionalProfile.arousal ?? '',
    viewerPosition: entry.emotionalProfile.viewer_position ?? '',
    patternIds: (entry.reusablePattern.pattern_ids ?? []).join(', '),
    reusablePrinciple: entry.reusablePattern.principle ?? '',
    worksWhen: (entry.reusablePattern.works_when ?? []).join(', '),
    avoidWhen: (entry.reusablePattern.avoid_when ?? []).join(', '),
    coverageRole: entry.executionDetails.coverageRole ?? '',
    difficulty: entry.executionDetails.difficulty ?? '',
    requirements: (entry.executionDetails.requirements ?? []).join(', '),
    blocking: entry.executionDetails.blocking ?? '',
  }
}

export function executionDetailsFromWorkspace(workspace: ShotManualWorkspace, entry?: ShotLibraryEntry): ShotReferenceManualUpdate['execution_details'] {
  return {
    duration_sec: entry?.executionDetails.durationSec,
    resolution: entry?.executionDetails.resolution ?? cleanText(workspace.resolution),
    aspect_ratio: entry?.executionDetails.aspectRatio ?? cleanText(workspace.aspectRatio),
    transition_in: entry?.executionDetails.transitionIn,
    transition_out: entry?.executionDetails.transitionOut,
    coverage_role: cleanText(workspace.coverageRole),
    difficulty: cleanText(workspace.difficulty),
    requirements: splitTags(workspace.requirements),
    blocking: cleanText(workspace.blocking),
  }
}

export function visualAnalysisFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['visual_analysis'] {
  return {
    shot_size: cleanText(workspace.shotSize),
    framing: splitTags(workspace.framing),
    composition: splitTags(workspace.composition),
    camera_angle: cleanText(workspace.cameraAngle),
    camera_height: cleanText(workspace.cameraHeight),
    lens: {
      focal_length_class: cleanText(workspace.lensFocalLength),
      depth_of_field: cleanText(workspace.lensDepthOfField),
      optical_effects: splitTags(workspace.opticalEffects),
    },
    focus: {
      behavior: cleanText(workspace.focusBehavior),
    },
    camera_movement: {
      type: cleanText(workspace.cameraMovementType),
      speed: cleanText(workspace.cameraMovementSpeed),
      stability: cleanText(workspace.cameraMovementStability),
      motivation: cleanText(workspace.cameraMovementMotivation),
    },
    lighting: {
      style: cleanText(workspace.lightingStyle),
      contrast: cleanText(workspace.lightingContrast),
    },
    color: {
      palette: cleanText(workspace.colorPalette),
      saturation: cleanText(workspace.colorSaturation),
    },
    environment: {
      location_type: cleanText(workspace.environmentLocationType),
      spatial_feeling: splitTags(workspace.spatialFeeling),
    },
  }
}

export function sceneSemanticsFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['scene_semantics'] {
  return {
    genre: splitTags(workspace.genre),
    scene_type: cleanText(workspace.sceneType),
    location_type: cleanText(workspace.sceneLocationType),
    conflict_level: cleanText(workspace.conflictLevel),
  }
}

export function narrativeFunctionFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['narrative_function'] {
  return {
    primary: cleanText(workspace.narrativePrimary),
    secondary: splitTags(workspace.narrativeSecondary),
    information_state: cleanText(workspace.informationState),
  }
}

export function emotionalProfileFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['emotional_profile'] {
  return {
    names: splitTags(workspace.emotionNames),
    valence: cleanText(workspace.emotionValence),
    arousal: cleanText(workspace.emotionArousal),
    viewer_position: cleanText(workspace.viewerPosition),
  }
}

export function reusablePatternFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['reusable_pattern'] {
  return {
    pattern_ids: splitTags(workspace.patternIds),
    principle: cleanText(workspace.reusablePrinciple),
    works_when: splitTags(workspace.worksWhen),
    avoid_when: splitTags(workspace.avoidWhen),
  }
}

export function buildShotTagSuggestions(entries: ShotLibraryEntry[]): ShotTagSuggestions {
  const categories: ShotLibrarySemanticCategory[] = ['intent', 'pattern', 'shotFunction', 'visualPreference', 'emotionalEffect']
  const result = Object.fromEntries(categories.map(category => [category, [] as string[]])) as ShotTagSuggestions
  for (const entry of entries) {
    for (const category of categories) {
      const source = category === 'intent' ? entry.intent : category === 'pattern' ? entry.pattern : category === 'shotFunction' ? entry.shotFunction : category === 'visualPreference' ? entry.visualPreference : entry.emotionalEffect
      for (const value of source) {
        if (!result[category].includes(value)) result[category].push(value)
      }
    }
  }
  for (const category of categories) {
    result[category].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }
  return result
}

export function buildShotFacetOptions(entries: ShotLibraryEntry[]): ShotFacetOptions {
  const result: ShotFacetOptions = {
    visual: [],
    narrative: [],
    emotion: [],
    pattern: [],
    production: [],
  }
  for (const entry of entries) {
    appendFacetValues(result.visual, [
      ...(entry.searchIndex.visual_facets ?? []),
      entry.visualAnalysis.shot_size,
      entry.visualAnalysis.camera_movement?.type,
      entry.visualAnalysis.camera_movement?.stability,
      entry.visualAnalysis.focus?.behavior,
      ...(entry.visualAnalysis.framing ?? []),
      ...(entry.visualAnalysis.composition ?? []),
    ])
    appendFacetValues(result.narrative, [
      ...(entry.searchIndex.narrative_facets ?? []),
      entry.narrativeFunction.primary,
      entry.narrativeFunction.information_state,
      entry.narrativeFunction.sequence_position,
    ])
    appendFacetValues(result.emotion, [
      ...(entry.searchIndex.emotion_facets ?? []),
      ...(entry.emotionalProfile.names ?? []),
      ...entry.emotionalEffect,
    ])
    appendFacetValues(result.pattern, [
      ...(entry.searchIndex.pattern_facets ?? []),
      ...(entry.reusablePattern.pattern_ids ?? []),
      ...entry.pattern,
    ])
    appendFacetValues(result.production, [
      ...(entry.searchIndex.production_facets ?? []),
      ...(entry.executionDetails.requirements ?? []),
      entry.executionDetails.coverageRole,
      entry.executionDetails.difficulty,
      entry.executionDetails.aspectRatio,
    ])
  }
  for (const values of Object.values(result)) {
    values.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }
  return result
}

export function buildShotGroupOptions(entries: ShotLibraryEntry[]): ShotLibraryGroupOption[] {
  const groups = new Map<number, ShotLibraryGroupOption>()
  for (const entry of entries) {
    if (!entry.groupId) continue
    if (groups.has(entry.groupId)) continue
    groups.set(entry.groupId, {
      id: entry.groupId,
      sourceId: entry.sourceId,
      title: entry.groupTitle || entry.title,
    })
  }
  return Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
}

export function isWorkspaceSelected(workspace: ShotImportWorkspace) {
  return workspace.selected !== false
}

export function appendTagValue(current: string, next: string) {
  const values = current.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
  if (!values.includes(next)) values.push(next)
  return values.join(', ')
}

export function tempResourceFromFile(file: File, objectUrl: string): RawResource {
  return {
    ID: -1,
    owner_id: 0,
    type: 'video',
    name: file.name,
    url: objectUrl,
    size: file.size,
    mime_type: file.type || 'video/mp4',
  }
}

export function buildImportWorkspaces(resource: RawResource, metadata: ShotLibraryVideoMetadata, ranges?: ShotCutRange[]): ShotImportWorkspace[] {
  const duration = metadata.durationSec && metadata.durationSec > 0 ? metadata.durationSec : undefined
  const normalizedRanges = ranges?.length ? ranges : undefined
  const segmentCount = normalizedRanges?.length ?? (duration ? Math.max(1, Math.ceil(duration / 6)) : 1)
  const segmentLength = duration ? duration / segmentCount : undefined
  return Array.from({ length: segmentCount }, (_, index) => {
    const range = normalizedRanges?.[index]
    const start = range ? roundTime(range.startSec) : segmentLength === undefined ? undefined : roundTime(index * segmentLength)
    const end = range ? roundTime(range.endSec) : segmentLength === undefined ? undefined : roundTime(index === segmentCount - 1 ? duration! : (index + 1) * segmentLength)
    const segmentDuration = start !== undefined && end !== undefined ? Math.max(0.1, end - start) : duration
    const analyzed = analyzeShotReference(resource, {
      name: resource.name,
      size: resource.size,
      type: resource.mime_type,
    }, {
      durationSec: segmentDuration,
      width: metadata.width,
      height: metadata.height,
    })
    const workspace = detailWorkspaceFromEntry({
      ...analyzed,
      order: index + 1,
      title: `${analyzed.title} · ${String(index + 1).padStart(2, '0')}`,
      startSec: start,
      endSec: end,
    })
    return {
      ...workspace,
      id: `workspace-${index + 1}`,
      order: index + 1,
      status: 'ready' as const,
      selected: false,
    }
  })
}

export function importWorkspaceToManualUpdate(workspace: ShotImportWorkspace): ShotReferenceManualUpdate {
  return {
    title: workspace.title,
    summary: workspace.summary,
    intent: splitTags(workspace.intent),
    pattern: splitTags(workspace.pattern),
    shot_function: splitTags(workspace.shotFunction),
    visual_preference: splitTags(workspace.visualPreference),
    emotional_effect: splitTags(workspace.emotionalEffect),
    execution_details: executionDetailsFromWorkspace(workspace),
    visual_analysis: visualAnalysisFromWorkspace(workspace),
    scene_semantics: sceneSemanticsFromWorkspace(workspace),
    narrative_function: narrativeFunctionFromWorkspace(workspace),
    emotional_profile: emotionalProfileFromWorkspace(workspace),
    reusable_pattern: reusablePatternFromWorkspace(workspace),
    start_sec: optionalNumber(workspace.startSec),
    start_sec_set: true,
    end_sec: optionalNumber(workspace.endSec),
    end_sec_set: true,
  }
}

export function importPhaseLabel(phase: ShotImportPhase, t: (key: string) => string): string {
  return t(`pages.shotLibrary.importPhases.${phase}`)
}

export function importProgressLabel(session: ShotImportSession, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (session.phase === 'preparing') {
    const suffix = session.progressPercent !== undefined ? ` · ${session.progressPercent}%` : ''
    return `${t('pages.shotLibrary.readingSource')}${suffix}`
  }
  if (session.phase === 'cutting') return t('pages.shotLibrary.cuttingShots')
  return t('pages.shotLibrary.importedShotCount', { count: session.workspaces.filter(isWorkspaceSelected).length })
}

export function defaultImportGroupTitle(sourceName: string): string {
  return titleFromFilename(sourceName) || sourceName
}

export function workspaceRangeDuration(workspace?: ShotImportWorkspace): number {
  if (!workspace) return 0
  const start = optionalNumber(workspace.startSec)
  const end = optionalNumber(workspace.endSec)
  if (start !== undefined && end !== undefined) return Math.max(0, end - start)
  return 0
}

export function formatWorkspaceRange(workspace: ShotImportWorkspace): string {
  const start = optionalNumber(workspace.startSec)
  const end = optionalNumber(workspace.endSec)
  if (start === undefined && end === undefined) return '--'
  if (start !== undefined && end !== undefined) return `${formatTimecode(start)}-${formatTimecode(end)}`
  if (start !== undefined) return `${formatTimecode(start)}+`
  return `-${formatTimecode(end!)}`
}

export function formatClipProgress(progress: number, durationSec: number, language = ''): string {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0
  const elapsed = Math.max(0, Math.min(duration, duration * progress))
  return `${formatTimecode(elapsed)} / ${duration ? formatDuration(duration, language) : '--'}`
}

export function formatTimecode(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function splitTags(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function resourceFromEntry(entry: ShotLibraryEntry): RawResource {
  return {
    ID: entry.resourceId,
    owner_id: 0,
    type: 'video',
    name: entry.resourceName,
    url: entry.resourceUrl,
    size: entry.size,
    mime_type: entry.mimeType,
  }
}

export function shotEntryKey(entry: Pick<ShotLibraryEntry, 'sourceId' | 'ID'>): string {
  return `${entry.sourceId}:${entry.ID}`
}

export function uploadErrorMessage(error: unknown, fallback: string): string {
  const responseError = (error as { response?: { data?: { error?: unknown; message?: unknown } } } | undefined)?.response?.data
  if (typeof responseError?.message === 'string') return responseError.message
  if (typeof responseError?.error === 'string') return responseError.error
  return error instanceof Error ? error.message : fallback
}

export function formatDuration(value: number, language = '') {
  if (!Number.isFinite(value) || value <= 0) return '0s'
  if (language.toLowerCase().startsWith('zh')) {
    if (value < 60) return `${Math.round(value)} 秒`
    const minutes = Math.floor(value / 60)
    const seconds = Math.round(value % 60)
    return `${minutes} 分 ${seconds} 秒`
  }
  if (value < 60) return `${Math.round(value)}s`
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes}m ${seconds}s`
}

function appendFacetValues(target: string[], values: Array<string | undefined>) {
  for (const value of values) {
    const clean = value?.trim()
    if (clean && !target.includes(clean)) target.push(clean)
  }
}

function cleanText(value: string): string | undefined {
  return value.trim() || undefined
}

function titleFromFilename(sourceName: string): string {
  return sourceName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function roundTime(value: number): number {
  return Math.round(value * 10) / 10
}
