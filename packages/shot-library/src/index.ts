import {
  normalizeAPIBaseURL,
  type ShotLibrarySourceConfig,
} from '@movscript/shared'

export type ShotLibraryAnalysisStatus = 'analyzing' | 'ready' | 'failed'
export type ShotLibrarySemanticCategory = 'intent' | 'pattern' | 'shotFunction' | 'visualPreference' | 'emotionalEffect'

export interface ShotLibraryVideoMetadata {
  durationSec?: number
  width?: number
  height?: number
}

export interface ShotLibraryResourceLike {
  ID: number
  name: string
  url: string
  size: number
  mime_type: string
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

export interface ShotLibraryPageResponse<Resource extends ShotLibraryResourceLike = ShotLibraryResourceLike> {
  total: number
  items: ShotReferenceApiEntry<Resource>[]
  page: number
  page_size: number
}

export interface ShotReferenceApiEntry<Resource extends ShotLibraryResourceLike = ShotLibraryResourceLike> {
  ID: number
  group_id?: number
  group?: ShotReferenceApiGroup<Resource>
  resource_id: number
  resource?: Resource
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

export interface ShotReferenceApiGroup<Resource extends ShotLibraryResourceLike = ShotLibraryResourceLike> {
  ID: number
  title: string
  summary?: string
  source_resource_id: number
  source_resource?: Resource
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

export interface ShotSearchRequest {
  query: string
  locale: string
  filters?: ShotLibraryFacetFilters
  topK?: number
}

export interface ShotSearchEngine {
  search(entries: ShotLibraryEntry[], request: ShotSearchRequest): ShotSearchResult[]
}

export type ShotSearchCanonicalCategory = ShotLibrarySemanticCategory | 'visual' | 'narrative' | 'emotion' | 'production'

export interface ShotQueryTranslationLike {
  originalQuery: string
  canonicalTags: Partial<Record<ShotSearchCanonicalCategory, string[]>>
  terms: string[]
}

export interface ShotTranslatedSearchRequest {
  translation: ShotQueryTranslationLike
  filters?: ShotLibraryFacetFilters
  topK?: number
}

export interface ShotLibraryFacetFilters {
  visual?: string[]
  narrative?: string[]
  emotion?: string[]
  pattern?: string[]
  production?: string[]
}

export type ShotVectorDocumentKind = 'combined' | 'tags' | 'visual' | 'narrative' | 'reusable_pattern' | 'production'

export interface ShotVectorDocument {
  id: string
  referenceId: number
  sourceId: string
  locale: string
  kind: ShotVectorDocumentKind
  text: string
  metadata: Record<string, unknown>
}

export interface ShotVectorSearchRequest {
  query: string
  locale: string
  sourceIds?: string[]
  filters?: ShotLibraryFacetFilters
  topK?: number
}

export interface ShotVectorSearchResult {
  document: ShotVectorDocument
  score: number
}

export interface ShotVectorStore {
  upsert(document: ShotVectorDocument): Promise<void>
  search(request: ShotVectorSearchRequest): Promise<ShotVectorSearchResult[]>
  deleteByReference(referenceId: number): Promise<void>
  reindex(scope?: { sourceIds?: string[]; referenceIds?: number[] }): Promise<void>
}

export interface ShotTextLocalizationOptions {
  locale?: string
  localizeAnyValue?: (value: string, locale: string) => string
  localizeFieldValue?: (field: string, value: string, locale: string) => string
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

export interface CreateShotReferencesFromResourceResponse<Resource extends ShotLibraryResourceLike = ShotLibraryResourceLike> {
  total: number
  items: ShotReferenceApiEntry<Resource>[]
}

export interface ShotLibraryVideoInput {
  name: string
  size: number
  type?: string
}

export interface ShotSearchIndexBuildInput {
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

export function analyzeShotReference<Resource extends ShotLibraryResourceLike>(
  resource: Resource,
  video: ShotLibraryVideoInput,
  metadata: ShotLibraryVideoMetadata = {},
  now = new Date(),
): ShotLibraryEntry {
  const durationSec = normalizedDuration(metadata.durationSec)
  const resolution = metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : undefined
  const aspectRatio = metadata.width && metadata.height ? formatAspectRatio(metadata.width, metadata.height) : undefined
  const durationIntent = durationSec && durationSec >= 8 ? 'slow_viewer_down' : 'guide_attention'
  const inferredIntent = uniqueShotValues([
    ...matchHints(video.name, INTENT_HINTS),
    durationIntent,
  ])
  const inferredPattern = uniqueShotValues([
    ...matchHints(video.name, PATTERN_HINTS),
    durationSec && durationSec >= 8 ? 'static_observation' : 'insert_detail',
  ].filter(Boolean) as string[])
  const shotFunction = durationSec && durationSec >= 8
    ? ['tension_buildup', 'emotional_pause']
    : ['reference_moment', 'visual_cue']
  const visualPreference = uniqueShotValues([
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
  const searchIndex = buildShotSearchIndex({
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
    analysisSource: 'manual_workspace',
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

export function normalizeShotLibraryRuntimeSources(
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
    const normalized = normalizeShotLibraryRuntimeSource(source)
    if (normalized) result.set(normalized.id, normalized)
  }
  if (result.size === 0) {
    const normalized = normalizeShotLibraryRuntimeSource(fallback)
    if (normalized) result.set(normalized.id, normalized)
  }
  return Array.from(result.values())
}

export function normalizeShotLibraryRuntimeSource(source: Partial<ShotLibrarySourceConfig> | null | undefined): ShotLibrarySource | null {
  if (!source?.id?.trim() || !source.name?.trim() || !source.baseURL?.trim()) return null
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

export function shotLibraryEntryFromApi<Resource extends ShotLibraryResourceLike>(
  input: ShotReferenceApiEntry<Resource>,
  source?: ShotLibrarySource,
): ShotLibraryEntry {
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

export function mergeShotReferences(entries: ShotLibraryEntry[], next: ShotLibraryEntry): ShotLibraryEntry[] {
  const withoutExisting = entries.filter(entry => {
    if (entry.sourceId !== next.sourceId) return true
    return entry.ID !== next.ID && entry.resourceId !== next.resourceId
  })
  return [next, ...withoutExisting]
}

export function buildShotSearchIndex(input: ShotSearchIndexBuildInput): ShotSearchIndex {
  const visualFacets = shotVisualFacetValues(input.visualAnalysis)
  const narrativeFacets = uniqueShotValues([
    input.narrativeFunction.primary,
    ...(input.narrativeFunction.secondary ?? []),
    input.narrativeFunction.information_state,
    input.narrativeFunction.sequence_position,
    input.narrativeFunction.relation_to_previous,
    input.narrativeFunction.relation_to_next,
  ].filter(Boolean) as string[])
  const emotionFacets = uniqueShotValues([
    ...(input.emotionalProfile.names ?? []),
    input.emotionalProfile.valence,
    input.emotionalProfile.arousal,
    input.emotionalProfile.dominance,
    input.emotionalProfile.viewer_position,
  ].filter(Boolean) as string[])
  const patternFacets = uniqueShotValues([...input.pattern, ...(input.reusablePattern.pattern_ids ?? [])])
  const productionFacets = uniqueShotValues([
    input.executionDetails.aspectRatio,
    input.executionDetails.resolution,
    input.executionDetails.transitionIn,
    input.executionDetails.transitionOut,
    input.executionDetails.coverageRole,
    input.executionDetails.difficulty,
    ...(input.executionDetails.requirements ?? []),
  ].filter(Boolean) as string[])
  const tags = uniqueShotValues([...input.intent, ...input.pattern, ...input.shotFunction, ...input.visualPreference, ...input.emotionalEffect])
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

export function buildShotSearchIndexFromEntry(entry: ShotLibraryEntry): ShotSearchIndex {
  return buildShotSearchIndex({
    title: entry.title,
    summary: entry.summary,
    resourceName: entry.resourceName,
    intent: entry.intent,
    pattern: entry.pattern,
    shotFunction: entry.shotFunction,
    visualPreference: entry.visualPreference,
    emotionalEffect: entry.emotionalEffect,
    visualAnalysis: entry.visualAnalysis,
    sceneSemantics: entry.sceneSemantics,
    narrativeFunction: entry.narrativeFunction,
    emotionalProfile: entry.emotionalProfile,
    reusablePattern: entry.reusablePattern,
    executionDetails: entry.executionDetails,
  })
}

export function buildShotRetrievalText(entry: ShotLibraryEntry, options: ShotTextLocalizationOptions = {}): string {
  const locale = options.locale ?? 'zh-CN'
  const localizeAnyValue = options.localizeAnyValue ?? ((value: string) => value)
  const index = buildShotSearchIndexFromEntry(entry)
  const semanticValues = uniqueShotValues([
    ...entry.intent,
    ...entry.pattern,
    ...entry.shotFunction,
    ...entry.visualPreference,
    ...entry.emotionalEffect,
    ...(index.visual_facets ?? []),
    ...(index.narrative_facets ?? []),
    ...(index.emotion_facets ?? []),
    ...(index.pattern_facets ?? []),
    ...(index.production_facets ?? []),
  ])
  const localizedValues = semanticValues.map(value => localizeAnyValue(value, locale))
  return uniqueShotValues([
    entry.title,
    entry.summary,
    entry.resourceName,
    index.search_text,
    ...(index.natural_language_queries ?? []),
    ...semanticValues,
    ...localizedValues,
    entry.reusablePattern.principle,
    ...(entry.reusablePattern.works_when ?? []),
    ...(entry.reusablePattern.avoid_when ?? []),
    entry.executionDetails.blocking,
  ].filter((value): value is string => Boolean(value?.trim()))).join(' ')
}

export function buildShotVectorDocuments(entry: ShotLibraryEntry, options: ShotTextLocalizationOptions = {}): ShotVectorDocument[] {
  const locale = options.locale ?? 'zh-CN'
  const localizeAnyValue = options.localizeAnyValue ?? ((value: string) => value)
  const localizeFieldValue = options.localizeFieldValue ?? ((_field: string, value: string) => value)
  const index = buildShotSearchIndexFromEntry(entry)
  const baseMetadata = {
    referenceId: entry.ID,
    sourceId: entry.sourceId,
    title: entry.title,
    tags: index.tags ?? [],
    visualFacets: index.visual_facets ?? [],
    narrativeFacets: index.narrative_facets ?? [],
    emotionFacets: index.emotion_facets ?? [],
    patternFacets: index.pattern_facets ?? [],
    productionFacets: index.production_facets ?? [],
  }
  const doc = (kind: ShotVectorDocumentKind, parts: Array<string | undefined>): ShotVectorDocument | null => {
    const text = uniqueShotValues(parts.filter((value): value is string => Boolean(value?.trim()))).join(' ')
    if (!text) return null
    return {
      id: `${entry.sourceId}:${entry.ID}:${locale}:${kind}`,
      referenceId: entry.ID,
      sourceId: entry.sourceId,
      locale,
      kind,
      text,
      metadata: { ...baseMetadata, kind },
    }
  }
  return [
    doc('combined', [buildShotRetrievalText(entry, options)]),
    doc('tags', [
      ...(index.tags ?? []),
      ...(index.tags ?? []).map(value => localizeAnyValue(value, locale)),
    ]),
    doc('visual', [
      ...(index.visual_facets ?? []),
      ...(index.visual_facets ?? []).map(value => localizeFieldValue('visual_facets', value, locale)),
    ]),
    doc('narrative', [
      entry.narrativeFunction.primary,
      entry.narrativeFunction.information_state,
      ...(entry.narrativeFunction.secondary ?? []),
      ...(index.narrative_facets ?? []).map(value => localizeFieldValue('narrative_facets', value, locale)),
    ]),
    doc('reusable_pattern', [
      entry.reusablePattern.principle,
      ...(entry.reusablePattern.pattern_ids ?? []),
      ...(entry.reusablePattern.works_when ?? []),
      ...(entry.reusablePattern.avoid_when ?? []),
      ...Object.entries(entry.reusablePattern.variables ?? {}).map(([key, value]) => `${key}: ${value}`),
    ]),
    doc('production', [
      entry.executionDetails.coverageRole,
      entry.executionDetails.difficulty,
      entry.executionDetails.blocking,
      ...(entry.executionDetails.requirements ?? []),
      ...(index.production_facets ?? []).map(value => localizeFieldValue('production_facets', value, locale)),
    ]),
  ].filter((value): value is ShotVectorDocument => value !== null)
}

export function searchShotReferencesWithTranslation(entries: ShotLibraryEntry[], request: ShotTranslatedSearchRequest): ShotSearchResult[] {
  const filters = request.filters ?? {}
  const filtered = entries.filter(entry => shotReferenceMatchesFacetFilters(entry, filters))
  const results = request.translation.terms.length === 0
    ? filtered.map(entry => ({ entry, score: 0, matches: shotFacetFilterMatches(entry, filters) }))
    : filtered
      .map(entry => scoreShotReference(entry, request.translation, filters))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
  return request.topK ? results.slice(0, request.topK) : results
}

export function scoreShotReference(entry: ShotLibraryEntry, translation: ShotQueryTranslationLike, filters: ShotLibraryFacetFilters = {}): ShotSearchResult {
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
  const matches: ShotSearchMatch[] = shotFacetFilterMatches(entry, filters)
  let score = 0
  score += scoreCanonicalTagMatches(entry, translation, matches)
  for (const term of translation.terms) {
    for (const item of haystacks) {
      if (!item.normalized.includes(term)) continue
      score += item.weight
      matches.push({ category: item.category, value: item.label, weight: item.weight, term })
    }
  }
  return { entry, score, matches: dedupeShotSearchMatches(matches) }
}

export function shotReferenceMatchesFacetFilters(entry: ShotLibraryEntry, filters: ShotLibraryFacetFilters): boolean {
  return shotFacetCategories.every(category => {
    const selected = filters[category] ?? []
    if (selected.length === 0) return true
    const values = shotFacetValuesForEntry(entry, category)
    return selected.every(value => values.includes(value))
  })
}

export function shotFacetFilterMatches(entry: ShotLibraryEntry, filters: ShotLibraryFacetFilters): ShotSearchMatch[] {
  return shotFacetCategories.flatMap(category => {
    const selected = filters[category] ?? []
    if (selected.length === 0) return []
    const values = shotFacetValuesForEntry(entry, category)
    return selected
      .filter(value => values.includes(value))
      .map(value => ({ category, value, weight: 2 }))
  })
}

export const shotFacetCategories = ['visual', 'narrative', 'emotion', 'pattern', 'production'] as const

export function shotFacetValuesForEntry(entry: ShotLibraryEntry, category: typeof shotFacetCategories[number]): string[] {
  switch (category) {
    case 'visual':
      return uniqueShotValues([
        ...(entry.searchIndex.visual_facets ?? []),
        entry.visualAnalysis.shot_size,
        entry.visualAnalysis.camera_movement?.type,
        entry.visualAnalysis.camera_movement?.stability,
        entry.visualAnalysis.focus?.behavior,
        ...(entry.visualAnalysis.framing ?? []),
        ...(entry.visualAnalysis.composition ?? []),
      ].filter(Boolean) as string[])
    case 'narrative':
      return uniqueShotValues([...(entry.searchIndex.narrative_facets ?? []), entry.narrativeFunction.primary, entry.narrativeFunction.information_state].filter(Boolean) as string[])
    case 'emotion':
      return uniqueShotValues([...(entry.searchIndex.emotion_facets ?? []), ...(entry.emotionalProfile.names ?? []), ...entry.emotionalEffect].filter(Boolean) as string[])
    case 'pattern':
      return uniqueShotValues([...(entry.searchIndex.pattern_facets ?? []), ...(entry.reusablePattern.pattern_ids ?? []), ...entry.pattern].filter(Boolean) as string[])
    case 'production':
      return uniqueShotValues([...(entry.searchIndex.production_facets ?? []), ...(entry.executionDetails.requirements ?? []), entry.executionDetails.coverageRole, entry.executionDetails.difficulty].filter(Boolean) as string[])
  }
}

export function dedupeShotSearchMatches(matches: ShotSearchMatch[]): ShotSearchMatch[] {
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

function scoreCanonicalTagMatches(entry: ShotLibraryEntry, translation: ShotQueryTranslationLike, matches: ShotSearchMatch[]): number {
  let score = 0
  const addMatches = (category: ShotSearchCanonicalCategory, values: string[] | undefined, entryValues: string[], weight: number) => {
    for (const value of values ?? []) {
      if (!entryValues.includes(value)) continue
      score += weight
      matches.push({ category: category === 'shotFunction' || category === 'visualPreference' || category === 'intent' ? 'tag' : category === 'emotionalEffect' ? 'emotion' : category, value, weight, term: translation.originalQuery })
    }
  }
  addMatches('intent', translation.canonicalTags.intent, entry.intent, 10)
  addMatches('pattern', translation.canonicalTags.pattern, entry.pattern, 10)
  addMatches('shotFunction', translation.canonicalTags.shotFunction, entry.shotFunction, 8)
  addMatches('visualPreference', translation.canonicalTags.visualPreference, entry.visualPreference, 6)
  addMatches('emotionalEffect', translation.canonicalTags.emotionalEffect, entry.emotionalEffect, 6)
  addMatches('visual', translation.canonicalTags.visual, shotFacetValuesForEntry(entry, 'visual'), 5)
  addMatches('narrative', translation.canonicalTags.narrative, shotFacetValuesForEntry(entry, 'narrative'), 8)
  addMatches('emotion', translation.canonicalTags.emotion, shotFacetValuesForEntry(entry, 'emotion'), 5)
  addMatches('production', translation.canonicalTags.production, shotFacetValuesForEntry(entry, 'production'), 4)
  return score
}

export function shotVisualFacetValues(visual: ShotVisualAnalysis): string[] {
  return uniqueShotValues([
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

function naturalLanguageQueriesForShot(input: ShotSearchIndexBuildInput): string[] {
  const queries: string[] = []
  if (input.intent.includes('create_tension')) queries.push('气氛慢慢变紧的镜头', 'suspense tension buildup shot')
  if (input.intent.includes('reveal_information') || input.narrativeFunction.primary === 'delayed_reveal') queries.push('角色发现真相前的延迟揭示', 'delayed reveal before discovery')
  if (input.pattern.includes('foreground_obstruction')) queries.push('前景遮挡像被偷看一样的镜头', 'foreground obstruction hidden observer shot')
  if (input.pattern.includes('slow_push_in')) queries.push('慢推近制造压迫感', 'slow push in psychological pressure')
  if (input.intent.includes('isolate_character')) queries.push('角色孤独留白压迫', 'isolate character with negative space')
  return uniqueShotValues(queries)
}

function matchHints(value: string, hints: Array<{ pattern: RegExp; value: string }>): string[] {
  return hints.filter(hint => hint.pattern.test(value)).map(hint => hint.value)
}

function titleFromResourceName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled shot reference'
}

function normalizedDuration(value?: number): number | undefined {
  if (!value || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value * 10) / 10
}

function formatDuration(value: number): string {
  if (value < 60) return `${value.toFixed(value % 1 === 0 ? 0 : 1)}s`
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes}m ${seconds}s`
}

function aspectRatioLabel(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined
  if (width > height) return 'landscape_frame'
  if (height > width) return 'vertical_frame'
  return 'square_frame'
}

function formatAspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height)
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function buildSummary(title: string, durationSec: number | undefined, resolution: string | undefined, intent: string[], pattern: string[]): string {
  const duration = durationSec ? `${formatDuration(durationSec)} reference` : 'video reference'
  const quality = resolution ? ` at ${resolution}` : ''
  return `${title} is a ${duration}${quality}; inferred intents include ${intent.slice(0, 2).join(', ')} and reusable patterns include ${pattern.slice(0, 2).join(', ')}.`
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
    analysis.composition = uniqueShotValues([...(analysis.composition ?? []), 'close_framing'])
    analysis.characters = [{ ...(analysis.characters?.[0] ?? {}), expression: 'reaction', action: 'reacts' }]
  }
  if (/wide|远景|empty/.test(text) || pattern.includes('negative_space_pressure')) {
    analysis.shot_size = 'wide_shot'
    analysis.composition = uniqueShotValues([...(analysis.composition ?? []), 'negative_space'])
    analysis.environment = { ...analysis.environment, spatial_feeling: ['large', 'isolating'] }
  }
  if (pattern.includes('slow_push_in')) {
    analysis.camera_movement = { type: 'push_in', speed: 'slow', stability: 'smooth', motivation: 'psychological_pressure' }
  }
  if (pattern.includes('handheld_follow')) {
    analysis.camera_movement = { type: 'follow', speed: 'reactive', stability: 'handheld', motivation: 'subjective_presence' }
  }
  if (pattern.includes('foreground_obstruction')) {
    analysis.framing = uniqueShotValues([...(analysis.framing ?? []), 'foreground_obstruction'])
    analysis.composition = uniqueShotValues([...(analysis.composition ?? []), 'layered_depth'])
    analysis.lens = { ...analysis.lens, optical_effects: uniqueShotValues([...(analysis.lens?.optical_effects ?? []), 'foreground_blur']) }
    analysis.focus = { behavior: 'soft_or_rack_reveal', initial_focus: 'foreground', final_focus: 'subject' }
    analysis.characters = [{ ...(analysis.characters?.[0] ?? {}), visibility: 'partially_obscured' }]
  }
  if (intent.includes('create_tension') || emotionalEffect.includes('suspense')) {
    analysis.lighting = { ...analysis.lighting, style: 'low_key', contrast: 'medium_high' }
    analysis.color = { ...analysis.color, palette: 'cool_muted', saturation: 'low' }
  }
  if (intent.includes('isolate_character')) {
    analysis.composition = uniqueShotValues([...(analysis.composition ?? []), 'off_center_subject', 'negative_space'])
    analysis.environment = { ...analysis.environment, spatial_feeling: uniqueShotValues([...(analysis.environment?.spatial_feeling ?? []), 'empty', 'distant']) }
  }
  if (visualPreference.includes('vertical_frame')) analysis.framing = uniqueShotValues([...(analysis.framing ?? []), 'vertical_frame'])
  if (visualPreference.includes('landscape_frame')) analysis.framing = uniqueShotValues([...(analysis.framing ?? []), 'landscape_frame'])
  if (durationSec && durationSec >= 8) analysis.composition = uniqueShotValues([...(analysis.composition ?? []), 'held_composition'])
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
    semantics.genre = uniqueShotValues([...(semantics.genre ?? []), 'thriller'])
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
  if (intent.includes('create_tension')) fn.secondary = uniqueShotValues([...(fn.secondary ?? []), 'build_tension', 'guide_attention'])
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
    profile.names = uniqueShotValues([...(profile.names ?? []), 'suspense', 'unease'])
    profile.valence = 'negative'
    profile.arousal = 'medium_high'
    profile.dominance = 'low'
    profile.viewer_position = 'hidden_observer'
    profile.intensity = 0.78
  }
  if (emotionalEffect.includes('isolation') || intent.includes('isolate_character')) {
    profile.names = uniqueShotValues([...(profile.names ?? []), 'isolation', 'loneliness'])
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
    requirements: uniqueShotValues([...(details.requirements ?? []), ...requirements]),
  }
}

export function resolveShotLibraryResourceUrl(baseURL: string, url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (!baseURL) return url
  try {
    return new URL(url, baseURL).toString()
  } catch {
    return url
  }
}

export function uniqueShotValues(values: string[]): string[] {
  return Array.from(new Set(values))
}
