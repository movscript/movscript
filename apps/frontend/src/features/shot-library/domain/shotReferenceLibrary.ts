import type { RawResource } from '@/types'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import { normalizeAPIBaseURL } from '@/shared/infrastructure/config'
import type { ShotLibrarySourceConfig } from '@/shared/contracts/appSettings'

export type ShotLibraryAnalysisStatus = 'analyzing' | 'ready' | 'failed'
export type ShotLibrarySemanticCategory = 'intent' | 'pattern' | 'shotFunction' | 'visualPreference' | 'emotionalEffect'

export interface ShotLibraryVideoMetadata {
  durationSec?: number
  width?: number
  height?: number
}

export interface ShotLibraryEntry {
  ID: number
  sourceId: string
  sourceName: string
  sourceBaseURL: string
  sourceReadOnly: boolean
  groupId?: number
  groupTitle?: string
  groupSummary?: string
  order: number
  startSec?: number
  endSec?: number
  resourceId: number
  resourceName: string
  resourceUrl: string
  mimeType: string
  size: number
  title: string
  summary: string
  analysisStatus: ShotLibraryAnalysisStatus
  analysisSource: string
  intent: string[]
  pattern: string[]
  shotFunction: string[]
  visualPreference: string[]
  emotionalEffect: string[]
  executionDetails: {
    durationSec?: number
    resolution?: string
    aspectRatio?: string
    transitionIn?: string
    transitionOut?: string
    coverageRole?: string
    difficulty?: string
    requirements?: string[]
    blocking?: string
  }
  visualAnalysis: ShotVisualAnalysis
  sceneSemantics: ShotSceneSemantics
  narrativeFunction: ShotNarrativeFunction
  emotionalProfile: ShotEmotionalProfile
  reusablePattern: ShotReusablePattern
  searchIndex: ShotSearchIndex
  retrievalText: string
  createdAt: string
  updatedAt: string
}

export interface ShotVisualAnalysis {
  shot_size?: string
  framing?: string[]
  composition?: string[]
  camera_angle?: string
  camera_height?: string
  lens?: {
    focal_length_class?: string
    depth_of_field?: string
    optical_effects?: string[]
  }
  focus?: {
    behavior?: string
    initial_focus?: string
    final_focus?: string
  }
  camera_movement?: {
    type?: string
    speed?: string
    stability?: string
    motivation?: string
  }
  lighting?: {
    style?: string
    motivation?: string
    contrast?: string
    direction?: string
  }
  color?: {
    palette?: string
    contrast?: string
    saturation?: string
  }
  environment?: {
    location_type?: string
    spatial_feeling?: string[]
  }
  characters?: Array<{
    role?: string
    visibility?: string
    expression?: string
    action?: string
  }>
}

export interface ShotSceneSemantics {
  genre?: string[]
  scene_type?: string
  location_type?: string
  time_of_day?: string
  character_count?: string
  relationship_state?: string
  conflict_level?: string
  story_beat?: string
  production_scale?: string
}

export interface ShotNarrativeFunction {
  primary?: string
  secondary?: string[]
  information_state?: string
  sequence_position?: string
  relation_to_previous?: string
  relation_to_next?: string
}

export interface ShotEmotionalProfile {
  names?: string[]
  valence?: string
  arousal?: string
  dominance?: string
  viewer_position?: string
  intensity?: number
}

export interface ShotReusablePattern {
  pattern_ids?: string[]
  principle?: string
  works_when?: string[]
  avoid_when?: string[]
  variables?: Record<string, string>
}

export interface ShotSearchIndex {
  search_text?: string
  natural_language_queries?: string[]
  tags?: string[]
  visual_facets?: string[]
  narrative_facets?: string[]
  emotion_facets?: string[]
  pattern_facets?: string[]
  production_facets?: string[]
  confidence?: Record<string, number>
}

export interface ShotLibrarySource {
  id: string
  name: string
  baseURL: string
  apiV1BaseURL: string
  enabled: boolean
  readOnly: boolean
  authToken?: string
}

export interface ShotLibrarySourceResult {
  source: ShotLibrarySource
  page?: ShotLibraryPageResponse
  error?: unknown
}

export interface ShotLibraryPageResponse {
  total: number
  items: ShotReferenceApiEntry[]
  page: number
  page_size: number
}

export interface ShotReferenceApiEntry {
  ID: number
  group_id?: number
  group?: ShotReferenceApiGroup
  resource_id: number
  resource?: RawResource
  order?: number
  start_sec?: number
  end_sec?: number
  title: string
  summary: string
  analysis_status: ShotLibraryAnalysisStatus
  analysis_source?: string
  intent: string[]
  pattern: string[]
  shot_function: string[]
  visual_preference: string[]
  emotional_effect: string[]
  execution_details: {
    duration_sec?: number
    resolution?: string
    aspect_ratio?: string
    transition_in?: string
    transition_out?: string
    coverage_role?: string
    difficulty?: string
    requirements?: string[]
    blocking?: string
  }
  visual_analysis?: ShotVisualAnalysis
  scene_semantics?: ShotSceneSemantics
  narrative_function?: ShotNarrativeFunction
  emotional_profile?: ShotEmotionalProfile
  reusable_pattern?: ShotReusablePattern
  search_index?: ShotSearchIndex
  retrieval_text: string
  CreatedAt: string
  UpdatedAt: string
}

export interface ShotReferenceApiGroup {
  ID: number
  title: string
  summary?: string
  source_resource_id: number
  source_resource?: RawResource
  analysis_status: ShotLibraryAnalysisStatus
  cut_strategy: string
  CreatedAt: string
  UpdatedAt: string
}

