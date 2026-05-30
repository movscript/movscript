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
  }
  retrievalText: string
  createdAt: string
  updatedAt: string
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
  }
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
  start_sec?: number
  start_sec_set?: boolean
  end_sec?: number
  end_sec_set?: boolean
}

export interface CreateShotReferencesFromResourceInput {
  resource_id: number
  group_id?: number
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
  const retrievalText = [
    title,
    summary,
    inferredIntent.join(' '),
    inferredPattern.join(' '),
    shotFunction.join(' '),
    visualPreference.join(' '),
    emotionalEffect.join(' '),
    video.name,
  ].join(' ')
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
    executionDetails: {
      durationSec,
      resolution,
      aspectRatio,
    },
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
    },
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
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) return entries
  return entries
    .map(entry => ({ entry, score: scoreShotReference(entry, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .map(item => item.entry)
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

function scoreShotReference(entry: ShotLibraryEntry, terms: string[]) {
  const haystacks = [
    { text: entry.title, weight: 6 },
    { text: entry.summary, weight: 4 },
    { text: entry.retrievalText, weight: 2 },
    { text: entry.resourceName, weight: 3 },
    { text: entry.sourceName, weight: 2 },
    { text: entry.groupTitle ?? '', weight: 4 },
    { text: entry.intent.join(' '), weight: 5 },
    { text: entry.pattern.join(' '), weight: 5 },
    { text: entry.shotFunction.join(' '), weight: 4 },
    { text: entry.visualPreference.join(' '), weight: 3 },
    { text: entry.emotionalEffect.join(' '), weight: 3 },
  ].map(item => ({ ...item, text: item.text.toLowerCase() }))
  return terms.reduce((score, term) => {
    const termScore = haystacks.reduce((sum, item) => sum + (item.text.includes(term) ? item.weight : 0), 0)
    return score + termScore
  }, 0)
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
