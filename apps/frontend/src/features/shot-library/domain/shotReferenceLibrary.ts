import type { RawResource } from '@/types'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import {
  analyzeShotReference as coreAnalyzeShotReference,
  buildShotRetrievalText as coreBuildShotRetrievalText,
  buildShotSearchIndex as coreBuildShotSearchIndex,
  buildShotSearchIndexFromEntry as coreBuildShotSearchIndexFromEntry,
  buildShotVectorDocuments as coreBuildShotVectorDocuments,
  mergeShotReferences as coreMergeShotReferences,
  normalizeShotLibraryRuntimeSources,
  searchShotReferencesWithTranslation,
  shotLibraryEntryFromApi as coreShotLibraryEntryFromApi,
  type CreateShotReferencesFromResourceInput,
  type CreateShotReferencesFromResourceResponse as CoreCreateShotReferencesFromResourceResponse,
  type ShotEmotionalProfile,
  type ShotLibraryAnalysisStatus,
  type ShotLibraryEntry,
  type ShotLibraryFacetFilters,
  type ShotLibraryPageResponse as CoreShotLibraryPageResponse,
  type ShotLibrarySemanticCategory,
  type ShotLibrarySource,
  type ShotLibrarySourceResult as CoreShotLibrarySourceResult,
  type ShotLibraryVideoInput,
  type ShotLibraryVideoMetadata,
  type ShotNarrativeFunction,
  type ShotReferenceApiEntry as CoreShotReferenceApiEntry,
  type ShotReferenceApiGroup as CoreShotReferenceApiGroup,
  type ShotReferenceManualUpdate,
  type ShotReusablePattern,
  type ShotSceneSemantics,
  type ShotSearchEngine,
  type ShotSearchIndexBuildInput,
  type ShotSearchIndex,
  type ShotSearchMatch,
  type ShotSearchRequest,
  type ShotSearchResult,
  type ShotVectorDocument,
  type ShotVectorDocumentKind,
  type ShotVectorSearchRequest,
  type ShotVectorSearchResult,
  type ShotVectorStore,
  type ShotVisualAnalysis,
} from '@movscript/core/shot-library'
import type { ShotLibrarySourceConfig } from '@/shared/contracts/appSettings'
import {
  localizeAnyShotValue,
  localizeShotFieldValue,
  localizeShotSemanticValue,
  localizeShotTerm,
  translateShotQuery,
} from './shotVocabulary'

export { localizeAnyShotValue, localizeShotField, localizeShotFieldValue, localizeShotSemanticValue, localizeShotTerm, localizeShotFacetValue, shotSearchBackendQuery, translateShotQuery } from './shotVocabulary'

export type {
  CreateShotReferencesFromResourceInput,
  ShotEmotionalProfile,
  ShotLibraryAnalysisStatus,
  ShotLibraryEntry,
  ShotLibraryFacetFilters,
  ShotLibrarySemanticCategory,
  ShotLibrarySource,
  ShotLibraryVideoInput,
  ShotLibraryVideoMetadata,
  ShotNarrativeFunction,
  ShotReferenceManualUpdate,
  ShotReusablePattern,
  ShotSceneSemantics,
  ShotSearchEngine,
  ShotSearchIndex,
  ShotSearchMatch,
  ShotSearchRequest,
  ShotSearchResult,
  ShotVectorDocument,
  ShotVectorDocumentKind,
  ShotVectorSearchRequest,
  ShotVectorSearchResult,
  ShotVectorStore,
  ShotVisualAnalysis,
}

export type ShotLibraryPageResponse = CoreShotLibraryPageResponse<RawResource>
export type ShotReferenceApiEntry = CoreShotReferenceApiEntry<RawResource>
export type ShotReferenceApiGroup = CoreShotReferenceApiGroup<RawResource>
export type CreateShotReferencesFromResourceResponse = CoreCreateShotReferencesFromResourceResponse<RawResource>

export interface ShotLibrarySourceResult extends CoreShotLibrarySourceResult {
  source: ShotLibrarySource
  page?: ShotLibraryPageResponse
  error?: unknown
}

export type SearchIndexBuildInput = ShotSearchIndexBuildInput