export interface ShotReferenceManualUpdate {
  title: string
  summary: string
  intent: string[]
  pattern: string[]
  shot_function: string[]
  visual_preference: string[]
  emotional_effect: string[]
  execution_details?: ShotReferenceApiEntry['execution_details']
  visual_analysis?: ShotVisualAnalysis
  scene_semantics?: ShotSceneSemantics
  narrative_function?: ShotNarrativeFunction
  emotional_profile?: ShotEmotionalProfile
  reusable_pattern?: ShotReusablePattern
  start_sec?: number
  start_sec_set?: boolean
  end_sec?: number
  end_sec_set?: boolean
}

export interface ShotSearchMatch {
  category: 'text' | 'tag' | 'visual' | 'narrative' | 'emotion' | 'pattern' | 'production'
  value: string
  weight: number
  term?: string
}

export interface ShotSearchResult {
  entry: ShotLibraryEntry
  score: number
  matches: ShotSearchMatch[]
}

export interface ShotLibraryFacetFilters {
  visual?: string[]
  narrative?: string[]
  emotion?: string[]
  pattern?: string[]
  production?: string[]
}

export interface CreateShotReferencesFromResourceInput {
  resource_id: number
  group_id?: number
  group_title?: string
  duration_sec?: number
  width?: number
  height?: number
  shots: ShotReferenceManualUpdate[]
}

export interface CreateShotReferencesFromResourceResponse {
  total: number
  items: ShotReferenceApiEntry[]
}

export interface ShotLibraryVideoInput {
  name: string
  size: number
  type?: string
}

const INTENT_HINTS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /reveal|揭示|真相|发现|discover|find/i, value: 'reveal_information' },
  { pattern: /tension|紧张|压迫|pressure|suspense/i, value: 'create_tension' },
  { pattern: /lonely|孤独|isolate|alone|empty/i, value: 'isolate_character' },
  { pattern: /memory|回忆|remember|nostalgia/i, value: 'evoke_memory' },
  { pattern: /power|权力|威胁|threat|dominance/i, value: 'show_power_shift' },
]

const PATTERN_HINTS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /push|推进|慢推|dolly/i, value: 'slow_push_in' },
  { pattern: /handheld|手持|shake|晃动/i, value: 'handheld_follow' },
  { pattern: /obstruct|遮挡|door|window|frame/i, value: 'foreground_obstruction' },
  { pattern: /wide|远景|empty|空镜/i, value: 'negative_space_pressure' },
  { pattern: /close|特写|face|reaction/i, value: 'reaction_close_up' },
]