export function analyzeShotReference(
  resource: RawResource,
  video: ShotLibraryVideoInput,
  metadata: ShotLibraryVideoMetadata = {},
  now = new Date(),
): ShotLibraryEntry {
  return coreAnalyzeShotReference(resource, video, metadata, now)
}

export function normalizeShotLibrarySources(
  sources: ShotLibrarySourceConfig[] | undefined,
  currentAPIBaseURL: string,
  fallbackName = 'Movscript',
): ShotLibrarySource[] {
  return normalizeShotLibraryRuntimeSources(sources, currentAPIBaseURL, fallbackName)
}

export function shotLibraryEntryFromApi(input: ShotReferenceApiEntry, source?: ShotLibrarySource): ShotLibraryEntry {
  return coreShotLibraryEntryFromApi(input, source)
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

export function searchShotReferences(entries: ShotLibraryEntry[], query: string, locale = 'zh-CN'): ShotLibraryEntry[] {
  return searchShotReferenceResults(entries, query, {}, locale).map(result => result.entry)
}

export function searchShotReferenceResults(entries: ShotLibraryEntry[], query: string, filters: ShotLibraryFacetFilters = {}, locale = 'zh-CN'): ShotSearchResult[] {
  return localKeywordShotSearchEngine.search(entries, { query, filters, locale })
}

export function mergeShotReferences(entries: ShotLibraryEntry[], next: ShotLibraryEntry): ShotLibraryEntry[] {
  return coreMergeShotReferences(entries, next)
}

export function localizeShotSummary(entry: Pick<ShotLibraryEntry, 'title' | 'intent' | 'pattern' | 'executionDetails'>, language: string): string {
  if (!language.toLowerCase().startsWith('zh')) {
    const duration = entry.executionDetails.durationSec ? `${formatDuration(entry.executionDetails.durationSec)} reference` : 'video reference'
    const quality = entry.executionDetails.resolution ? ` at ${entry.executionDetails.resolution}` : ''
    return `${entry.title} is a ${duration}${quality}; inferred intents include ${entry.intent.slice(0, 2).map(value => localizeShotTerm('intent', value, language)).join(', ')} and reusable patterns include ${entry.pattern.slice(0, 2).map(value => localizeShotTerm('pattern', value, language)).join(', ')}.`
  }
  const duration = entry.executionDetails.durationSec ? `${formatDurationZh(entry.executionDetails.durationSec)}镜头参考` : '镜头视频参考'
  const quality = entry.executionDetails.resolution ? `，分辨率 ${entry.executionDetails.resolution}` : ''
  const intents = entry.intent.slice(0, 2).map(value => localizeShotSemanticValue('intent', value, language)).join('、') || '引导注意'
  const patterns = entry.pattern.slice(0, 2).map(value => localizeShotSemanticValue('pattern', value, language)).join('、') || '可复用镜头模式'
  return `${entry.title} 是一条${duration}${quality}；它主要用于${intents}，可复用的镜头模式包括${patterns}。`
}

export const localKeywordShotSearchEngine: ShotSearchEngine = {
  search(entries, request) {
    const translation = translateShotQuery(request.query, request.locale)
    return searchShotReferencesWithTranslation(entries, {
      translation,
      filters: request.filters,
      topK: request.topK,
    })
  },
}

function requestConfigForSource(source: ShotLibrarySource): AxiosRequestConfig {
  return {
    baseURL: source.apiV1BaseURL,
    headers: source.authToken ? { Authorization: `Bearer ${source.authToken}` } : undefined,
  }
}

export function buildShotSearchIndex(input: SearchIndexBuildInput): ShotSearchIndex {
  return coreBuildShotSearchIndex(input)
}

export function buildShotSearchIndexFromEntry(entry: ShotLibraryEntry): ShotSearchIndex {
  return coreBuildShotSearchIndexFromEntry(entry)
}

export function buildShotRetrievalText(entry: ShotLibraryEntry, locale = 'zh-CN'): string {
  return coreBuildShotRetrievalText(entry, {
    locale,
    localizeAnyValue: localizeAnyShotValue,
  })
}

export function buildShotVectorDocuments(entry: ShotLibraryEntry, locale = 'zh-CN'): ShotVectorDocument[] {
  return coreBuildShotVectorDocuments(entry, {
    locale,
    localizeAnyValue: localizeAnyShotValue,
    localizeFieldValue: localizeShotFieldValue,
  })
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