export function analyzeShotReference(
  resource: RawResource,
  video: ShotLibraryVideoInput,
  metadata: ShotLibraryVideoMetadata = {},
  now = new Date(),
): ShotLibraryEntry {
  const durationSec = normalizedDuration(metadata.durationSec)
  const resolution = metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : undefined
  const aspectRatio = metadata.width && metadata.height ? formatAspectRatio(metadata.width, metadata.height) : undefined
  const durationIntent = durationSec && durationSec >= 8 ? 'slow_viewer_down' : 'guide_attention'
  const inferredIntent = unique([
    ...matchHints(video.name, INTENT_HINTS),
    durationIntent,
  ])
  const inferredPattern = unique([
    ...matchHints(video.name, PATTERN_HINTS),
    durationSec && durationSec >= 8 ? 'static_observation' : 'insert_detail',
  ].filter(Boolean) as string[])
  const shotFunction = durationSec && durationSec >= 8
    ? ['tension_buildup', 'emotional_pause']
    : ['reference_moment', 'visual_cue']
  const visualPreference = unique([
    aspectRatioLabel(metadata.width, metadata.height),
    durationSec && durationSec >= 8 ? 'restrained_pacing' : 'compact_pacing',
    'video_reference',
  ].filter(Boolean) as string[])
  const emotionalEffect = inferredIntent.includes('create_tension')
    ? ['suspense']
    : inferredIntent.includes('isolate_character')
      ? ['isolation']
      : ['reference_mood']
  const title = titleFromResourceName(video.name)
  const summary = buildSummary(title, durationSec, resolution, inferredIntent, inferredPattern)
  const visualAnalysis = inferVisualAnalysis(video.name, inferredIntent, inferredPattern, visualPreference, emotionalEffect, durationSec)
  const sceneSemantics = inferSceneSemantics(video.name, inferredIntent, emotionalEffect)
  const narrativeFunction = inferNarrativeFunction(inferredIntent, shotFunction, inferredPattern)
  const emotionalProfile = inferEmotionalProfile(emotionalEffect, inferredIntent)
  const reusablePattern = inferReusablePattern(inferredIntent, inferredPattern)
  const executionDetails = enrichExecutionDetails({
    durationSec,
    resolution,
    aspectRatio,
  }, visualAnalysis, inferredPattern)
  const searchIndex = buildSearchIndex({
    title,
    summary,
    resourceName: video.name,
    intent: inferredIntent,
    pattern: inferredPattern,
    shotFunction,
    visualPreference,
    emotionalEffect,
    visualAnalysis,
    sceneSemantics,
    narrativeFunction,
    emotionalProfile,
    reusablePattern,
    executionDetails,
  })
  const retrievalText = searchIndex.search_text ?? ''
  const timestamp = now.toISOString()

  return {
    ID: resource.ID,
    sourceId: 'local',
    sourceName: 'Local',
    sourceBaseURL: '',
    sourceReadOnly: false,
    order: 1,
    resourceId: resource.ID,
    resourceName: resource.name,
    resourceUrl: resource.url,
    mimeType: resource.mime_type,
    size: resource.size,
    title,
    summary,
    analysisStatus: 'ready',
    analysisSource: 'manual_draft',
    intent: inferredIntent,
    pattern: inferredPattern,
    shotFunction,
    visualPreference,
    emotionalEffect,
    executionDetails,
    visualAnalysis,
    sceneSemantics,
    narrativeFunction,
    emotionalProfile,
    reusablePattern,
    searchIndex,
    retrievalText,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function normalizeShotLibrarySources(
  sources: ShotLibrarySourceConfig[] | undefined,
  currentAPIBaseURL: string,
  fallbackName = 'Movscript',
): ShotLibrarySource[] {
  const fallback: ShotLibrarySourceConfig = {
    id: 'default',
    name: fallbackName,
    baseURL: currentAPIBaseURL,
    enabled: true,
  }
  const configured = Array.isArray(sources) && sources.length > 0 ? sources : [fallback]
  const result = new Map<string, ShotLibrarySource>()
  for (const source of configured) {
    const normalized = normalizeShotLibrarySource(source)
    if (normalized) result.set(normalized.id, normalized)
  }
  if (result.size === 0) {
    const normalized = normalizeShotLibrarySource(fallback)
    if (normalized) result.set(normalized.id, normalized)
  }
  return Array.from(result.values())
}

export function shotLibraryEntryFromApi(input: ShotReferenceApiEntry, source?: ShotLibrarySource): ShotLibraryEntry {
  const resource = input.resource
  const sourceBaseURL = source?.baseURL ?? ''
  return {
    ID: input.ID,
    sourceId: source?.id ?? 'default',
    sourceName: source?.name ?? 'Movscript',
    sourceBaseURL,
    sourceReadOnly: source?.readOnly ?? false,
    groupId: input.group_id ?? input.group?.ID,
    groupTitle: input.group?.title,
    groupSummary: input.group?.summary,
    order: input.order ?? 1,
    startSec: input.start_sec,
    endSec: input.end_sec,
    resourceId: input.resource_id,
    resourceName: resource?.name ?? `Resource #${input.resource_id}`,
    resourceUrl: resolveShotLibraryResourceUrl(sourceBaseURL, resource?.url ?? `/api/v1/resources/${input.resource_id}/file`),
    mimeType: resource?.mime_type ?? 'video/mp4',
    size: resource?.size ?? 0,
    title: input.title,
    summary: input.summary,
    analysisStatus: input.analysis_status,
    analysisSource: input.analysis_source ?? 'manual',
    intent: input.intent ?? [],
    pattern: input.pattern ?? [],
    shotFunction: input.shot_function ?? [],
    visualPreference: input.visual_preference ?? [],
    emotionalEffect: input.emotional_effect ?? [],
    executionDetails: {
      durationSec: input.execution_details?.duration_sec,
      resolution: input.execution_details?.resolution,
      aspectRatio: input.execution_details?.aspect_ratio,
      transitionIn: input.execution_details?.transition_in,
      transitionOut: input.execution_details?.transition_out,
      coverageRole: input.execution_details?.coverage_role,
      difficulty: input.execution_details?.difficulty,
      requirements: input.execution_details?.requirements ?? [],
      blocking: input.execution_details?.blocking,
    },
    visualAnalysis: input.visual_analysis ?? {},
    sceneSemantics: input.scene_semantics ?? {},
    narrativeFunction: input.narrative_function ?? {},
    emotionalProfile: input.emotional_profile ?? {},
    reusablePattern: input.reusable_pattern ?? {},
    searchIndex: input.search_index ?? {},
    retrievalText: input.retrieval_text,
    createdAt: input.CreatedAt,
    updatedAt: input.UpdatedAt,
  }
}

export async function listShotLibrarySource(
  apiClient: AxiosInstance,
  source: ShotLibrarySource,
  query: string,
): Promise<ShotLibrarySourceResult> {
  const params = new URLSearchParams()
  params.set('page', '1')
  params.set('page_size', '100')
  if (query.trim()) params.set('q', query.trim())
  try {
    const response = await apiClient.get<ShotLibraryPageResponse>(`/shot-references?${params}`, requestConfigForSource(source))
    return { source, page: response.data }
  } catch (error) {
    return { source, error }
  }
}

export async function uploadShotReferenceToSource(
  apiClient: AxiosInstance,
  source: ShotLibrarySource,
  form: FormData,
  config: Pick<AxiosRequestConfig, 'onUploadProgress'> = {},
): Promise<ShotLibraryEntry> {
  const response = await apiClient.post<ShotReferenceApiEntry>('/shot-references/upload', form, {
    ...requestConfigForSource(source),
    ...config,
  })
  return shotLibraryEntryFromApi(response.data, source)
}

export async function uploadShotLibraryResourceToSource(
  apiClient: AxiosInstance,
  source: ShotLibrarySource,
  form: FormData,
  config: Pick<AxiosRequestConfig, 'onUploadProgress'> = {},
): Promise<RawResource> {
  const response = await apiClient.post<RawResource>('/resources/upload', form, {
    ...requestConfigForSource(source),
    ...config,
  })
  return response.data
}

export async function createShotReferencesFromResourceInSource(
  apiClient: AxiosInstance,
  source: ShotLibrarySource,
  input: CreateShotReferencesFromResourceInput,
): Promise<ShotLibraryEntry[]> {
  const response = await apiClient.post<CreateShotReferencesFromResourceResponse>(
    '/shot-references/from-resource',
    input,
    requestConfigForSource(source),
  )
  return response.data.items.map(item => shotLibraryEntryFromApi(item, source))
}

export async function deleteShotReferenceFromSource(
  apiClient: AxiosInstance,
  source: ShotLibrarySource,
  entryId: number,
): Promise<void> {
  await apiClient.delete(`/shot-references/${entryId}`, requestConfigForSource(source))
}

export async function updateShotReferenceInSource(
  apiClient: AxiosInstance,
  source: ShotLibrarySource,
  entryId: number,
  input: ShotReferenceManualUpdate,
): Promise<ShotLibraryEntry> {
  const response = await apiClient.patch<ShotReferenceApiEntry>(`/shot-references/${entryId}`, input, requestConfigForSource(source))
  return shotLibraryEntryFromApi(response.data, source)
}

export function searchShotReferences(entries: ShotLibraryEntry[], query: string): ShotLibraryEntry[] {
  return searchShotReferenceResults(entries, query).map(result => result.entry)
}

export function searchShotReferenceResults(entries: ShotLibraryEntry[], query: string, filters: ShotLibraryFacetFilters = {}): ShotSearchResult[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const filtered = entries.filter(entry => matchesFacetFilters(entry, filters))
  if (terms.length === 0) {
    return filtered.map(entry => ({ entry, score: 0, matches: facetFilterMatches(entry, filters) }))
  }
  return filtered
    .map(entry => scoreShotReference(entry, terms, filters))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
}

export function mergeShotReferences(entries: ShotLibraryEntry[], next: ShotLibraryEntry): ShotLibraryEntry[] {
  const withoutExisting = entries.filter(entry => {
    if (entry.sourceId !== next.sourceId) return true
    return entry.ID !== next.ID && entry.resourceId !== next.resourceId
  })
  return [next, ...withoutExisting]
}

export function localizeShotSemanticValue(category: ShotLibrarySemanticCategory, value: string, language: string): string {
  if (!language.toLowerCase().startsWith('zh')) return value
  return SHOT_SEMANTIC_LABELS_ZH[category]?.[value] ?? value
}

export function localizeShotSummary(entry: Pick<ShotLibraryEntry, 'title' | 'intent' | 'pattern' | 'executionDetails'>, language: string): string {
  if (!language.toLowerCase().startsWith('zh')) {
    const duration = entry.executionDetails.durationSec ? `${formatDuration(entry.executionDetails.durationSec)} reference` : 'video reference'
    const quality = entry.executionDetails.resolution ? ` at ${entry.executionDetails.resolution}` : ''
    return `${entry.title} is a ${duration}${quality}; inferred intents include ${entry.intent.slice(0, 2).join(', ')} and reusable patterns include ${entry.pattern.slice(0, 2).join(', ')}.`
  }
  const duration = entry.executionDetails.durationSec ? `${formatDurationZh(entry.executionDetails.durationSec)}镜头参考` : '镜头视频参考'
  const quality = entry.executionDetails.resolution ? `，分辨率 ${entry.executionDetails.resolution}` : ''
  const intents = entry.intent.slice(0, 2).map(value => localizeShotSemanticValue('intent', value, language)).join('、') || '引导注意'
  const patterns = entry.pattern.slice(0, 2).map(value => localizeShotSemanticValue('pattern', value, language)).join('、') || '可复用镜头模式'
  return `${entry.title} 是一条${duration}${quality}；它主要用于${intents}，可复用的镜头模式包括${patterns}。`
}

const SHOT_SEMANTIC_LABELS_ZH: Record<ShotLibrarySemanticCategory, Record<string, string>> = {
  intent: {
    reveal_information: '揭示信息',
    create_tension: '制造紧张感',
    isolate_character: '突出角色孤立',
    evoke_memory: '唤起回忆',
    show_power_shift: '表现权力变化',
    slow_viewer_down: '让观众放慢感受',
    guide_attention: '引导注意力',
  },
  pattern: {
    slow_push_in: '慢推近',
    handheld_follow: '手持跟拍',
    foreground_obstruction: '前景遮挡',
    negative_space_pressure: '留白压迫',
    reaction_close_up: '反应特写',
    static_observation: '静态观察',
    insert_detail: '细节插入',
  },
  shotFunction: {
    reference_moment: '参考片刻',
    visual_cue: '视觉提示',
    tension_buildup: '铺垫紧张',
    emotional_pause: '情绪停顿',
  },
  visualPreference: {
    landscape_frame: '横构图',
    vertical_frame: '竖构图',
    square_frame: '方构图',
    restrained_pacing: '克制节奏',
    compact_pacing: '紧凑节奏',
    video_reference: '视频参考',
  },
  emotionalEffect: {
    reference_mood: '参考氛围',
    suspense: '悬疑感',
    isolation: '孤立感',
  },
}

function scoreShotReference(entry: ShotLibraryEntry, terms: string[], filters: ShotLibraryFacetFilters = {}): ShotSearchResult {
  const haystacks = [
    { category: 'text' as const, label: 'title', text: entry.title, weight: 6 },
    { category: 'text' as const, label: 'summary', text: entry.summary, weight: 4 },
    { category: 'text' as const, label: 'retrieval_text', text: entry.retrievalText, weight: 2 },
    { category: 'text' as const, label: 'resource', text: entry.resourceName, weight: 3 },
    { category: 'text' as const, label: 'source', text: entry.sourceName, weight: 2 },
    { category: 'text' as const, label: 'group', text: entry.groupTitle ?? '', weight: 4 },
    { category: 'tag' as const, label: 'intent', text: entry.intent.join(' '), weight: 5 },
    { category: 'tag' as const, label: 'pattern', text: entry.pattern.join(' '), weight: 5 },
    { category: 'tag' as const, label: 'shot_function', text: entry.shotFunction.join(' '), weight: 4 },
    { category: 'tag' as const, label: 'visual_preference', text: entry.visualPreference.join(' '), weight: 3 },
    { category: 'emotion' as const, label: 'emotional_effect', text: entry.emotionalEffect.join(' '), weight: 3 },
    { category: 'text' as const, label: 'search_text', text: entry.searchIndex.search_text ?? '', weight: 5 },
    { category: 'text' as const, label: 'query_examples', text: entry.searchIndex.natural_language_queries?.join(' ') ?? '', weight: 6 },
    { category: 'visual' as const, label: 'visual_facets', text: entry.searchIndex.visual_facets?.join(' ') ?? '', weight: 4 },
    { category: 'narrative' as const, label: 'narrative_facets', text: entry.searchIndex.narrative_facets?.join(' ') ?? '', weight: 5 },
    { category: 'emotion' as const, label: 'emotion_facets', text: entry.searchIndex.emotion_facets?.join(' ') ?? '', weight: 5 },
    { category: 'pattern' as const, label: 'pattern_facets', text: entry.searchIndex.pattern_facets?.join(' ') ?? '', weight: 5 },
    { category: 'production' as const, label: 'production_facets', text: entry.searchIndex.production_facets?.join(' ') ?? '', weight: 3 },
    { category: 'visual' as const, label: 'shot_size', text: entry.visualAnalysis.shot_size ?? '', weight: 3 },
    { category: 'visual' as const, label: 'composition', text: entry.visualAnalysis.composition?.join(' ') ?? '', weight: 4 },
    { category: 'visual' as const, label: 'framing', text: entry.visualAnalysis.framing?.join(' ') ?? '', weight: 4 },
    { category: 'visual' as const, label: 'movement', text: entry.visualAnalysis.camera_movement?.type ?? '', weight: 4 },
    { category: 'visual' as const, label: 'movement_motivation', text: entry.visualAnalysis.camera_movement?.motivation ?? '', weight: 4 },
    { category: 'visual' as const, label: 'focus', text: entry.visualAnalysis.focus?.behavior ?? '', weight: 3 },
    { category: 'narrative' as const, label: 'primary_function', text: entry.narrativeFunction.primary ?? '', weight: 5 },
    { category: 'narrative' as const, label: 'information_state', text: entry.narrativeFunction.information_state ?? '', weight: 4 },
    { category: 'emotion' as const, label: 'viewer_position', text: entry.emotionalProfile.viewer_position ?? '', weight: 4 },
    { category: 'pattern' as const, label: 'principle', text: entry.reusablePattern.principle ?? '', weight: 4 },
  ].map(item => ({ ...item, normalized: item.text.toLowerCase() }))
  const matches: ShotSearchMatch[] = facetFilterMatches(entry, filters)
  let score = 0
  for (const term of terms) {
    for (const item of haystacks) {
      if (!item.normalized.includes(term)) continue
      score += item.weight
      matches.push({ category: item.category, value: item.label, weight: item.weight, term })
    }
  }
  return { entry, score, matches: dedupeMatches(matches) }
}

function matchesFacetFilters(entry: ShotLibraryEntry, filters: ShotLibraryFacetFilters): boolean {
  return facetCategories.every(category => {
    const selected = filters[category] ?? []
    if (selected.length === 0) return true
    const values = facetValuesForEntry(entry, category)
    return selected.every(value => values.includes(value))
  })
}

function facetFilterMatches(entry: ShotLibraryEntry, filters: ShotLibraryFacetFilters): ShotSearchMatch[] {
  return facetCategories.flatMap(category => {
    const selected = filters[category] ?? []
    if (selected.length === 0) return []
    const values = facetValuesForEntry(entry, category)
    return selected
      .filter(value => values.includes(value))
      .map(value => ({ category, value, weight: 2 }))
  })
}

const facetCategories = ['visual', 'narrative', 'emotion', 'pattern', 'production'] as const

function facetValuesForEntry(entry: ShotLibraryEntry, category: typeof facetCategories[number]): string[] {
  switch (category) {
    case 'visual':
      return unique([
        ...(entry.searchIndex.visual_facets ?? []),
        entry.visualAnalysis.shot_size,
        entry.visualAnalysis.camera_movement?.type,
        entry.visualAnalysis.camera_movement?.stability,
        entry.visualAnalysis.focus?.behavior,
        ...(entry.visualAnalysis.framing ?? []),
        ...(entry.visualAnalysis.composition ?? []),
      ].filter(Boolean) as string[])
    case 'narrative':
      return unique([...(entry.searchIndex.narrative_facets ?? []), entry.narrativeFunction.primary, entry.narrativeFunction.information_state].filter(Boolean) as string[])
    case 'emotion':
      return unique([...(entry.searchIndex.emotion_facets ?? []), ...(entry.emotionalProfile.names ?? []), ...entry.emotionalEffect].filter(Boolean) as string[])
    case 'pattern':
      return unique([...(entry.searchIndex.pattern_facets ?? []), ...(entry.reusablePattern.pattern_ids ?? []), ...entry.pattern].filter(Boolean) as string[])
    case 'production':
      return unique([...(entry.searchIndex.production_facets ?? []), ...(entry.executionDetails.requirements ?? []), entry.executionDetails.coverageRole, entry.executionDetails.difficulty].filter(Boolean) as string[])
  }
}

function dedupeMatches(matches: ShotSearchMatch[]): ShotSearchMatch[] {
  const seen = new Set<string>()
  const result: ShotSearchMatch[] = []
  for (const match of matches) {
    const key = `${match.category}:${match.value}:${match.term ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(match)
  }
  return result.slice(0, 12)
}

function normalizeShotLibrarySource(source: ShotLibrarySourceConfig): ShotLibrarySource | null {
  if (!source.id?.trim() || !source.name?.trim() || !source.baseURL?.trim()) return null
  const baseURL = normalizeAPIBaseURL(source.baseURL)
  return {
    id: source.id.trim(),
    name: source.name.trim(),
    baseURL,
    apiV1BaseURL: `${baseURL}/api/v1`,
    enabled: source.enabled !== false,
    readOnly: source.readOnly === true,
    authToken: source.authToken?.trim() || undefined,
  }
}

function requestConfigForSource(source: ShotLibrarySource): AxiosRequestConfig {
  return {
    baseURL: source.apiV1BaseURL,
    headers: source.authToken ? { Authorization: `Bearer ${source.authToken}` } : undefined,
  }
}

function resolveShotLibraryResourceUrl(baseURL: string, url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (!baseURL) return url
  try {
    return new URL(url, baseURL).toString()
  } catch {
    return url
  }
}

function buildSummary(title: string, durationSec: number | undefined, resolution: string | undefined, intent: string[], pattern: string[]) {
  const duration = durationSec ? `${formatDuration(durationSec)} reference` : 'video reference'
  const quality = resolution ? ` at ${resolution}` : ''
  return `${title} is a ${duration}${quality}; inferred intents include ${intent.slice(0, 2).join(', ')} and reusable patterns include ${pattern.slice(0, 2).join(', ')}.`
}

interface SearchIndexBuildInput {
  title: string
  summary: string
  resourceName: string
  intent: string[]
  pattern: string[]
  shotFunction: string[]
  visualPreference: string[]
  emotionalEffect: string[]
  visualAnalysis: ShotVisualAnalysis
  sceneSemantics: ShotSceneSemantics
  narrativeFunction: ShotNarrativeFunction
  emotionalProfile: ShotEmotionalProfile
  reusablePattern: ShotReusablePattern
  executionDetails: ShotLibraryEntry['executionDetails']
}

function inferVisualAnalysis(source: string, intent: string[], pattern: string[], visualPreference: string[], emotionalEffect: string[], durationSec?: number): ShotVisualAnalysis {
  const text = source.toLowerCase()
  const analysis: ShotVisualAnalysis = {
    shot_size: 'medium_shot',
    camera_angle: 'eye_level',
    camera_height: 'standing_eye_level',
    lens: { focal_length_class: 'normal_lens', depth_of_field: 'moderate_depth' },
    focus: { behavior: 'hold_focus', final_focus: 'subject' },
    camera_movement: { type: 'static', speed: 'still', stability: 'locked_off' },
    lighting: { style: 'naturalistic', contrast: 'medium' },
    color: { palette: 'neutral', contrast: 'medium', saturation: 'medium' },
    environment: { location_type: 'unspecified', spatial_feeling: ['reference_space'] },
    characters: [{ role: 'subject', visibility: 'readable', expression: 'unspecified', action: 'reference_action' }],
  }
  if (/close|特写|face|reaction/.test(text) || pattern.includes('reaction_close_up')) {
    analysis.shot_size = 'close_up'
    analysis.composition = unique([...(analysis.composition ?? []), 'close_framing'])
    analysis.characters = [{ ...(analysis.characters?.[0] ?? {}), expression: 'reaction', action: 'reacts' }]
  }
  if (/wide|远景|empty/.test(text) || pattern.includes('negative_space_pressure')) {
    analysis.shot_size = 'wide_shot'
    analysis.composition = unique([...(analysis.composition ?? []), 'negative_space'])
    analysis.environment = { ...analysis.environment, spatial_feeling: ['large', 'isolating'] }
  }
  if (pattern.includes('slow_push_in')) {
    analysis.camera_movement = { type: 'push_in', speed: 'slow', stability: 'smooth', motivation: 'psychological_pressure' }
  }
  if (pattern.includes('handheld_follow')) {
    analysis.camera_movement = { type: 'follow', speed: 'reactive', stability: 'handheld', motivation: 'subjective_presence' }
  }
  if (pattern.includes('foreground_obstruction')) {
    analysis.framing = unique([...(analysis.framing ?? []), 'foreground_obstruction'])
    analysis.composition = unique([...(analysis.composition ?? []), 'layered_depth'])
    analysis.lens = { ...analysis.lens, optical_effects: unique([...(analysis.lens?.optical_effects ?? []), 'foreground_blur']) }
    analysis.focus = { behavior: 'soft_or_rack_reveal', initial_focus: 'foreground', final_focus: 'subject' }
    analysis.characters = [{ ...(analysis.characters?.[0] ?? {}), visibility: 'partially_obscured' }]
  }
  if (intent.includes('create_tension') || emotionalEffect.includes('suspense')) {
    analysis.lighting = { ...analysis.lighting, style: 'low_key', contrast: 'medium_high' }
    analysis.color = { ...analysis.color, palette: 'cool_muted', saturation: 'low' }
  }
  if (intent.includes('isolate_character')) {
    analysis.composition = unique([...(analysis.composition ?? []), 'off_center_subject', 'negative_space'])
    analysis.environment = { ...analysis.environment, spatial_feeling: unique([...(analysis.environment?.spatial_feeling ?? []), 'empty', 'distant']) }
  }
  if (visualPreference.includes('vertical_frame')) analysis.framing = unique([...(analysis.framing ?? []), 'vertical_frame'])
  if (visualPreference.includes('landscape_frame')) analysis.framing = unique([...(analysis.framing ?? []), 'landscape_frame'])
  if (durationSec && durationSec >= 8) analysis.composition = unique([...(analysis.composition ?? []), 'held_composition'])
  return analysis
}

function inferSceneSemantics(source: string, intent: string[], emotionalEffect: string[]): ShotSceneSemantics {
  const text = source.toLowerCase()
  const semantics: ShotSceneSemantics = {
    genre: ['drama'],
    scene_type: 'reference_moment',
    location_type: 'unspecified',
    conflict_level: 'medium',
    story_beat: 'visual_reference',
    production_scale: 'small_to_medium',
  }
  if (/office|办公室/.test(text)) semantics.location_type = 'office_interior'
  if (/door|room|室内/.test(text)) semantics.location_type = 'interior'
  if (intent.includes('create_tension') || emotionalEffect.includes('suspense')) {
    semantics.genre = unique([...(semantics.genre ?? []), 'thriller'])
    semantics.scene_type = 'suspense_or_discovery'
    semantics.conflict_level = 'medium_high'
    semantics.story_beat = 'before_reveal'
  }
  if (intent.includes('reveal_information')) {
    semantics.scene_type = 'discovery'
    semantics.story_beat = 'reveal'
  }
  if (intent.includes('isolate_character')) semantics.relationship_state = 'distance_or_disconnection'
  return semantics
}

function inferNarrativeFunction(intent: string[], shotFunction: string[], pattern: string[]): ShotNarrativeFunction {
  const fn: ShotNarrativeFunction = {
    primary: shotFunction[0] ?? 'reference_moment',
    secondary: shotFunction.slice(0, 3),
    information_state: 'present_information',
    sequence_position: 'reference',
    relation_to_previous: 'continues_attention',
    relation_to_next: 'supports_next_cut',
  }
  if (intent.includes('reveal_information')) {
    fn.primary = 'delayed_reveal'
    fn.information_state = 'withhold_then_reveal'
    fn.sequence_position = 'setup_or_payoff'
    fn.relation_to_previous = 'narrows_attention'
    fn.relation_to_next = 'prepares_reaction'
  }
  if (intent.includes('create_tension')) fn.secondary = unique([...(fn.secondary ?? []), 'build_tension', 'guide_attention'])
  if (pattern.includes('insert_detail')) {
    fn.primary = 'insert_detail'
    fn.relation_to_next = 'motivates_reaction'
  }
  return fn
}

function inferEmotionalProfile(emotionalEffect: string[], intent: string[]): ShotEmotionalProfile {
  const profile: ShotEmotionalProfile = {
    names: emotionalEffect,
    valence: 'neutral',
    arousal: 'medium',
    dominance: 'medium',
    viewer_position: 'observer',
    intensity: 0.5,
  }
  if (emotionalEffect.includes('suspense') || intent.includes('create_tension')) {
    profile.names = unique([...(profile.names ?? []), 'suspense', 'unease'])
    profile.valence = 'negative'
    profile.arousal = 'medium_high'
    profile.dominance = 'low'
    profile.viewer_position = 'hidden_observer'
    profile.intensity = 0.78
  }
  if (emotionalEffect.includes('isolation') || intent.includes('isolate_character')) {
    profile.names = unique([...(profile.names ?? []), 'isolation', 'loneliness'])
    profile.valence = 'negative'
    profile.arousal = 'low_medium'
    profile.dominance = 'low'
    profile.viewer_position = 'distant_observer'
    profile.intensity = 0.68
  }
  return profile
}

function inferReusablePattern(intent: string[], pattern: string[]): ShotReusablePattern {
  const principle = pattern.length > 0
    ? `Reuse ${pattern[0]} when the scene needs ${intent.slice(0, 2).join(' / ')}.`
    : 'Use this reference as a visual mood and execution anchor.'
  const result: ShotReusablePattern = {
    pattern_ids: pattern,
    principle,
    works_when: [
      'the scene needs a reusable visual method',
      'the audience should understand the shot through image structure',
    ],
    avoid_when: ['the story beat requires a simpler or more direct shot'],
    variables: {},
  }
  if (pattern.includes('foreground_obstruction')) {
    result.principle = 'Place a visual barrier between camera and subject, then reduce distance or increase visibility to delay emotional access.'
    result.works_when = ['the scene benefits from withholding information', 'the subject can stay partially readable', 'the location has foreground layers']
    result.avoid_when = ['the action must be immediately clear', 'the scene needs direct emotional openness']
    result.variables = { ...result.variables, obstruction_type: 'doorframe_or_foreground_object', subject_visibility: 'partial_to_clear' }
  }
  if (pattern.includes('slow_push_in')) result.variables = { ...result.variables, camera_distance_change: 'slow_push_in', reveal_speed: 'slow' }
  if (pattern.includes('negative_space_pressure')) result.variables = { ...result.variables, space_ratio: 'large_environment_small_subject' }
  return result
}

function enrichExecutionDetails(details: ShotLibraryEntry['executionDetails'], visual: ShotVisualAnalysis, pattern: string[]): ShotLibraryEntry['executionDetails'] {
  const requirements = ['video_reference']
  if (pattern.includes('slow_push_in')) requirements.push('slow_dolly_or_gimbal')
  if (pattern.includes('foreground_obstruction')) requirements.push('foreground_layer', 'controlled_focus')
  if (visual.camera_movement?.stability === 'handheld') requirements.push('handheld_operator')
  return {
    ...details,
    transitionIn: details.transitionIn ?? 'cut',
    transitionOut: details.transitionOut ?? 'cut_to_next_beat',
    coverageRole: details.coverageRole ?? 'reference_shot',
    difficulty: details.difficulty ?? 'medium',
    blocking: details.blocking ?? 'stage the subject so the camera relationship expresses the selected pattern',
    requirements: unique([...(details.requirements ?? []), ...requirements]),
  }
}

function buildSearchIndex(input: SearchIndexBuildInput): ShotSearchIndex {
  const visualFacets = visualFacetValues(input.visualAnalysis)
  const narrativeFacets = unique([
    input.narrativeFunction.primary,
    ...(input.narrativeFunction.secondary ?? []),
    input.narrativeFunction.information_state,
    input.narrativeFunction.sequence_position,
    input.narrativeFunction.relation_to_previous,
    input.narrativeFunction.relation_to_next,
  ].filter(Boolean) as string[])
  const emotionFacets = unique([
    ...(input.emotionalProfile.names ?? []),
    input.emotionalProfile.valence,
    input.emotionalProfile.arousal,
    input.emotionalProfile.dominance,
    input.emotionalProfile.viewer_position,
  ].filter(Boolean) as string[])
  const patternFacets = unique([...input.pattern, ...(input.reusablePattern.pattern_ids ?? [])])
  const productionFacets = unique([
    input.executionDetails.aspectRatio,
    input.executionDetails.resolution,
    input.executionDetails.transitionIn,
    input.executionDetails.transitionOut,
    input.executionDetails.coverageRole,
    input.executionDetails.difficulty,
    ...(input.executionDetails.requirements ?? []),
  ].filter(Boolean) as string[])
  const tags = unique([...input.intent, ...input.pattern, ...input.shotFunction, ...input.visualPreference, ...input.emotionalEffect])
  const naturalLanguageQueries = naturalLanguageQueriesForShot(input)
  const searchText = [
    input.title,
    input.summary,
    input.resourceName,
    tags.join(' '),
    visualFacets.join(' '),
    narrativeFacets.join(' '),
    emotionFacets.join(' '),
    patternFacets.join(' '),
    productionFacets.join(' '),
    naturalLanguageQueries.join(' '),
    input.reusablePattern.principle,
    input.executionDetails.blocking,
  ].filter(Boolean).join(' ')
  return {
    search_text: searchText,
    natural_language_queries: naturalLanguageQueries,
    tags,
    visual_facets: visualFacets,
    narrative_facets: narrativeFacets,
    emotion_facets: emotionFacets,
    pattern_facets: patternFacets,
    production_facets: productionFacets,
    confidence: {
      visual_analysis: 0.64,
      narrative_function: 0.7,
      emotional_effect: 0.68,
      reusable_pattern: 0.66,
    },
  }
}

function visualFacetValues(visual: ShotVisualAnalysis): string[] {
  return unique([
    visual.shot_size,
    visual.camera_angle,
    visual.camera_height,
    visual.lens?.focal_length_class,
    visual.lens?.depth_of_field,
    ...(visual.lens?.optical_effects ?? []),
    visual.focus?.behavior,
    visual.focus?.initial_focus,
    visual.focus?.final_focus,
    visual.camera_movement?.type,
    visual.camera_movement?.speed,
    visual.camera_movement?.stability,
    visual.camera_movement?.motivation,
    visual.lighting?.style,
    visual.lighting?.motivation,
    visual.lighting?.contrast,
    visual.lighting?.direction,
    visual.color?.palette,
    visual.color?.contrast,
    visual.color?.saturation,
    visual.environment?.location_type,
    ...(visual.framing ?? []),
    ...(visual.composition ?? []),
    ...(visual.environment?.spatial_feeling ?? []),
    ...(visual.characters ?? []).flatMap(character => [character.role, character.visibility, character.expression, character.action]),
  ].filter(Boolean) as string[])
}

function naturalLanguageQueriesForShot(input: SearchIndexBuildInput): string[] {
  const queries: string[] = []
  if (input.intent.includes('create_tension')) queries.push('气氛慢慢变紧的镜头', 'suspense tension buildup shot')
  if (input.intent.includes('reveal_information') || input.narrativeFunction.primary === 'delayed_reveal') queries.push('角色发现真相前的延迟揭示', 'delayed reveal before discovery')
  if (input.pattern.includes('foreground_obstruction')) queries.push('前景遮挡像被偷看一样的镜头', 'foreground obstruction hidden observer shot')
  if (input.pattern.includes('slow_push_in')) queries.push('慢推近制造压迫感', 'slow push in psychological pressure')
  if (input.intent.includes('isolate_character')) queries.push('角色孤独留白压迫', 'isolate character with negative space')
  return unique(queries)
}

function matchHints(value: string, hints: Array<{ pattern: RegExp; value: string }>) {
  return hints.filter(hint => hint.pattern.test(value)).map(hint => hint.value)
}

function titleFromResourceName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled shot reference'
}

function normalizedDuration(value?: number) {
  if (!value || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value * 10) / 10
}

function formatDuration(value: number) {
  if (value < 60) return `${value.toFixed(value % 1 === 0 ? 0 : 1)}s`
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes}m ${seconds}s`
}

function formatDurationZh(value: number) {
  if (value < 60) return `${value.toFixed(value % 1 === 0 ? 0 : 1)} 秒`
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes} 分 ${seconds} 秒`
}

function aspectRatioLabel(width?: number, height?: number) {
  if (!width || !height) return undefined
  if (width > height) return 'landscape_frame'
  if (height > width) return 'vertical_frame'
  return 'square_frame'
}

function formatAspectRatio(width: number, height: number) {
  const divisor = gcd(width, height)
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}
